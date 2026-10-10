import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const L=createRequire(import.meta.url)('../ui/lab-auto.js');
const row=(m,n,ds)=>({modalidade:m,concurso:n,data:'2026-01-01',dezenas:ds});
const range=(lo,n)=>Array.from({length:n},(_,i)=>lo+i);
const lf=[row('lotofacil',1,range(1,15)),row('lotofacil',2,range(11,15))];
const ms=[row('mega-sena',1,[1,2,3,4,5,6]),row('mega-sena',2,[1,2,10,20,40,60])];

test('Lotofácil: médias de linhas e colunas são vetores por posição',()=>{
 const p=L.analyze('lotofacil',{dezenas:range(1,15)},lf).perfilModalidade;
 assert.deepEqual(p.historicoMedio.linhas,[2.5,2.5,5,2.5,2.5]);
 assert.deepEqual(p.historicoMedio.colunas,[3,3,3,3,3]);
 assert.equal(L.sum(p.historicoMedio.linhas),15);
 assert.equal(p.estatisticas.linhas[0].media,2.5);
 assert.deepEqual(p.estatisticas.linhas[0].faixaCentral80,[.5,4.5]);
});
test('base vazia mantém médias e repetição indisponíveis, sem inventar zero observado',()=>{
 const p=L.analyze('lotofacil',{dezenas:range(1,15)},[]).perfilModalidade;
 assert.deepEqual(p.historicoMedio.linhas,[null,null,null,null,null]);
 assert.equal(p.historicoMedio.soma,null);assert.equal(p.estatisticas.soma.faixaCentral80,null);
 assert.equal(p.repeticao.atual,null);assert.equal(p.repeticao.probabilidadeExata,null);
 assert.equal(p.repeticao.historicoMedio,null);
});
test('apostas ampliadas não recebem percentis de sorteios menores',()=>{
 for(const [m,ds,rows] of [['lotofacil',range(1,16),lf],['mega-sena',range(1,7),ms]]){
  const p=L.analyze(m,{dezenas:ds},rows).perfilModalidade;
  assert.equal(p.comparavel,false);assert.equal(p.estatisticas.soma.percentil,null);
  assert.match(p.nota,/Aposta ampliada/);
  assert.ok(Math.abs(p.repeticao.esperadoUniforme-ds.length*L.cfg(m).k/L.cfg(m).N)<1e-12);
 }
});
test('repetição combinatória da Lotofácil tem suporte 5–15 e média 9 na aposta simples',()=>{
 const p=L.analyze('lotofacil',{dezenas:range(1,15)},lf).perfilModalidade.repeticao;
 assert.equal(p.atual,5);assert.equal(p.esperadoUniforme,9);
 assert.ok(p.distribuicao.slice(0,5).every(v=>v===0));
 assert.ok(Math.abs(L.sum(p.distribuicao)-1)<1e-12);
 assert.ok(Math.abs(L.sum(p.distribuicao.map((v,i)=>v*i))-9)<1e-12);
 assert.equal(p.probabilidadeExata,L.comb(15,5)/L.comb(25,15));
});
test('Mega-Sena: repetição usa último resultado e a média uniforme é 0,6',()=>{
 const r=L.analyze('mega-sena',{dezenas:range(1,6)},ms).perfilModalidade.repeticao;
 assert.equal(r.atual,2);assert.deepEqual(r.dezenas,[1,2]);
 assert.equal(r.esperadoUniforme,.6);assert.equal(r.transicoes,1);assert.equal(r.historicoMedio,2);
});
test('lacunas e conflitos não viram transições consecutivas',()=>{
 const rows=[lf[0],{...lf[1],concurso:3}];
 assert.equal(L.analyze('lotofacil',{dezenas:range(1,15)},rows).perfilModalidade.repeticao.transicoes,0);
 const conflict=[...ms,row('mega-sena',2,[7,8,9,10,11,12]),row('mega-sena',3,[7,8,9,10,11,12])];
 const p=L.analyze('mega-sena',{dezenas:range(1,6)},conflict).perfilModalidade;
 assert.equal(p.concursos,2);assert.equal(p.repeticao.transicoes,0);
});
test('corte temporal exclui o alvo também das novas métricas',()=>{
 const a=L.analyze('lotofacil',{dezenas:range(1,15)},lf,{antesDe:2}).perfilModalidade;
 const b=L.analyze('lotofacil',{dezenas:range(1,15)},[lf[0],{...lf[1],dezenas:range(5,15)}],{antesDe:2}).perfilModalidade;
 assert.deepEqual(a,b);assert.equal(a.repeticao.concurso,1);
});
test('qualidade sem histórico é zero e sem validação nunca é boa',()=>{
 assert.equal(L.evidenceQuality({n:0},{estado:'insuficiente'},'amostra-insuficiente').pontuacao,0);
 const q=L.evidenceQuality({n:200},{estado:'insuficiente'},'perfil-historico');
 assert.ok(q.pontuacao<=69);assert.notEqual(q.nivel,'boa');
 assert.match(q.validacao,/não executada/);assert.match(q.motivo,/heurística/);
});
test('janela tardia não é penalizada como lacuna interna e não oculta o recorte',()=>{
 const a=L.evidenceQuality({n:180,primeiro:3000,inicioAusente:2999},{estado:'neutro'},'perfil-historico');
 const b=L.evidenceQuality({n:180},{estado:'neutro'},'perfil-historico');
 assert.equal(a.pontuacao,b.pontuacao);assert.ok(a.limitacoes.some(x=>/recorte/.test(x)));
 assert.ok(L.evidenceQuality({n:180,lacunas:10},{estado:'neutro'},'perfil-historico').pontuacao<b.pontuacao);
});
test('incompletude e conflitos reduzem qualidade sem premiar acertos históricos',()=>{
 const q=L.evidenceQuality({n:180,semData:180,invalidos:20,conflitos:2},{estado:'neutro'},'perfil-historico');
 assert.ok(q.pontuacao<L.evidenceQuality({n:180},{estado:'neutro'},'perfil-historico').pontuacao);
 assert.ok(q.penalidades.some(x=>/sem data/.test(x.motivo)));
 assert.match(q.metodologia,/Não premia acertos/);
});
test('recomendação automática traz qualidade e preserva a rodada original',()=>{
 const a=L.autoRecommend('mega-sena',ms,{}, {agora:'2026-10-08T14:00:00Z'});
 const b=L.autoRecommend('mega-sena',ms,a.automatico.estado,{agora:'2026-10-08T15:00:00Z'});
 assert.deepEqual(a.automatico.rodada,b.automatico.rodada);
 assert.deepEqual(a.qualidadeEvidencia,b.qualidadeEvidencia);
 assert.equal(a.calibracao.estado,'insuficiente');assert.equal(a.versao,L.VERSION);
 assert.equal(a.principal.analise.versao,L.VERSION);
});
const ctx=vm.createContext({LL18:L,console,setTimeout,clearTimeout,
 LL18Check:{ticket:()=>'<div>Cartela de teste</div>',board:()=>'',legend:()=>''}});
