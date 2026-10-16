/* Memória persistente e apresentação do ciclo automático. */
(function(root){
'use strict';
const L=root.LL18, jobs=new Map(), loaded=new Map(), remote=new Map(), cache=new Map(), preparing=new Map(),session=new Map();
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
  ${rejected?'<p class="auto-history-note" role="status">Este registro não atende aos critérios de avaliação: confira a data do resultado e se o pacote foi criado em um dia anterior. Pacotes do mesmo dia são excluídos porque não há hora oficial verificável. Ele permanece visível, sem entrar no desempenho.</p>':''}
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
 return `<details class="auto-history" data-auto-history="${esc(profile)}" ><summary>Histórico dos jogos por concurso<span>${a.acompanhamento.n} conferidos</span></summary><p class="auto-history-note">Confira a sugestão principal e os 11 jogos virtuais deste perfil, concurso a concurso.</p>
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
  let state=session.get(profile)||bridge.read(key(profile),null);
  state=merge(state,await source(m,profile),profile,base.meta.ultimo||0);
  const result=await root.LL18UI.automatic(m,records,state||{},op,progress);
  session.set(profile,result.automatico.estado);
  const write=(k,v)=>bridge.writeAsync?bridge.writeAsync(k,v):bridge.write(k,v);
  const saved=await write(key(profile),result.automatico.estado);
  result.automatico.persistido=saved;
  if(saved){
   const profiles=bridge.read('automatico421:perfis',[]),i=profiles.findIndex(x=>x.perfil===profile),entry={m,perfil:profile,op};
   if(i<0)profiles.push(entry);else profiles[i]=entry;
   result.automatico.persistido=await write('automatico421:perfis',profiles);
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
 const walletStamp=JSON.stringify(bridge.savedGames?.()||[]),stamp=JSON.stringify([op,before,walletStamp]);
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
  if(walletStamp!==JSON.stringify(bridge.savedGames?.()||[])){cache.delete(m);setTimeout(()=>prepare(m),0);return;}
  bridge.deliver(m,result,records);
  // Evita refazer a calibração em cada redesenho se o armazenamento falhar.
  // Atualizar sugestão continua permitindo uma tentativa explícita de gravação.
  cache.set(m,JSON.stringify([op,result.base.assinatura,walletStamp]));
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
const icon=type=>`<svg class="auto-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${type==='trocar'?'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>':type==='manter'?'<path d="m5 12 4 4L19 6"/>':'<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>'}</svg>`;
function decisionView(a,old=false){
 const d=a.decisao,round=a.rodada,last=a.acompanhamento.observacoes.at(-1);
 const kind=old?'pendente':d.acao==='ALTERAR'?'trocar':d.acao==='REVALIDAR'?'revalidar':'manter';
 const title={manter:'Manter estratégia',trocar:'Trocar estratégia',revalidar:'Reavaliar estratégia',pendente:'Reavaliando decisão'}[kind];
 const deferred=!old&&d.metodo&&d.metodo!==round.metodo;
 const reason=old?'O histórico mudou. Aguarde a atualização automática para consultar a decisão atual.':d.motivo;
 return `<section class="auto-main-decision" data-decision="${kind}" aria-label="Decisão da sugestão principal"><div class="auto-status-heading">${icon(kind)}<strong>${title}</strong></div><p class="auto-decision-reason"><b>Por quê:</b> ${esc(reason)}</p><p class="int-help">Nesta sugestão: <b>${esc(name(round.metodo))}</b>. ${deferred?`A decisão indica ${esc(name(d.metodo))} para a próxima rodada; este jogo já estava registrado no pacote de análise.`:'A orientação é sobre a estratégia; as dezenas são renovadas a cada concurso.'}</p>${!old&&d.concurso?`<p class="int-help">Última decisão após o concurso ${num(d.concurso,0)} · ${num(d.n,0)} concursos avaliados.</p>`:''}<details class="auto-decision-context"><summary>Última conferência e próxima revisão</summary><p class="int-help">${last?`Concurso ${num(last.concurso,0)}: principal com ${last.acertos.principal} acertos.`:'O pacote atual aguarda resultados elegíveis.'} Próxima revisão a partir de ${num(a.proximaRevisao,0)} concursos conferidos neste perfil.</p></details></section>`;
}
function savedSequence(m,t,saved=[],target=null,covers=null){
 const c=L.cfg(m),main=x=>L.key(m,c.colunas?{colunas:x.colunas}:{dezenas:x.dezenas});
 const fullKey=L.key(m,t),mainKey=main(t),exact=[],partial=[];
 for(const j of saved){
  if(j.modalidade!==m)continue;
  try{if(main(j)!==mainKey)continue;(L.key(m,j)===fullKey?exact:partial).push(j);}catch(e){/* Registros inválidos não viram correspondências. */}
 }
 const coverage=exact.map(j=>target&&covers?covers(j,target):null);
 return {registros:exact.length,mesmasDezenas:partial.length,cobertos:coverage.filter(x=>x===true).length,indefinidos:coverage.filter(x=>x==null).length,
  tipos:[...new Set(exact.map(j=>j.acompanhamento==='fixo'?'Jogo fixo':j.deConcurso&&!j.concursoAlvo?'Teimosinha':j.concursoAlvo?'Concurso único':'Acompanhamento contínuo'))]};
}
function savedSequenceView(m,t,target){
 const s=savedSequence(m,t,bridge?.savedGames?.()||[],target,bridge?.savedGameCoverage);
 const extra={trevos:'trevos',mes:'Mês da Sorte',time:'Time do Coração'}[L.cfg(m).extra];
 const title=s.registros?'Já registrada em Meus Jogos':s.mesmasDezenas?'Dezenas já registradas; complemento diferente':'Sequência ainda não registrada em Meus Jogos';
 const text=s.registros?`${s.registros} registro${s.registros===1?'':'s'} · ${s.tipos.join(' / ')}. ${!target?'Concurso da sugestão ainda não definido.':s.cobertos?`O acompanhamento inclui o concurso ${target}.`:s.indefinidos?'Confira a participação deste registro em Meus Jogos.':`Os registros encontrados não cobrem o concurso ${target}.`}`:s.mesmasDezenas?`As dezenas coincidem, mas o complemento (${extra}) é diferente ou não foi informado.`:'Salve a sugestão para acompanhá-la na sua base de jogos.';
 return `<div class="auto-saved-sequence" data-saved-sequence="${s.registros?'registrada':s.mesmasDezenas?'parcial':'nova'}" role="status"><div class="auto-status-heading">${icon(s.registros?'manter':'pendente')}<strong>${title}</strong></div><p class="int-help">${esc(text)}</p></div>`;
}
function strategyDiagnosis(a){
 const future=a.acompanhamento.n>0;
 const obs=future?a.acompanhamento.observacoes:a.inicial?.particao?a.inicial.observacoes.slice(a.inicial.nSelecao):[];
 const n=obs.length,stats=n?(future?a.acompanhamento.ranking:a.inicial?.teste||[]):[],last=obs.at(-1);
 const rows=a.pacoteVirtual.map(t=>{
  const x=stats.find(s=>s.id===t.id),control=t.id==='uniforme';
  const media=control&&n?L.mean(obs.map(o=>o.acertos.uniforme)):n&&Number.isFinite(x?.media)?x.media:null;
  const confirmed=!!x&&(future?n>=60&&L.autoEligible(x):a.inicial?.metodo===x.id);
  return {id:t.id,media,ultimo:n?last.acertos[t.id]??null:null,confirmado:confirmed,controle:control,estatistica:x};
 });
 const tested=rows.filter(x=>!x.controle&&x.media!==null),max=tested.length?Math.max(...tested.map(x=>x.media)):null;
 const leaders=max===null?[]:tested.filter(x=>Math.abs(x.media-max)<1e-9).map(x=>x.id);
 const lastMax=tested.some(x=>x.ultimo!==null)?Math.max(...tested.filter(x=>x.ultimo!==null).map(x=>x.ultimo)):null;
 return {n,origem:future?'prospectivo':n?'historico':'sem-base',ultimoConcurso:last?.concurso??null,melhorMedia:max,lideres:leaders,
  melhoresUltimo:lastMax===null?[]:tested.filter(x=>x.ultimo===lastMax).map(x=>x.id),melhorUltimo:lastMax,
  confirmadas:tested.filter(x=>x.confirmado).map(x=>x.id),linhas:rows.sort((x,y)=>(y.media??-1)-(x.media??-1))};
}
function strategyView(a,old=false){
 const d=strategyDiagnosis(a),names=ids=>ids.map(id=>name(id)).join(' · ');
 const highlight=!d.n?'Nenhuma estratégia se destacou: ainda não há concursos elegíveis para comparação.':d.lideres.length===10?`Empate entre as estratégias na média observada: ${num(d.melhorMedia)} acertos.`:`Maior média observada: ${names(d.lideres)} · ${num(d.melhorMedia)} acertos.`;
 const confirmation=d.confirmadas.length?(d.origem==='prospectivo'?`Atendem aos critérios de evidência do motor: ${names(d.confirmadas)}.`:`Destaque confirmado nas etapas históricas: ${names(d.confirmadas)}. Ainda em observação nos próximos sorteios.`):'Nenhuma melhora confirmada pelos critérios do motor para trocar de estratégia.';
 const status=x=>x.controle?'Referência virtual':x.confirmado?d.origem==='prospectivo'?'Atende aos critérios de troca':'Confirmada no teste histórico':x.media===null?'Aguardando conferência':d.lideres.includes(x.id)?'Maior média; sem confirmação':'Sem melhora confirmada';
 return `<section class="auto-strategy-diagnosis" aria-label="Diagnóstico das outras estratégias"><div class="int-section-title"><h3>Diagnóstico das outras estratégias</h3><span>${d.n?num(d.n,0)+' concursos':'Aguardando'}</span></div><p class="auto-strategy-highlight">${esc(highlight)}</p><p class="int-help">${esc(confirmation)}</p>${old?'<p class="nota atencao">Histórico alterado: este diagnóstico aguarda atualização.</p>':''}${d.ultimoConcurso?`<p class="int-help"><b>${d.origem==='historico'?'Último concurso do teste histórico':'Última conferência'} · ${d.ultimoConcurso}:</b> ${esc(names(d.melhoresUltimo))} · ${d.melhorUltimo} acertos. Um resultado isolado não determina a troca.</p>`:''}<p class="int-help">${d.origem==='prospectivo'?'Jogos registrados antes dos resultados.':d.n?'Teste histórico separado; estes não são jogos feitos por você.':'Aguardando histórico suficiente ou resultados válidos.'} A maior média, sozinha, não confirma superioridade.</p>
  <details class="int-details auto-ranking"><summary>Comparar ${a.pacoteVirtual.filter(t=>t.id!=='uniforme').length} estratégias e controle</summary><div class="ll-table" tabindex="0" role="region" aria-label="Comparação das estratégias"><table><thead><tr><th scope="col">Estratégia</th><th scope="col">${d.origem==='historico'?'Último no teste':'Último conferido'}</th><th scope="col">Média de acertos</th><th scope="col">Diagnóstico</th><th scope="col">${L.cfg(a.modalidade).k-1}+ acertos</th><th scope="col">Diferença para o acaso</th><th scope="col">IC 95%</th></tr></thead><tbody>${d.linhas.map(x=>`<tr data-strategy-diagnosis="${esc(x.id)}"><th scope="row">${esc(name(x.id))}</th><td>${num(x.ultimo,0)}</td><td>${num(x.media)}</td><td>${esc(status(x))}</td><td>${d.n?a.objetivo?.linhas.find(row=>row.id===x.id)?.proximos??'—':'—'}</td><td>${num(x.estatistica?.acaso.media,3)}</td><td>${x.estatistica?.acaso.ic?.map(v=>num(v,3)).join(' a ')||'—'}</td></tr>`).join('')}</tbody></table></div><p class="int-help">Controle: média de 32 jogos aleatórios independentes por concurso, além do controle visível no pacote. A troca exige melhora de média e acertos altos em períodos distintos, correção conjunta de 40 comparações e teste válido para consultas repetidas. A linha Controle aleatório mostra somente o bilhete virtual visível.</p>${a.inicial?.particao?`<p class="int-help">Seleção inicial: ${a.inicial.particao.validacao.join('–')} · teste separado: ${a.inicial.particao.teste.join('–')}.</p>`:''}</details></section>`;
}
function render(g,old=false,rec=()=>'',trevos=()=> ''){
 const a=g.automatico,follow=a.acompanhamento,round=a.rodada;
 const goal=a.objetivo,goalMain=goal?.linhas.find(x=>x.id==='principal'),k=L.cfg(g.modalidade).k;
 const ticket=(t,i)=>`<article class="int-ticket ${i===0?'int-principal':''}"><div class="int-section-title"><h3>${i===0?'Sua sugestão principal':'Jogo adicional '+i}</h3><span>${i===0?'CONCURSO '+(round.concursoAlvo||'A DEFINIR'):'OPCIONAL'}</span></div>${balls(g.modalidade,t)}${t.trevos?trevos(t.trevos):''}${i===0?decisionView(a,old)+savedSequenceView(g.modalidade,t,round.concursoAlvo):''}${rec(t)}${i===0?`<details class="auto-reason"><summary>Como esta sugestão foi escolhida</summary><p class="int-help">${esc(g.motivo)}</p></details>`:''}<button class="acao secundaria" data-int-analisar="${i}">Ver estatísticas deste jogo</button></article>`;
 return `<section class="int-results auto-results" data-auto-modalidade="${esc(g.modalidade)}" aria-label="Sugestão automática"><div class="int-section-title"><h2>Seu lote está pronto</h2><span>${esc(L.VERSION)}</span></div>
  ${old?'<p class="nota atencao">O histórico mudou. A atualização automática está preparando o próximo concurso.</p>':''}
  ${!a.persistido?'<p class="nota atencao" role="alert">Não foi possível registrar o pacote de análise. Os jogos já salvos foram preservados. Toque em Atualizar sugestão para tentar novamente ou salve uma cópia em Meus jogos → Backup.</p>':''}
  ${!g.base.n?'<p class="nota atencao">Sem histórico disponível. A sugestão usa apenas referências combinatórias; a comparação começará quando os resultados chegarem.</p>':''}
  <div class="auto-context"><span>${esc(L.cfg(g.modalidade).nome)} · ${round.concursoAlvo?'concurso '+num(round.concursoAlvo,0):'concurso a definir'}</span><span class="auto-state">${old?'Histórico alterado':round.concursoAlvo?'Aguardando resultado':'Prévia'}</span></div>
  ${ticket(g.jogos[0],0)}
  ${strategyView(a,old)}
  <div class="auto-lot-cost"><div><span>Seu lote · ${g.jogos.length} ${g.jogos.length===1?'jogo':'jogos'}</span><strong>${money(g.custo)}</strong></div><p>${money(g.unitario)} por jogo<br>Testes virtuais: R$ 0,00</p></div>
  ${g.jogos.length>1?`<details class="int-details"><summary>Jogos adicionais escolhidos (${g.jogos.length-1})</summary>${g.jogos.slice(1).map((t,i)=>ticket(t,i+1)).join('')}</details>`:''}
  ${g.jogos.length<g.solicitados?`<p class="nota">O orçamento comporta ${g.jogos.length} dos ${g.solicitados} jogos solicitados.</p>`:''}
  <div class="int-grid int-actions" aria-label="Ações do lote"><button class="acao" id="int-salvar" ${old?'disabled':''}>Salvar ${g.jogos.length===1?'sugestão':'lote'} · ${money(g.custo)}</button><button class="acao secundaria" id="int-exportar">Exportar CSV</button></div><p class="int-help">Salvar no app não compra apostas. O pacote virtual permanece separado dos seus jogos e do seu orçamento.</p>
  <section class="auto-overview" aria-label="Resumo da análise"><h3>O que a análise mostra</h3><p class="int-help">${follow.n?`Acompanhamento prospectivo: ${num(follow.n,0)} concursos elegíveis.`:a.inicial?.particao?'Teste histórico separado. O acompanhamento futuro ainda não começou.':'Descrição do histórico disponível. Ainda sem validação suficiente.'}</p>
  <div class="auto-summary"><div><b>${num(g.base.n,0)}</b><small>concursos na base</small></div><div><b>${num(follow.n,0)}</b><small>conferidos neste perfil</small></div><div><b>${a.pacoteVirtual.length}</b><small>jogos virtuais</small></div></div>
  <p class="auto-limitation">Histórico descreve; não prevê. Estes indicadores não são chance de prêmio.</p></section>
  <div class="auto-section-heading"><h3>Entenda esta sugestão</h3><p>Abra os detalhes que deseja consultar.</p></div>
  ${g.base.invalidos||g.base.conflitos?`<p class="nota atencao" role="status">Base com ${num(g.base.invalidos,0)} registros inválidos e ${num(g.base.conflitos,0)} conflitos excluídos. Confira a integridade abaixo.</p>`:''}
  ${root.LL18UI?.diagnosticAlerts(g.diagnostico)||''}
  ${root.LL18UI?.observatoryView(g.diagnostico)||''}
  ${root.LL18UI?.baseHealthView(g.principal.analise.saudeBase,{historico:g.parametros.antesDe!==null})||''}
  ${root.LL18UI?.evidenceView(g)||''}
  ${root.LL18UI?.recommendationPlanView(g.plano)||''}
  ${root.LL18UI?.frequencyDiagnosisView(g.principal.analise.diagnosticoFrequencia)||''}
  ${root.LL18UI?.modalidadeProfileView(g.principal.analise.perfilModalidade,{open:false})||''}
  ${historyReport(g)}
  <details class="auto-decision auto-goal"><summary>Acertos altos e critério de escolha</summary><span class="int-eyebrow">FOCO NO PRÊMIO MÁXIMO</span><h3>Acertos altos também decidem a escolha</h3><p class="int-help">A troca de estratégia exige melhora na média e em um índice que dá mais peso aos acertos próximos de ${k}. A diferença precisa aparecer em períodos distintos e superar o controle aleatório.</p>${goalMain&&goal.n?`<div class="auto-summary"><div><b>${goalMain.melhor}</b><small>melhor acerto de dezenas${L.cfg(g.modalidade).colunas?' / colunas':''}</small></div><div><b>${goalMain.proximos}</b><small>com ${k-1} ou ${k} acertos</small></div><div><b>${goalMain.maximos}</b><small>acertos completos${g.modalidade==='mais-milionaria'?' com trevos':''}</small></div></div><p class="int-help">${follow.n?'Sua principal registrada antes dos sorteios.':'Referência: consenso histórico no teste separado; não representa jogos feitos por você.'} ${goal.n} concursos avaliados${L.cfg(g.modalidade).dupla?' (primeiro sorteio)':''}${goalMain.completos<goal.n?`; ${goal.n-goalMain.completos} sem trevos para conferir o prêmio máximo`:''}. Esses números descrevem o que aconteceu.</p>`:'<p class="int-help">Os acertos altos aparecerão após a conferência. Um prêmio isolado não muda a estratégia.</p>'}</details>
  <details class="int-details auto-pack"><summary>Pacote de estratégias · ${a.pacoteVirtual.length} jogos virtuais</summary><p class="int-help">${round.concursoAlvo?'Registrados para o concurso '+round.concursoAlvo+'.':'Prévia sem concurso definido; ainda não entra na avaliação.'} A conferência e a comparação acontecem automaticamente. Custo dos testes: R$ 0,00.</p><div class="auto-pack-grid">${a.pacoteVirtual.map(t=>`<article class="auto-test" data-auto-strategy="${esc(t.id)}"><b>${esc(t.nome)}</b>${balls(g.modalidade,t.jogo)}</article>`).join('')}</div></details>
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
root.LL18Auto={mount,recommend,historyChanged,render,merge,prepare,historyReport,savedSequence,strategyDiagnosis};
})(globalThis);
