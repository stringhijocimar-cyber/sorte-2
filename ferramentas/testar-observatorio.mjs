import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const L=createRequire(import.meta.url)('../ui/lab-auto.js');
const before='2026-01-01T14:00:00Z',after='2026-01-02';
const draw=(m,n=1,data='2025-12-31',t)=>{const value=t||L.randomTicket(m,L.rng('resultado-'+m));return {modalidade:m,concurso:n,data,...value,...(!t&&!L.cfg(m).colunas?{dezenas:value.dezenas.slice(0,L.cfg(m).k)}:{})};};
const base=[draw('mega-sena')];
const cycle=(m='mega-sena',op={})=>L.autoCycle(m,[draw(m)],{}, {...op,agora:before});
const report=(a,rows,op={},saved=[])=>L.prospectiveTiers(a.modalidade,rows,a.estado,op,saved);
const exact=(scope,h)=>scope.linhas.find(x=>x.tipo==='exatamente'&&x.acertos===h);
const main=f=>f.escopos[0];
const wallet=f=>f.escopos[1];
const pkg=f=>f.escopos[2];
const copy=x=>structuredClone(x);
function combinations(xs,k){if(!k)return [[]];return xs.flatMap((d,i)=>combinations(xs.slice(i+1),k-1).map(t=>[d,...t]));}

