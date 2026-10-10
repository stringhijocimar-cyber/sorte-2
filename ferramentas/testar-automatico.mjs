import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const L=createRequire(import.meta.url)('../ui/lab-auto.js');
const m='mega-sena',now='2026-09-27T22:00:00Z';
function history(n,mode=m){const random=L.rng('historico:'+mode);return Array.from({length:n},(_,i)=>({modalidade:mode,concurso:i+1,data:'2026-09-26',...L.randomTicket(mode,random)}));}

test('um comando prepara principal, dez hipóteses e controle, sem treino manual',()=>{
 const r=L.autoRecommend(m,history(40),{}, {agora:now});
 assert.equal(r.automatico.pacoteVirtual.length,11);
 assert.equal(r.automatico.custoVirtual,0);
 assert.equal(r.jogos.length,1);
 assert.equal(r.automatico.rodada.concursoAlvo,41);
 assert.deepEqual(r.jogos[0],r.automatico.rodada.principal);
 assert.equal(r.automatico.estado.rodadas.length,1);
 assert.equal(r.automatico.inicial.estado,'amostra-insuficiente');
 assert.equal(r.principal.analise.base.n,40);
});
test('rodada permanece congelada em recarga e novo toque; resultado é contado uma vez',()=>{
 const rows=history(40),first=L.autoCycle(m,rows,{}, {agora:now});
 const again=L.autoCycle(m,rows,first.estado,{agora:'2026-09-28T10:00:00Z',semente:'outra'});
 assert.deepEqual(again.rodada,first.rodada);
 const draw={modalidade:m,concurso:41,data:'2026-09-28',dezenas:[1,2,3,4,5,6]};
 const next=L.autoCycle(m,[...rows,draw],again.estado,{agora:'2026-09-28T23:00:00Z'});
 assert.equal(next.acompanhamento.n,1);assert.equal(next.rodada.concursoAlvo,42);
 assert.deepEqual(next.acompanhamento.observacoes[0].resultado,{dezenas:draw.dezenas});
 for(const t of first.rodada.testes)assert.equal(next.acompanhamento.observacoes[0].acertos[t.id],t.jogo.dezenas.filter(x=>draw.dezenas.includes(x)).length);
 assert.equal(L.autoCycle(m,[...rows,draw],next.estado,{agora:now}).acompanhamento.n,1);
 assert.equal(next.decisao.acao,'MANTER');
});
test('correções de resultado substituem a observação, preservando o pacote original',()=>{
 const rows=history(40),a=L.autoCycle(m,rows,{}, {agora:now});
 const draw={modalidade:m,concurso:41,data:'2026-09-28',dezenas:a.rodada.testes[0].jogo.dezenas};
 const b=L.autoCycle(m,[...rows,draw],a.estado,{agora:'2026-09-28T23:00:00Z'});
 const corrected={...draw,dezenas:Array.from({length:60},(_,i)=>i+1).filter(d=>!draw.dezenas.includes(d)).slice(0,6)};
 const c=L.autoCycle(m,[...rows,corrected],b.estado,{agora:'2026-09-29T23:00:00Z'});
 assert.equal(c.acompanhamento.n,1);
 assert.equal(c.acompanhamento.observacoes[0].acertos.equilibrio,0);
 assert.deepEqual(c.acompanhamento.observacoes[0].resultado,{dezenas:corrected.dezenas});
 assert.deepEqual(c.estado.rodadas[0],a.rodada);
});
test('validação não acessa o futuro e a estratégia é congelada antes do teste',()=>{
 const rows=history(180),a=L.autoCycle(m,rows,{}, {agora:now});
 const changed=rows.map((r,i)=>i>=120?{...r,dezenas:[1,2,3,4,5,6]}:r);
 const b=L.autoCycle(m,changed,{}, {agora:now});
 assert.deepEqual(a.inicial.validacao,b.inicial.validacao);
 assert.equal(a.inicial.selecao,b.inicial.selecao);
 assert.deepEqual(a.inicial.observacoes.slice(0,60),b.inicial.observacoes.slice(0,60));
 assert.ok(a.inicial.observacoes.every(x=>x.geradoAte<x.concurso));
 assert.equal(a.inicial.congeladoAte,120);
});
test('orçamento, fixas e exclusões valem para todos os jogos; formato não mistura evidência',()=>{
 const rows=history(40),op={agora:now,fixas:[1,2],excluidas:[7,8],quantidade:5,orcamento:12};
 const r=L.autoRecommend(m,rows,{},op);
 assert.equal(r.custo,12);assert.equal(r.jogos.length,2);
 for(const t of [...r.jogos,...r.automatico.pacoteVirtual.map(x=>x.jogo)]){
  assert.ok(t.dezenas.includes(1)&&t.dezenas.includes(2));assert.ok(!t.dezenas.includes(7)&&!t.dezenas.includes(8));
 }
 const changed=L.autoCycle(m,rows,r.automatico.estado,{agora:now});
 assert.notEqual(changed.estado.perfil,r.automatico.estado.perfil);
 assert.equal(changed.estado.rodadas.length,1);
 assert.throws(()=>L.autoRecommend(m,rows,{}, {agora:now,fixas:[1,2,3,4,5,6],quantidade:2}),/restrições/);
});
test('registro criado depois da data do sorteio não vira evidência prospectiva',()=>{
 const a=L.autoCycle(m,history(40),{}, {agora:'2026-10-02T12:00:00Z'});
 const draw={modalidade:m,concurso:41,data:'2026-09-28',dezenas:[1,2,3,4,5,6]};
 const b=L.autoCycle(m,[...history(40),draw],a.estado,{agora:'2026-10-03T12:00:00Z'});
 assert.equal(b.acompanhamento.n,0);assert.deepEqual(b.acompanhamento.rejeitados,[41]);
});
test('lacunas impedem calibração e base ampliada a libera automaticamente',()=>{
 const rows=history(180),a=L.autoCycle(m,rows.filter(x=>x.concurso!==120),{}, {agora:now});
 assert.equal(a.inicial.estado,'amostra-insuficiente');
 const b=L.autoCycle(m,rows,a.estado,{agora:now});assert.equal(b.inicial.estado,'concluido');
});
test('etapas iniciais têm resolução para Holm sem reutilizar a seleção no teste',()=>{
 const rows=history(190),small=L.autoCycle(m,rows.slice(0,179),{}, {agora:now});
 assert.equal(small.inicial.estado,'amostra-insuficiente');assert.equal(small.inicial.necessarios,180);
 const initial=L.autoCycle(m,rows.slice(0,180),small.estado,{agora:now}).inicial;
 assert.equal(initial.observacoes.length,120);
 assert.equal(initial.particao.validacao[1]+1,initial.particao.teste[0]);
 for(const x of [...initial.validacao,...initial.teste]){
  assert.equal(x.n,60);assert.equal(x.objetivo.n,60);
  assert.equal(x.acaso.permutacoesExatas,4096);
  assert.ok(40*2/x.acaso.permutacoesExatas<.05,'um sinal máximo não é impedido pela resolução do teste');
 }
 const a=L.autoCycle(m,rows.slice(0,180),{}, {agora:now});
 const extended=L.autoCycle(m,rows,a.estado,{agora:now});
 assert.deepEqual(extended.inicial,a.inicial,'estender o histórico conserva a calibração original');
});
for(const mode of Object.keys(L.rules))test(mode+': pacote virtual válido e independente de compra',()=>{
 const c=L.cfg(mode),r=L.autoCycle(mode,[],{}, {agora:now});
 assert.equal(r.rodada.concursoAlvo,null);assert.equal(r.estado.rodadas.length,0);
 for(const item of r.pacoteVirtual)assert.deepEqual(L.validateTicket(mode,item.jogo,{completo:true}),item.jogo);
 assert.equal(r.custoVirtual,0);
 if(c.especial)assert.equal(r.rodada.concursoAlvo,null);
});
test('melhor estratégia nos concursos futuros muda a principal, nunca após um sorteio',()=>{
 const rows=history(120),first=L.autoCycle(m,rows.slice(0,40),{}, {agora:'2026-09-01T10:00:00Z'});
 const good={dezenas:[1,2,3,4,5,6]},bad={dezenas:[7,8,9,10,11,12]},state=first.estado;
 state.metodo='consenso';state.rodadas=[];
 for(let n=41;n<=100;n++){
  rows[n-1]={modalidade:m,concurso:n,data:'2026-09-26',...good};
  state.rodadas.push({...first.rodada,concursoAlvo:n,geradoAte:n-1,criadoEm:'2026-09-01T10:00:00Z',semente:'teste:'+n,principal:bad,consenso:bad,testes:Object.keys(L.autoExperts).map(id=>({id,jogo:id==='frequencia'?good:bad}))});
 }
 const r=L.autoCycle(m,rows.slice(0,100),state,{agora:now});
 assert.equal(r.acompanhamento.n,60);assert.equal(r.decisao.acao,'ALTERAR');
 assert.equal(r.decisao.metodo,'frequencia');
 assert.deepEqual(r.rodada.principal,r.rodada.testes.find(x=>x.id==='frequencia').jogo);
});

