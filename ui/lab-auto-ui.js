/* Memória persistente e apresentação do ciclo automático. */
(function(root){
'use strict';
const L=root.LL18, jobs=new Map(), loaded=new Map(), remote=new Map(), cache=new Map(), preparing=new Map();
let bridge=null, scheduled=false;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=2)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('pt-BR',{maximumFractionDigits:d});
const money=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const name=id=>id==='consenso'?'Consenso das estratégias':L.autoExperts[id]||id;
const key=p=>'automatico421:'+p;
// Apenas o concurso selecionado é desenhado; os demais pacotes permanecem na memória.
const reports=new Map(),historyChoices=new Map();
function historyCard(m,t,title,result,hits,primary=false){
 const C=root.LL18Check,c=L.cfg(m);
 const second=c.dupla&&result?.dezenasSegundoSorteio?{dezenas:result.dezenasSegundoSorteio}:null;
 return `<article class="auto-history-game ${primary?'primary':''}"><div class="auto-game-head"><h4>${esc(title)}</h4><span class="auto-hit-count">${hits==null?'Aguardando':hits+' acerto'+(hits===1?'':'s')+(c.dupla?' · 1º sorteio':'')}</span></div>${C.ticket(m,t,result)}
  ${second?`<p class="auto-history-note">2º sorteio: ${L.hits(m,t,second)} acertos</p>${C.ticket(m,t,second)}`:c.dupla&&result?'<p class="auto-history-note">2º sorteio: aguardando publicação.</p>':''}
  <details><summary>Ver cartela completa</summary>${C.board(m,t,result,{selo:result&&c.dupla?'1º sorteio':result?'Conferido':'Aguardando resultado'})}${second?C.board(m,t,second,{selo:'2º sorteio'}):''}${result?C.legend():''}</details></article>`;
}
function historyRound(report,target){
 const {m,a}=report,round=a.estado.rodadas.find(r=>r.concursoAlvo===target);
 if(!round)return '<p class="auto-history-note">Nenhum pacote registrado para este concurso.</p>';
 const observation=a.acompanhamento.observacoes.find(o=>o.concurso===target),result=observation?.resultado;
 const rejected=a.acompanhamento.rejeitados.includes(target),checked=!!result,C=root.LL18Check;
 const label=checked?'Conferido':rejected?'Fora da avaliação':'Aguardando resultado';
 const date=observation?.data?.split('-').reverse().join('/')||'';
 return `<div class="auto-round-summary"><div><b>Concurso ${target}</b>${date?`<div class="auto-round-date">${esc(date)}</div>`:''}</div><span class="auto-history-status ${checked?'checked':''}">${label}</span></div>
  ${rejected?'<p class="auto-history-note" role="status">Este registro não atende aos critérios de avaliação: confira a data do resultado e se o pacote foi criado antes do sorteio. Ele permanece visível, sem entrar no desempenho.</p>':''}
  ${checked?`<div class="auto-history-result"><b>${L.cfg(m).dupla?'Resultado · 1º sorteio':'Resultado do concurso'}</b>${C.ticket(m,result)}${result.dezenasSegundoSorteio?`<b>Resultado · 2º sorteio</b>${C.ticket(m,{dezenas:result.dezenasSegundoSorteio})}`:''}</div>${C.legend()}`:'<p class="auto-history-note">As combinações originais estão preservadas. Os acertos aparecerão quando este concurso for recebido e validado.</p>'}
  ${historyCard(m,round.principal,'Sugestão principal · '+name(round.metodo),result,observation?.acertos.principal,true)}
  <p class="auto-history-note">${round.testes.length} jogos virtuais · custo R$ 0,00. As dezenas permanecem iguais às registradas para este concurso.</p>
  <div class="auto-history-games">${round.testes.map(t=>historyCard(m,t.jogo,name(t.id),result,observation?.acertos[t.id])).join('')}</div>`;
}
function historyReport(g){
 const a=g.automatico,profile=a.estado.perfil,rounds=a.estado.rodadas.slice().sort((x,y)=>y.concursoAlvo-x.concursoAlvo);
 const report={m:g.modalidade,a};reports.set(profile,report);
 if(!rounds.length)return '<section class="auto-history"><h3>Histórico dos jogos por concurso</h3><p class="auto-history-note">O histórico aparecerá quando houver um pacote registrado para um concurso definido.</p></section>';
 const observed=new Set(a.acompanhamento.observacoes.map(o=>o.concurso)),rejected=new Set(a.acompanhamento.rejeitados);
 const selected=rounds.find(r=>r.concursoAlvo===historyChoices.get(profile))?.concursoAlvo||rounds.find(r=>observed.has(r.concursoAlvo))?.concursoAlvo||rounds[0].concursoAlvo;
 return `<details class="auto-history" data-auto-history="${esc(profile)}" ${a.acompanhamento.n?'open':''}><summary>Histórico dos jogos por concurso<span>${a.acompanhamento.n} conferidos</span></summary><p class="auto-history-note">Confira a sugestão principal e os 11 jogos virtuais deste perfil, concurso a concurso.</p>
  <label>Concurso registrado<select data-auto-contest aria-label="Concurso do histórico de jogos">${rounds.map(r=>`<option value="${r.concursoAlvo}" ${selected===r.concursoAlvo?'selected':''}>${r.concursoAlvo} · ${observed.has(r.concursoAlvo)?'Conferido':rejected.has(r.concursoAlvo)?'Fora da avaliação':'Aguardando resultado'}</option>`).join('')}</select></label>
  <div data-auto-round aria-live="polite">${historyRound(report,selected)}</div></details>`;
}
function merge(local,shared,profile,latest){
 if(!shared||shared.protocolo!==L.autoProtocol||shared.perfil!==profile||shared.ultimaBase?.ultimo>latest)return local;
 if(!local)return shared;
 const targets=new Set(local.rodadas.map(r=>r.concursoAlvo));
 // Uma rodada já exibida nunca é reescrita por uma atualização do servidor.
 return {...local,rodadas:local.rodadas.concat(shared.rodadas.filter(r=>!targets.has(r.concursoAlvo))).sort((a,b)=>a.concursoAlvo-b.concursoAlvo)};
}
async function source(m,profile){
 if(profile!==L.autoOptions(m).profile)return null;
 if(!remote.has(m))remote.set(m,(async()=>{
  try{return await bridge.fetchJson('https://raw.githubusercontent.com/stringhijocimar-cyber/sorte-2/main/aprendizado/'+m+'.json');}
  catch(e){try{return root.LL18_AUTO_BOOKS?.[m]||await bridge.fetchJson('./aprendizado/'+m+'.json');}catch(e){return null;}}
 })());
 return remote.get(m);
}
async function history(m){
 if(!loaded.has(m))loaded.set(m,(async()=>{try{await bridge.loadHistory(m);}catch(e){/* Offline: histórico salvo, nunca dados inventados. */}})());
 return loaded.get(m);
}
async function recommend(m,records,op={},progress=()=>{}){
 if(!bridge)throw Error('Aguarde a abertura do aplicativo.');
 const profile=L.autoOptions(m,op).profile;
 const previous=jobs.get(profile)||Promise.resolve();
 const task=previous.catch(()=>{}).then(async()=>{
  const base=L.recommendationBase(m,records,op);
  let state=bridge.read(key(profile),null);
  state=merge(state,await source(m,profile),profile,base.meta.ultimo||0);
  const result=await root.LL18UI.automatic(m,records,state||{},op,progress);
  const saved=bridge.write(key(profile),result.automatico.estado);
  result.automatico.persistido=saved;
  if(saved){
   const profiles=bridge.read('automatico421:perfis',[]),i=profiles.findIndex(x=>x.perfil===profile),entry={m,perfil:profile,op};
   if(i<0)profiles.push(entry);else profiles[i]=entry;
   bridge.write('automatico421:perfis',profiles);
  }
  return result;
 });
 jobs.set(profile,task);
 try{return await task;}finally{if(jobs.get(profile)===task)jobs.delete(profile);}
}
function status(text){const el=document.getElementById('auto-status');if(el)el.textContent=text;}
async function prepare(m){
 if(!bridge||bridge.currentScreen()!=='sugestoes'||bridge.currentMode()!==m||bridge.busy())return;
 let op;try{op=bridge.options(m);}catch(e){status(e.message);return;}
 const before=L.recommendationBase(m,bridge.records(),op).meta.assinatura;
 const stamp=JSON.stringify([op,before]);
 if(cache.get(m)===stamp||preparing.get(m)?.stamp===stamp)return;
 // Só uma resposta entregue entra no cache. Navegar ou uma falha transitória
 // não pode marcar a preparação como concluída e bloquear a próxima abertura.
 const attempt={stamp};preparing.set(m,attempt);
 const active=()=>preparing.get(m)===attempt&&bridge.currentMode()===m&&bridge.currentScreen()==='sugestoes'&&!bridge.busy();
 status('Analisando o histórico e preparando a sugestão automaticamente…');
 try{
  await history(m);
  if(!active())return;
  // O usuário pode ajustar o formato enquanto a rede termina.
  if(JSON.stringify(op)!==JSON.stringify(bridge.options(m)))return;
  const records=bridge.records().slice();
  const result=await recommend(m,records,op,p=>{if(active())status(p.etapa+': '+p.feitos+' de '+p.total+'.');});
  if(!active())return;
  if(JSON.stringify(op)!==JSON.stringify(bridge.options(m)))return;
  if(result.base.assinatura!==L.recommendationBase(m,bridge.records(),op).meta.assinatura){cache.delete(m);historyChanged();return;}
  bridge.deliver(m,result,records);
  if(result.automatico.persistido)cache.set(m,JSON.stringify([op,result.base.assinatura]));
 }catch(e){if(active())status('Preparação automática pendente: '+e.message+' Toque em Atualizar sugestão para tentar novamente.');}
 finally{if(preparing.get(m)===attempt)preparing.delete(m);}
}
function mount(b){bridge=b;if(bridge.currentScreen()==='sugestoes')void prepare(bridge.currentMode());}
function historyChanged(){
 if(!bridge||scheduled)return;scheduled=true;
 setTimeout(async()=>{
  scheduled=false;remote.clear();
  // Também confere os perfis personalizados já usados, sem abrir outra tela.
  for(const entry of bridge.read('automatico421:perfis',[])){
   const op={...entry.op,quantidade:1,orcamento:null,concursoAlvo:null},records=bridge.records().slice();
   const old=bridge.read(key(entry.perfil),null),base=L.recommendationBase(entry.m,records,op);
   if(old?.ultimaBase?.assinatura===base.meta.assinatura&&old.ultimaBase.avaliacao===L.history(entry.m,records,{antesDe:op.antesDe??null}).meta.assinatura)continue;
   try{await recommend(entry.m,records,op);}catch(e){status('Avaliação pendente: '+e.message);}
  }
  cache.delete(bridge.currentMode());void prepare(bridge.currentMode());
 },200);
}
function balls(m,t){const c=L.cfg(m);return `<div class="dezenas">${c.colunas?t.colunas.map((a,i)=>`<span class="auto-column"><small>Coluna ${i+1}</small>${a.join(' / ')}</span>`).join(''):t.dezenas.map(d=>`<span class="dz marcada">${String(d).padStart(2,'0')}</span>`).join('')}</div>${c.extra?`<p class="int-help">${esc(c.extra)}: ${esc(Array.isArray(t[c.extra])?t[c.extra].join(' · '):t[c.extra]??'não informado')}</p>`:''}`;}
function render(g,old=false,rec=()=>'',trevos=()=> ''){
 const a=g.automatico,follow=a.acompanhamento,last=follow.observacoes.at(-1),round=a.rodada;
 const ranking=(follow.n?follow.ranking:a.inicial?.teste||[]).slice().sort((x,y)=>y.media-x.media);
 const n=follow.n||a.inicial?.observacoes.slice(30).length||0;
 const ticket=(t,i)=>`<article class="int-ticket ${i===0?'int-principal':''}"><div class="int-section-title"><h3>${i===0?'Sua sugestão principal':'Jogo adicional '+i}</h3><span>${i===0?'CONCURSO '+(round.concursoAlvo||'A DEFINIR'):'OPCIONAL'}</span></div>${balls(g.modalidade,t)}${t.trevos?trevos(t.trevos):''}${rec(t)}${i===0?`<p class="int-help">${esc(g.motivo)}</p>`:''}<button class="acao secundaria" data-int-analisar="${i}">Ver estatísticas deste jogo</button></article>`;
 return `<section class="int-results auto-results" aria-label="Sugestão automática"><div class="int-section-title"><h2>Sugestão + laboratório automático</h2><span>4.24</span></div>
  ${old?'<p class="nota atencao">O histórico mudou. A atualização automática está preparando o próximo concurso.</p>':''}
  ${!a.persistido?'<p class="nota atencao" role="alert">A memória do aparelho não pôde ser gravada. Este pacote ainda não está registrado para avaliação; libere espaço e atualize a sugestão.</p>':''}
  ${!g.base.n?'<p class="nota atencao">Sem histórico disponível. A sugestão usa apenas referências combinatórias; a comparação começará quando os resultados chegarem.</p>':''}
  ${ticket(g.jogos[0],0)}
  <div class="auto-summary"><div><b>${num(g.base.n,0)}</b><small>concursos analisados</small></div><div><b>${a.pacoteVirtual.length}</b><small>jogos de teste virtual</small></div><div><b>${num(follow.n,0)}</b><small>sorteios conferidos</small></div></div>
  <article class="auto-decision"><span class="int-eyebrow">DECISÃO AUTOMÁTICA · ${esc(a.decisao.acao)}</span><h3>${esc(name(round.metodo))}</h3><p>${esc(a.decisao.motivo)}</p><p class="int-help">${last?`Último resultado: concurso ${last.concurso}; principal com ${last.acertos.principal} acertos. `:'O pacote atual aguarda o próximo resultado. '}Revisão de estratégia a partir de ${a.proximaRevisao} sorteios conferidos neste perfil; o pacote é renovado a cada novo concurso.</p></article>
  ${historyReport(g)}
  <details class="int-details auto-pack" ${follow.n?'':'open'}><summary>Pacote de estratégias · ${a.pacoteVirtual.length} jogos virtuais</summary><p class="int-help">${round.concursoAlvo?'Registrados para o concurso '+round.concursoAlvo+'.':'Prévia sem concurso definido; ainda não entra na avaliação.'} A conferência e a comparação acontecem automaticamente. Custo dos testes: R$ 0,00.</p><div class="auto-pack-grid">${a.pacoteVirtual.map(t=>`<article class="auto-test" data-auto-strategy="${esc(t.id)}"><b>${esc(t.nome)}</b>${balls(g.modalidade,t.jogo)}</article>`).join('')}</div></details>
  <details class="int-details auto-ranking"><summary>Desempenho e motivo da escolha</summary><p class="int-help">${follow.n?`${follow.n} concursos com jogos registrados antes do resultado.`:`Comparação histórica inicial: ${n} concursos de teste, separados dos 30 usados para escolher o método. Ainda não é acompanhamento futuro.`}</p>${ranking.length?`<div class="ll-table"><table><thead><tr><th>Estratégia</th><th>Acertos médios</th><th>Diferença para o acaso</th><th>IC 95%</th></tr></thead><tbody>${ranking.map(x=>`<tr><td>${esc(name(x.id))}</td><td>${num(x.media)}</td><td>${num(x.acaso.media,3)}</td><td>${x.acaso.ic?.map(v=>num(v,3)).join(' a ')||'—'}</td></tr>`).join('')}</tbody></table></div>`:'<p>Aguardando histórico suficiente; nenhuma estratégia é declarada vencedora.</p>'}<p class="int-help">Controle: média de 32 jogos aleatórios independentes por concurso, além do controle visível no pacote. A troca exige confirmação em períodos distintos, correção de múltiplas comparações e teste válido para consultas repetidas. O maior número da tabela, sozinho, não basta.</p>${a.inicial?.particao?`<p class="int-help">Seleção inicial: ${a.inicial.particao.validacao.join('–')} · teste separado: ${a.inicial.particao.teste.join('–')}.</p>`:''}</details>
  ${g.jogos.length>1?`<details class="int-details"><summary>Jogos adicionais escolhidos (${g.jogos.length-1})</summary>${g.jogos.slice(1).map((t,i)=>ticket(t,i+1)).join('')}</details>`:''}
  ${g.jogos.length<g.solicitados?`<p class="nota">O orçamento comporta ${g.jogos.length} dos ${g.solicitados} jogos solicitados.</p>`:''}
  <div class="int-grid int-actions"><button class="acao" id="int-salvar" ${old?'disabled':''}>Salvar ${g.jogos.length===1?'sugestão':'lote'} · ${money(g.custo)}</button><button class="acao secundaria" id="int-exportar">Exportar CSV</button></div><p class="int-help">Salvar no app não compra apostas. O pacote virtual permanece separado dos seus jogos e do seu orçamento.</p>
  <details class="int-details"><summary>Como o ciclo funciona</summary><p class="int-help">Analisa o histórico disponível, registra o pacote para o próximo concurso, confere os acertos e decide manter ou alterar a estratégia. O perfil padrão das oito modalidades é acompanhado também pelo repositório, com o app fechado; formatos personalizados são conferidos quando o app recebe os resultados. Offline, utiliza o histórico salvo. Você não precisa treinar o sistema.</p><p class="int-help">${esc(a.limite)} Sorteios independentes não se tornam previsíveis pelo histórico. O aplicativo compara hipóteses; não promete vantagem ou lucro.</p><p class="int-help">Base: ${esc(g.base.assinatura)} · ${g.base.primeiro||'—'}–${g.base.ultimo||'—'} · ${g.base.lacunas} lacunas. Motor ${esc(g.versao)}.</p></details>
 </section>`;
}
root.addEventListener?.('online',()=>{loaded.clear();remote.clear();cache.clear();historyChanged();});
root.addEventListener?.('change',event=>{
 const select=event.target.closest?.('[data-auto-contest]'),host=select?.closest('[data-auto-history]');
 if(!host)return;
 const report=reports.get(host.dataset.autoHistory),target=Number(select.value);
 if(!report?.a.estado.rodadas.some(r=>r.concursoAlvo===target))return;
 historyChoices.set(host.dataset.autoHistory,target);
 host.querySelector('[data-auto-round]').innerHTML=historyRound(report,target);
});
root.LL18Auto={mount,recommend,historyChanged,render,merge,prepare,historyReport};
})(globalThis);
