/* Uma seleção principal, com os mesmos cálculos usados no laboratório.
 * Frequência, atraso e semelhança são critérios descritivos, não previsões.
 * Recebe um retrato explícito dos dados; não lê estado da interface. */
(function(root){
'use strict';
const L=root.LL18||(typeof require==='function'?require('./lab-core.js'):null);
if(!L.paired&&typeof require==='function')require('./lab-strategies.js');
const labels={soma:'Soma',paridade:'Pares e ímpares',amplitude:'Amplitude',
 consecutivos:'Consecutivos',dispersao:'Dispersão',concentracao:'Faixas numéricas',
 finais:'Finais',frequencia:'Frequência histórica',atraso:'Atrasos observáveis',
 paresTrios:'Pares e trios no histórico',repeticao:'Repetição do último resultado',
 perfil:'Distribuição de acertos'};

function recommendationBase(m,records,op={}){
 const janela=op.janela??0;
 if(!Number.isInteger(janela)||janela<0)throw Error('Janela de histórico inválida.');
 const full=L.history(m,records,{antesDe:op.antesDe??null});
 if(!janela||full.rows.length<=janela)return {...full,totalDisponivel:full.meta.n};
 const cut=L.history(m,full.rows.slice(-janela),{antesDe:op.antesDe??null});
 cut.meta.invalidos=full.meta.invalidos;cut.meta.conflitos=full.meta.conflitos;
 cut.meta.duplicatas=full.meta.duplicatas;
 return {...cut,totalDisponivel:full.meta.n};
}

// A semente da validação depende da base e do formato, nunca do botão
// "novo jogo". Repetir a geração não procura um backtest mais favorável.
const calibrationCache=new Map();
const weightProfiles=[
 {id:'neutro',pesos:{}},
 {id:'estrutura',pesos:{soma:1.2,paridade:1.2,amplitude:1.2,consecutivos:1.2,dispersao:1.2,concentracao:1.2,finais:1.2}},
 {id:'frequencia',pesos:{frequencia:1.2,atraso:.8}},
 {id:'subconjuntos',pesos:{paresTrios:1.2,perfil:1.2,repeticao:.8}}
];
function calibrateRecommendation(m,records,op={},progress=()=>{}){
 const b=recommendationBase(m,records,op),c=L.cfg(m);
 const shape=op.formato?L.validateTicket(m,op.formato,{completo:true}):L.randomTicket(m,L.rng('formato-420'));
 const sizes=c.colunas?shape.colunas.map(a=>a.length):[shape.dezenas.length,shape.trevos?.length||0];
 const signature=JSON.stringify([m,b.meta.assinatura,sizes,op.fixas||[],op.excluidas||[]]);
 if(calibrationCache.has(signature))return calibrationCache.get(signature);
 const fallback={versao:L.VERSION,modalidade:m,assinatura:b.meta.assinatura,pesos:{},perfil:'neutro',estado:'insuficiente',
   motivo:'Pesos neutros: são necessários 120 concursos consecutivos para separar treino, validação e teste.'};
 // Restrições alteram a população de comparação. Não reutilizar evidência
 // obtida para jogos livres em jogos fixados pelo usuário.
 if(L.nums(op.fixas||[]).length||L.nums(op.excluidas||[]).length)
   return {...fallback,estado:'restricoes',motivo:'Pesos neutros: fixas e exclusões não participaram da validação de jogos livres.'};
 const rows=b.rows.filter(r=>r.bloco===b.rows.at(-1)?.bloco).slice(-180);
 if(rows.length<120||c.especial)return fallback;
 const seed='validacao-420:'+m+':'+sizes.join(','),start=rows.length-60,observacoes=[];
 let selecao=null;
 function summarize(lo,hi){
   const segment=observacoes.slice(lo,hi),stats=weightProfiles.map((v,j)=>({id:v.id,
     acaso:L.paired(segment.map(r=>r.acertos[j]-r.acaso),seed+':'+lo+':acaso:'+j),
     neutro:L.paired(segment.map(r=>r.acertos[j]-r.acertos[0]),seed+':'+lo+':neutro:'+j)}));
   const ps=L.holm(stats.slice(1).flatMap(s=>[s.acaso.p,s.neutro.p]));
   stats.slice(1).forEach((s,j)=>{s.acaso.pAjustado=ps[2*j];s.neutro.pAjustado=ps[2*j+1];});
   return stats;
 }
 for(let i=start;i<rows.length;i++){
   if(i===start+30){
     const validacao=summarize(0,30),eligible=validacao.slice(1).filter(s=>L.robust(s.acaso)&&L.robust(s.neutro));
     eligible.sort((a,b)=>b.neutro.ic[0]-a.neutro.ic[0]);
     selecao={perfil:eligible[0]?.id||'neutro',congeladaAte:rows[i-1].concurso,resultados:validacao};
   }
   const past=L.history(m,rows.slice(0,i)),random=L.rng(seed+':'+rows[i].concurso);
   const same=c.colunas?shape.colunas.every(a=>a.length===1):shape.dezenas.length===c.k;
   const refs=same?past.rows.map((r,j)=>L.vector(m,r,past,j)):
     Array.from({length:100},()=>L.vector(m,L.randomTicket(m,random,shape),past));
   const model=L.center(refs),pool=Array.from({length:80},()=>{
     const jogo=L.randomTicket(m,random,shape);return {jogo,v:L.vector(m,jogo,past)};
   });
   const acertos=weightProfiles.map(p=>{
     let chosen=pool[0],best=Infinity;
     for(const x of pool){const score=L.distance(x.v,model,p.pesos);if(score<best){best=score;chosen=x;}}
     return L.hits(m,chosen.jogo,rows[i]);
   });
   const uniform=L.rng(seed+':acaso:'+rows[i].concurso);
   const acaso=L.mean(Array.from({length:32},()=>L.hits(m,L.randomTicket(m,uniform,shape),rows[i])));
   observacoes.push({concurso:rows[i].concurso,treinoAte:rows[i-1].concurso,acertos,acaso});
   progress({etapa:'Validando pesos em concursos posteriores ao treino',feitos:i-start+1,total:60});
 }
 const teste=summarize(30,60),winner=teste.find(s=>s.id===selecao.perfil);
 const accepted=selecao.perfil!=='neutro'&&L.robust(winner.acaso)&&L.robust(winner.neutro);
 const result={...fallback,estado:accepted?'ajustado':'neutro',perfil:accepted?selecao.perfil:'neutro',
   pesos:accepted?{...weightProfiles.find(p=>p.id===selecao.perfil).pesos}:{},semente:seed,
   particao:{treino:[rows[0].concurso,rows[start-1].concurso],validacao:[rows[start].concurso,rows[start+29].concurso],teste:[rows[start+30].concurso,rows.at(-1).concurso]},
   selecao,teste,observacoes,candidatos:80,referencias:32,
   motivo:accepted?'Pesos ajustados em até 20%, após validação e confirmação em teste separado. Resultado exploratório; acompanhar concursos futuros.':
     'Pesos neutros mantidos: nenhum ajuste superou simultaneamente o perfil neutro e o acaso na validação e no teste separado.',
   limites:'60 alvos walk-forward, 30 para validação e 30 para teste. IC 95%, permutação em blocos, Holm em 6 comparações por etapa e estabilidade em 3 períodos. Mede o jogo principal; não certifica lucro, complementos ou o lote. Monte Carlo descreve o acaso e não fornece sinal preditivo.'};
 if(calibrationCache.size>=12)calibrationCache.delete(calibrationCache.keys().next().value);
 calibrationCache.set(signature,result);return result;
}

/* Qualidade da evidência não é probabilidade de prêmio. É um resumo operacional
 * para impedir que o usuário confunda uma seleção bem explicada com uma
 * previsão. A pontuação é determinística e penaliza base curta, lacunas,
 * conflitos e ausência de validação fora da amostra. */
function evidenceQuality(base,calibration,state){
 const reasons=[],limits=[],penalidades=[];let score=100;
 const n=Number(base?.n)||0,gaps=(Number(base?.lacunas)||0)+(Number(base?.semRegistroAteCorte)||0);
 const penalizar=(p,motivo)=>{score-=p;penalidades.push({pontos:p,motivo});limits.push(motivo);};
 // Ausência anterior ao início descreve o recorte, não uma lacuna interna.
 if(base?.inicioAusente)limits.push(`recorte começa no concurso ${base.primeiro??Number(base.inicioAusente)+1}; concursos anteriores não foram analisados`);
 if(n<30)penalizar(45,`base curta: ${n} concurso${n===1?'':'s'} válidos`);
 else if(n<60)penalizar(25,`base ainda pequena: ${n} concursos válidos`);
 else if(n<120)penalizar(12,`base moderada: ${n} concursos; validação integrada ainda é limitada`);
 else reasons.push(`${n} concursos válidos na base`);
 if(gaps)penalizar(Math.min(25,gaps*2),`${gaps} lacuna${gaps===1?'':'s'} no histórico`);
 if(Number(base?.conflitos)>0)penalizar(15,`${base.conflitos} conflito${base.conflitos===1?'':'s'} excluído${base.conflitos===1?'':'s'}`);
 for(const [campo,nome] of [['semData','sem data'],['semComplemento','sem complemento completo'],['invalidos','registros inválidos excluídos']]){
   const k=Number(base?.[campo])||0;if(k)penalizar(Math.min(15,15*k/Math.max(1,n)),`${k} ${nome}`);
 }
 const cs=calibration?.estado;
 const validacao=cs==='ajustado'?'ajuste confirmado em teste separado':cs==='neutro'?'teste separado executado; sem ajuste confirmado':
   cs==='teste-separado'?'teste separado executado; vantagem futura não demonstrada':
   cs==='prospectivo'?'acompanhamento prospectivo disponível; vantagem futura não demonstrada':
   cs==='recuo-prospectivo'?'perfil suspenso pelo acompanhamento prospectivo':
   cs==='restricoes'?'restrições não participaram desta calibração':'validação não executada ou amostra insuficiente';
 if(cs==='ajustado')reasons.push('pesos validados em período separado');
 else if(['prospectivo','neutro','teste-separado'].includes(cs))reasons.push(validacao);
 else if(cs==='recuo-prospectivo')penalizar(20,'acompanhamento prospectivo suspendeu o perfil');
 else penalizar(8,validacao);
 if(state==='amostra-insuficiente')limits.push('seleção sem ranking histórico confiável');
 if(state==='perfil-historico')reasons.push('ranking histórico aplicado apenas de forma descritiva');
 if(state==='recuo-prospectivo')limits.push('perfil histórico em recuo por desempenho prospectivo inferior');
 const validada=['ajustado','neutro','prospectivo','teste-separado'].includes(cs);
 const teto=n===0?0:n<30?49:!validada?69:100;
 score=Math.min(score,teto);
 score=Math.max(0,Math.min(100,Math.round(score)));
 const nivel=score>=75?'boa':score>=50?'moderada':'limitada';
 return {pontuacao:score,nivel,motivo:`Qualidade operacional ${nivel} (${score}/100), por regra heurística. Não é uma estimativa de chance de prêmio nem confiança estatística.`,
   fatores:reasons,limitacoes:[...new Set(limits)],validacao,penalidades,teto,
   metodologia:'Índice heurístico não calibrado: parte de 100, desconta tamanho, lacunas internas, conflitos e incompletude; aplica teto 0 sem base, 49 com menos de 30 concursos e 69 sem validação. Não premia acertos nem implica previsão.',versao:'qualidade-evidencia-2'};
}

// BigInt preserva contagens como C(100,50); a saída usa strings serializáveis.
function exactChoose(n,k){
 if(k<0||k>n)return 0n;
 let value=1n;for(let i=1;i<=Math.min(k,n-k);i++)value=value*BigInt(n-i+1)/BigInt(i);
 return value;
}
function recommendationPlan(m,op={},motor='automatico'){
 if(!['automatico','integrado'].includes(motor))throw Error('Motor de recomendação inválido.');
 const c=L.cfg(m),shape=L.validateTicket(m,op.formato||L.randomTicket(m,L.rng('formato:'+m)),{completo:true});
 const parse=value=>{const a=L.nums(value??[]);if(new Set(a).size!==a.length||a.some(d=>d<c.base||d>=c.base+c.N))throw Error('Dezenas fixas ou excluídas inválidas.');return a.sort((a,b)=>a-b);};
 const fixed=parse(op.fixas),excluded=parse(op.excluidas);
 if(c.colunas&&(fixed.length||excluded.length))throw Error('Restrições por dezena não se aplicam às colunas.');
 if(fixed.some(d=>excluded.includes(d)))throw Error('Uma dezena não pode estar fixa e excluída ao mesmo tempo.');
 if(op.trevosFixos!==undefined&&op.trevosFixos!==null){
  if(c.extra!=='trevos')throw Error('Trevos fixos não se aplicam a esta modalidade.');
  shape.trevos=L.validateTicket(m,{...shape,trevos:op.trevosFixos},{completo:true}).trevos;
 }
 const marked=c.colunas?L.sum(shape.colunas.map(a=>a.length)):shape.dezenas.length;
 const free=c.colunas?null:c.N-fixed.length-excluded.length,remaining=c.colunas?null:marked-fixed.length;
 if(remaining!==null&&remaining<0)throw Error('Há mais dezenas fixas do que posições no jogo.');
 if(remaining!==null&&remaining>free)throw Error('As exclusões não deixam dezenas suficientes para montar o jogo.');
 const q=op.quantidade??1;
 if(!Number.isInteger(q)||q<1||q>60)throw Error('Escolha de 1 a 60 jogos.');
 const unit=L.currentCost(m,shape),budget=op.orcamento==null||op.orcamento===''?q*unit:Number(op.orcamento);
 if(!Number.isFinite(budget)||budget<unit)throw Error('O orçamento não cobre um jogo. Reduza as dezenas ou ajuste o limite.');
 const size=Math.min(q,Math.floor((budget+1e-8)/unit));
 const main=c.colunas?shape.colunas.reduce((a,col)=>a*exactChoose(10,col.length),1n):exactChoose(free,remaining);
 const fullMain=c.colunas?main:exactChoose(c.N,marked);
 const extra=c.extra==='trevos'?(op.trevosFixos!=null?1n:exactChoose(6,shape.trevos.length)):
  ['mes','time'].includes(c.extra)?BigInt(c.extraN):1n;
 const complete=main*extra,capacity=motor==='automatico'?complete:main;
 const overlap=c.colunas?L.sum(shape.colunas.map(a=>a.length*a.length/10)):fixed.length+(free?remaining*remaining/free:0);
 const originalOverlap=c.colunas?overlap:marked*marked/c.N;
 const janela=op.janela??0,antesDe=op.antesDe??null;
 if(!Number.isInteger(janela)||janela<0)throw Error('Janela de histórico inválida.');
 if(antesDe!==null&&(!Number.isSafeInteger(antesDe)||antesDe<1))throw Error('Corte de concurso inválido.');
 const alerts=[];
 if(size<q)alerts.push(`O limite comporta ${size} dos ${q} jogos solicitados; o orçamento não será aumentado.`);
 if(fixed.length||excluded.length||op.trevosFixos!=null)alerts.push('Restrições mudam a população de jogos e limitam a variedade; não tornam suas dezenas mais prováveis.');
 if(janela)alerts.push(`Seleção limitada aos últimos ${janela} registros válidos anteriores ao corte; isso não significa ${janela} concursos consecutivos.`);
 if(antesDe)alerts.push(`Somente resultados anteriores ao concurso ${antesDe} podem participar da seleção.`);
 if(capacity<BigInt(size))alerts.push(`As restrições permitem somente ${capacity} jogo(s) diferente(s) pela identidade deste motor, menos que o lote de ${size}. Reduza a quantidade ou revise as restrições.`);
 else if(capacity===BigInt(size))alerts.push('O lote utiliza todas as configurações disponíveis pela identidade deste motor; não há outra combinação distinta dentro dessas restrições.');
 if(extra>1n)alerts.push(motor==='automatico'?'A identidade inclui o complemento: jogos com as mesmas dezenas e complementos diferentes podem aparecer no lote.':'Neste motor, jogos adicionais precisam ter dezenas/colunas diferentes; mudar somente o complemento não cria um adicional.');
 return {protocolo:'plano-recomendacao-1',modalidade:m,motor,viavel:capacity>=BigInt(size),formato:shape,
  fixas:fixed,excluidas:excluded,trevosFixos:op.trevosFixos!=null?shape.trevos:null,
  marcadas:marked,livresDisponiveis:free,aEscolher:remaining,
  combinacoesPrincipais:main.toString(),combinacoesCompletas:complete.toString(),capacidadeMotor:capacity.toString(),
  principaisSemRestricoes:fullMain.toString(),complementosPossiveis:extra.toString(),
  fracaoPrincipal:main===fullMain?1:Number(main)/Number(fullMain),
  identidade:motor==='automatico'?'Jogo completo, incluindo complementos.':'Dezenas/colunas principais; complementos diferentes não criam adicionais.',
  solicitados:q,efetivos:size,unitario:unit,orcamento:budget,custo:size*unit,reduzidoPorOrcamento:size<q,
  sobreposicaoReferencia:overlap,sobreposicaoSemRestricoes:originalOverlap,
  janela,antesDe,avisos:alerts,
  metodologia:c.colunas?'Configurações principais = produto de C(10, marcações por coluna). Sobreposição = soma de marcações²/10.':
   'Configurações principais = C(dezenas livres disponíveis, posições restantes). Sobreposição de referência = fixas + posições restantes²/dezenas livres disponíveis (zero se não há livres).',
  limites:'Contagens exatas de formatos possíveis, não de candidatas avaliadas. Referência de sobreposição para dois jogos uniformes independentes sob as mesmas restrições; admite repetições e não descreve o lote otimizado. Não é probabilidade de prêmio, vantagem ou cobertura garantida. Não somamos chances de jogos sobrepostos. Custo usa os preços configurados no app, sem compra de apostas.'};
}
function assertRecommendationPlan(plan){
 if(!plan.viavel)throw Error(`As restrições permitem somente ${plan.capacidadeMotor} jogo(s) diferente(s). Reduza a quantidade ou revise as restrições.`);
 return plan;
}

function recommend(m,records,op={},progress=()=>{}){
 const c=L.cfg(m),seed=String(op.semente??'recomendacao-419'),random=L.rng(seed);
 const q=op.quantidade??1,N=op.candidatos??Math.max(600,q*25);
 if(!Number.isInteger(q)||q<1||q>60||!Number.isInteger(N)||N<q||N>10000)
   throw Error('Escolha de 1 a 60 jogos e até 10.000 candidatos.');
 const originalShape=op.formato?L.validateTicket(m,op.formato,{completo:true}):L.randomTicket(m,L.rng(seed+':formato'));
 const plano=assertRecommendationPlan(recommendationPlan(m,{...op,formato:originalShape},'integrado')),shape=plano.formato;
 const parse=value=>{const a=L.nums(value);if(new Set(a).size!==a.length||a.some(d=>d<c.base||d>=c.base+c.N))throw Error('Dezenas fixas ou excluídas inválidas.');return a.sort((a,b)=>a-b);};
 const fixed=parse(op.fixas||[]),excluded=parse(op.excluidas||[]);
 if(c.colunas&&(fixed.length||excluded.length))throw Error('Restrições por dezena não se aplicam às colunas.');
 if(fixed.some(d=>excluded.includes(d)))throw Error('Uma dezena não pode estar fixa e excluída ao mesmo tempo.');
 const universe=Array.from({length:c.N},(_,i)=>i+c.base).filter(d=>!fixed.includes(d)&&!excluded.includes(d));
 const remaining=c.colunas?0:shape.dezenas.length-fixed.length;
 if(remaining<0)throw Error('Há mais dezenas fixas do que posições no jogo.');
 if(remaining>universe.length)throw Error('As exclusões não deixam dezenas suficientes para montar o jogo.');
 const unit=L.currentCost(m,shape),budget=op.orcamento==null||op.orcamento===''?q*unit:Number(op.orcamento);
 if(!Number.isFinite(budget)||budget<unit)throw Error('O orçamento não cobre um jogo. Reduza as dezenas ou ajuste o limite.');
 const size=Math.min(q,Math.floor((budget+1e-8)/unit));
 const possible=c.colunas?shape.colunas.reduce((a,col)=>a*L.comb(10,col.length),1):L.comb(universe.length,remaining);
 if(possible<size)throw Error('As restrições permitem somente '+possible+' jogo(s) diferente(s).');
 const b=recommendationBase(m,records,op),monitor=op.acompanhamento;
 const suspended=monitor?.comparacao?.n>=60&&monitor.comparacao.pAjustado<.05&&
   monitor.comparacao.ic?.[1]<0&&monitor.comparacao.periodos?.length===3&&monitor.comparacao.periodos.every(x=>x<0);
 const enough=b.rows.length>=30&&!suspended;
 let calibration=calibrateRecommendation(m,records,{...op,formato:shape},progress);
 if(suspended)calibration={...calibration,estado:'recuo-prospectivo',pesos:{},perfil:'uniforme',
   motivo:'Seleção por perfil suspensa: acompanhamento prospectivo persistentemente inferior à referência. Mantidos orçamento, restrições e diversidade.'};
 const weights=calibration.pesos;
 const refRandom=L.rng(seed+':calibracao');
 const same=c.colunas?shape.colunas.every(a=>a.length===1):shape.dezenas.length===c.k;
 // O resultado que é referência não conta como acerto de si próprio.
 const reference=enough&&same?b.rows.map((r,i)=>L.vector(m,r,b,i)):
   Array.from({length:200},()=>L.vector(m,L.randomTicket(m,refRandom,shape),b));
 const model=L.center(reference),pool=[],seen=new Set(),limit=Math.min(N,possible);
 // Enumeração quando o espaço é pequeno evita esgotar tentativas com fixas.
 const ranks=!c.colunas&&possible<=N?Array.from({length:possible},(_,i)=>i):null;
 if(ranks)for(let i=ranks.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ranks[i],ranks[j]]=[ranks[j],ranks[i]];}
 for(let i=0;i<limit*30&&pool.length<limit;i++){
   const ticket=L.randomTicket(m,random,shape);
   if(!c.colunas)ticket.dezenas=fixed.concat(ranks?L.unrank(universe,remaining,ranks[pool.length]):L.sample(universe,remaining,random)).sort((a,b)=>a-b);
   if(op.trevosFixos)ticket.trevos=L.validateTicket(m,{...ticket,trevos:op.trevosFixos},{completo:true}).trevos;
   const key=JSON.stringify(c.colunas?ticket.colunas:ticket.dezenas);
   if(seen.has(key))continue;seen.add(key);
   const v=L.vector(m,ticket,b),dist=enough?L.distance(v,model,weights):0;
   pool.push({jogo:ticket,vector:v,distancia:dist,mask:L.mask(L.tokens(m,ticket))});
   if(pool.length%100===0)progress({etapa:'Integrando critérios',feitos:pool.length,total:limit});
 }
 if(pool.length<size)throw Error('Não foi possível completar o lote. Revise as restrições.');
 const evaluated=pool.length,selected=[];
 while(selected.length<size){
   let best=0,value=Infinity;
   for(let i=0;i<pool.length;i++){
     const p=pool[i],n=L.tokens(m,p.jogo).length,over=selected.map(s=>L.intersection(s.mask,p.mask));
     const penalty=L.mean(over.map(h=>h*h/(n*n)+L.comb(h,2)/Math.max(1,L.comb(n,2))+L.comb(h,3)/Math.max(1,L.comb(n,3))));
     const score=p.distancia+penalty;
     if(score<value){value=score;best=i;}
   }
   selected.push(pool.splice(best,1)[0]);
 }
 const explain=p=>{
   const groups=new Map();
   p.vector.forEach((v,j)=>{
     const id=L.criterionNames[Math.min(j,11)],penalty=Math.min(5,Math.abs(v-model.media[j])/model.dp[j])*(weights[id]??1)/p.vector.length;
     groups.set(id,(groups.get(id)||0)+penalty);
   });
   return {jogo:p.jogo,distancia:enough?p.distancia:null,
     criterios:[...groups].map(([id,contribuicao])=>({id,nome:labels[id],contribuicao:enough?contribuicao:null}))};
 };
 const explanations=selected.map(explain),first=selected[0].jogo;
 progress({etapa:'Conferindo a recomendação',feitos:evaluated,total:evaluated});
 const analysis=L.analyze(m,first,b.rows,{antesDe:op.antesDe??null});
 // Esta comparação descreve a combinação escolhida. Nunca é evidência de
 // vantagem fora da amostra, pois os mesmos dados participaram da seleção.
 const adherence=L.reference(m,first,b.rows,{antesDe:op.antesDe??null,semente:seed+':referencia',amostras:1000});
 analysis.base=b.meta;
 analysis.saudeBase=L.historyHealth(b);
 analysis.diagnosticoFrequencia=L.frequencyDiagnosis(m,b);
 const qualidade=evidenceQuality(b.meta,calibration,suspended?'recuo-prospectivo':enough?'perfil-historico':'amostra-insuficiente');
 return {versao:L.VERSION,motor:'integrado',plano,modalidade:m,semente:seed,calibracao:calibration,qualidadeEvidencia:qualidade,
   parametros:{acompanhamento:monitor?{comparacao:monitor.comparacao}:null,janela:op.janela??0,antesDe:op.antesDe??null,fixas:fixed,excluidas:excluded,formato:shape,trevosFixos:op.trevosFixos||null},
   base:b.meta,totalDisponivel:b.totalDisponivel,estado:suspended?'recuo-prospectivo':enough?'perfil-historico':'amostra-insuficiente',
   jogos:selected.map(p=>p.jogo),explicacoes:explanations,
   principal:{...explanations[0],analise:analysis,aderencia:adherence},
   candidatos:evaluated,solicitados:q,custo:selected.length*unit,unitario:unit,
   diversidade:L.portfolio(m,selected.map(p=>p.jogo)),
   motivo:suspended?calibration.motivo:enough?'Menor distância conjunta ao perfil histórico entre as candidatas avaliadas. Jogos adicionais reduzem a repetição de dezenas, pares e trios.':'Menos de 30 concursos válidos: seleção aleatória, respeitando tamanho, orçamento e restrições. Não há ranking histórico confiável.',
   evidencia:'Seleção descritiva. Esta recomendação não tem vantagem preditiva demonstrada.',aviso:L.aviso};
}
Object.assign(L,{recommendationPlan,assertRecommendationPlan,recommend,recommendationBase,calibrateRecommendation,evidenceQuality});
if(typeof module!=='undefined'&&module.exports)module.exports=L;
})(globalThis);