test('janela curta limita características, sem descartar avaliações antigas',()=>{
 const rows=history(100),state=L.autoCycle(m,rows.slice(0,40),{}, {agora:now,janela:30}).estado;
 const template=state.rodadas[0];state.rodadas=[];
 for(let n=41;n<=100;n++){
  rows[n-1].data='2026-09-28';
  state.rodadas.push({...template,concursoAlvo:n,geradoAte:n-1,semente:'janela:'+n});
 }
 const result=L.autoCycle(m,rows,state,{agora:'2026-09-29T12:00:00Z',janela:30});
 assert.equal(result.base.n,30);assert.equal(result.acompanhamento.n,60);
});

test('memória adulterada não aceita alvo duplicado ou jogo incompatível',()=>{
 const rows=history(40),a=L.autoCycle(m,rows,{}, {agora:now});
 const duplicate=structuredClone(a.estado);duplicate.rodadas.push(duplicate.rodadas[0]);
 assert.throws(()=>L.autoCycle(m,rows,duplicate),/Registro/);
 const invalidCut=structuredClone(a.estado);delete invalidCut.rodadas[0].geradoAte;
 assert.throws(()=>L.autoCycle(m,rows,invalidCut),/Registro/);
 const changed=structuredClone(a.estado);changed.rodadas[0].principal.dezenas.push(60);
 assert.throws(()=>L.autoCycle(m,rows,changed),/incompatível|repetida/);
});