for(const f of ['lab-ui.js','lab-auto-ui.js'])vm.runInContext(readFileSync(new URL('../ui/'+f,import.meta.url),'utf8'),ctx);
test('tela automática renderiza qualidade, perfil e versão do motor',()=>{
 const g=L.autoRecommend('lotofacil',lf,{}, {agora:'2026-10-08T14:00:00Z'});
 const html=ctx.LL18Auto.render(g);
 assert.match(html,/Qualidade operacional da base/);assert.match(html,/Leitura específica da Lotofácil/);
 assert.match(html,/Média histórica da linha/);assert.match(html,/validação não executada/);
 assert.ok(html.includes(L.VERSION));
});
test('renderizador de qualidade escapa conteúdo externo',()=>{
 const html=ctx.LL18UI.evidenceView({qualidadeEvidencia:{nivel:'<script>alert(1)</script>',pontuacao:0,motivo:'<img src=x onerror=alert(1)>',validacao:'<script>',limitacoes:['<svg>']}});
 assert.doesNotMatch(html,/<script|<img|<svg/);assert.match(html,/&lt;script/);
});
function worker(fail=false){
 const handlers={},deleted=[];let skipped=0,claimed=0;
 vm.runInNewContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),{
  self:{addEventListener:(k,f)=>handlers[k]=f,skipWaiting:()=>{skipped++;},clients:{claim:()=>{claimed++;}}},
  caches:{open:async()=>({addAll:async()=>{if(fail)throw Error('offline');}}),
   delete:async k=>{deleted.push(k);return true;},keys:async()=>['lotolab-v35','lotolab-v36','outro-app']}
 });
 return {handlers,deleted,skipped:()=>skipped,claimed:()=>claimed};
}
test('falha de instalação PWA mantém o worker anterior e não ativa casca incompleta',async()=>{
 const w=worker(true);let task;w.handlers.install({waitUntil:p=>task=p});
 await assert.rejects(task,/offline/);assert.equal(w.skipped(),0);
 assert.deepEqual(w.deleted,['lotolab-v37']);
});
test('ativação PWA limpa somente caches do LotoLab',async()=>{
 const w=worker();let task;w.handlers.activate({waitUntil:p=>task=p});await task;
 assert.deepEqual(w.deleted,['lotolab-v35','lotolab-v36']);assert.equal(w.claimed(),1);
});

