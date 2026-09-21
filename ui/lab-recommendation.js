/* Uma seleção principal, com os mesmos cálculos usados no laboratório.
 * Frequência, atraso e semelhança são critérios descritivos, não previsões.
 * Recebe um retrato explícito dos dados; não lê estado da interface. */
(function(root){
'use strict';
const L=root.LL18||(typeof require==='function'?require('./lab-core.js'):null);
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

function recommend(m,records,op={},progress=()=>{}){
 const c=L.cfg(m),seed=String(op.semente??'recomendacao-419'),random=L.rng(seed);
 const q=op.quantidade??1,N=op.candidatos??Math.max(600,q*25);
 if(!Number.isInteger(q)||q<1||q>60||!Number.isInteger(N)||N<q||N>10000)
   throw Error('Escolha de 1 a 60 jogos e até 10.000 candidatos.');
 const shape=op.formato?L.validateTicket(m,op.formato,{completo:true}):L.randomTicket(m,L.rng(seed+':formato'));
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
 const b=recommendationBase(m,records,op),enough=b.rows.length>=30;
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
   const v=L.vector(m,ticket,b),dist=enough?L.distance(v,model):0;
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
     const id=L.criterionNames[Math.min(j,11)],penalty=Math.min(5,Math.abs(v-model.media[j])/model.dp[j])/p.vector.length;
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
 return {versao:'4.19.0',motor:'integrado',modalidade:m,semente:seed,
   parametros:{janela:op.janela??0,antesDe:op.antesDe??null,fixas:fixed,excluidas:excluded,formato:shape,trevosFixos:op.trevosFixos||null},
   base:b.meta,totalDisponivel:b.totalDisponivel,estado:enough?'perfil-historico':'amostra-insuficiente',
   jogos:selected.map(p=>p.jogo),explicacoes:explanations,
   principal:{...explanations[0],analise:analysis,aderencia:adherence},
   candidatos:evaluated,solicitados:q,custo:selected.length*unit,unitario:unit,
   diversidade:L.portfolio(m,selected.map(p=>p.jogo)),
   motivo:enough?'Menor distância conjunta ao perfil histórico entre as candidatas avaliadas. Jogos adicionais reduzem a repetição de dezenas, pares e trios.':'Menos de 30 concursos válidos: seleção aleatória, respeitando tamanho, orçamento e restrições. Não há ranking histórico confiável.',
   evidencia:'Seleção descritiva. Esta recomendação não tem vantagem preditiva demonstrada.',aviso:L.aviso};
}
Object.assign(L,{recommend,recommendationBase});
if(typeof module!=='undefined'&&module.exports)module.exports=L;
})(globalThis);
