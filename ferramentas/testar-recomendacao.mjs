import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),L=require('../ui/lab-recommendation.js');
const data=m=>JSON.parse(readFileSync(new URL('../dados/'+m+'.json',import.meta.url))).concursos;
const m='mega-sena',rows=data(m).slice(-100);

test('uma principal reproduzível e distribuição conferida independentemente',()=>{
 const op={semente:'integracao',quantidade:3},a=L.recommend(m,rows,op),b=L.recommend(m,rows,op);
 assert.deepEqual(a,b);assert.deepEqual(a.principal.jogo,a.jogos[0]);
 assert.equal(new Set(a.jogos.map(t=>t.dezenas.join())).size,3);
 assert.equal(a.base.n,rows.length);
 const counts=Array(7).fill(0);for(const r of rows)counts[r.dezenas.filter(d=>a.jogos[0].dezenas.includes(d)).length]++;
 assert.deepEqual(a.principal.analise.faixas.map(f=>f.vezes),counts);
 assert.ok(Math.abs(a.principal.analise.faixas.reduce((s,f)=>s+f.percentual,0)-100)<1e-10);
 assert.equal(a.principal.criterios.length,12);
 assert.ok(Math.abs(a.principal.criterios.reduce((s,x)=>s+x.contribuicao,0)-a.principal.distancia)<1e-10);
});
test('o histórico participa da escolha, não só da explicação',()=>{
 const op={semente:'dados-influenciam',fixas:[1,2,3,4,5],excluidas:Array.from({length:53},(_,i)=>i+8)};
 const history=d=>Array.from({length:40},(_,i)=>({modalidade:m,concurso:i+1,dezenas:d}));
 const a=L.recommend(m,history([1,2,3,4,5,6]),op),b=L.recommend(m,history([1,2,3,4,5,7]),op);
 assert.notDeepEqual(a.jogos[0],b.jogos[0]);
 assert.equal(a.candidatos,2);assert.equal(b.candidatos,2);
});
test('corte temporal impede alvo e futuro de participar da geração',()=>{
 const cut=rows.at(-20).concurso,op={semente:'corte',antesDe:cut};
 const past=rows.filter(r=>r.concurso<cut),full=L.recommend(m,rows,op),isolated=L.recommend(m,past,op);
 assert.deepEqual(full,isolated);assert.ok(full.base.ultimo<cut);
});
test('janela aplicada à seleção e à explicação; mudanças na base invalidam assinatura',()=>{
 const op={semente:'janela',janela:50},g=L.recommend(m,rows,op);
 assert.equal(g.base.n,50);assert.equal(g.totalDisponivel,100);
 assert.equal(g.principal.analise.base.assinatura,g.base.assinatura);
 const changed=structuredClone(rows);changed.at(-1).dezenas=[1,2,3,4,5,6];
 assert.notEqual(L.recommendationBase(m,changed,op).meta.assinatura,g.base.assinatura);
 const future=[...rows,{modalidade:m,concurso:rows.at(-1).concurso+1,dezenas:[1,2,3,4,5,6]}];
 assert.notEqual(L.recommendationBase(m,future,op).meta.assinatura,g.base.assinatura);
});
test('orçamento, fixas e exclusões são efetivos e conflitos geram erro',()=>{
 const g=L.recommend(m,rows,{semente:'limites',quantidade:5,orcamento:12,fixas:[3],excluidas:[7]});
 assert.equal(g.jogos.length,2);assert.equal(g.custo,12);assert.equal(g.solicitados,5);
 assert.ok(g.jogos.every(t=>t.dezenas.includes(3)&&!t.dezenas.includes(7)));
 assert.throws(()=>L.recommend(m,rows,{fixas:[3],excluidas:[3]}),/mesmo tempo/);
 assert.throws(()=>L.recommend(m,rows,{orcamento:5}),/orçamento/);
 assert.throws(()=>L.recommend(m,rows,{quantidade:2,fixas:[1,2,3,4,5,6]}),/somente 1/);
});
test('base escassa é explícita; percentuais ausentes não viram sucesso ou confiança',()=>{
 const g=L.recommend(m,[],{semente:'vazio'});
 assert.equal(g.estado,'amostra-insuficiente');assert.equal(g.base.n,0);
 assert.equal(g.principal.distancia,null);
 assert.ok(g.principal.analise.faixas.every(f=>f.percentual===null));
 assert.equal(g.principal.aderencia.estado,'amostra insuficiente');
 assert.equal(g.jogos.length,1);
});
test('conflitos não são usados; concursos fora do recorte não alteram resultado',()=>{
 const conflicting={...rows[0],dezenas:[1,2,3,4,5,6]},g=L.recommend(m,[...rows,conflicting],{semente:'conflitos'});
 assert.equal(g.base.conflitos,1);assert.equal(g.base.n,rows.length-1);
 const op={semente:'recorte',janela:30};
 assert.deepEqual(L.recommend(m,rows,op).jogos,L.recommend(m,rows.slice(-30),op).jogos);
});
for(const [mode,c] of Object.entries(L.rules)){
 test(mode+': tamanho mínimo e máximo, complementos e custo coerentes',()=>{
   for(const expanded of [false,true]){
     const shape=L.randomTicket(mode,L.rng(mode));
     if(c.colunas&&expanded)shape.colunas=Array.from({length:7},()=>[0,1,2]);
     else if(!c.colunas&&expanded)shape.dezenas=Array.from({length:c.max},(_,i)=>i+c.base);
     const g=L.recommend(mode,[],{formato:shape,quantidade:2,semente:'formatos'});
     g.jogos.forEach(t=>assert.deepEqual(L.validateTicket(mode,t,{completo:true}),t));
     assert.equal(g.custo,2*L.currentCost(mode,shape));
     assert.equal(g.jogos[0].dezenas?.length,shape.dezenas?.length);
   }
 });
}
test('trevos escolhidos pelo usuário chegam à análise e ao jogo principal',()=>{
 const g=L.recommend('mais-milionaria',data('mais-milionaria').slice(-60),{semente:'trevos',trevosFixos:[2,6],quantidade:2});
 assert.ok(g.jogos.every(t=>t.trevos.join()==='2,6'));
 assert.deepEqual(g.principal.analise.jogo.trevos,[2,6]);
});
