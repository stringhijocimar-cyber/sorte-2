/* Reposição limitada de concursos ausentes, sempre pelo número exato na CAIXA.
 * Não troca registros existentes e não aceita "último" como resposta ao alvo. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {converter} from './atualizar-resultados.mjs';
const require=createRequire(import.meta.url),L=require('../ui/lab-core.js');
const limite=Number(process.argv.find(x=>x.startsWith('--limite='))?.split('=')[1]||40);
if(!Number.isSafeInteger(limite)||limite<1||limite>10000)throw Error('Limite inválido.');
const dir=new URL('../dados/',import.meta.url),files=[],queue=[];
for(const name of readdirSync(dir).filter(x=>x.endsWith('.json'))){
 const path=new URL(name,dir),data=JSON.parse(readFileSync(path)),m=data.modalidade;
 if(!L.rules[m]||L.cfg(m).especial)continue;
 const b=L.history(m,data.concursos),known=new Set(b.rows.map(r=>r.concurso)),file={path,data,m,novos:[]};files.push(file);
 let count=0;for(let n=b.meta.ultimo-1;n>=1&&count<limite;n--)if(!known.has(n)){queue.push({file,n});count++;}
}
console.log(`${queue.length} concursos ausentes a consultar; até três requisições simultâneas.`);
let failed=0,done=0;
async function consume(){while(queue.length){const {file,n}=queue.shift();try{
 const url=`https://servicebus2.caixa.gov.br/portaldeloterias/api/${L.cfg(file.m).slug}/${n}`;
 const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('HTTP '+response.status);
 const r=converter(await response.json(),file.m);
 if(r.concurso!==n)throw Error('A fonte respondeu outro concurso.');
 L.normalizeDraw(file.m,r);file.novos.push(r);done++;
 if(done%50===0)console.log(`${done} recuperados; ${queue.length} ainda na fila.`);
 }catch(e){failed++;console.error(`${file.m} #${n}: ${e.message}`);}
}}
await Promise.all(Array.from({length:3},consume));
for(const file of files){if(!file.novos.length)continue;
 file.data.concursos.push(...file.novos);file.data.concursos.sort((a,b)=>a.concurso-b.concurso);
 file.data.total=file.data.concursos.length;
 writeFileSync(file.path,JSON.stringify(file.data)+'\n');
 console.log(`${file.m}: +${file.novos.length}; ${L.history(file.m,file.data.concursos).meta.lacunas} lacunas restantes.`);
}
console.log(`${done} recuperados; ${failed} indisponíveis. Dados existentes preservados.`);
if(failed)console.warn('Reposição parcial. As ausências continuam visíveis e serão tentadas na próxima execução.');
