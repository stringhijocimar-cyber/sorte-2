/* Backup dos dados locais, com integridade e restauração reversível. */
(function(root){
'use strict';
const PREFIX='lotolab:',LIMIT=30*1024*1024,FORMAT='lotolab-backup',SCHEMA=1;
function collect(storage){
 const entries=[];
 for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PREFIX))entries.push([key,storage.getItem(key)]);}
 return entries.sort((a,b)=>a[0].localeCompare(b[0],'en'));
}
async function digest(text){
 const bytes=new TextEncoder().encode(text);
 if(bytes.length>LIMIT)throw Error('Backup maior que 30 MB.');
 if(!root.crypto?.subtle)throw Error('Este ambiente não permite verificar o backup. Abra no aplicativo ou em uma conexão segura.');
 return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
}
function checkEntries(entries){
 if(!Array.isArray(entries)||entries.length>10000)throw Error('Lista de dados inválida.');
 const seen=new Set();
 const inspect=(v,depth=0)=>{
  if(depth>128)throw Error('Estrutura de dados muito profunda.');
  if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){
   if(['__proto__','constructor','prototype'].includes(k))throw Error('Chave de dados não permitida.');
   inspect(x,depth+1);
  }
 };
 for(const row of entries){
  if(!Array.isArray(row)||row.length!==2)throw Error('Entrada de dados inválida.');
  const [key,value]=row;
  if(typeof key!=='string'||!key.startsWith(PREFIX)||key.length>1024||seen.has(key)||typeof value!=='string')throw Error('Chave inválida ou repetida.');
  const parsed=JSON.parse(value);inspect(parsed);seen.add(key);
  if(['jogos','resultados','teimosinhas','avisos'].some(x=>key===PREFIX+x)&&!Array.isArray(parsed))throw Error('Lista principal inválida.');
 }
 return entries;
}
async function create(storage,version='4.26.5',now=new Date().toISOString()){
 const entries=checkEntries(Array.isArray(storage)?storage:root.LL18Storage?.owns(storage)?await root.LL18Storage.snapshot():collect(storage)),payload={versao:version,criadoEm:now,entradas:entries};
 return {formato:FORMAT,esquema:SCHEMA,conteudo:payload,sha256:await digest(JSON.stringify(payload))};
}
async function validate(raw){
 if(typeof raw!=='string')throw Error('Arquivo de backup inválido.');
 if(new TextEncoder().encode(raw).length>LIMIT)throw Error('Backup maior que 30 MB.');
 const data=JSON.parse(raw);
 if(data.formato!==FORMAT||data.esquema!==SCHEMA||!data.conteudo||typeof data.sha256!=='string'||!/^[a-f0-9]{64}$/.test(data.sha256))throw Error('Formato de backup desconhecido.');
 if(await digest(JSON.stringify(data.conteudo))!==data.sha256)throw Error('O backup está incompleto ou foi alterado.');
 if(!Number.isFinite(Date.parse(data.conteudo.criadoEm))||typeof data.conteudo.versao!=='string')throw Error('Identificação de backup inválida.');
 checkEntries(data.conteudo.entradas);
 return data;
}
function summary(data){
 const entries=new Map(data.conteudo.entradas),count=k=>{const a=JSON.parse(entries.get(PREFIX+k)||'[]');return Array.isArray(a)?a.length:0;};
 return {jogos:count('jogos'),teimosinhas:count('teimosinhas'),resultados:count('resultados'),chaves:entries.size};
}
// Substitui apenas o namespace do app. Falhas revertem ao snapshot anterior.
async function restore(storage,raw){
 const data=await validate(raw);
 if(root.LL18Storage?.owns(storage)){await root.LL18Storage.restore(data.conteudo.entradas);return summary(data);}
 const before=collect(storage);
 const replace=entries=>{for(const [key] of collect(storage))storage.removeItem(key);for(const [key,value] of entries)storage.setItem(key,value);};
 try{replace(data.conteudo.entradas);}catch(error){
  try{replace(before);}catch(rollback){root.LL18Backup.recovery=before;throw Error('Restauração interrompida. Conserve o backup anterior e exporte a cópia de recuperação.');}
  throw Error('Não foi possível restaurar; os dados anteriores foram mantidos. Libere espaço e tente novamente.');
 }
 return summary(data);
}
root.LL18Backup={collect,create,validate,restore,summary,digest,LIMIT,recovery:null};
if(typeof module!=='undefined'&&module.exports)module.exports=root.LL18Backup;
})(globalThis);