test('mesmo dia sem hora oficial não entra como evidência prospectiva, inclusive após a apuração',()=>{
 const draw=row('mega-sena',3,[1,2,3,4,5,6]);draw.data='2026-10-08';
 for(const instant of ['2026-10-08T11:00:00Z','2026-10-09T02:30:00Z']){
  const a=L.autoCycle('mega-sena',ms,{}, {agora:instant});
  const b=L.autoCycle('mega-sena',[...ms,draw],a.estado,{agora:'2026-10-09T12:00:00Z'});
  assert.equal(b.acompanhamento.n,0);assert.deepEqual(b.acompanhamento.rejeitados,[3]);
  assert.deepEqual(b.estado.rodadas[0],a.rodada);
 }
});
test('dia anterior ao resultado continua elegível na avaliação prospectiva',()=>{
 const a=L.autoCycle('mega-sena',ms,{}, {agora:'2026-10-07T14:00:00Z'});
 const draw={...row('mega-sena',3,[1,2,3,4,5,6]),data:'2026-10-08'};
 const b=L.autoCycle('mega-sena',[...ms,draw],a.estado,{agora:'2026-10-09T12:00:00Z'});
 assert.equal(b.acompanhamento.n,1);assert.deepEqual(b.acompanhamento.rejeitados,[]);
});
test('mudança do protocolo de avaliação revalida decisões sem sobrescrever rodadas',()=>{
 const a=L.autoCycle('mega-sena',ms,{}, {agora:'2026-10-07T14:00:00Z'});
 const state=structuredClone(a.estado);state.metodo='frequencia';
 state.decisoes=[{n:60,metodo:'frequencia',anterior:'consenso',acao:'ALTERAR',protocoloAvaliacao:'objetivo-426-2',motivo:'registro de teste'}];
 const b=L.autoCycle('mega-sena',ms,state,{agora:'2026-10-07T15:00:00Z'});
 assert.equal(b.estado.metodo,'consenso');assert.equal(b.estado.decisoes[0].metodo,'frequencia');
 assert.equal(b.estado.decisoes.at(-1).acao,'REVALIDAR');
 assert.equal(b.estado.decisoes.at(-1).protocoloAvaliacao,L.autoEvaluation);
 assert.deepEqual(b.rodada,a.rodada);
});

