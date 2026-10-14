// Compara geração pura com a fonte original, sem rede ou arquivo dourado manual.
// Requer que o commit de referência esteja disponível no checkout.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),ref=process.argv[2]||'60763bce175cfdd4410d9709f172440143c9df06';
const previous=vm.createContext({console});
for(const file of ['lab-core.js','lab-strategies.js','lab-recommendation.js','lab-auto.js']){
 vm.runInContext(execFileSync('git',['show',`${ref}:ui/${file}`],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024}),previous);
}
const old=previous.LL18,current=createRequire(import.meta.url)('../ui/lab-auto.js');
function withoutVersion(value){
 if(Array.isArray(value))return value.map(withoutVersion);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(k=>k!=='versao').sort().map(k=>[k,withoutVersion(value[k])]));
 return value;
}
let checked=0;
for(const m of ['mega-sena','lotofacil','quina','lotomania','dupla-sena','timemania','dia-de-sorte','mais-milionaria']){
 const records=JSON.parse(readFileSync(new URL('../dados/'+m+'.json',import.meta.url),'utf8')).concursos.slice(-100);
 const op={quantidade:3,fixas:[current.cfg(m).base],excluidas:[current.cfg(m).base+current.cfg(m).N-1],agora:'2026-10-13T23:00:00Z'};
 const a=old.autoRecommend(m,records,{},op),b=current.autoRecommend(m,records,{},op);
 assert.ok(JSON.stringify(withoutVersion(a))===JSON.stringify(withoutVersion(b)),`Saída serializável da geração alterada: ${m}`);
 const before=JSON.stringify(b.automatico.estado);
 current.observatory(m,records,b.automatico.estado,b.parametros,[],b.jogos);
 assert.equal(JSON.stringify(b.automatico.estado),before,`Diagnóstico alterou estado: ${m}`);
 checked++;console.log('ok - '+m+': jogos, custos, sementes, perfis, calibração, decisões e rodadas preservados');
}
console.log(`${checked} modalidades comparadas com ${ref}; 100 resultados reais por modalidade; três jogos, uma fixa e uma excluída. Apenas etiquetas de versão são ignoradas.`);
