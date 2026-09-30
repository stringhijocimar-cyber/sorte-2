/* Ciclo automático: previsões congeladas antes do alvo, comparação e decisão. */
(function(root){
'use strict';
const L=root.LL18||(typeof require==='function'?require('./lab-recommendation.js'):null);
const PROTOCOL='auto-421-1', VERSION='4.22.1', POOL=96, REFERENCES=32;
const experts={
 equilibrio:'Equilíbrio de soma e paridade', frequencia:'Frequência com suavização bayesiana',
 recencia:'Frequência recente ponderada', atraso:'Atrasos como hipótese',
 pares:'Associação de pares', trios:'Associação de trios',
 transicoes:'Transições entre concursos', perfil:'Distribuição histórica de acertos',
 cobertura:'Diversificação e cobertura', evolutivo:'Busca evolutiva de combinações',
 uniforme:'Controle aleatório'
};
const ids=Object.keys(experts), selectable=ids.filter(x=>x!=='uniforme');
const clone=x=>JSON.parse(JSON.stringify(x));
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));

function options(m,op={}){
 const c=L.cfg(m),shape=L.validateTicket(m,op.formato||L.randomTicket(m,L.rng('formato:'+m)),{completo:true});
 const parse=v=>{const a=L.nums(v||[]);if(new Set(a).size!==a.length||a.some(x=>x<c.base||x>=c.base+c.N))throw Error('Restrições inválidas.');return a.sort((a,b)=>a-b);};
 const fixed=parse(op.fixas),excluded=parse(op.excluidas),janela=op.janela??0;
 if(!Number.isInteger(janela)||janela<0)throw Error('Janela inválida.');
 if(c.colunas&&(fixed.length||excluded.length))throw Error('Fixas por dezena não se aplicam às colunas.');
 if(fixed.some(x=>excluded.includes(x)))throw Error('Uma dezena não pode ser fixa e excluída.');
 if(!c.colunas&&(fixed.length>shape.dezenas.length||c.N-excluded.length<shape.dezenas.length))throw Error('As restrições não permitem completar o jogo.');
 if(op.trevosFixos)shape.trevos=L.validateTicket(m,{...shape,trevos:op.trevosFixos},{completo:true}).trevos;
 const sizes=c.colunas?shape.colunas.map(a=>a.length):[shape.dezenas.length,shape.trevos?.length||0];
 const profile=JSON.stringify([PROTOCOL,m,sizes,fixed,excluded,op.trevosFixos||null,janela,op.antesDe??null]);
 return {shape,fixed,excluded,janela,profile,trevosFixos:op.trevosFixos||null};
}
function randomTicket(m,random,o){
 const c=L.cfg(m),t=L.randomTicket(m,random,o.shape);
 if(!c.colunas){const pool=Array.from({length:c.N},(_,i)=>i+c.base).filter(d=>!o.fixed.includes(d)&&!o.excluded.includes(d));
  t.dezenas=o.fixed.concat(L.sample(pool,o.shape.dezenas.length-o.fixed.length,random)).sort((a,b)=>a-b);}
 if(o.trevosFixos)t.trevos=o.trevosFixos.slice();return t;
}
function structure(m,t){
 const c=L.cfg(m),s=L.structural(m,t),n=L.tokens(m,t).length;
 return [s.media/c.N,s.pares/n,s.amplitude/c.N-(n-1)/(n+1),
  s.consecutivos*c.N/Math.max(1,n*(n-1)),s.dispersao/c.N,s.concentracao,
  Math.max(...s.finais)/n];
}
function model(m,rows=[]){
 const c=L.cfg(m),N=c.colunas?70:c.N,p=c.colunas?.1:c.k/c.N;
 const b={m,c,N,p,n:0,counts:new Float64Array(N),recent:new Float64Array(N),mass:0,
  last:new Int32Array(N).fill(-1),pair:new Uint32Array(N*N),triple:new Uint32Array(N*N*N),
  transition:new Uint32Array(N*N),previousCount:new Uint32Array(N),means:Array(7).fill(0),
  squares:Array(7).fill(0),masks:[],previous:null,lastDraw:null,rows:[]};
 for(const r of rows)add(b,r);return b;
}
function add(b,r){
 const ts=L.tokens(b.m,r).sort((a,z)=>a-z),N=b.N;
 if(b.lastDraw&&r.concurso!==b.lastDraw.concurso+1){b.last.fill(-1);b.recent.fill(0);b.mass=0;}
 for(let d=0;d<N;d++)b.recent[d]*=.96;b.mass=b.mass*.96+1;
 for(const d of ts){b.counts[d]++;b.recent[d]++;b.last[d]=b.n;}
 for(let i=0;i<ts.length;i++)for(let j=i+1;j<ts.length;j++){
  b.pair[ts[i]*N+ts[j]]++;
  for(let k=j+1;k<ts.length;k++)b.triple[(ts[i]*N+ts[j])*N+ts[k]]++;
 }
 if(b.previous&&r.concurso===b.lastDraw.concurso+1)for(const d of b.previous){
  b.previousCount[d]++;for(const e of ts)b.transition[d*N+e]++;
 }
 structure(b.m,r).forEach((v,j)=>{b.means[j]+=v;b.squares[j]+=v*v;});
 b.masks.push(L.mask(ts));b.previous=ts;b.lastDraw=r;b.rows.push(r);b.n++;
}
function feature(b,t,o){
 const ts=L.tokens(b.m,t).sort((a,z)=>a-z),N=b.N,n=b.n,p=b.p;
 const lift=(count,prior,den=n)=>Math.log(Math.max(1e-9,(count+40*prior)/(den+40)/prior));
 const s=structure(b.m,t),equilibrium=-L.mean(s.map((v,j)=>{
  const mean=n?b.means[j]/n:[.5,.5,0,1,.29,.35,.25][j];
  const variance=n?Math.max(.0025,b.squares[j]/n-mean*mean):.05;
  return Math.min(5,Math.abs(v-mean)/Math.sqrt(variance));
 }));
 const frequency=L.mean(ts.map(d=>lift(b.counts[d],p)));
 const recent=L.mean(ts.map(d=>lift(b.recent[d],p,b.mass)));
 const delay=L.mean(ts.map(d=>b.last[d]<0?0:Math.min(3,(n-1-b.last[d])*p)));
 let pairs=0,np=0,trios=0,nt=0;
 const pairPrior=b.c.colunas?.01:b.c.k*(b.c.k-1)/(N*(N-1));
 const triplePrior=b.c.colunas?.001:pairPrior*(b.c.k-2)/(N-2);
 for(let i=0;i<ts.length;i++)for(let j=i+1;j<ts.length;j++){
  if(b.c.colunas&&Math.floor(ts[i]/10)===Math.floor(ts[j]/10))continue;
  pairs+=lift(b.pair[ts[i]*N+ts[j]],pairPrior);np++;
 }
 // Até 128 trios distribuídos pelo bilhete: custo previsível na Lotomania.
 const total=L.comb(ts.length,3),step=Math.max(1,Math.ceil(total/128));let rank=0;
 for(let i=0;i<ts.length;i++)for(let j=i+1;j<ts.length;j++)for(let k=j+1;k<ts.length;k++,rank++){
  if(rank%step)continue;
  if(b.c.colunas&&new Set([ts[i],ts[j],ts[k]].map(x=>Math.floor(x/10))).size<3)continue;
  trios+=lift(b.triple[(ts[i]*N+ts[j])*N+ts[k]],triplePrior);nt++;
 }
 const transition=b.previous?L.mean(ts.map(d=>L.mean(b.previous.map(e=>lift(b.transition[e*N+d],p,b.previousCount[e]))))):0;
 const mask=L.mask(ts),hist=b.masks.slice(-180),dist=Array(b.c.k+1).fill(0),expected=L.distribution(b.m,t);
 hist.forEach(a=>dist[L.intersection(a,mask)]++);
 const profile=hist.length?-L.sum(dist.map((x,h)=>Math.abs(x/hist.length-expected[h]))):0;
 return {t,mask,features:[equilibrium,frequency,recent,delay,np?pairs/np:0,nt?trios/nt:0,transition,profile]};
}
function proposal(b,o,target){
 const seed=PROTOCOL+':'+o.profile+':'+target,random=L.rng(seed),pool=[],seen=new Set();
 for(let i=0;i<POOL*10&&pool.length<POOL;i++){
  const t=randomTicket(b.m,random,o),key=L.key(b.m,t);if(seen.has(key))continue;
  seen.add(key);pool.push(feature(b,t,o));
 }
 if(!pool.length)throw Error('Não foi possível formar uma combinação válida.');
 const scales=Array.from({length:8},(_,j)=>({mean:L.mean(pool.map(x=>x.features[j])),sd:Math.max(.01,L.sd(pool.map(x=>x.features[j])))}));
 const quality=x=>L.mean(x.features.map((v,j)=>clamp((v-scales[j].mean)/scales[j].sd,-3,3)));
 let evolved=pool.reduce((a,x)=>quality(x)>quality(a)?x:a,pool[0]);
 for(let i=0;i<24;i++){
  const t=clone(evolved.t),c=b.c;
  if(c.colunas){const col=Math.floor(random()*7);t.colunas[col]=L.sample(Array.from({length:10},(_,d)=>d),t.colunas[col].length,random);}
  else{const change=t.dezenas.map((d,i)=>o.fixed.includes(d)?-1:i).filter(i=>i>=0),free=Array.from({length:c.N},(_,d)=>d+c.base).filter(d=>!o.excluded.includes(d)&&!t.dezenas.includes(d));
   if(!change.length||!free.length)break;t.dezenas[change[Math.floor(random()*change.length)]]=free[Math.floor(random()*free.length)];t.dezenas.sort((a,z)=>a-z);}
  const x=feature(b,t,o);if(quality(x)>quality(evolved))evolved=x;
 }
 if(!seen.has(L.key(b.m,evolved.t)))pool.push(evolved);
 const chosen=[],taken=new Set();
 for(let j=0;j<8;j++){
  const ordered=pool.slice().sort((a,z)=>z.features[j]-a.features[j]);
  const x=ordered.find(x=>!taken.has(L.key(b.m,x.t)))||ordered[0];
  chosen.push({id:ids[j],jogo:x.t});taken.add(L.key(b.m,x.t));
 }
 const masks=chosen.map(x=>L.mask(L.tokens(b.m,x.jogo)));
 const redundancy=x=>L.mean(masks.map(a=>{const h=L.intersection(a,x.mask);return h*h+L.comb(h,2)+L.comb(h,3);}));
 const covered=pool.slice().sort((a,z)=>redundancy(a)-redundancy(z)).find(x=>!taken.has(L.key(b.m,x.t)))||pool[0];
 chosen.push({id:'cobertura',jogo:covered.t},{id:'evolutivo',jogo:evolved.t});
 const votes=chosen.map(x=>L.mask(L.tokens(b.m,x.jogo)));
 const agreement=x=>L.mean(votes.map(a=>L.intersection(a,x.mask)))/L.tokens(b.m,x.t).length+.03*quality(x);
 const consensus=pool.reduce((a,x)=>agreement(x)>agreement(a)?x:a,pool[0]);
 chosen.push({id:'uniforme',jogo:randomTicket(b.m,L.rng(seed+':controle-visivel'),o)});
 return {seed,tests:chosen,consensus:consensus.t,pool:pool.map(x=>({jogo:x.t,score:agreement(x)})),candidatos:pool.length};
}
function observation(m,r,draw,o){
 const reference=L.mean(Array.from({length:REFERENCES},(_,i)=>L.hits(m,randomTicket(m,L.rng(r.semente+':controle:'+i),o),draw)));
 const acertos=Object.fromEntries(r.testes.map(x=>[x.id,L.hits(m,x.jogo,draw)]));
 acertos.consenso=L.hits(m,r.consenso,draw);acertos.principal=L.hits(m,r.principal,draw);
 return {concurso:draw.concurso,data:draw.data,geradoAte:r.geradoAte,acertos,referencia:reference,
  resultado:{...L.validateTicket(m,draw,{resultado:true}),...(draw.dezenasSegundoSorteio?{dezenasSegundoSorteio:draw.dezenasSegundoSorteio.slice()}:{})},
  complementos:r.testes.map(x=>({id:x.id,financeiro:L.financial(m,x.jogo,draw)}))};
}
function statistics(obs,seed){
 const list=selectable.map(id=>({id,n:obs.length,media:L.mean(obs.map(x=>x.acertos[id])),
  acaso:L.paired(obs.map(x=>x.acertos[id]-x.referencia),seed+':'+id,999),
  consenso:L.paired(obs.map(x=>x.acertos[id]-x.acertos.consenso),seed+':consenso:'+id,999)}));
 const adj=L.holm(list.flatMap(x=>[x.acaso.p,x.consenso.p]));
 list.forEach((x,j)=>{x.acaso.pAjustado=adj[j*2];x.consenso.pAjustado=adj[j*2+1];});return list;
}
function winner(stats){return stats.filter(x=>L.robust(x.acaso)&&L.robust(x.consenso)).sort((a,b)=>b.consenso.ic[0]-a.consenso.ic[0])[0]?.id||'consenso';}
function retrospective(m,rows,o,progress){
 if(rows.length<120)return {estado:'amostra-insuficiente',metodo:'consenso',n:0,necessarios:120,observacoes:[],motivo:'A base ainda não permite separar 60 concursos de avaliação. O pacote virtual começa sem escolher um vencedor histórico.'};
 const start=rows.length-60,training=rows.slice(0,start),b=model(m,training),obs=[];let choice='consenso',validation=[];
 for(let i=start;i<rows.length;i++){
  if(i===start+30){validation=statistics(obs,'validacao:'+o.profile+':'+rows[start].concurso);choice=winner(validation);}
  const p=proposal(b,o,rows[i].concurso),r={testes:p.tests,consenso:p.consensus,principal:p.consensus,semente:p.seed,geradoAte:rows[i-1].concurso};
  obs.push(observation(m,r,rows[i],o));add(b,rows[i]);
  progress({etapa:'Comparando estratégias automaticamente',feitos:i-start+1,total:60});
 }
 const test=statistics(obs.slice(30),'teste:'+o.profile+':'+rows[start+30].concurso),selected=test.find(x=>x.id===choice);
 const confirmed=choice!=='consenso'&&selected&&L.robust(selected.acaso)&&L.robust(selected.consenso);
 return {estado:'concluido',metodo:confirmed?choice:'consenso',n:60,observacoes:obs,
  selecao:choice,validacao:validation,teste:test,congeladoAte:rows[start+29].concurso,
  particao:{treino:[rows[0].concurso,rows[start-1].concurso],validacao:[rows[start].concurso,rows[start+29].concurso],teste:[rows[start+30].concurso,rows.at(-1).concurso]},
  motivo:confirmed?'Uma estratégia superou o controle e o consenso na validação e confirmou o resultado no teste separado. A escolha continua exploratória até os próximos sorteios.':'Nenhuma estratégia superou o controle e o consenso nas duas etapas. Mantido o consenso; os próximos concursos serão avaliados automaticamente.'};
}
// Mistura de supermartingales de Hoeffding para diferenças limitadas a [-1,1].
// O máximo acumulado permite consultar repetidamente sem escolher um p favorável.
function anytime(delta,k){
 const lambdas=[.05,.1,.2,.4,.8,1.6,3.2];let sum=0,maxE=1;
 delta.forEach((d,i)=>{sum+=d/k;const e=L.mean(lambdas.map(l=>Math.exp(Math.min(700,l*sum-(i+1)*l*l/2))));maxE=Math.max(maxE,e);});
 return Math.min(1,1/maxE);
}
function prospective(m,rows,state,o){
 const byNumber=new Map(rows.map(r=>[r.concurso,r])),observations=[],pending=[],rejected=[];
 for(const round of state.rodadas||[]){
  const draw=byNumber.get(round.concursoAlvo);if(!draw){pending.push(round.concursoAlvo);continue;}
  if(round.geradoAte>=draw.concurso||round.protocolo!==PROTOCOL){rejected.push(draw.concurso);continue;}
  // Se já existia data comprovadamente anterior à criação, não foi prospectivo.
  const localDay=new Date(round.criadoEm).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  if(!draw.data||localDay>draw.data){rejected.push(draw.concurso);continue;}
  observations.push(observation(m,round,draw,o));
 }
 observations.sort((a,b)=>a.concurso-b.concurso);
 const stats=statistics(observations,'prospectivo:'+o.profile),M=selectable.length*3,k=L.cfg(m).k;
 for(const x of stats){
  x.pContinuoAcaso=Math.min(1,M*anytime(observations.map(r=>r.acertos[x.id]-r.referencia),k));
  x.pContinuoConsenso=Math.min(1,M*anytime(observations.map(r=>r.acertos[x.id]-r.acertos.consenso),k));
  x.pContinuoAbaixo=Math.min(1,30*anytime(observations.map(r=>r.referencia-r.acertos[x.id]),k));
 }
 return {n:observations.length,observacoes:observations,ranking:stats,pendentes:pending,rejeitados:rejected};
}
function validateState(m,input,o){
 if(!input||input.protocolo!==PROTOCOL||input.perfil!==o.profile)return {protocolo:PROTOCOL,modalidade:m,perfil:o.profile,opcoes:clone(o),rodadas:[],decisoes:[]};
 const s=clone(input),seen=new Set();
 if(!Array.isArray(s.rodadas)||s.rodadas.length>20000||!Array.isArray(s.decisoes))throw Error('Memória automática inválida.');
 if(s.metodo&&!['consenso',...selectable].includes(s.metodo))throw Error('Método desconhecido na memória.');
 for(const r of s.rodadas){
  if(!Number.isSafeInteger(r.geradoAte)||r.geradoAte<0||!Number.isSafeInteger(r.concursoAlvo)||r.concursoAlvo<=r.geradoAte||seen.has(r.concursoAlvo)||!Number.isFinite(Date.parse(r.criadoEm))||r.protocolo!==PROTOCOL)throw Error('Registro de avaliação inválido.');
  if(!Array.isArray(r.testes)||r.testes.length!==ids.length||new Set(r.testes.map(x=>x.id)).size!==ids.length||r.testes.some(x=>!ids.includes(x.id)))throw Error('Pacote de testes incompleto.');
  for(const t of [r.principal,r.consenso,...r.testes.map(x=>x.jogo)]){
   L.validateTicket(m,t,{completo:true});
   if(L.cfg(m).colunas?t.colunas.some((a,i)=>a.length!==o.shape.colunas[i].length):t.dezenas.length!==o.shape.dezenas.length||o.fixed.some(d=>!t.dezenas.includes(d))||o.excluded.some(d=>t.dezenas.includes(d)))throw Error('Jogo incompatível com o perfil de avaliação.');
   if(o.trevosFixos&&JSON.stringify(t.trevos)!==JSON.stringify(o.trevosFixos))throw Error('Trevos incompatíveis com o perfil.');
  }seen.add(r.concursoAlvo);
 }
 return s;
}
function autoCycle(m,records,input={},op={},progress=()=>{}){
 const o=options(m,op),base=L.recommendationBase(m,records,op),rows=base.rows,c=L.cfg(m),state=validateState(m,input,o);
 const evaluation=L.history(m,records,{antesDe:op.antesDe??null});
 const now=op.agora||new Date().toISOString();if(!Number.isFinite(Date.parse(now)))throw Error('Data de geração inválida.');
 const contiguous=rows.filter(r=>r.bloco===rows.at(-1)?.bloco).length;
 if(rows.length&&(!state.inicial||state.inicial.estado==='amostra-insuficiente'&&contiguous>=120)){
  state.inicial=retrospective(m,contiguous>=120?rows:rows.slice(-Math.min(contiguous,119)),o,progress);
  if(!state.decisoes.length)state.metodo=state.inicial.metodo;
 }
 const follow=prospective(m,evaluation.rows,state,o),count=follow.n;
 const lastDecision=state.decisoes.at(-1),ready=count>=60&&count>=(lastDecision?.n||30)+30;
 if(ready){
  const candidates=follow.ranking.filter(x=>L.robust(x.acaso)&&L.robust(x.consenso)&&x.pContinuoAcaso<.05&&x.pContinuoConsenso<.05).sort((a,b)=>b.consenso.media-a.consenso.media);
  const old=state.metodo||'consenso',chosen=candidates[0]?.id;
  const current=follow.ranking.find(x=>x.id===old),bad=current&&current.pContinuoAbaixo<.05&&current.acaso.ic?.[1]<0&&current.acaso.periodos.every(x=>x<0);
  state.metodo=chosen||(bad?'consenso':old);
  state.decisoes.push({n:count,concurso:follow.observacoes.at(-1).concurso,anterior:old,metodo:state.metodo,
   acao:state.metodo===old?'MANTER':'ALTERAR',motivo:chosen?'Desempenho consistente nos concursos registrados antes do resultado, acima do controle e do consenso.':bad?'O método ficou persistentemente abaixo do controle. Retorno ao consenso.':'As diferenças continuam compatíveis com o acaso. Manter evita trocar por causa de um único concurso.'});
 }
 const latest=rows.at(-1)?.concurso||0,requested=op.concursoAlvo??null;
 if(requested!==null&&(!Number.isSafeInteger(requested)||requested<=latest))throw Error('Escolha um concurso futuro.');
 const target=requested||(c.especial?null:latest?latest+1:null);
 let round=state.rodadas.find(r=>r.concursoAlvo===target),p;
 if(!round){
  progress({etapa:'Montando sugestão e pacote virtual',feitos:0,total:1});
  p=proposal(model(m,rows),o,target||1);
  const method=state.metodo||'consenso',principal=method==='consenso'?p.consensus:p.tests.find(x=>x.id===method)?.jogo||p.consensus;
  round={protocolo:PROTOCOL,concursoAlvo:target,geradoAte:latest,criadoEm:now,semente:p.seed,base:base.meta.assinatura,
   metodo:method,principal,consenso:p.consensus,testes:p.tests,candidatos:p.candidatos};
  if(target)state.rodadas.push(round);
 }
 state.ultimaBase={ultimo:latest,assinatura:base.meta.assinatura,avaliacao:evaluation.meta.assinatura,n:base.meta.n};
 const decision=state.decisoes.at(-1)||{acao:'MANTER',metodo:state.metodo||'consenso',motivo:state.inicial?.motivo||'Aguardando resultados válidos para iniciar o acompanhamento.'};
 return {versao:VERSION,protocolo:PROTOCOL,modalidade:m,estado:state,base:base.meta,rodada:round,acompanhamento:follow,
  inicial:state.inicial||null,decisao:decision,proximaRevisao:Math.max(60,30*(Math.floor(count/30)+1)),
  pacoteVirtual:round.testes.map(x=>({...x,nome:experts[x.id]})),custoVirtual:0,pool:p?.pool||null,
  limite:'Os testes virtuais não são apostas. Acertos históricos e convergência não representam probabilidade futura. Comparação principal: dezenas/colunas; complementos e retorno financeiro são informados separadamente.'};
}
function autoRecommend(m,records,input={},op={},progress=()=>{}){
 const cycle=autoCycle(m,records,input,op,progress),o=options(m,op),base=L.recommendationBase(m,records,op),q=op.quantidade??1;
 if(!Number.isInteger(q)||q<1||q>60)throw Error('Escolha de 1 a 60 jogos.');
 const unit=L.currentCost(m,o.shape),budget=op.orcamento==null||op.orcamento===''?q*unit:Number(op.orcamento);
 if(!Number.isFinite(budget)||budget<unit)throw Error('O orçamento não cobre um jogo.');
 const size=Math.min(q,Math.floor((budget+1e-8)/unit)),pool=cycle.pool||(size>1?proposal(model(m,base.rows),o,cycle.rodada.concursoAlvo||1).pool:[]);
 const selected=[cycle.rodada.principal],seen=new Set(selected.map(t=>L.key(m,t)));
 while(selected.length<size){
  const next=pool.filter(x=>!seen.has(L.key(m,x.jogo))).map(x=>({...x,value:x.score-L.mean(selected.map(t=>L.hits(m,t,x.jogo)/L.tokens(m,t).length))})).sort((a,b)=>b.value-a.value)[0];
  if(!next)throw Error('As restrições não permitem essa quantidade de jogos diferentes.');selected.push(next.jogo);seen.add(L.key(m,next.jogo));
 }
 progress({etapa:'Explicando a decisão automática',feitos:1,total:1});
 const analysis=L.analyze(m,selected[0],base.rows),adherence=L.reference(m,selected[0],base.rows,{amostras:1000,semente:cycle.rodada.semente+':explicacao'});
 const explanations=selected.map(jogo=>({jogo,distancia:null,criterios:[]}));
 const {pool:unused,...publicCycle}=cycle;
 return {versao:VERSION,motor:'automatico',modalidade:m,semente:cycle.rodada.semente,
  parametros:{janela:o.janela,antesDe:op.antesDe??null,formato:o.shape,fixas:o.fixed,excluidas:o.excluded,trevosFixos:o.trevosFixos},
  base:base.meta,totalDisponivel:base.totalDisponivel,jogos:selected,explicacoes:explanations,
  principal:{...explanations[0],analise:analysis,aderencia:adherence},diversidade:L.portfolio(m,selected),
  custo:selected.length*unit,unitario:unit,solicitados:q,candidatos:cycle.rodada.candidatos,estado:base.meta.n>=30?'perfil-historico':'amostra-insuficiente',
  calibracao:{perfil:cycle.rodada.metodo,pesos:{},motivo:cycle.decisao.motivo,particao:cycle.inicial?.particao},
  motivo:cycle.rodada.metodo==='consenso'?'Combinação com maior concordância entre as dez estratégias do pacote virtual.':'Estratégia selecionada automaticamente: '+experts[cycle.rodada.metodo]+'.',
  evidencia:'Seleção e comparação automáticas; vantagem futura não demonstrada.',automatico:publicCycle,aviso:L.aviso};
}
Object.assign(L,{autoProtocol:PROTOCOL,autoExperts:experts,autoOptions:options,autoCycle,autoRecommend,autoProspective:prospective,autoAnytime:anytime});
if(typeof module!=='undefined'&&module.exports)module.exports=L;
})(globalThis);