// Diagnóstico objetivo da base: não modifica os jogos nem certifica atualidade.
test('cobertura interna não confunde um recorte tardio com todo o histórico',()=>{
 const rows=ms.map((r,i)=>({...r,concurso:3000+i})),b=L.history('mega-sena',rows),antes=structuredClone(b.meta);
 const h=L.historyHealth(b);
 assert.equal(h.coberturaInterna,1);assert.equal(h.concursos,2);assert.equal(h.primeiro,3000);
 assert.equal(h.consecutivosFinais,2);assert.deepEqual(b.meta,antes);
 assert.match(h.nota,/não certifica todo o histórico/);
});
test('lacunas reduzem cobertura somente dentro dos limites e interrompem o trecho final',()=>{
 const rows=[{...ms[0],concurso:2},{...ms[1],concurso:6},{...ms[0],concurso:7}];
 const h=L.historyHealth(L.history('mega-sena',rows));
 assert.equal(h.coberturaInterna,3/6);assert.equal(h.faltantesInternos,3);assert.equal(h.consecutivosFinais,2);
});
test('data ausente do último concurso não usa download ou data de outro resultado',()=>{
 const rows=[{...ms[0],data:'2026-10-07'},{...ms[1],data:null,importadoEm:'2026-10-08T12:00:00Z'}];
 const h=L.historyHealth(L.history('mega-sena',rows));
 assert.equal(h.dataUltimo,null);assert.equal(h.semData,1);
 const html=ctx.LL18UI.baseHealthView(h,{referencia:'2026-10-08'});
 assert.match(html,/último concurso em indisponível/);assert.match(html,/download não substitui/);
 assert.doesNotMatch(html,/dias desde a apuração|pode estar desatualizada/);
});
test('base sem dados e eventos anuais não recebem cobertura artificial',()=>{
 const empty=L.historyHealth(L.history('lotofacil',[]));
 assert.equal(empty.coberturaInterna,null);assert.equal(empty.dataUltimo,null);assert.equal(empty.consecutivosFinais,0);
 const h=L.historyHealth(L.history('mega-da-virada',[{...ms[0],modalidade:'mega-da-virada',concurso:3000}]));
 assert.equal(h.coberturaInterna,null);assert.equal(h.consecutivosFinais,null);
 assert.doesNotMatch(ctx.LL18UI.baseHealthView(h,{referencia:'2026-10-08'}),/pode estar desatualizada/);
});
test('inversões de data são visíveis sem modificar a base',()=>{
 const rows=[{...ms[0],data:'2026-10-08'},{...ms[1],data:'2026-10-07'}];
 const b=L.history('mega-sena',rows),h=L.historyHealth(b);
 assert.equal(h.datasForaDeOrdem,1);assert.equal(h.dataUltimo,'2026-10-07');
 assert.match(ctx.LL18UI.baseHealthView(h,{referencia:'2026-10-08'}),/inversões de data/);
 assert.equal(b.rows[0].data,'2026-10-08');
});
test('recorte histórico intencional não gera alerta de atraso nem usa dados após o corte',()=>{
 const a=L.analyze('mega-sena',{dezenas:[1,2,3,4,5,6]},ms,{antesDe:2});
 assert.equal(a.saudeBase.ultimo,1);assert.equal(a.saudeBase.concursos,1);
 const html=ctx.LL18UI.baseHealthView(a.saudeBase,{historico:true,referencia:'2026-10-08'});
 assert.match(html,/Recorte histórico intencional/);assert.doesNotMatch(html,/pode estar desatualizada|dias desde a apuração/);
});
test('idade e futuro são apresentados como comparação com o relógio, não prova de atualização',()=>{
 const h=L.historyHealth(L.history('mega-sena',[{...ms[0],data:'2026-10-01'}]));
 const recente=ctx.LL18UI.baseHealthView(h,{referencia:'2026-10-08'});
 assert.match(recente,/7 dias desde a apuração/);assert.doesNotMatch(recente,/pode estar desatualizada/);
 assert.match(ctx.LL18UI.baseHealthView(h,{referencia:'2026-10-09'}),/pode estar desatualizada/);
 assert.match(ctx.LL18UI.baseHealthView(h,{referencia:'2026-09-30'}),/está no futuro/);
});
test('fonte declarada é contada, escapada e não autenticada pelo painel',()=>{
 const rows=ms.map(r=>({...r,origem:'<img src=x onerror=alert(1)>'}));
 const h=L.historyHealth(L.history('mega-sena',rows));assert.equal(h.fontes[0].concursos,2);
 const html=ctx.LL18UI.baseHealthView(h,{referencia:'2026-01-01'});
 assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/não autenticadas/);
});
test('sugestão automática apresenta o diagnóstico objetivo sem reescrever a rodada',()=>{
 const g=L.autoRecommend('lotofacil',lf,{}, {agora:'2026-10-08T14:00:00Z'}),snapshot=JSON.stringify(g.automatico.rodada);
 assert.match(ctx.LL18Auto.render(g),/Cobertura e atualização do histórico/);
 assert.equal(JSON.stringify(g.automatico.rodada),snapshot);
 assert.equal(g.principal.analise.saudeBase.concursos,g.base.n);
});
