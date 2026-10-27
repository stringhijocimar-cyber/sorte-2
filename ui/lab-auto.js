/* Ciclo automático: previsões congeladas antes do alvo, comparação e decisão. */
(function(root){
'use strict';
const L=root.LL18||(typeof require==='function'?require('./lab-recommendation.js'):null);
// O protocolo dos bilhetes permanece igual: rodadas antigas continuam congeladas.
const PROTOCOL='auto-421-1', EVALUATION='objetivo-426-3', VERSION=L.VERSION, POOL=96, REFERENCES=32;
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
// Utilidade fixada antes de avaliar: acertos altos recebem peso cúbico.
// Não é uma probabilidade ou estimativa de prêmio. +Milionária exige trevos.
function objective(m,t,draw){
 const c=L.cfg(m),h=L.hits(m,t,draw);
 if(c.extra==='trevos'&&(!t.trevos||!draw.trevos))return null;
 const extra=c.extra==='trevos'?t.trevos.filter(x=>draw.trevos.includes(x)).length/2:1;
 return (h/c.k)**3*extra**2;
}
function observation(m,r,draw,o){
 const controls=Array.from({length:REFERENCES},(_,i)=>randomTicket(m,L.rng(r.semente+':controle:'+i),o));
 const reference=L.mean(controls.map(t=>L.hits(m,t,draw)));
 const acertos=Object.fromEntries(r.testes.map(x=>[x.id,L.hits(m,x.jogo,draw)]));
 acertos.consenso=L.hits(m,r.consenso,draw);acertos.principal=L.hits(m,r.principal,draw);
 const tickets={...Object.fromEntries(r.testes.map(x=>[x.id,x.jogo])),consenso:r.consenso,principal:r.principal};
 const scores=Object.fromEntries(Object.entries(tickets).map(([id,t])=>[id,objective(m,t,draw)]));
 const full=objective(m,r.principal,draw)!==null;
 return {concurso:draw.concurso,data:draw.data,geradoAte:r.geradoAte,acertos,referencia:reference,
  objetivo:{protocolo:EVALUATION,valores:scores,referencia:full?L.mean(controls.map(t=>objective(m,t,draw))):null},
  resultado:{...L.validateTicket(m,draw,{resultado:true}),...(draw.dezenasSegundoSorteio?{dezenasSegundoSorteio:draw.dezenasSegundoSorteio.slice()}:{})},
  complementos:r.testes.map(x=>({id:x.id,financeiro:L.financial(m,x.jogo,draw)}))};
}
function compare(delta,seed){
 const s=L.paired(delta,seed,999);
 if(delta.length<10)return s;
 const blocks=[];for(let i=0;i<delta.length;i+=s.bloco)blocks.push(L.sum(delta.slice(i,i+s.bloco)));
 // Enumeração evita que a resolução de 999 sorteios impeça a correção de
 // 40 hipóteses em amostras pequenas. O IC continua sendo bootstrap em blocos.
 if(blocks.length<=16){
  let values=[0];for(const block of blocks)values=values.flatMap(x=>[x+block,x-block]);
  const target=Math.abs(L.sum(delta));
  s.p=values.filter(v=>Math.abs(v)>=target-1e-12).length/values.length;
  s.permutacoesExatas=values.length;
 }
 return s;
}
function statistics(obs,seed){
 const complete=obs.filter(x=>x.objetivo?.protocolo===EVALUATION&&x.objetivo.referencia!==null);
 const list=selectable.map(id=>({id,n:obs.length,media:L.mean(obs.map(x=>x.acertos[id])),
  acaso:compare(obs.map(x=>x.acertos[id]-x.referencia),seed+':'+id),
  consenso:compare(obs.map(x=>x.acertos[id]-x.acertos.consenso),seed+':consenso:'+id),
  objetivo:{n:complete.length,media:complete.length?L.mean(complete.map(x=>x.objetivo.valores[id])):null,
   acaso:compare(complete.map(x=>x.objetivo.valores[id]-x.objetivo.referencia),seed+':objetivo:'+id),
   consenso:compare(complete.map(x=>x.objetivo.valores[id]-x.objetivo.valores.consenso),seed+':objetivo-consenso:'+id)}}));
 const adj=L.holm(list.flatMap(x=>[x.acaso.p,x.consenso.p,x.objetivo.acaso.p,x.objetivo.consenso.p]));
 list.forEach((x,j)=>{[x.acaso,x.consenso,x.objetivo.acaso,x.objetivo.consenso].forEach((s,i)=>s.pAjustado=adj[j*4+i]);});return list;
}
const qualified=x=>L.robust(x.acaso)&&L.robust(x.consenso)&&L.robust(x.objetivo.acaso)&&L.robust(x.objetivo.consenso);
// A apresentação consulta o mesmo critério usado na revisão prospectiva.
const eligible=x=>qualified(x)&&x.pContinuoAcaso<.05&&x.pContinuoConsenso<.05&&x.objetivo.pContinuoAcaso<.05&&x.objetivo.pContinuoConsenso<.05;
function winner(stats){return stats.filter(qualified).sort((a,b)=>b.objetivo.consenso.ic[0]-a.objetivo.consenso.ic[0])[0]?.id||'consenso';}
function goalReport(m,obs){
 const k=L.cfg(m).k;
 return {protocolo:EVALUATION,n:obs.length,linhas:[...ids,'consenso','principal'].map(id=>{
  const dist=Array.from({length:k+1},(_,h)=>({acertos:h,vezes:obs.filter(x=>x.acertos[id]===h).length}));
  const full=obs.filter(x=>x.objetivo?.valores[id]!==null&&x.objetivo?.valores[id]!==undefined);
  const maximos=full.filter(x=>x.objetivo.valores[id]===1).length;
  return {id,distribuicao:dist,melhor:obs.length?Math.max(...dist.filter(x=>x.vezes).map(x=>x.acertos)):null,
   proximos:obs.filter(x=>x.acertos[id]>=k-1).length,maximos,completos:full.length,icMaximos:L.wilson(maximos,full.length)};
 })};
}
function retrospective(m,rows,o,progress){
 // Com só seis blocos de cinco concursos, o menor p bilateral é 2/64,
 // insuficiente para Holm em 40 comparações. Doze blocos em cada etapa
 // permitem confirmar um sinal forte sem relaxar o controle de falsos positivos.
 if(rows.length<180)return {estado:'amostra-insuficiente',metodo:'consenso',n:0,necessarios:180,nSelecao:60,observacoes:[],motivo:'A base ainda não permite separar 60 concursos de seleção e 60 de teste, além de 60 anteriores para treino. O pacote virtual começa sem escolher um vencedor histórico.'};
 const start=rows.length-120,training=rows.slice(0,start),b=model(m,training),obs=[];let choice='consenso',validation=[];
 for(let i=start;i<rows.length;i++){
  if(i===start+60){validation=statistics(obs,'validacao:'+o.profile+':'+rows[start].concurso);choice=winner(validation);}
  const p=proposal(b,o,rows[i].concurso),r={testes:p.tests,consenso:p.consensus,principal:p.consensus,semente:p.seed,geradoAte:rows[i-1].concurso};
  obs.push(observation(m,r,rows[i],o));add(b,rows[i]);
  progress({etapa:'Comparando estratégias automaticamente',feitos:i-start+1,total:120});
 }
 const test=statistics(obs.slice(60),'teste:'+o.profile+':'+rows[start+60].concurso),selected=test.find(x=>x.id===choice);
 const confirmed=choice!=='consenso'&&selected&&qualified(selected);
 return {estado:'concluido',metodo:confirmed?choice:'consenso',n:120,nSelecao:60,observacoes:obs,
  selecao:choice,validacao:validation,teste:test,congeladoAte:rows[start+59].concurso,
  particao:{treino:[rows[0].concurso,rows[start-1].concurso],validacao:[rows[start].concurso,rows[start+59].concurso],teste:[rows[start+60].concurso,rows.at(-1).concurso]},
  motivo:confirmed?'Uma estratégia superou o controle e o consenso em média e proximidade do prêmio máximo, na validação e no teste separado. A escolha continua exploratória até os próximos sorteios.':'Nenhuma estratégia confirmou melhora de média e proximidade do prêmio máximo nas duas etapas. Mantido o consenso; os próximos concursos serão avaliados automaticamente.'};
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
  // A fonte fornece somente a data, não a hora da apuração. Mesmo dia não
  // comprova que o pacote existia antes do sorteio: fica fora da evidência.
  const localDay=new Date(round.criadoEm).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  if(!draw.data||localDay>=draw.data){rejected.push(draw.concurso);continue;}
  observations.push(observation(m,round,draw,o));
 }
 observations.sort((a,b)=>a.concurso-b.concurso);
 const stats=statistics(observations,'prospectivo:'+o.profile),M=selectable.length*6,k=L.cfg(m).k;
 const complete=observations.filter(x=>x.objetivo.referencia!==null);
 for(const x of stats){
  x.pContinuoAcaso=Math.min(1,M*anytime(observations.map(r=>r.acertos[x.id]-r.referencia),k));
  x.pContinuoConsenso=Math.min(1,M*anytime(observations.map(r=>r.acertos[x.id]-r.acertos.consenso),k));
  x.pContinuoAbaixo=Math.min(1,M*anytime(observations.map(r=>r.referencia-r.acertos[x.id]),k));
  x.objetivo.pContinuoAcaso=Math.min(1,M*anytime(complete.map(r=>r.objetivo.valores[x.id]-r.objetivo.referencia),1));
  x.objetivo.pContinuoConsenso=Math.min(1,M*anytime(complete.map(r=>r.objetivo.valores[x.id]-r.objetivo.valores.consenso),1));
  x.objetivo.pContinuoAbaixo=Math.min(1,M*anytime(complete.map(r=>r.objetivo.referencia-r.objetivo.valores[x.id]),1));
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
 const initialCut=state.inicial?.particao?.teste?.[1];
 const initialSignature=initialCut?L.history(m,rows,{antesDe:initialCut+1}).meta.assinatura:null;
 if(rows.length&&(!state.inicial||state.inicial.protocoloAvaliacao!==EVALUATION||state.inicial.estado==='amostra-insuficiente'&&contiguous>=180||initialCut&&state.inicial.assinatura!==initialSignature)){
  state.inicial=retrospective(m,contiguous>=180?rows:rows.slice(-Math.min(contiguous,179)),o,progress);
  state.inicial.protocoloAvaliacao=EVALUATION;
  state.inicial.assinatura=L.history(m,rows).meta.assinatura;
  if(!state.decisoes.length)state.metodo=state.inicial.metodo;
 }
 const follow=prospective(m,evaluation.rows,state,o),count=follow.n;
 if(state.decisoes.length&&state.decisoes.at(-1).protocoloAvaliacao!==EVALUATION){
  const old=state.metodo;
  state.metodo=state.inicial?.metodo||'consenso';
  state.decisoes.push({n:count,protocoloAvaliacao:EVALUATION,concurso:follow.observacoes.at(-1)?.concurso??null,
   anterior:old,metodo:state.metodo,acao:'REVALIDAR',
   motivo:'Critério temporal atualizado: pacotes do mesmo dia sem hora oficial não entram na evidência. Método retorna à referência inicial até nova confirmação; rodadas originais preservadas.'});
 }
 const lastDecision=state.decisoes.at(-1),ready=count>=60&&(lastDecision?.protocoloAvaliacao!==EVALUATION||count>=(lastDecision?.n||30)+30);
 if(ready){
  const candidates=follow.ranking.filter(eligible).sort((a,b)=>b.objetivo.consenso.ic[0]-a.objetivo.consenso.ic[0]);
  const old=state.metodo||'consenso',chosen=candidates[0]?.id;
  const current=follow.ranking.find(x=>x.id===old),bad=current&&current.pContinuoAbaixo<.05&&current.acaso.ic?.[1]<0&&current.acaso.periodos.every(x=>x<0);
  const badObjective=current&&current.objetivo.pContinuoAbaixo<.05&&current.objetivo.acaso.ic?.[1]<0&&current.objetivo.acaso.periodos.every(x=>x<0);
  state.metodo=chosen||(bad||badObjective?'consenso':old);
  state.decisoes.push({n:count,protocoloAvaliacao:EVALUATION,concurso:follow.observacoes.at(-1).concurso,anterior:old,metodo:state.metodo,
   acao:state.metodo===old?'MANTER':'ALTERAR',motivo:chosen?'Melhora consistente de média e proximidade do prêmio máximo, acima do controle e do consenso em concursos futuros.':bad||badObjective?'O método ficou persistentemente abaixo do controle. Retorno ao consenso.':'As diferenças continuam compatíveis com o acaso. Manter evita trocar por causa de um único concurso.'});
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
  inicial:state.inicial||null,decisao:decision,objetivo:goalReport(m,count?follow.observacoes:state.inicial?.observacoes?.slice(state.inicial.nSelecao)||[]),proximaRevisao:Math.max(60,30*(Math.floor(count/30)+1)),
  pacoteVirtual:round.testes.map(x=>({...x,nome:experts[x.id]})),custoVirtual:0,pool:p?.pool||null,
  limite:'Os testes virtuais não são apostas. Acertos históricos e convergência não representam probabilidade futura. Comparação principal: dezenas/colunas; complementos e retorno financeiro são informados separadamente.'};
}
// Protocolo exclusivo do painel, sem participação em pesos/decisões/sementes.
const TIER_PROTOCOL='faixas-diagnostico-4268-1',WALLET_PROTOCOL='carteira-congelada-4268-1';
function frozenDay(instant){
 if(typeof instant!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(instant)||!Number.isFinite(Date.parse(instant)))return null;
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));
}
function freezeSavedGame(m,game,generatedUntil,instant=new Date().toISOString()){
 if(!frozenDay(instant)||!Number.isSafeInteger(generatedUntil)||generatedUntil<0)throw Error('Registro prospectivo inválido.');
 const kind=game.acompanhamento||'unico',start=kind==='unico'?game.concursoAlvo:game.deConcurso;
 if(!['unico','fixo','teimosinha'].includes(kind)||!Number.isSafeInteger(start)||start<=generatedUntil)throw Error('Defina um concurso futuro para registrar a carteira.');
 const count=kind==='teimosinha'?game.concursos:1;
 if(!Number.isSafeInteger(count)||count<1||count>10000)throw Error('Quantidade de concursos inválida.');
 return {protocolo:WALLET_PROTOCOL,criadoEm:instant,geradoAte:generatedUntil,
  acompanhamento:kind,inicio:start,fim:kind==='fixo'?null:start+count-1,jogo:L.validateTicket(m,game,{completo:true})};
}
function hitTiers(m,groups,{prospectivo=true,familia}={}){
 const c=L.cfg(m),M=familia||3*(2*(c.k+1)+2*(c.extra==='trevos'?3:c.extra?2:0));
 const n=groups.length,rows=[];
 const summarize=(h,minimum,component=false)=>{
  const complete=component?groups.filter(g=>g.resultado[c.extra]!==undefined&&g.jogos.every(t=>t[c.extra]!==undefined)):groups;
  const observations=complete.map(g=>{
   const values=g.jogos.map(t=>{
    const hit=component?(c.extra==='trevos'?t.trevos.filter(d=>g.resultado.trevos.includes(d)).length:Number(t[c.extra]===g.resultado[c.extra])):L.hits(m,t,g.resultado);
    const ps=component?(c.extra==='trevos'?Array.from({length:3},(_,i)=>L.comb(t.trevos.length,i)*L.comb(6-t.trevos.length,2-i)/L.comb(6,2)):[1-1/c.extraN,1/c.extraN]):L.distribution(m,t);
    return {observado:Number(minimum?hit>=h:hit===h),referencia:minimum?L.sum(ps.slice(h)):ps[h]};
   });
   return {observado:L.mean(values.map(x=>x.observado)),referencia:L.mean(values.map(x=>x.referencia))};
  });
  const count=observations.length,actual=count?L.mean(observations.map(x=>x.observado)):null,expected=count?L.mean(observations.map(x=>x.referencia)):null;
  // Hoeffding condicional + união sobre faixas/escopos e n: soma 1/[n(n+1)]=1.
  // Cada concurso fornece UMA observação limitada a [0,1], mesmo com jogos sobrepostos.
  const radius=count&&prospectivo?Math.sqrt(Math.log(2*M*count*(count+1)/.05)/(2*count)):null;
  return {acertos:h,tipo:minimum?'pelo-menos':'exatamente',n:count,observado:actual,referencia:expected,
   diferenca:count?actual-expected:null,intervaloDiferenca:radius===null?null:[Math.max(-1,actual-expected-radius),Math.min(1,actual-expected+radius)],
   ocorrencias:complete.reduce((total,g)=>total+Number(g.jogos.some(t=>{const v=component?(c.extra==='trevos'?t.trevos.filter(d=>g.resultado.trevos.includes(d)).length:Number(t[c.extra]===g.resultado[c.extra])):L.hits(m,t,g.resultado);return minimum?v>=h:v===h;})),0)};
 };
 for(let h=0;h<=c.k;h++)rows.push(summarize(h,false),summarize(h,true));
 const complement=c.extra?Array.from({length:c.extra==='trevos'?3:2},(_,h)=>[summarize(h,false,true),summarize(h,true,true)]).flat():[];
 const formats=[...new Set(groups.flatMap(g=>g.jogos.map(t=>c.colunas?t.colunas.map(a=>a.length).join('/')+' marcações por coluna':t.dezenas.length+' dezenas'+(c.extra==='trevos'?' + '+t.trevos?.length+' trevos':''))))];
 return {n,bilhetes:groups.reduce((total,g)=>total+g.jogos.length,0),formatos:formats,linhas:rows,complementos:complement,
  periodo:n?{primeiro:groups[0].concurso,ultimo:groups.at(-1).concurso,dataPrimeiro:groups[0].data,dataUltimo:groups.at(-1).data}:null,
  familia:M,prospectivo,unidade:'Média por concurso da fração de jogos na faixa. Bilhetes do mesmo concurso não são observações independentes.',
  protocolo:TIER_PROTOCOL,extracao:c.dupla?'Primeiro sorteio; segunda extração e prêmios não são agregados.':'Dezenas/colunas; complementos conferidos separadamente.'};
}
function prospectiveTiers(m,records,input,op={},saved=[]){
 const c=L.cfg(m),o=options(m,op),state=validateState(m,input,o),b=L.history(m,records,{antesDe:op.antesDe??null});
 const byNumber=new Map(b.rows.map(r=>[r.concurso,r])),principal=[],virtual=[],wallet=[],pending=[],rejected=[];
 for(const round of state.rodadas){
  const draw=byNumber.get(round.concursoAlvo);
  if(!draw){pending.push(round.concursoAlvo);continue;}
  const day=frozenDay(round.criadoEm);
  if(!draw.data||!day||day>=draw.data){rejected.push({concurso:round.concursoAlvo,motivo:!draw.data?'Resultado sem data':'Data de geração não comprova antecedência ao resultado'});continue;}
  const base={concurso:draw.concurso,data:draw.data,resultado:draw};
  principal.push({...base,jogos:[round.principal]});virtual.push({...base,jogos:round.testes.map(t=>t.jogo)});
 }
 let legacy=0,changed=0;const entries=[],savedForMode=saved.filter(t=>t.modalidade===m),walletLimited=savedForMode.length>200;
 for(const game of walletLimited?[]:savedForMode){
  const f=game.registroProspectivo;
  if(!f||f.protocolo!==WALLET_PROTOCOL){legacy++;continue;}
  try{
   const checked=freezeSavedGame(m,{...f.jogo,acompanhamento:f.acompanhamento,concursoAlvo:f.inicio,deConcurso:f.inicio,concursos:f.fim===null?1:f.fim-f.inicio+1},f.geradoAte,f.criadoEm);
   if(JSON.stringify(checked)!==JSON.stringify(f)||L.key(m,game)!==L.key(m,f.jogo)){changed++;continue;}
   const day=frozenDay(f.criadoEm);entries.push({f,day});
  }catch{changed++;}
 }
 let noDate=0,sameDay=0;
 for(const draw of b.rows){
  const eligible=entries.filter(({f})=>draw.concurso>=f.inicio&&(f.fim===null||draw.concurso<=f.fim));
  if(!eligible.length)continue;
  if(!draw.data){noDate++;continue;}
  const games=eligible.filter(({day})=>day<draw.data).map(({f})=>f.jogo);
  if(games.length)wallet.push({concurso:draw.concurso,data:draw.data,resultado:draw,jogos:games});
  if(games.length<eligible.length)sameDay++;
 }
 const sorted=xs=>xs.sort((a,b)=>a.concurso-b.concurso),M=3*(2*(c.k+1)+2*(c.extra==='trevos'?3:c.extra?2:0));
 const scopes=[['principal','Principal congelada',principal],['carteira','Carteira salva no aparelho',wallet],['virtual','Pacote virtual',virtual]].map(([id,nome,g])=>({id,nome,...hitTiers(m,sorted(g),{familia:M,prospectivo:id!=='carteira'})}));
 return {modalidade:m,perfil:o.profile,protocolo:TIER_PROTOCOL,protocoloBilhetes:PROTOCOL,escopos:scopes,
  pendentes:[...new Set(pending)].sort((a,b)=>a-b),rejeitados:rejected,carteiraLimitada:walletLimited,carteiraExcluida:{legados:legacy,alterados:changed,semData:noDate,semAntecedencia:sameDay},
  integridade:{conflitos:b.meta.conflitos,invalidos:b.meta.invalidos,lacunas:b.meta.lacunas,correcoes:b.rows.filter(r=>r.revisoes?.length).length},
  metodo:'Diagnóstico sem sinal de superioridade. H0: sorteios uniformes independentes, condicionados aos jogos congelados. Referência analítica por bilhete; média e diferença calculadas por concurso. Limite de Hoeffding bilateral com 95% de cobertura conjunta nas faixas, três escopos e consultas sucessivas deste perfil: alfa/(M n(n+1)). Não é intervalo para chance de prêmio da carteira. Comparar outros perfis não fica coberto por esta família.',
  nota:'Resultado ausente não vira zero. Exatamente h e pelo menos h são eventos distintos. Jogos salvos não comprovam compra. A carteira é o recorte dos jogos que continuam salvos: exclusões podem selecionar resultados a posteriori; sem trilha imutável de exclusões, ela recebe somente descrição, sem limites inferenciais. O painel não altera pesos, métodos, sementes ou rodadas.'};
}
const diagnosticCache=new Map();
function observatory(m,records,state,op={},saved=[],tickets=[]){
 // Chave completa no worker: inclui metadados, correções, carteira, formato e corte.
 const cacheKey=JSON.stringify([m,records,state,op,saved,tickets]);
 if(diagnosticCache.has(cacheKey))return clone(diagnosticCache.get(cacheKey));
 const b=L.history(m,records,{antesDe:op.antesDe??null}),tiers=prospectiveTiers(m,records,state,op,saved),c=L.cfg(m);
 const initial=state.inicial,observations=initial?.estado==='concluido'?initial.observacoes.slice(initial.nSelecao):[];
 // As observações do teste guardam o consenso histórico, não a principal do usuário.
 const historical=observations.map(x=>({concurso:x.concurso,data:x.data,acertos:x.acertos.consenso}));
 const separate={n:historical.length,periodo:initial?.particao?.teste||null,protocolo:initial?.protocoloAvaliacao||null,
  linhas:Array.from({length:c.k+1},(_,h)=>({acertos:h,exatamente:historical.filter(x=>x.acertos===h).length,peloMenos:historical.filter(x=>x.acertos>=h).length})),
  nota:'Teste histórico separado do consenso; não é carteira real nem principal prospectiva. Nenhum intervalo de consultas futuras é aplicado ao teste histórico.'};
 const result={faixas:tiers,testeSeparado:separate,carteira:L.portfolioDiagnosis(m,tickets,op),proveniencia:L.historyProvenance(b)};
 if(diagnosticCache.size>=3)diagnosticCache.delete(diagnosticCache.keys().next().value);
 diagnosticCache.set(cacheKey,clone(result));return result;
}
function autoRecommend(m,records,input={},op={},progress=()=>{}){
 const plano=L.assertRecommendationPlan(L.recommendationPlan(m,op,'automatico'));
 const cycle=autoCycle(m,records,input,op,progress),o=options(m,op),base=L.recommendationBase(m,records,op),q=op.quantidade??1;
 if(!Number.isInteger(q)||q<1||q>60)throw Error('Escolha de 1 a 60 jogos.');
 const unit=L.currentCost(m,o.shape),budget=op.orcamento==null||op.orcamento===''?q*unit:Number(op.orcamento);
 if(!Number.isFinite(budget)||budget<unit)throw Error('O orçamento não cobre um jogo.');
 const size=Math.min(q,Math.floor((budget+1e-8)/unit)),pool=cycle.pool||(size>1?proposal(model(m,base.rows),o,cycle.rodada.concursoAlvo||1).pool:[]);
 const selected=[cycle.rodada.principal],seen=new Set(selected.map(t=>L.key(m,t)));
 while(selected.length<size){
  const next=pool.filter(x=>!seen.has(L.key(m,x.jogo))).map(x=>({...x,value:x.score-L.mean(selected.map(t=>L.hits(m,t,x.jogo)/L.tokens(m,t).length))})).sort((a,b)=>b.value-a.value)[0];
  if(!next)throw Error('O espaço matemático comporta o lote, mas a amostragem não encontrou candidatas diferentes suficientes. Reduza a quantidade ou revise as restrições. Nenhum jogo foi alterado.');selected.push(next.jogo);seen.add(L.key(m,next.jogo));
 }
 progress({etapa:'Explicando a decisão automática',feitos:1,total:1});
 const analysis=L.analyze(m,selected[0],base.rows),adherence=L.reference(m,selected[0],base.rows,{amostras:1000,semente:cycle.rodada.semente+':explicacao'});
 const explanations=selected.map(jogo=>({jogo,distancia:null,criterios:[]}));
 const {pool:unused,...publicCycle}=cycle;
 analysis.base=base.meta;
 analysis.saudeBase=L.historyHealth(base);
 analysis.diagnosticoFrequencia=L.frequencyDiagnosis(m,base);
 analysis.padroes=L.patternSummary(m,selected[0],base);
 const estadoValidacao=cycle.acompanhamento.n>=60?'prospectivo':cycle.inicial?.estado==='concluido'?'teste-separado':'insuficiente';
 const qualidadeEvidencia=L.evidenceQuality(base.meta,{estado:estadoValidacao},base.meta.n>=30?'perfil-historico':'amostra-insuficiente');
 return {versao:VERSION,motor:'automatico',plano,modalidade:m,semente:cycle.rodada.semente,
  parametros:{janela:o.janela,antesDe:op.antesDe??null,formato:o.shape,fixas:o.fixed,excluidas:o.excluded,trevosFixos:o.trevosFixos},
  base:base.meta,totalDisponivel:base.totalDisponivel,jogos:selected,explicacoes:explanations,
  principal:{...explanations[0],analise:analysis,aderencia:adherence},diversidade:L.portfolio(m,selected),
  custo:selected.length*unit,unitario:unit,solicitados:q,candidatos:cycle.rodada.candidatos,estado:base.meta.n>=30?'perfil-historico':'amostra-insuficiente',
  calibracao:{estado:estadoValidacao,perfil:cycle.rodada.metodo,pesos:{},motivo:cycle.decisao.motivo,particao:cycle.inicial?.particao},qualidadeEvidencia,
  motivo:cycle.rodada.metodo==='consenso'?'Combinação com maior concordância entre as dez estratégias do pacote virtual.':'Estratégia selecionada automaticamente: '+experts[cycle.rodada.metodo]+'.',
  evidencia:'Seleção e comparação automáticas; vantagem futura não demonstrada.',automatico:publicCycle,aviso:L.aviso};
}
Object.assign(L,{autoProtocol:PROTOCOL,autoEvaluation:EVALUATION,autoObjective:objective,autoExperts:experts,autoOptions:options,autoCycle,autoRecommend,autoProspective:prospective,autoAnytime:anytime,autoEligible:eligible,tierProtocol:TIER_PROTOCOL,walletProtocol:WALLET_PROTOCOL,freezeSavedGame,hitTiers,prospectiveTiers,observatory});
if(typeof module!=='undefined'&&module.exports)module.exports=L;
})(globalThis);
