import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url),L=require('../ui/lab-auto.js');
const context=vm.createContext({LL18:L});
vm.runInContext(readFileSync(new URL('../ui/lab-auto-ui.js',import.meta.url),'utf8'),context);
const UI=context.LL18Auto,copy=x=>JSON.parse(JSON.stringify(x));
const t={dezenas:[1,2,3,4,5,6]},saved=(extra={})=>({modalidade:'mega-sena',...t,...extra});
const cycle=()=>L.autoRecommend('mega-sena',[],{},{agora:'2026-10-15T12:00:00Z'}).automatico;

test('registro independe da ordem, isola modalidade e ignora jogo inválido',()=>{
 const games=[saved({dezenas:[6,5,4,3,2,1]}),saved({modalidade:'dupla-sena'}),saved({dezenas:[1,1,2,3,4,5]})];
 const before=copy(games),r=UI.savedSequence('mega-sena',t,games);
 assert.equal(r.registros,1);assert.deepEqual(games,before);
});
test('mesmas dezenas com trevos, mês ou time diferente são correspondências parciais',()=>{
 for(const [m,j,other] of [['mais-milionaria',{...t,trevos:[1,2]},{trevos:[3,4]}],['dia-de-sorte',{dezenas:[1,2,3,4,5,6,7],mes:2},{mes:3}],['timemania',{dezenas:[1,2,3,4,5,6,7,8,9,10],time:1},{time:2}]]){
  const r=UI.savedSequence(m,j,[{modalidade:m,...j,...other},{modalidade:m,dezenas:j.dezenas}]);
  assert.equal(r.registros,0);assert.equal(r.mesmasDezenas,2);
  assert.equal(UI.savedSequence(m,j,[{modalidade:m,...j}]).registros,1);
 }
});
test('colunas do Super Sete conservam posições na identidade',()=>{
 const j={colunas:[[0],[1],[2],[3],[4],[5],[6]]};
 assert.equal(UI.savedSequence('super-sete',j,[{modalidade:'super-sete',colunas:j.colunas.slice().reverse()}]).registros,0);
 assert.equal(UI.savedSequence('super-sete',j,[{modalidade:'super-sete',...j}]).registros,1);
});
test('sequência expirada, ativa e legado ficam distintos no concurso alvo',()=>{
 const games=[saved({acompanhamento:'fixo',deConcurso:10}),saved({deConcurso:1,concursos:3}),saved()];
 const r=UI.savedSequence('mega-sena',t,games,20,j=>j.acompanhamento==='fixo'?true:j.deConcurso?false:null);
 assert.equal(r.registros,3);assert.equal(r.cobertos,1);assert.equal(r.indefinidos,1);
});
test('ausência de comparação não vira empate, média zero ou vencedor',()=>{
 const a=cycle(),r=UI.strategyDiagnosis(a);
 assert.equal(r.n,0);assert.equal(r.melhorMedia,null);assert.equal(r.lideres.length,0);
 assert.ok(r.linhas.every(x=>x.media===null&&x.ultimo===null&&!x.confirmado));
});
const stat=(id,media,strong=true)=>{
 const comparison=()=>({n:60,pAjustado:strong ? .001 : .5,ic:strong?[.1,.3]:[-.2,.3],periodos:[.1,.1,.1],semMelhor:.1,semPior:.1,media:.2});
 return {id,media,acaso:comparison(),consenso:comparison(),pContinuoAcaso:.001,pContinuoConsenso:.001,
  objetivo:{acaso:comparison(),consenso:comparison(),pContinuoAcaso:.001,pContinuoConsenso:.001}};
};
function observed(n=60){
 const a=cycle();
 a.acompanhamento={n,observacoes:Array.from({length:n},(_,i)=>({concurso:i+1,acertos:Object.fromEntries(Object.keys(L.autoExperts).map(id=>[id,id==='frequencia'?3:2]))})),ranking:[stat('frequencia',3,false),stat('equilibrio',2,false)]};
 return a;
}
test('maior média e último resultado não se tornam confirmação sem os critérios do motor',()=>{
 const a=observed(),before=copy(a),r=UI.strategyDiagnosis(a);
 assert.deepEqual(copy(r.lideres),['frequencia']);assert.equal(r.melhorUltimo,3);assert.equal(r.confirmadas.length,0);
 assert.equal(r.ultimoConcurso,60);assert.deepEqual(a,before);
 a.acompanhamento.ranking=[stat('equilibrio',3,false),stat('frequencia',3,false)];
 assert.equal(UI.strategyDiagnosis(a).lideres.length,2);
});
test('confirmação prospectiva usa o mesmo predicado do motor e exige a amostra mínima',()=>{
 const a=observed();a.acompanhamento.ranking[0]=stat('frequencia',3,true);
 assert.equal(L.autoEligible(a.acompanhamento.ranking[0]),true);
 assert.deepEqual(copy(UI.strategyDiagnosis(a).confirmadas),['frequencia']);
 a.acompanhamento.ranking[0].objetivo.pContinuoConsenso=.5;
 assert.equal(UI.strategyDiagnosis(a).confirmadas.length,0);
 const short=observed(1);short.acompanhamento.ranking[0]=stat('frequencia',3,true);
 assert.equal(UI.strategyDiagnosis(short).confirmadas.length,0);
});
test('histórico de teste não usa o vencedor apenas da seleção e cede à primeira observação futura',()=>{
 const a=cycle(),obs=observed().acompanhamento.observacoes;
 a.inicial={particao:{},observacoes:obs,nSelecao:0,teste:[stat('frequencia',3,true)],metodo:'consenso',selecao:'frequencia'};
 assert.equal(UI.strategyDiagnosis(a).origem,'historico');assert.equal(UI.strategyDiagnosis(a).confirmadas.length,0);
 a.inicial.metodo='frequencia';assert.equal(UI.strategyDiagnosis(a).confirmadas.length,1);
 a.acompanhamento=observed(1).acompanhamento;
 const r=UI.strategyDiagnosis(a);assert.equal(r.n,1);assert.equal(r.origem,'prospectivo');assert.equal(r.confirmadas.length,0);
});