function controller(store=new Map(),canSave=true,shared=null){
 const context=vm.createContext({LL18:L,document:{getElementById:()=>null},setTimeout,
  LL18UI:{automatic:async(m,rows,s,op,p)=>L.autoRecommend(m,rows,s,op,p)}});
 vm.runInContext(readFileSync(new URL('../ui/lab-auto-ui.js',import.meta.url),'utf8'),context);
 context.LL18Auto.mount({currentScreen:()=>'',currentMode:()=>m,
  read:(k,p)=>store.has(k)?structuredClone(store.get(k)):p,
  write:(k,v)=>{if(canSave)store.set(k,structuredClone(v));return canSave;},
  fetchJson:async()=>{if(shared)return shared;throw Error('offline');}});
 return context.LL18Auto;
}
test('cliente importa livro público sem sobrescrever rodada já vista',async()=>{
 const rows=history(40),book=L.autoCycle(m,rows,{}, {agora:now}).estado;
 const api=controller(new Map(),true,book),a=await api.recommend(m,rows,{agora:now});
 assert.deepEqual(a.automatico.rodada,book.rodadas[0]);assert.equal(a.automatico.persistido,true);
 const local=structuredClone(book);local.rodadas[0].criadoEm='2026-09-27T21:00:00Z';
 const merged=api.merge(local,book,book.perfil,40);
 assert.equal(merged.rodadas[0].criadoEm,local.rodadas[0].criadoEm);
 assert.equal(merged.rodadas.length,1);
 assert.equal(api.merge(null,book,'outro perfil',40),null);
 assert.equal(api.merge(null,book,book.perfil,39),null);
});
test('falha de gravação é declarada; chamadas concorrentes não perdem o registro',async()=>{
 const rows=history(40),failed=await controller(new Map(),false).recommend(m,rows,{agora:now});
 assert.equal(failed.automatico.persistido,false);
 const store=new Map(),api=controller(store),pair=await Promise.all([api.recommend(m,rows,{agora:now}),api.recommend(m,rows,{agora:now})]);
 assert.deepEqual(pair[0].automatico.rodada,pair[1].automatico.rodada);
 assert.equal(store.get('automatico421:'+pair[0].automatico.estado.perfil).rodadas.length,1);
 const reopened=await controller(store).recommend(m,rows,{agora:now});
 assert.deepEqual(reopened.automatico.rodada,pair[0].automatico.rodada);
});

