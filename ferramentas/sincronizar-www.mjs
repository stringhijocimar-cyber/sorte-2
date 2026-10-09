import {readFileSync, readdirSync, cpSync, existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targets=['index.html','sw.js','manifest.webmanifest','ui','runner'];
const mode=process.argv[2];
if(!['sync','check'].includes(mode))throw Error('Use sincronizar-www.mjs sync|check.');

function verify(source,dest,label){
  if(!existsSync(dest))throw Error(`Distribuição ausente: www/${label}`);
  const dir=targets.includes(label)&&['ui','runner'].includes(label);
  if(dir){
    const scan=(src,dst,relative)=>{
      const entries=readdirSync(src,{withFileTypes:true});
      const other=readdirSync(dst).sort();
      if(JSON.stringify(entries.map(e=>e.name).sort())!==JSON.stringify(other))
        throw Error(`Lista de arquivos divergente: ${relative}`);
      for(const e of entries){
        if(e.isSymbolicLink())throw Error(`Link simbólico não permitido: ${relative}/${e.name}`);
        if(e.isDirectory())scan(join(src,e.name),join(dst,e.name),`${relative}/${e.name}`);
        else if(!readFileSync(join(src,e.name)).equals(readFileSync(join(dst,e.name))))
          throw Error(`Asset divergente: ${relative}/${e.name}`);
      }
    };
    scan(source,dest,label);
  }else if(!readFileSync(source).equals(readFileSync(dest)))throw Error(`Asset divergente: ${label}`);
}
for(const target of targets){
  const source=join(root,target),dest=join(root,'www',target);
  if(mode==='sync')cpSync(source,dest,{recursive:true});
  verify(source,dest,target);
}
console.log(`Distribuição www/: ${mode==='sync'?'sincronizada e verificada':'verificada'}.`);
