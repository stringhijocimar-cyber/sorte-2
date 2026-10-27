import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const L=createRequire(import.meta.url)('../ui/lab-strategies.js');
const rows=Array.from({length:45},(_,i)=>({modalidade:'lotofacil',concurso:i+1,...L.randomTicket('lotofacil',L.rng('draw:'+i))}));
test('produto cartesiano contém 32 jogos únicos e respeita cada grupo',()=>{
 const g=L.fechamento43323('lotofacil',rows,{semente:'cartesiano'});
 assert.equal(g.jogos.length,32);assert.equal(new Set(g.jogos.map(t=>L.key('lotofacil',t))).size,32);
 for(const t of g.jogos){L.validateTicket('lotofacil',t,{completo:true});assert.equal(t.dezenas.length,15);
  for(const grupo of g.grupos){const ds=t.dezenas.filter(d=>grupo.dezenas.includes(d));assert.equal(ds.length,grupo.quantidade);assert.ok(grupo.opcoes.some(x=>JSON.stringify(x)===JSON.stringify(ds)));}
 }
 assert.equal(g.custo,32*L.currentCost('lotofacil',g.jogos[0]));
 assert.deepEqual(g,L.fechamento43323('lotofacil',rows,{semente:'cartesiano'}));
 assert.equal(g.somas.reduce((s,x)=>s+x.vezes,0),rows.length);
 assert.equal(g.diagnostico.modalidade,'lotofacil');assert.ok(g.diagnostico.ciclos);
});
test('garantia condicional contém cada união de opções, sem garantir outros resultados',()=>{
 const g=L.fechamento43323('lotofacil',[],{});
 for(let bits=0;bits<32;bits++){
  const alvo={dezenas:g.grupos.flatMap((x,i)=>x.opcoes[(bits>>i)&1]).sort((a,b)=>a-b)};
  assert.equal(Math.max(...g.jogos.map(t=>L.hits('lotofacil',t,alvo))),15);
 }
 assert.ok(Math.max(...g.jogos.map(t=>L.hits('lotofacil',t,{dezenas:Array.from({length:15},(_,i)=>i+1)})))<15);
});
test('recusa grupos inválidos, modalidade errada e orçamento incompleto',()=>{
 assert.throws(()=>L.fechamento43323('mega-sena',[],{}),/Lotofácil/);
 for(const ordem of [[],Array(25).fill(1),Array.from({length:25},(_,i)=>i),Array.from({length:25},(_,i)=>i+1.5)])assert.throws(()=>L.fechamento43323('lotofacil',[],{ordem}),/25 dezenas/);
 assert.throws(()=>L.fechamento43323('lotofacil',[],{orcamento:0}),/orçamento/);
 const ordem=Array.from({length:25},(_,i)=>25-i),g=L.fechamento43323('lotofacil',[],{ordem});assert.deepEqual(g.grupos[0].dezenas,[25,24,23,22,21]);
});
test('corte exclui futuro e backtest compara 32 jogos antes de cada alvo',()=>{
 const a=L.backtestFechamento43323('lotofacil',rows,{antesDe:40,concursos:5,semente:'corte'});
 const b=L.backtestFechamento43323('lotofacil',rows.slice(0,39),{antesDe:40,concursos:5,semente:'corte'});
 assert.deepEqual(a,b);assert.equal(a.concursos,5);assert.equal(a.jogosPorConcurso,32);
 assert.ok(a.observacoes.every(x=>x.treinoAte<x.concurso&&x.concurso<40));
 assert.throws(()=>L.backtestFechamento43323('lotofacil',rows.slice(0,30)),/31 concursos/);
});
test('aba exclusiva da Lotofácil e worker retornam o conjunto',()=>{
 const ctx={LL18:L,console};vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../ui/lab-ui.js',import.meta.url),'utf8'),ctx);
 const html=ctx.LL18UI.panel('lotofacil');assert.match(html,/data-ll-tab="fechamento"/);assert.match(html,/data-ll-action/);
 assert.doesNotMatch(ctx.LL18UI.panel('mega-sena'),/data-ll-tab="fechamento"/);
 let response;const w={LL18:L,self:{postMessage:x=>response=x}};vm.createContext(w);vm.runInContext(readFileSync(new URL('../ui/lab-worker.js',import.meta.url),'utf8'),w);
 w.self.onmessage({data:{id:1,acao:'fechamento',modalidade:'lotofacil',registros:rows,op:{}}});assert.equal(response.resultado.jogos.length,32);
});
