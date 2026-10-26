import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),R=require('../ui/lab-saved-review.js'),L=require('../ui/lab-core.js');
const game=(extra={})=>({id:'a',modalidade:'mega-sena',dezenas:[1,2,3,4,5,6],data:'2025-01-01',acompanhamento:'fixo',deConcurso:10,...extra});
const draw=(n,extra={})=>({modalidade:'mega-sena',concurso:n,data:'2025-01-02',dezenas:[1,2,3,4,5,7],...extra});
test('avalia manuais, sugestões e legados sem mudar dados ou jogos',()=>{
 const games=[game({metodo:'manual'}),game({id:'b',dezenas:[11,12,13,14,15,16],metodo:'automatico'}),game({id:'c',deConcurso:11,concursos:3,acompanhamento:undefined})],records=[draw(10)];
 const before=JSON.stringify([games,records]),r=R.review(games,records);
 assert.equal(r.size,3);assert.equal(r.get(games[0]).media,5);assert.equal(r.get(games[1]).media,0);
 assert.equal(r.get(games[2]).n,0);assert.equal(JSON.stringify([games,records]),before);
 assert.ok(Math.abs(r.get(games[0]).esperado-.6)<1e-10);
});
test('avaliação prospectiva exclui mesmo dia, data ausente, antes do cadastro e fora da cobertura',()=>{
 const j=game({concursoAlvo:12,acompanhamento:'unico'}),rows=[draw(9),draw(10,{data:'2025-01-01'}),draw(11,{data:null}),draw(12),draw(13)];
 const r=R.review([j],rows).get(j);assert.equal(r.n,1);assert.equal(r.media,5);assert.equal(r.acao,'retirar');
});
test('jogo fixo permanece; único e teimosinha encerrados recebem retirada',()=>{
 const games=[game(),game({id:'u',acompanhamento:'unico',concursoAlvo:10}),game({id:'t',acompanhamento:'teimosinha',deConcurso:8,concursos:3})],r=R.review(games,[draw(10)]);
 assert.equal(r.get(games[0]).acao,'manter');assert.equal(r.get(games[1]).acao,'retirar');assert.equal(r.get(games[2]).acao,'retirar');
 const future=game({deConcurso:15});assert.match(R.review([future],[draw(10)]).get(future).motivo,/começa no concurso 15/);
});
test('duplicata compara modalidade, complementos e participação do próximo concurso',()=>{
 const a=game(),b=game({id:'b',dezenas:[6,5,4,3,2,1]}),c=game({id:'c',modalidade:'dupla-sena'}),d=game({id:'d',deConcurso:20});
 const r=R.review([a,b,c,d],[draw(10)]);assert.equal(r.get(b).acao,'retirar');assert.match(r.get(b).motivo,/#a/);assert.equal(r.get(a).acao,'manter');assert.equal(r.get(c).acao,'manter');assert.equal(r.get(d).acao,'manter');
 const t=game({modalidade:'mais-milionaria',trevos:[1,2]}),u={...t,id:'u',trevos:[3,4]},missing={...t,id:'m',trevos:undefined};
 const q=R.review([t,u,missing],[draw(10,{modalidade:'mais-milionaria',trevos:[1,2]})]);
 assert.equal(q.get(u).acao,'manter');assert.equal(q.get(missing).acao,'reavaliar');
});
test('controle de inclusão preserva os registros e não escolhe duplicata inativa como referência',()=>{
 const a=game({analiseAtiva:false,conferencias:[{concurso:10,acertos:5}]}),b=game({id:'b'}),r=R.review([a,b],[draw(10)]);
 assert.equal(r.get(a).ativo,false);assert.equal(r.get(b).acao,'manter');assert.equal(a.conferencias.length,1);assert.equal(R.active({}),true);
 assert.match(R.card(a,r.get(a)),/Reincluir na análise/);
});
test('ausência de data ou cadastro inválido exige revisão; histórico ausente não vira desempenho zero',()=>{
 for(const j of [game({data:undefined}),game({dezenas:[1,1,2,3,4,5]})])assert.equal(R.review([j],[draw(10)]).get(j).acao,'reavaliar');
 const j=game(),r=R.review([j],[]).get(j);assert.equal(r.n,0);assert.equal(r.media,null);assert.equal(r.acao,'manter');
});
test('desempenho ruim ou excepcional não prevê resultado nem determina retirada',()=>{
 const j=game(),bad=Array.from({length:70},(_,i)=>draw(10+i,{dezenas:[11,12,13,14,15,16]}));
 const r=R.review([j],bad).get(j);assert.equal(r.n,70);assert.equal(r.media,0);assert.equal(r.acao,'manter');
 const good=bad.map(r=>({...r,dezenas:j.dezenas}));assert.equal(R.review([j],good).get(j).acao,'manter');
});
test('Super Sete usa posição das colunas e referência probabilística apropriada',()=>{
 const j=game({modalidade:'super-sete',colunas:[[0],[1],[2],[3],[4],[5],[6]]});
 const r=R.review([j],[{modalidade:'super-sete',concurso:10,data:'2025-01-02',colunas:j.colunas}]).get(j);
 assert.equal(r.media,7);assert.ok(Math.abs(r.esperado-.7)<1e-10);
});
test('resultados conflitantes não entram; motivos e IDs são escapados no HTML',()=>{
 const j=game({id:'<img src=x>'}),r=R.review([j],[draw(10),draw(10,{dezenas:[11,12,13,14,15,16]})]).get(j);
 assert.equal(r.n,0);assert.doesNotMatch(R.card(j,r),/<img/);
});
