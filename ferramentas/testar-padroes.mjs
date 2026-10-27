import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const L=createRequire(import.meta.url)('../ui/lab-auto.js');
const ticket={dezenas:[1,2,3,8,13,21]};
const draw=(n,ds=ticket.dezenas,m='mega-sena')=>({modalidade:m,concurso:n,dezenas:ds});
const report=(rows,t=ticket,op={},m='mega-sena')=>L.analyze(m,t,rows,op).padroes;
test('perfis distinguem ligações consecutivas, maior bloco e categorias matemáticas',()=>{
 const p=L.patternProfile('mega-sena',ticket);
 assert.deepEqual([p.pares,p.impares,p.primos,p.fibonacci,p.consecutivos,p.maiorSequencia],[2,4,3,6,2,3]);
 assert.deepEqual(p.linhas,[4,1,1,0,0,0]);
 assert.deepEqual(p.colunas,[2,1,2,0,0,0,0,1,0,0]);
 assert.equal(L.patternProfile('mega-sena',{dezenas:[1,2,10,11,30,50]}).maiorSequencia,2);
 assert.equal(L.patternProfile('mega-sena',{dezenas:[1,3,5,7,9,11]}).maiorSequencia,0);
 assert.equal(L.patternProfile('super-sete',{colunas:[[1],[2],[3],[4],[5],[6],[7]]}),null);
});
test('histogramas têm denominadores próprios, zeros e último concurso correto',()=>{
 const p=report([draw(1),draw(2,[4,5,6,7,8,9]),draw(4,[10,11,12,13,14,15])]);
 for(const d of p.distribuicoes){assert.equal(L.sum(d.categorias.map(x=>x.vezes)),d.n);assert.ok(Math.abs(L.sum(d.categorias.map(x=>x.percentual))-100)<1e-10);}
 const r=p.distribuicoes.find(d=>d.id==='repetidas');assert.equal(r.n,1);assert.equal(r.categorias[1].vezes,1);assert.equal(r.categorias[1].ultimo,2);
 assert.equal(p.grade.denominador,18);
 for(const axis of ['linhas','colunas']){assert.equal(L.sum(p.grade[axis].map(x=>x.vezes)),18);assert.ok(Math.abs(L.sum(p.grade[axis].map(x=>x.percentual))-100)<1e-10);}
 assert.equal(p.dezenas.length,60);assert.equal(p.dezenas.find(d=>d.dezena===1).atraso,null);assert.equal(p.dezenas.find(d=>d.dezena===13).atraso,0);
});
test('referências uniformes independem do histórico e conservam massa unitária',()=>{
 for(const m of ['mega-sena','lotofacil']){
  const t=L.randomTicket(m,L.rng('referencia')),p=report([],t,{},m);
  for(const d of p.distribuicoes.filter(d=>d.id!=='maiorSequencia'))assert.ok(Math.abs(L.sum(d.categorias.map(x=>x.esperado))-1)<1e-9,d.id);
  assert.ok(p.distribuicoes.every(d=>d.n===0&&d.categorias.every(x=>x.percentual===null)));
  assert.equal(p.ciclos.disponivel,false);
 }
 const p=report([]).distribuicoes.find(d=>d.id==='consecutivos');
 assert.ok(Math.abs(p.categorias[0].esperado-L.comb(55,6)/L.comb(60,6))<1e-12);
 assert.equal(L.distribution('mega-sena',ticket)[6],1/L.comb(60,6));
});
test('ciclos fecham, reiniciam e não atravessam lacunas ou início desconhecido',()=>{
 const rows=Array.from({length:10},(_,i)=>draw(i+1,Array.from({length:6},(_,j)=>i*6+j+1)));
 const p=report([...rows,draw(11)]).ciclos;
 assert.deepEqual(p.completos,[{inicio:1,fim:10,concursos:10}]);assert.equal(p.media,10);
 assert.equal(p.atual.inicio,11);assert.equal(p.atual.concursos,1);assert.equal(p.atual.faltantes.length,54);
 const close=report(rows).ciclos;assert.equal(close.atual.concursos,0);assert.equal(close.atual.inicio,null);assert.equal(close.atual.faltantes.length,60);
 const partial=report(rows.map(r=>({...r,concurso:r.concurso+100}))).ciclos;
 assert.equal(partial.completos.length,0);assert.equal(partial.media,null);assert.equal(partial.trechosParciais,1);assert.equal(partial.atual.inicioConhecido,true);
 const gap=report([...rows.slice(0,9),{...rows[9],concurso:11}]).ciclos;
 assert.equal(gap.completos.length,0);assert.equal(gap.atual.inicioConhecido,false);assert.equal(gap.atual.concursos,1);assert.equal(gap.atual.faltantes.length,54);
 const next=report([...rows, ...rows.map(r=>({...r,concurso:r.concurso+10}))]).ciclos;
 assert.deepEqual(next.completos.map(x=>x.concursos),[10,10]);
});
test('corte temporal, conflitos e aposta ampliada não geram comparações falsas',()=>{
 const rows=[draw(1),draw(2),draw(3)],a=report(rows,ticket,{antesDe:3});
 assert.deepEqual(a,report([...rows.slice(0,2),draw(3,[30,40,50,51,52,53])],ticket,{antesDe:3}));
 const missing=report(rows,ticket,{antesDe:6});assert.equal(missing.atual.repetidas,null);assert.equal(missing.ciclos.atual.atualizadoAteCorte,false);
 const conflict=report([...rows,draw(2,[4,5,6,7,8,9])]);assert.equal(conflict.base.conflitos,1);assert.equal(conflict.distribuicoes.find(x=>x.id==='repetidas').n,0);
 const enlarged=report(rows,{dezenas:[1,2,3,4,5,6,7]});assert.equal(enlarged.comparavel,false);assert.ok(enlarged.distribuicoes.every(x=>x.percentualDoPerfil===null));
});
test('Lotofácil usa grade 5×5, Fibonacci até 21 e referência de repetição 9',()=>{
 const t={dezenas:Array.from({length:15},(_,i)=>i+1)},p=report([draw(1,t.dezenas,'lotofacil'),draw(2,t.dezenas,'lotofacil')],t,{},'lotofacil');
 assert.deepEqual(p.atual.linhas,[5,5,5,0,0]);assert.deepEqual(p.atual.colunas,[3,3,3,3,3]);assert.equal(p.atual.fibonacci,6);
 const r=p.distribuicoes.find(x=>x.id==='repetidas');assert.ok(Math.abs(L.sum(r.categorias.map(x=>x.valor*x.esperado))-9)<1e-12);
 assert.equal(p.grade.denominador,30);
});
test('Mega da Virada mantém ciclos, atrasos e repetição consecutiva indisponíveis',()=>{
 const m='mega-da-virada',p=report([draw(100,ticket.dezenas,m),draw(200,ticket.dezenas,m)],ticket,{},m);
 assert.equal(p.ciclos.disponivel,false);assert.equal(p.atual.repetidas,null);assert.equal(p.distribuicoes.find(x=>x.id==='repetidas').n,0);assert.ok(p.dezenas.every(x=>x.atraso===null));
});
test('estratégia experimental combina critérios, respeita orçamento e não lê o futuro',()=>{
 const m='mega-sena',random=L.rng('padroes'),rows=Array.from({length:45},(_,i)=>draw(i+1,L.randomTicket(m,random).dezenas));
 const op={modelo:'padroes',quantidade:3,candidatos:50,semente:'fixa',orcamento:18,antesDe:46};
 const a=L.generate(m,rows,op);assert.equal(a.custo,18);assert.equal(a.gerados,3);assert.equal(new Set(a.jogos.map(t=>L.key(m,t))).size,3);
 assert.deepEqual(a,L.generate(m,[...rows,draw(46)],op));
 assert.ok(a.explicacoes.every(x=>x.padroes&&/sem confiança preditiva/.test(x.confianca)));
 const model=L.patternModel(m,rows),weights={primos:0,fibonacci:0,sequencia:0,grade:0};
 assert.equal(L.patternDistance(m,ticket,model,weights),0);assert.ok(L.patternDistance(m,ticket,model)>0);
 assert.throws(()=>L.generate('quina',[],{modelo:'padroes',candidatos:10}),/disponíveis/);
});
test('painel explica denominadores e jogo salvo recebe perfil sem alterar decisão',()=>{
 const require=createRequire(import.meta.url);require('../ui/lab-ui.js');
 const p=report([draw(1)]),html=globalThis.LL18UI.patternView(p);
 assert.match(html,/Fibonacci/);assert.match(html,/Ciclos de cobertura/);assert.match(html,/não é a chance deste jogo/);
 assert.match(html,/Denominador: 6 dezenas/);assert.match(html,/transições consecutivas válidas/);
 const R=require('../ui/lab-saved-review.js'),j={id:1,modalidade:'mega-sena',...ticket,data:'2025-01-01',acompanhamento:'fixo',deConcurso:1};
 const review=R.review([j],[draw(1)]).get(j);
 assert.deepEqual(review.padroes,L.patternProfile('mega-sena',ticket));assert.equal(review.acao,'manter');
 assert.match(R.card(j,review),/Perfil do jogo/);
});
