/* Dados volumosos em IndexedDB; jogos e preferências continuam no localStorage. */
(function(root){
'use strict';
const PREFIX='lotolab:',HEAVY=new Set(['resultados','laboratorio418','aprendizado','historicoAprendizado','pesquisaAdaptativa','calibracao','audMemoria']);
const managed=k=>k.startsWith(PREFIX)&&(HEAVY.has(k.slice(PREFIX.length))||k.startsWith(PREFIX+'automatico421:'));
let local=null,db=null,starting=null,started=false,enabled=false,restoring=false,cache=new Map(),tail=Promise.resolve(true),lastError=null;
function localEntries(){
 const out=[];
 for(let i=0;i<local.length;i++){const k=local.key(i);if(k?.startsWith(PREFIX))out.push([k,local.getItem(k)]);}
 return out;
}
function transaction(mode,run){
 return new Promise((resolve,reject)=>{
  let tx;try{tx=db.transaction('entries',mode);}catch(e){reject(e);return;}
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('Falha no armazenamento.'));tx.onabort=()=>reject(tx.error||Error('Gravação interrompida.'));
  try{run(tx.objectStore('entries'));}catch(e){try{tx.abort();}catch(_){}reject(e);}
 });
}
async function all(){
 const out=new Map();
 await transaction('readonly',store=>{const req=store.openCursor();req.onsuccess=()=>{const c=req.result;if(c){out.set(c.key,c.value);c.continue();}};});
 return out;
}
async function saveRaw(k,v){
 await transaction('readwrite',store=>store.put(v,k));
 let read;
 await transaction('readonly',store=>{const req=store.get(k);req.onsuccess=()=>{read=req.result;};});
 if(read!==v)throw Error('A leitura não confirmou a gravação.');
}
function enqueue(k,v){
 cache.set(k,v);
 const done=tail.then(async()=>{
  try{
   await saveRaw(k,v);
   // Se a migração anterior falhou, não deixe a cópia antiga sobrescrever
   // a gravação já confirmada quando o aplicativo for aberto novamente.
   try{local.removeItem(k);}catch(_){}
   lastError=null;return true;
  }catch(e){lastError=e;return false;}
 });
 tail=done;return done;
}
function migrate(k,v){
 const done=tail.then(async()=>{
  /* Uma gravação nova da sessão tem prioridade sobre a cópia antiga. */
  if(cache.get(k)!==v)return true;
  try{
   await saveRaw(k,v);
   if(local.getItem(k)===v)local.removeItem(k);
   lastError=null;return true;
  }catch(e){lastError=e;return false;}
 });
 tail=done;return done;
}
function start(storage){
 if(starting)return starting;
 starting=(async()=>{
  try{
   local=storage||root.localStorage;
   if(!local||!root.indexedDB)return false;
   db=await new Promise((resolve,reject)=>{
    const req=root.indexedDB.open('lotolab-dados',1);let cancelled=false;
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('entries'))req.result.createObjectStore('entries');};
    req.onerror=()=>reject(req.error||Error('Não foi possível abrir os dados.'));
    req.onblocked=()=>{cancelled=true;reject(Error('Feche outras janelas do LotoLab para abrir os dados.'));};
    req.onsuccess=()=>{if(cancelled){req.result.close();return;}resolve(req.result);};
   });
   db.onversionchange=()=>db.close();
   cache=await all();
   const legacy=localEntries().filter(([k])=>managed(k));
   /* A abertura não espera cada gravação e releitura da migração. Em aparelhos
      com muitos resultados e pacotes automáticos, essa espera prendia o app
      no logo. Os valores antigos entram primeiro no cache da sessão; a fila
      confirma cada um no IndexedDB antes de remover a cópia original. */
   for(const [k,v] of legacy)cache.set(k,v);
   enabled=true;
   for(const [k,v] of legacy)migrate(k,v);
   return true;
  }catch(e){lastError=e;enabled=false;return false;}
  finally{started=true;}
 })();return starting;
}
function read(key,fallback){
 const k=PREFIX+key;
 if(!enabled||!managed(k))return fallback();
 if(!cache.has(k))return fallback();
 return JSON.parse(cache.get(k));
}
function write(key,value,fallback){
 if(restoring)return false;
 const k=PREFIX+key;
 if(!enabled||!managed(k))return fallback();
 const raw=JSON.stringify(value);void enqueue(k,raw);return true;
}
async function writeAsync(key,value,fallback){
 if(restoring)return false;
 const k=PREFIX+key;
 if(!enabled||!managed(k))return fallback();
 return enqueue(k,JSON.stringify(value));
}
async function snapshot(){
 await tail;
 const entries=new Map(localEntries());
 // Inclui também a cópia de sessão se uma gravação falhou: o backup conserva
 // o que o usuário está vendo, sem declarar a gravação interna como concluída.
 for(const [k,v] of cache)entries.set(k,v);
 return [...entries].sort((a,b)=>a[0].localeCompare(b[0],'en'));
}
function replaceLocal(entries){
 for(const [k] of localEntries())local.removeItem(k);
 for(const [k,v] of entries)local.setItem(k,v);
}
async function restore(entries){
 restoring=true;
 try{
  await tail;
  const beforeLocal=localEntries(),before=await snapshot();
  const small=entries.filter(([k])=>!managed(k)),large=entries.filter(([k])=>managed(k));
  try{
   replaceLocal(small);
   // Uma transação substitui todos os dados volumosos ou nenhum deles.
   await transaction('readwrite',store=>{store.clear();for(const [k,v] of large)store.put(v,k);});
  }catch(e){
   try{replaceLocal(beforeLocal);}catch(rollback){
    if(root.LL18Backup)root.LL18Backup.recovery=before;
    throw Error('Restauração interrompida. Conserve o backup e exporte a cópia de recuperação.');
   }
   throw Error('Não foi possível restaurar; os dados anteriores foram mantidos.');
  }
  cache=new Map(large);lastError=null;
 }finally{restoring=false;}
}
root.LL18Storage={start,read,write,writeAsync,snapshot,restore,owns:s=>enabled&&s===local,managed,
 get started(){return started;},get enabled(){return enabled;},get lastError(){return lastError;},flush:()=>tail};
})(globalThis);