test('resultado sem data fica fora da evidência prospectiva',()=>{
 const a=L.autoCycle(m,history(40),{}, {agora:now});
 const r=L.autoCycle(m,[...history(40),{modalidade:m,concurso:41,dezenas:[1,2,3,4,5,6]}],a.estado,{agora:now});
 assert.equal(r.acompanhamento.n,0);assert.deepEqual(r.acompanhamento.rejeitados,[41]);
});

function preparation(compute,canSave=()=>true){
 const rows=history(40),memory=new Map(),delivered=[];
 let screen='';
 const context=vm.createContext({LL18:L,document:{getElementById:()=>null},setTimeout,
  LL18UI:{automatic:compute}});
 vm.runInContext(readFileSync(new URL('../ui/lab-auto-ui.js',import.meta.url),'utf8'),context);
 const api=context.LL18Auto;
 api.mount({currentScreen:()=>screen,currentMode:()=>m,busy:()=>false,
  options:()=>({agora:now}),records:()=>rows,loadHistory:async()=>{},
  fetchJson:async()=>{throw Error('offline');},
  read:(k,p)=>memory.has(k)?structuredClone(memory.get(k)):p,
  write:(k,v)=>{if(!canSave())return false;memory.set(k,structuredClone(v));return true;},
  deliver:(mode,result)=>delivered.push(result)});
 return {api,delivered,screen:value=>{screen=value;}};
}
test('falha de quota não recalcula a cada redesenho e a nova tentativa preserva a rodada',async()=>{
 let calls=0,saving=false;
 const p=preparation(async(...args)=>{calls++;return L.autoRecommend(...args);},()=>saving);
 p.screen('sugestoes');await p.api.prepare(m);
 const first=p.delivered[0];assert.equal(first.automatico.persistido,false);
 await p.api.prepare(m);await p.api.prepare(m);assert.equal(calls,1);
 saving=true;
 const retry=await p.api.recommend(m,history(40),{agora:now});
 assert.equal(retry.automatico.persistido,true);
 assert.deepEqual(retry.automatico.rodada,first.automatico.rodada);
});
test('registro só é declarado persistido depois do commit assíncrono',async()=>{
 let commit,started;
 const ready=new Promise(resolve=>{started=resolve;});
 const context=vm.createContext({LL18:L,document:{getElementById:()=>null},setTimeout,
  LL18UI:{automatic:async(...args)=>L.autoRecommend(...args)}});
 vm.runInContext(readFileSync(new URL('../ui/lab-auto-ui.js',import.meta.url),'utf8'),context);
 let writes=0;
 context.LL18Auto.mount({currentScreen:()=>'',currentMode:()=>m,read:(k,p)=>p,
  writeAsync:async()=>{if(++writes===1){started();return new Promise(resolve=>{commit=resolve;});}return true;},
  fetchJson:async()=>{throw Error('offline');}});
 let finished=false;
 const pending=context.LL18Auto.recommend(m,history(40),{agora:now}).then(r=>{finished=true;return r;});
 await ready;assert.equal(finished,false);commit(true);
 assert.equal((await pending).automatico.persistido,true);assert.equal(writes,2);
});
test('voltar à tela retoma a sugestão que terminou durante a navegação',async()=>{
 let release,started;
 const ready=new Promise(resolve=>{started=resolve;});
 let calls=0;
 const p=preparation(async(...args)=>{
  if(++calls===1){started();await new Promise(resolve=>{release=resolve;});}
  return L.autoRecommend(...args);
 });
 p.screen('sugestoes');const pending=p.api.prepare(m);await ready;
 p.screen('jogos');release();await pending;
 assert.equal(p.delivered.length,0);
 p.screen('sugestoes');await p.api.prepare(m);
 assert.equal(p.delivered.length,1);
 assert.equal(p.delivered[0].automatico.rodada.concursoAlvo,41);
});
test('falha transitória não bloqueia a preparação automática na próxima abertura',async()=>{
 let calls=0;
 const p=preparation(async(...args)=>{
  if(++calls===1)throw Error('Worker indisponível');
  return L.autoRecommend(...args);
 });
 p.screen('sugestoes');await p.api.prepare(m);
 assert.equal(p.delivered.length,0);
 await p.api.prepare(m);
 assert.equal(p.delivered.length,1);
 await p.api.prepare(m);
 assert.equal(calls,2,'um resultado já entregue não precisa ser recalculado');
});

