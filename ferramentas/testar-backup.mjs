import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const B=createRequire(import.meta.url)('../ui/lab-backup.js');
function storage(initial={}){
 const m=new Map(Object.entries(initial));
 return {get length(){return m.size;},key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};
}
const game={id:'fixo',modalidade:'mega-sena',dezenas:[1,2,3,4,5,6],acompanhamento:{tipo:'fixo',inicio:3059},conferencias:[{concurso:3059,acertos:5}]};
const initial={'lotolab:jogos':JSON.stringify([game]),'lotolab:teimosinhas':JSON.stringify([{...game,id:'t',concursos:10}]),'lotolab:resultados':JSON.stringify([{concurso:3059,dezenas:[1,2,3,4,5,7]}]),'lotolab:automatico421:perfil':JSON.stringify({rodadas:[{concursoAlvo:3060,principal:game}]}),'lotolab:tema':'"claro"','outro-servico':'preservado'};
test('backup e restauração preservam bytes, histórico e acompanhamento de todas as chaves do app',async()=>{
 const source=storage(initial),data=await B.create(source),raw=JSON.stringify(data),target=storage({'lotolab:tema':'"escuro"','lotolab:obsoleto':'1','outro-servico':'original'});
 assert.equal(data.conteudo.entradas.length,5);assert.equal(B.summary(data).jogos,1);
 await B.restore(target,raw);
 assert.deepEqual(B.collect(target),B.collect(source));assert.equal(target.getItem('outro-servico'),'original');assert.equal(target.getItem('lotolab:obsoleto'),null);
 const reopened=JSON.parse(target.getItem('lotolab:jogos'))[0];assert.deepEqual(reopened,game);
});
test('arquivo truncado, alterado ou de esquema desconhecido nunca escreve',async()=>{
 const s=storage(initial),data=await B.create(s),before=B.collect(s);
 for(const text of [JSON.stringify(data).slice(0,-2),JSON.stringify({...data,esquema:2}),JSON.stringify({...data,sha256:'0'.repeat(64)})]){
  await assert.rejects(B.restore(s,text));assert.deepEqual(B.collect(s),before);
 }
});
test('namespace externo, duplicatas e propriedades perigosas são recusados mesmo com hash recalculado',async()=>{
 for(const entries of [[['outro:segredo','1']],[['lotolab:x','1'],['lotolab:x','2']],[['lotolab:x','{"__proto__":{"p":1}}']],[['lotolab:jogos','{}']]]){
  const conteudo={versao:'4.26.0',criadoEm:'2026-10-04T00:00:00Z',entradas:entries},data={formato:'lotolab-backup',esquema:1,conteudo,sha256:await B.digest(JSON.stringify(conteudo))};
  await assert.rejects(B.validate(JSON.stringify(data)));
 }
});
test('falha de quota durante substituição restaura os dados anteriores integralmente',async()=>{
 const s=storage(initial),before=B.collect(s),target=storage({'lotolab:novo':'"novo"','lotolab:jogos':'[]'}),raw=JSON.stringify(await B.create(target));
 const set=s.setItem;let rejected=false;
 s.setItem=(k,v)=>{if(k==='lotolab:novo'&&!rejected){rejected=true;throw Error('Quota');}set(k,v);};
 await assert.rejects(B.restore(s,raw),/anteriores foram mantidos/);
 assert.deepEqual(B.collect(s),before);assert.equal(s.getItem('outro-servico'),'preservado');
});
test('backup vazio é válido e corrupção já existente impede falsa confirmação de exportação',async()=>{
 assert.equal(B.summary(await B.create(storage())).chaves,0);
 await assert.rejects(B.create(storage({'lotolab:jogos':'não é JSON'})));
});

test('falha persistente de armazenamento ainda permite exportar o snapshot anterior',async()=>{
 const s=storage(initial),before=B.collect(s),raw=JSON.stringify(await B.create(storage({'lotolab:jogos':'[]'})));
 s.setItem=()=>{throw Error('armazenamento bloqueado');};
 await assert.rejects(B.restore(s,raw),/cópia de recuperação/);
 const rescue=await B.create(B.recovery);
 assert.deepEqual(rescue.conteudo.entradas,before);
 await B.validate(JSON.stringify(rescue));B.recovery=null;
});
