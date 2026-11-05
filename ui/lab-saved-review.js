/* Revisão dos jogos pessoais: diagnóstico descritivo, sem prever sorteios. */
(function(root){
'use strict';
const L=root.LL18||(typeof require==='function'?require('./lab-core.js'):null);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>x==null?'—':x.toLocaleString('pt-BR',{maximumFractionDigits:2});
const active=j=>j.analiseAtiva!==false;
function covers(j,r){
 if(j.modalidade!==r.modalidade)return false;
 if(j.acompanhamento==='fixo')return Number(j.deConcurso)>0&&r.concurso>=Number(j.deConcurso);
 if(Number.isFinite(j.concursoAlvo))return r.concurso===j.concursoAlvo;
 if(j.deConcurso)return r.concurso>=Number(j.deConcurso)&&r.concurso<Number(j.deConcurso)+Number(j.concursos||1);
 return !!r.data&&!!j.data&&r.data>=j.data;
}
function identity(m,t){const c=L.cfg(m);return JSON.stringify([c.colunas?t.colunas:t.dezenas,c.extra==='time'?(t.timeNome||t.time):c.extra?t[c.extra]:null]);}
function review(games,records){
 const bases=new Map(),tickets=new Map(),incompletos=new Set(),out=new Map();
 for(const j of games){
  if(!bases.has(j.modalidade)){try{bases.set(j.modalidade,L.history(j.modalidade,records));}catch{bases.set(j.modalidade,{rows:[],meta:{ultimo:null,lacunas:0}});}}
  try{
   const t=L.validateTicket(j.modalidade,j),c=L.cfg(j.modalidade);
   if(c.extra==='time'&&L.nomeDoTime(j.timeNome))t.timeNome=L.nomeDoTime(j.timeNome);
   if(c.extra&&t[c.extra]===undefined&&!t.timeNome)incompletos.add(j);
   tickets.set(j,t);
  }catch{}
 }
 const groups=new Map();
 for(const j of games){if(!tickets.has(j)||incompletos.has(j)||!active(j))continue;
  const b=bases.get(j.modalidade),target=b.meta.ultimo?b.meta.ultimo+1:null;
  if(!target||!covers(j,{modalidade:j.modalidade,concurso:target,data:'9999-12-31'}))continue;
  const key=j.modalidade+'|'+identity(j.modalidade,tickets.get(j));
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(j);
 }
 for(const j of games){
  const b=bases.get(j.modalidade),t=tickets.get(j),latest=b.meta.ultimo;
  const result={acao:'manter',titulo:'Manter em observação',motivo:'Ainda não há resultados suficientes para avaliar este jogo.',ativo:active(j),n:0,media:null,melhor:null,recente:null,esperado:null,ultimo:latest,lacunas:b.meta.lacunas};
  out.set(j,result);
  if(!t){Object.assign(result,{acao:'reavaliar',titulo:'Revisar cadastro',motivo:'Dezenas ou complementos incompletos ou inválidos. Revise o jogo antes de compará-lo.'});continue;}
  let savedDate=null;try{savedDate=L.isoDate(String(j.criadoEm||j.data||'').slice(0,10));}catch{}
  const rows=b.rows.filter(r=>savedDate&&r.data&&r.data>savedDate&&covers(j,r));
  const hits=rows.map(r=>L.hits(j.modalidade,t,r));
  const distribution=L.distribution(j.modalidade,t);
  const c=L.cfg(j.modalidade);
  result.padroes=L.patternProfile(j.modalidade,t)||L.structural(j.modalidade,t);
  if(!c.colunas){
   result.soma=L.sum(t.dezenas);
   result.tamanhoComparavel=t.dezenas.length===c.k;
   if(result.tamanhoComparavel){
    if(b.faixaSoma===undefined)b.faixaSoma=historicalSumRange(b.rows);
    result.faixaSoma=b.faixaSoma;
   }
  }
  Object.assign(result,{n:hits.length,media:hits.length?L.mean(hits):null,melhor:hits.length?Math.max(...hits):null,recente:hits.length?L.mean(hits.slice(-Math.min(10,hits.length))):null,esperado:distribution.reduce((s,p,i)=>s+p*i,0)});
  if(incompletos.has(j)){
   Object.assign(result,{acao:'reavaliar',titulo:'Completar cadastro',motivo:'Complete o jogo para conferir todos os acertos. Os indicadores descrevem as dezenas marcadas.'});
   continue;
  }
  const end=j.acompanhamento==='fixo'?null:Number.isFinite(j.concursoAlvo)?j.concursoAlvo:j.deConcurso?Number(j.deConcurso)+Number(j.concursos||1)-1:null;
  const start=j.deConcurso?Number(j.deConcurso):j.concursoAlvo;
  if(latest&&end&&latest>=end){Object.assign(result,{acao:'retirar',titulo:'Retirar da análise',motivo:`A participação terminou no concurso ${end}. Preserve o histórico e retire este registro da comparação de jogos ativos.`});continue;}
  const key=j.modalidade+'|'+identity(j.modalidade,t),group=groups.get(key)||[],first=group[0];
  if(first&&first!==j&&covers(j,{modalidade:j.modalidade,concurso:latest+1,data:'9999-12-31'})){Object.assign(result,{acao:'retirar',titulo:'Retirar duplicata da análise',motivo:`A mesma sequência e os mesmos complementos já estão no jogo #${first.id}, também válido para o concurso ${latest+1}. Retirar a duplicata evita contar a mesma combinação duas vezes; os bilhetes continuam salvos.`});continue;}
  if(!savedDate){Object.assign(result,{acao:'reavaliar',titulo:'Revisar data do jogo',motivo:'Não há uma data de cadastro válida para separar resultados anteriores e posteriores ao registro.'});continue;}
  result.motivo=start&&latest&&start>latest?`A participação começa no concurso ${start}. Aguarde os resultados antes de reavaliar.`:!hits.length?'Nenhum resultado válido posterior à data de cadastro dentro da participação do jogo. Aguarde a conferência.':hits.length<60?`${hits.length} concurso${hits.length===1?'':'s'} posterior${hits.length===1?'':'es'} ao cadastro. Amostra curta: mantenha em observação; um resultado isolado não justifica trocar a sequência.`:'O desempenho foi atualizado com os resultados posteriores ao cadastro. A média passada, acima ou abaixo do acaso, não demonstra vantagem para o próximo sorteio nem justifica excluir a sequência.';
 }
 return out;
}
function historicalSumRange(rows){
 if(rows.length<30)return null;
 const totals=rows.map(r=>L.sum(r.dezenas));
 return {min:Math.round(L.quantile(totals,.1)),max:Math.round(L.quantile(totals,.9)),n:totals.length};
}
function indicator(label,value,reference='',good=null,detail=''){
 const state=good===null?'neutral':good?'good':'attention';
 const tag=good===null?'':good?'Dentro da faixa':'Fora da faixa';
 return `<div class="saved-review-indicator ${state}"><div><strong>${esc(label)}</strong>${tag?`<span class="saved-review-status">${tag}</span>`:''}</div><div><b>${esc(value)}</b>${reference?`<span>${esc(reference)}</span>`:''}</div>${detail?`<small>${esc(detail)}</small>`:''}</div>`;
}
function card(j,r,open=false){
 if(!r)return '';
 const p=r.padroes,faixa=r.faixaSoma;
 let indicators='';
 if(p){
  if(r.soma!==undefined){
   const referencia=faixa?'Faixa histórica central (80%) de '+faixa.min+' a '+faixa.max:
     r.tamanhoComparavel?'Faixa histórica indisponível':'Resultados de tamanho diferente';
   const detalhe=faixa?faixa.n+' concursos comparáveis. A faixa descreve o passado e não prevê resultados.':
     r.tamanhoComparavel?'Mínimo de 30 concursos válidos.':'A soma do jogo exige uma referência com a mesma quantidade de dezenas.';
   indicators+=indicator('Soma do jogo',r.soma,referencia,faixa?r.soma>=faixa.min&&r.soma<=faixa.max:null,detalhe);
  }
  indicators+=indicator('Pares e ímpares',p.pares+' pares / '+p.impares+' ímpares');
  if(p.primos!==undefined)indicators+=indicator('Números primos',p.primos);
  if(p.fibonacci!==undefined)indicators+=indicator('Fibonacci',p.fibonacci);
  if(p.maiorSequencia!==undefined)indicators+=indicator('Maior sequência',p.maiorSequencia,'Números consecutivos');
  if(p.linhas?.length)indicators+=indicator('Linhas',p.linhas.join(' / '),'Distribuição no volante');
  if(p.colunas?.length)indicators+=indicator('Colunas',p.colunas.join(' / '),'Distribuição no volante');
 }
 const symbol=r.acao==='retirar'?'↔':r.acao==='reavaliar'?'↻':'✓';
 return `<section class="saved-review ${r.acao}${r.ativo?'':' inactive'}" data-saved-review="${esc(j.id)}" aria-label="Avaliação deste jogo"><details class="saved-review-details"${open?' open':''}><summary class="saved-review-heading"><span aria-hidden="true">${symbol}</span><strong>${esc(r.titulo)}</strong><small>${r.ativo?'Na análise':'Fora da análise'} · Abrir diagnóstico</small></summary><div class="saved-review-indicators">${indicators}</div><p><b>Motivo da recomendação:</b> ${esc(r.motivo)}</p><details><summary>Ver métricas históricas</summary><div class="saved-review-metrics"><span>Concursos após cadastro<b>${r.n}</b></span><span>Média de acertos<b>${num(r.media)}</b></span><span>Últimos até 10<b>${num(r.recente)}</b></span><span>Referência ao acaso<b>${num(r.esperado)}</b></span></div><p>Resultados posteriores ao cadastro e dentro da participação declarada. Estatísticas descritivas não aumentam a probabilidade de prêmio.${r.lacunas?' Há lacunas no histórico.':''}</p></details><button class="acao secundaria mini" data-alternar-analise="${esc(j.id)}" aria-pressed="${r.ativo}">${r.ativo?'Retirar da análise':'Reincluir na análise'}</button><small class="saved-review-footnote">O jogo e as conferências permanecem salvos.</small><p class="saved-review-error" role="status"></p></details></section>`;
}
root.LL18SavedReview={active,covers,review,card};
if(typeof module!=='undefined'&&module.exports)module.exports=root.LL18SavedReview;
})(globalThis);