test('objetivo completo da +Milionária exige os trevos; ausências não viram zero',()=>{
 const t={dezenas:[1,2,3,4,5,6],trevos:[1,2]};
 assert.equal(L.autoObjective('mais-milionaria',t,{...t,trevos:[3,4]}),0);
 assert.equal(L.autoObjective('mais-milionaria',t,t),1);
 assert.equal(L.autoObjective('mais-milionaria',t,{dezenas:t.dezenas}),null);
 assert.ok(L.autoObjective('mais-milionaria',t,{...t,trevos:[2,3]})<1);
 for(const mode of Object.keys(L.rules)){
  const jogo=L.randomTicket(mode,L.rng('jogo:'+mode)),c=L.cfg(mode);
  const draw=c.colunas?{colunas:jogo.colunas.map(a=>[a[0]])}:{dezenas:L.sample(Array.from({length:c.N},(_,i)=>c.base+i),c.k,L.rng('sorteio:'+mode)),...(jogo.trevos?{trevos:jogo.trevos.slice(0,2)}:{})};
  const value=L.autoObjective(mode,jogo,draw);assert.ok(value>=0&&value<=1);
  const completo=c.colunas?{colunas:jogo.colunas.map(a=>[a[0]])}:{dezenas:jogo.dezenas.slice(0,c.k),...(jogo.trevos?{trevos:jogo.trevos.slice(0,2)}:{})};
  assert.equal(L.autoObjective(mode,jogo,completo),1);
 }
});

test('avaliação nova preserva rodadas antigas e reavalia uma correção sem mudar a seleção com dados futuros',()=>{
 const rows=history(180),a=L.autoCycle(m,rows,{}, {agora:now}),state=structuredClone(a.estado);
 delete state.inicial.protocoloAvaliacao;
 const upgraded=L.autoCycle(m,rows,state,{agora:now});
 assert.deepEqual(upgraded.rodada,a.rodada);assert.equal(upgraded.estado.rodadas.length,1);
 const corrected=rows.map(r=>r.concurso===170?{...r,dezenas:[1,2,3,4,5,6]}:r);
 const b=L.autoCycle(m,corrected,upgraded.estado,{agora:now});
 assert.notEqual(b.inicial.assinatura,upgraded.inicial.assinatura);
 assert.deepEqual(b.inicial.validacao,upgraded.inicial.validacao);
 assert.equal(b.inicial.selecao,upgraded.inicial.selecao);
 assert.deepEqual(b.rodada,a.rodada);
});

test('melhor média com pior desempenho de acertos altos não promove a estratégia',()=>{
 const rows=history(40),first=L.autoCycle(m,rows,{}, {agora:'2026-09-01T10:00:00Z'}),template=first.rodada;
 const full={dezenas:[1,2,3,4,5,6]},low={dezenas:[7,8,9,10,11,12]},two={dezenas:[1,2,7,8,9,10]};
 const state=first.estado;state.metodo='consenso';state.rodadas=[];
 for(let n=41;n<=280;n++){
  rows.push({modalidade:m,concurso:n,data:'2026-09-26',...full});
  const consensus=(n-41)%10===0?full:low;
  state.rodadas.push({...template,concursoAlvo:n,geradoAte:n-1,semente:'cauda:'+n,principal:consensus,consenso:consensus,
   testes:Object.keys(L.autoExperts).map(id=>({id,jogo:id==='frequencia'?two:consensus}))});
 }
 const r=L.autoCycle(m,rows,state,{agora:now}),candidate=r.acompanhamento.ranking.find(x=>x.id==='frequencia');
 assert.ok(candidate.acaso.media>0&&candidate.consenso.media>0);
 assert.ok(candidate.objetivo.consenso.media<0);
 assert.equal(r.decisao.metodo,'consenso');
 assert.equal(r.objetivo.linhas.find(x=>x.id==='principal').maximos,24);
 assert.equal(r.objetivo.linhas.find(x=>x.id==='frequencia').melhor,2);
});

test('família de comparações inclui a métrica de acertos altos e usa permutação exata em amostra pequena',()=>{
 const rows=history(40),a=L.autoCycle(m,rows,{}, {agora:now}),draw={modalidade:m,concurso:41,data:'2026-09-28',dezenas:[1,2,3,4,5,6]};
 const r=L.autoCycle(m,[...rows,draw],a.estado,{agora:now});
 for(const x of r.acompanhamento.ranking){
  assert.equal(x.objetivo.n,1);assert.equal(x.objetivo.acaso.pAjustado,1);
 }
 assert.equal(r.objetivo.protocolo,L.autoEvaluation);assert.equal(r.objetivo.n,1);
});