test('distribuição combinatória verificada por enumeração independente em universos pequenos',()=>{
 for(let N=4;N<=8;N++)for(let k=1;k<=3;k++)for(let n=k;n<=N;n++){
  const hist=Array(k+1).fill(0),ticket=Array.from({length:n},(_,i)=>i),results=combinations(Array.from({length:N},(_,i)=>i),k);
  for(const r of results)hist[r.filter(d=>ticket.includes(d)).length]++;
  for(let h=0;h<=k;h++)assert.ok(Math.abs(hist[h]/results.length-L.comb(n,h)*L.comb(N-n,k-h)/L.comb(N,k))<1e-12);
 }
});
test('todas as faixas aparecem; exatamente soma um, pelo menos é acumulado',()=>{
 const a=cycle(),r=draw('mega-sena',2,after,a.rodada.principal),f=report(a,[...base,r]);
 assert.equal(main(f).n,1);assert.equal(main(f).linhas.length,14);
 assert.equal(L.sum(main(f).linhas.filter(x=>x.tipo==='exatamente').map(x=>x.observado)),1);
 assert.equal(exact(main(f),6).observado,1);assert.equal(exact(main(f),0).observado,0);
 assert.equal(main(f).linhas.find(x=>x.tipo==='pelo-menos'&&x.acertos===0).observado,1);
 for(let h=0;h<=6;h++)assert.ok(Math.abs(main(f).linhas.find(x=>x.tipo==='pelo-menos'&&x.acertos===h).referencia-L.sum(main(f).linhas.filter(x=>x.tipo==='exatamente'&&x.acertos>=h).map(x=>x.referencia)))<1e-12);
 assert.equal(pkg(f).n,1);assert.equal(pkg(f).bilhetes,11);
 assert.match(main(f).unidade,/mesmo concurso não são observações independentes/);
});
test('ausência de resultado fica pendente com valores nulos, nunca zero',()=>{
 const a=cycle(),f=report(a,base);
 assert.deepEqual(f.pendentes,[2]);assert.equal(main(f).n,0);
 for(const row of main(f).linhas){assert.equal(row.observado,null);assert.equal(row.referencia,null);assert.equal(row.intervaloDiferenca,null);}
});
test('mesmo dia em Brasília, inclusive UTC do dia seguinte, fica excluído',()=>{
 for(const instant of ['2026-01-02T12:00:00Z','2026-01-03T02:30:00Z']){
  const a=cycle();a.estado.rodadas[0].criadoEm=instant;
  const f=report(a,[...base,draw('mega-sena',2,after)]);
  assert.equal(main(f).n,0);assert.equal(f.rejeitados.length,1);
 }
});
test('data ausente, conflitos e lacunas ficam explícitos',()=>{
 const a=cycle(),r=draw('mega-sena',2,null),f=report(a,[...base,r]);
 assert.equal(main(f).n,0);assert.match(f.rejeitados[0].motivo,/sem data/);
 const conflict=report(a,[...base,draw('mega-sena',2,after,{dezenas:[1,2,3,4,5,6]}),draw('mega-sena',2,after,{dezenas:[1,2,3,4,5,7]})]);
 assert.equal(conflict.integridade.conflitos,1);assert.equal(main(conflict).n,0);assert.deepEqual(conflict.pendentes,[2]);
 const missing=report(a,[draw('mega-sena',1),draw('mega-sena',4,after)]);
 assert.equal(missing.integridade.lacunas,2);assert.equal(main(missing).n,0);
});
test('corte temporal exclui futuro e diagnóstico não reescreve decisões/rodadas',()=>{
 const op={antesDe:3},a=cycle('mega-sena',op),state=copy(a.estado),records=[...base,draw('mega-sena',2,after),draw('mega-sena',3,'2026-01-03')];
 const first=report(a,records,op);records[2].dezenas=[1,2,3,4,5,6];
 assert.deepEqual(report(a,records,op),first);assert.deepEqual(a.estado,state);
 const future=copy(records);future.push(draw('mega-sena',20,'2026-02-03'));
 L.observatory('mega-sena',future,a.estado,op,[],[a.rodada.principal]);assert.deepEqual(a.estado,state);
});
test('formato ampliado usa distribuição própria, não conta combinações simples como amostra',()=>{
 const op={formato:{dezenas:[1,2,3,4,5,6,7]}},a=cycle('mega-sena',op),f=report(a,[...base,draw('mega-sena',2,after,{dezenas:[1,2,3,4,5,6]})],op);
 assert.equal(main(f).bilhetes,1);assert.equal(main(f).n,1);assert.equal(exact(main(f),6).referencia,7/L.comb(60,6));
 assert.deepEqual(main(f).formatos,['7 dezenas']);
});
test('duplicação no pacote virtual não infla denominador nem usa fórmula de independência da carteira',()=>{
 const a=cycle(),same=a.rodada.principal;
 for(const t of a.estado.rodadas[0].testes)t.jogo=copy(same);
 const f=report(a,[...base,draw('mega-sena',2,after,same)]);
 assert.equal(pkg(f).n,1);assert.equal(exact(pkg(f),6).observado,1);assert.equal(exact(pkg(f),6).referencia,1/L.comb(60,6));
 assert.deepEqual(exact(pkg(f),6).intervaloDiferenca,exact(main(f),6).intervaloDiferenca);
});
test('limites sucessivos correspondem à família declarada e não sinalizam superioridade',()=>{
 const a=cycle(),f=report(a,[...base,draw('mega-sena',2,after,a.rodada.principal)]),x=exact(main(f),6),M=42;
 assert.equal(main(f).familia,M);
 const d=x.observado-x.referencia,r=Math.sqrt(Math.log(2*M*1*2/.05)/2);
 assert.deepEqual(x.intervaloDiferenca,[Math.max(-1,d-r),Math.min(1,d+r)]);
 assert.match(f.metodo,/sem sinal de superioridade/);assert.equal(f.superioridade,undefined);
});
test('carteira salva necessita snapshot novo; legado e edição não ganham antecedência artificial',()=>{
 const a=cycle(),j={...a.rodada.principal,modalidade:'mega-sena',acompanhamento:'fixo',deConcurso:2};
 const snapshot=L.freezeSavedGame('mega-sena',j,1,before),saved={...j,registroProspectivo:snapshot};
 const rows=[...base,draw('mega-sena',2,after),draw('mega-sena',3,'2026-01-03')];
 const f=report(a,rows,{},[saved,j]);assert.equal(wallet(f).n,2);assert.equal(f.carteiraExcluida.legados,1);
 const edited={...saved,dezenas:[1,2,3,4,5,6]};if(L.key('mega-sena',edited)===L.key('mega-sena',saved))edited.dezenas=[1,2,3,4,5,7];
 const g=report(a,rows,{},[edited]);assert.equal(wallet(g).n,0);assert.equal(g.carteiraExcluida.alterados,1);
 assert.deepEqual(snapshot,saved.registroProspectivo);
});
test('snapshot respeita único, fixo, teimosinha e limite seguro',()=>{
 const a=cycle(),t=a.rodada.principal;
 for(const [kind,end] of [['unico',2],['teimosinha',3],['fixo',null]]){
  const j={...t,modalidade:'mega-sena',acompanhamento:kind,concursoAlvo:2,deConcurso:2,concursos:2};
  const s=L.freezeSavedGame('mega-sena',j,1,before);assert.equal(s.fim,end);
  const f=report(a,[...base,draw('mega-sena',2,after),draw('mega-sena',3,'2026-01-03'),draw('mega-sena',4,'2026-01-04')],{},[{...j,registroProspectivo:s}]);
  assert.equal(wallet(f).n,kind==='unico'?1:kind==='teimosinha'?2:3);
 }
 assert.throws(()=>L.freezeSavedGame('mega-sena',{...t,concursoAlvo:1},1,before),/futuro/);
 assert.throws(()=>L.freezeSavedGame('mega-sena',{...t,concursoAlvo:2},1,'2026-01-01'),/inválido/);
});
test('carteira restante é descrição, sem limite inferencial após possível exclusão posterior',()=>{
 const a=cycle(),j={...a.rodada.principal,modalidade:'mega-sena',concursoAlvo:2};j.registroProspectivo=L.freezeSavedGame('mega-sena',j,1,before);
 const f=report(a,[...base,draw('mega-sena',2,after)],{},[j]);assert.equal(wallet(f).n,1);assert.equal(wallet(f).prospectivo,false);
 assert.ok(wallet(f).linhas.every(x=>x.intervaloDiferenca===null));assert.match(f.nota,/exclusões podem selecionar resultados a posteriori/);
});
test('limite de carteira não impede diagnóstico da principal nem trunca uma carteira silenciosamente',()=>{
 const a=cycle(),j={...a.rodada.principal,modalidade:'mega-sena',concursoAlvo:2};j.registroProspectivo=L.freezeSavedGame('mega-sena',j,1,before);
 const f=report(a,[...base,draw('mega-sena',2,after)],{},Array(201).fill(j));assert.equal(f.carteiraLimitada,true);assert.equal(wallet(f).n,0);assert.equal(main(f).n,1);
});
test('complementos ausentes têm denominador próprio; +Milionária não afirma prêmio por dezenas',()=>{
 const a=cycle('mais-milionaria'),records=[draw('mais-milionaria'),draw('mais-milionaria',2,after,{dezenas:a.rodada.principal.dezenas})];
 let f=report(a,records);assert.equal(main(f).n,1);assert.ok(main(f).complementos.every(x=>x.n===0&&x.observado===null));
 records[1].trevos=copy(a.rodada.principal.trevos);f=report(a,records);
 const x=main(f).complementos.find(x=>x.tipo==='exatamente'&&x.acertos===2);assert.equal(x.n,1);assert.equal(x.observado,1);assert.equal(x.referencia,1/15);
});
test('Dia de Sorte e Timemania conferem complemento separado sem inventar rateio',()=>{
 for(const m of ['dia-de-sorte','timemania']){
  const a=cycle(m),t={...a.rodada.principal,dezenas:a.rodada.principal.dezenas.slice(0,L.cfg(m).k)},f=report(a,[draw(m),draw(m,2,after,t)]),x=main(f).complementos.find(x=>x.tipo==='exatamente'&&x.acertos===1);
  assert.equal(x.observado,1);assert.equal(x.referencia,1/L.cfg(m).extraN);assert.equal(f.roi,undefined);
 }
});
test('Super Sete considera posições/formatos; Dupla Sena identifica a extração',()=>{
 const m='super-sete',a=cycle(m),f=report(a,[draw(m),draw(m,2,after,a.rodada.principal)]);
 assert.ok(Math.abs(exact(main(f),7).referencia-1e-7)<1e-19);
 const d=cycle('dupla-sena'),g=report(d,[draw('dupla-sena'),draw('dupla-sena',2,after,d.rodada.principal)]);
 assert.match(main(g).extracao,/Primeiro sorteio/);
});
test('evento anual exige alvo explícito e não assume concursos intermediários',()=>{
 const m='mega-da-virada',a=cycle(m,{concursoAlvo:100}),f=report(a,[draw(m),draw(m,100,'2026-12-31',a.rodada.principal)],{concursoAlvo:100});
 assert.equal(main(f).n,1);assert.equal(f.integridade.lacunas,0);
});
test('Lotofácil compara coincidência natural com tamanho e fixas',()=>{
 const a={dezenas:Array.from({length:15},(_,i)=>i+1)},b={dezenas:Array.from({length:15},(_,i)=>i+11)},p=L.portfolioDiagnosis('lotofacil',[a,b]);
 assert.equal(p.referenciaMedia,9);assert.equal(p.sobreposicaoMedia,5);
 const c={dezenas:[1,2,3,4,5,6]},d={dezenas:[1,2,3,4,7,8]},restricted=L.portfolioDiagnosis('mega-sena',[c,d],{fixas:[1,2,3,4],excluidas:Array.from({length:52},(_,i)=>i+9)});
 assert.equal(restricted.referenciaMedia,5);assert.equal(restricted.sobreposicoes[0].contribuicaoFixas,4);
});
test('duplicados completos e mesmas principais com complementos diferentes são distintos',()=>{
 const t={dezenas:[1,2,3,4,5,6],trevos:[1,2]},u={...t,trevos:[2,3]},tickets=[t,copy(t),u],before=copy(tickets);
 const p=L.portfolioDiagnosis('mais-milionaria',tickets);assert.deepEqual(p.duplicados,[[0,1]]);assert.deepEqual(p.principaisIguaisComplementosDiferentes,[[0,2],[1,2]]);assert.deepEqual(tickets,before);
 assert.throws(()=>L.portfolioDiagnosis('mega-sena',[{dezenas:[1,2,3,4,5,6]}],{fixas:[7]}),/restrições/);
 assert.throws(()=>L.portfolioDiagnosis('mega-sena',Array(201).fill(t)),/200/);
});
test('proveniência não inventa origem/horário nem autentica hash ou proxy',()=>{
 const old=draw('mega-sena'),p=L.historyProvenance(L.history('mega-sena',[old]));
 assert.equal(p.consulta,null);assert.equal(p.oficialConfirmado,null);assert.equal(p.semProveniencia,1);assert.match(p.nota,/não autentica/);
 const meta={fonte:'proxy',urlFonte:'https://api.allorigins.win/',consultadoEm:before,confirmacaoDireta:true,ultimoSolicitado:true};
 const proxy=L.historyProvenance(L.history('mega-sena',[{...old,proveniencia:meta}]));assert.equal(proxy.oficialConfirmado,null);
 const official={...meta,fonte:'caixa',urlFonte:'https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena'};
 const saved=L.historyProvenance(L.history('mega-sena',[{...old,proveniencia:{...meta,consultadoEm:'2026-01-02T14:00:00Z'},consultasRecentes:[official]}]));
 assert.equal(saved.oficialConfirmado.concurso,1);assert.equal(saved.consulta.fonte,'proxy');assert.equal(saved.semProveniencia,0);
});
test('correção guarda versão anterior; consulta sem mudança não cria correção',()=>{
 const a=draw('mega-sena'),b={...a,dezenas:[1,2,3,4,5,6]};if(a.dezenas.join()===b.dezenas.join())b.dezenas=[2,3,4,5,6,7];
 const revision=L.historyRevision('mega-sena',a,b,before);assert.deepEqual(revision.anterior.dezenas,a.dezenas);
 assert.equal(L.historyRevision('mega-sena',a,{...a,proveniencia:{consultadoEm:before}},before),null);
 const p=L.historyProvenance(L.history('mega-sena',[{...b,revisoes:[revision]}]));assert.equal(p.correcoes.length,1);
});
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('importação textual sem data permanece sem data',()=>{
 const ctx=vm.createContext({MODALIDADES:L.rules,dataBrParaIso:s=>s,hoje:()=>{throw Error('Data de hoje não deve ser usada');},normalizarCaixa:()=>{}});
 vm.runInContext(index.slice(index.indexOf('function lerColagem('),index.indexOf('/* Insere sem duplicar:')),ctx);
 const result=ctx.lerColagem('2; ; 1 2 3 4 5 6','mega-sena');assert.equal(result[0].data,null);
});
test('gravação guarda trilha de correções e falha preserva a base anterior',()=>{
 const initial=draw('mega-sena'),changed={...initial,data:'2026-01-01'},S={resultados:[initial]};let succeeds=true;
 const ctx=vm.createContext({S,LL18:L,Guardar:{gravar:()=>succeeds},Date});
 vm.runInContext(index.slice(index.indexOf('function guardarResultados('),index.indexOf('/* Integração preserva')),ctx);
 ctx.guardarResultados([changed]);assert.equal(S.resultados[0].revisoes.length,1);assert.equal(S.resultados[0].revisoes[0].anterior.data,initial.data);
 const before=S.resultados;succeeds=false;assert.throws(()=>ctx.guardarResultados([{...changed,data:'2026-01-02'}]),/base anterior foi preservada/);assert.equal(S.resultados,before);
});
test('cache pequeno usa chave completa, devolve cópia e não modifica entradas',()=>{
 const a=cycle(),state=copy(a.estado),records=[...base,draw('mega-sena',2,after)],games=[a.rodada.principal];
 const result=L.observatory('mega-sena',records,a.estado,{},[],games),before=copy(result);result.carteira.jogos=999;
 assert.deepEqual(L.observatory('mega-sena',records,a.estado,{},[],games),before);
 const fresh=copy(records);fresh[1].proveniencia={fonte:'repositorio',urlFonte:'https://example.test/',consultadoEm:before.proveniencia.consulta?.quando||'2026-01-03T14:00:00Z'};
 assert.equal(L.observatory('mega-sena',fresh,a.estado,{},[],games).proveniencia.consulta.fonte,'repositorio');assert.deepEqual(a.estado,state);
});
test('erro numa correção posterior do mesmo lote não deixa alterações parciais em memória',()=>{
 const first=draw('mega-sena',1),second=draw('mega-sena',2),S={resultados:[first,second]},before=S.resultados;let written=0;
 const ctx=vm.createContext({S,LL18:L,Guardar:{gravar:()=>{written++;return true;}},Date});
 vm.runInContext(index.slice(index.indexOf('function guardarResultados('),index.indexOf('/* Integração preserva')),ctx);
 assert.throws(()=>ctx.guardarResultados([{...first,data:'2026-01-01'},{...second,dezenas:[1,2]}]),/Resultado exige/);
 assert.equal(S.resultados,before);assert.equal(written,0);
});
test('worker expõe diagnóstico puro e descarta erros sem alterar estado',()=>{
 const a=cycle(),messages=[],ctx=vm.createContext({LL18:L,self:{postMessage:x=>messages.push(x)}});
 vm.runInContext(readFileSync(new URL('../ui/lab-worker.js',import.meta.url),'utf8'),ctx);
 const state=copy(a.estado);ctx.self.onmessage({data:{id:1,acao:'diagnostico',modalidade:'mega-sena',registros:base,estado:a.estado,jogos:[a.rodada.principal]}});
 assert.equal(messages[0].id,1);assert.equal(messages[0].resultado.faixas.protocolo,L.tierProtocol);assert.deepEqual(a.estado,state);
});
test('UI apresenta três escopos/faixas, escapa origem e mantém diagnóstico sem evidência falso-positiva',()=>{
 const a=cycle(),d=L.observatory('mega-sena',base,a.estado,{},[],[a.rodada.principal]),ctx=vm.createContext({LL18:L,console,setTimeout,clearTimeout});
 vm.runInContext(readFileSync(new URL('../ui/lab-ui.js',import.meta.url),'utf8'),ctx);
 d.proveniencia.consulta={quando:before,fonte:'<img src=x onerror=1>',url:'<script>',concurso:1};
 const html=ctx.LL18UI.observatoryView(d);assert.match(html,/Principal congelada/);assert.match(html,/Carteira salva no aparelho/);assert.match(html,/Pacote virtual/);assert.match(html,/Exatamente 0/);assert.match(html,/Pelo menos 6/);
 assert.doesNotMatch(html,/<img|<script/);assert.match(html,/&lt;img/);assert.match(html,/sem sinal de superioridade/);
});
