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
function identity(m,t){const c=L.cfg(m);return JSON.stringify([c.colunas?t.colunas:t.dezenas,c.extra?t[c.extra]:null]);}
function review(games,records){
 const bases=new Map(),tickets=new Map(),out=new Map();
 for(const j of games){
  if(!bases.has(j.modalidade)){try{bases.set(j.modalidade,L.history(j.modalidade,records));}catch{bases.set(j.modalidade,{rows:[],meta:{ultimo:null,lacunas:0}});}}
  try{tickets.set(j,L.validateTicket(j.modalidade,j,{completo:true}));}catch{}
 }
 const groups=new Map();
 for(const j of games){if(!tickets.has(j)||!active(j))continue;
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
  result.padroes=L.patternProfile(j.modalidade,t);
  Object.assign(result,{n:hits.length,media:hits.length?L.mean(hits):null,melhor:hits.length?Math.max(...hits):null,recente:hits.length?L.mean(hits.slice(-Math.min(10,hits.length))):null,esperado:distribution.reduce((s,p,i)=>s+p*i,0)});
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
function card(j,r){
 if(!r)return '';
 const p=r.padroes,perfil=p?`<p class="saved-patterns">Perfil do jogo: ${p.pares} pares / ${p.impares} ímpares · ${p.primos} primos · ${p.fibonacci} Fibonacci · maior sequência ${p.maiorSequencia}. Linhas: ${p.linhas.join(' / ')}; colunas: ${p.colunas.join(' / ')}. Descrição, sem chance adicional.</p>`:'';
 const symbol=r.acao==='retirar'?'↔':r.acao==='reavaliar'?'↻':'✓';
 return `<section class="saved-review ${r.acao}${r.ativo?'':' inactive'}" data-saved-review="${esc(j.id)}" aria-label="Avaliação da IA deste jogo"><div class="saved-review-heading"><span aria-hidden="true">${symbol}</span><strong>${esc(r.titulo)}</strong><small>${r.ativo?'Na análise':'Fora da análise'}</small></div><p><b>Por quê:</b> ${esc(r.motivo)}</p><details><summary>Ver dados da avaliação</summary><div class="saved-review-metrics"><span>Concursos após cadastro<b>${r.n}</b></span><span>Média de acertos<b>${num(r.media)}</b></span><span>Últimos até 10<b>${num(r.recente)}</b></span><span>Referência ao acaso<b>${num(r.esperado)}</b></span></div>${perfil}<p>Somente resultados válidos, posteriores ao dia de cadastro e dentro da participação declarada. Resultados do mesmo dia não entram nesta avaliação.${r.ultimo?` Base até o concurso ${r.ultimo}.`:''}${r.lacunas?' Há lacunas no histórico disponível.':''} Acertos das dezenas${j.modalidade==='dupla-sena'?' do primeiro sorteio':''}; complementos não entram na média. Nenhuma previsão de prêmio.</p></details><button class="acao secundaria mini" data-alternar-analise="${esc(j.id)}" aria-pressed="${r.ativo}">${r.ativo?'Retirar da análise':'Reincluir na análise'}</button><small class="saved-review-footnote">${r.ativo?'A decisão é sua.':'Este jogo não entra nos comparativos de jogos ativos.'} O jogo e as conferências permanecem salvos.</small><p class="saved-review-error" role="status"></p></section>`;
}
root.LL18SavedReview={active,covers,review,card};
if(typeof module!=='undefined'&&module.exports)module.exports=root.LL18SavedReview;
})(globalThis);
