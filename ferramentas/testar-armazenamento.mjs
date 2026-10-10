/** Regressão da quota real: histórico completo, migração, sugestão e backup.
 * Os jogos de exemplo e a carga de quota existem somente neste teste.
 * Usa Chrome real e dados do repositório, sem depender de serviços externos. */
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=join(dirname(fileURLToPath(import.meta.url)),'..'),port=14000+process.pid%1000,debug=port+1000;
const profile=mkdtempSync(join(tmpdir(),'lotolab-storage-'));
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const chrome=spawn(process.env.LOTOLAB_CHROME||'google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-proxy-server',`--remote-debugging-port=${debug}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let completed=false,ws;
const close=()=>{server.kill();chrome.kill();};
process.on('exit',()=>{if(!completed)process.exitCode=1;close();});
server.on('error',e=>{throw e;});chrome.on('error',e=>{throw e;});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=90000){const start=Date.now();while(Date.now()-start<ms){if(await fn())return;await sleep(100);}throw Error('Tempo excedido: '+label);}
let target;
await until(async()=>{try{target=await(await fetch(`http://127.0.0.1:${debug}/json/new?about:blank`,{method:'PUT'})).json();return !!target.webSocketDebuggerUrl;}catch{return false;}},'Chrome');
await until(async()=>{try{return(await fetch(`http://127.0.0.1:${port}/index.html`)).ok;}catch{return false;}},'servidor');
let cmd;
async function connect(){
 const connection=new WebSocket(target.webSocketDebuggerUrl);ws=connection;
 await new Promise((resolve,reject)=>{connection.onopen=resolve;connection.onerror=reject;});
 let seq=0;const pending=new Map();
 connection.onclose=()=>{for(const p of pending.values())p.reject(Error('Chrome encerrou.'));pending.clear();};
 connection.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});connection.send(JSON.stringify({id,method,params}));});
}
await connect();
async function js(code){const r=await cmd('Runtime.evaluate',{expression:`(async()=>{${code}})()`,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails));return r.result.value;}
async function ready(){await until(()=>js(`return globalThis.LL18Storage?.started&&!!document.querySelector('#tela .foco-hero [data-atalho="sugestoes"]')`),'abertura do app');}
async function reopen(source,url){
 // Cada cenário recebe uma sessão própria. IDs de scripts do DevTools
 // podem deixar de existir quando uma recarga troca o processo da página.
 // Fechar a aba também impede tarefas da sessão anterior de alterar o banco.
 const closed=await fetch(`http://127.0.0.1:${debug}/json/close/${target.id}`);
 assert.ok(closed.ok,'a sessão anterior foi encerrada');
 target=await(await fetch(`http://127.0.0.1:${debug}/json/new?about:blank`,{method:'PUT'})).json();
 await connect();await cmd('Page.enable');await cmd('Runtime.enable');
 await cmd('Page.addScriptToEvaluateOnNewDocument',{source});
 await cmd('Page.navigate',{url});await ready();
}
const source=`
 const originalFetch=globalThis.fetch;
 globalThis.fetch=(input,options)=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.hostname==='raw.githubusercontent.com'){
   const path=url.pathname.split('/main/')[1];
   if(path?.startsWith('dados/')||path?.startsWith('aprendizado/'))return originalFetch('/'+path,options);
  }
  if(url.origin!==location.origin)return Promise.reject(Error('Fonte externa desligada no teste.'));
  return originalFetch(input,options);
 };
 if(!localStorage.getItem('storage-regression-seeded')){
  localStorage.setItem('storage-regression-seeded','preservar');
  for(const key of ['buscaAutomatica','pesquisaAutomatica','autoAnalise'])localStorage.setItem('lotolab:'+key,'false');
  localStorage.setItem('lotolab:tema','"claro"');
  localStorage.setItem('lotolab:jogos',JSON.stringify([{id:'legado-teste',modalidade:'mega-sena',dezenas:[1,2,3,4,5,6],data:'2026-01-01',concursoAlvo:999999,acompanhamento:'unico',conferencias:[]}]));
  localStorage.setItem('lotolab:resultados','[]');
  let lo=0,hi=6*1024*1024;
  while(lo<hi){const n=Math.ceil((lo+hi)/2);try{localStorage.setItem('lotolab:automatico421:teste-migracao',JSON.stringify({marcador:'x'.repeat(n)}));lo=n;}catch(e){if(e.name!=='QuotaExceededError')throw e;hi=n-1;}}
  globalThis.legacySize=lo;
  try{localStorage.setItem('lotolab:teste-limite','"'+'x'.repeat(32768)+'"');}catch(e){globalThis.legacyQuota=e.name;}
 }
`;
try{
 await cmd('Page.enable');await cmd('Runtime.enable');
 await cmd('Page.addScriptToEvaluateOnNewDocument',{source});
 await cmd('Page.navigate',{url:`http://127.0.0.1:${port}/index.html`});await ready();
 assert.equal(await js('return legacyQuota'),'QuotaExceededError','a instalação antiga excedia a quota real');
 assert.ok(await js(`return LL18Storage.enabled&&localStorage.getItem('lotolab:automatico421:teste-migracao')===null&&Guardar.ler('automatico421:teste-migracao',{}).marcador.length===legacySize`));
 assert.equal(await js(`return localStorage.getItem('storage-regression-seeded')`),'preservar');
 assert.equal(await js(`return S.jogos[0].id`),'legado-teste');
 assert.equal(await js(`return S.tema`),'claro');
 console.log('ok — quota antiga reproduzida; migração libera espaço e preserva jogos, tema e dados externos');

 const modes=readdirSync(join(root,'dados')).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5));
 const count=modes.reduce((n,m)=>n+JSON.parse(readFileSync(join(root,'dados',m+'.json'),'utf8')).concursos.length,0);
 const full=await js(`
  const lists=await Promise.all(${JSON.stringify(modes)}.map(async m=>{const d=await(await fetch('./dados/'+m+'.json')).json();return LL18.history(m,d.concursos).rows;}));
  const rows=lists.flat(),raw=JSON.stringify(rows);let quota;
  try{localStorage.setItem('lotolab:resultado-teste-quota',raw);}catch(e){quota=e.name;}
  localStorage.removeItem('lotolab:resultado-teste-quota');
  const t=performance.now(),added=guardarResultados(rows),mergeMs=performance.now()-t;
  const saved=await LL18Storage.flush();
  return {count:rows.length,chars:raw.length,quota,added,mergeMs,saved};
 `);
 assert.equal(full.count,count);assert.equal(full.added,count);
 assert.equal(full.quota,'QuotaExceededError');assert.ok(full.saved);
 assert.ok(full.mergeMs<10000,JSON.stringify(full));
 assert.equal(await js(`return localStorage.getItem('lotolab:resultados')`),null);
 assert.equal(await js(`return Guardar.ler('resultados',[]).length`),count);
 console.log(`ok — acervo real: ${count} resultados / ${full.chars} caracteres, mesclados em ${Math.round(full.mergeMs)} ms e gravados fora da quota antiga`);

 await js(`S.modalidade='lotofacil';irParaTela('sugestoes',{lateral:true});`);
 await until(()=>js(`return !!S.intLotes?.lotofacil?.laboratorio?.automatico.persistido&&!document.querySelector('#int-gerar')?.disabled`),'sugestão com histórico completo',180000);
 const round=await js(`return S.intLotes.lotofacil.laboratorio.automatico.rodada`);
 assert.equal(await js(`return document.querySelector('.auto-results [role=alert]')?.textContent||''`),'');
 await js(`document.querySelector('#int-salvar').click();`);
 assert.equal(await js(`return S.tela`),'jogos');
 assert.equal(await js(`return S.jogos.length`),2);
 const games=await js(`return JSON.stringify(S.jogos)`);
 console.log('ok — sugestão registrada e salva pela interface com histórico completo');

 await until(()=>js(`return !!Guardar.ler('laboratorio418',{}).monitor?.lotofacil`),'registro do acompanhamento após salvar');
 const backup=await js(`globalThis.storageBackup=await LL18Backup.create(localStorage);return {summary:LL18Backup.summary(storageBackup),bytes:JSON.stringify(storageBackup).length};`);
 const before=await js(`return storageBackup.conteudo.entradas;`);
 assert.equal(backup.summary.jogos,2);assert.equal(backup.summary.resultados,count);
 assert.ok(backup.bytes<LLIMIT());
 await js(`Guardar.gravar('jogos',[]);await Guardar.gravarAsync('resultados',[]);await LL18Backup.restore(localStorage,JSON.stringify(storageBackup));`);
 assert.deepEqual(await js(`return await LL18Storage.snapshot();`),before);
 assert.equal(await js(`return localStorage.getItem('storage-regression-seeded')`),'preservar');
 console.log('ok — backup reúne os dois armazenamentos e restaura os bytes originais');

 const rollback=await js(`
  const other=structuredClone(storageBackup);other.conteudo.entradas=other.conteudo.entradas.map(([k,v])=>[k,k==='lotolab:jogos'||k==='lotolab:resultados'?'[]':v]);other.sha256=await LL18Backup.digest(JSON.stringify(other.conteudo));
  const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){if(k==='lotolab:resultados')throw new DOMException('Falha de quota simulada','QuotaExceededError');return put.call(this,v,k);};
  let error;try{await LL18Backup.restore(localStorage,JSON.stringify(other));}catch(e){error=e.message;}finally{IDBObjectStore.prototype.put=put;}
  return {error,snapshot:await LL18Storage.snapshot()};
 `);
 assert.match(rollback.error,/dados anteriores foram mantidos/);assert.deepEqual(rollback.snapshot,before);
 console.log('ok — falha depois de iniciar a transação não apaga histórico nem jogos');

 await cmd('Page.reload');await ready();
 assert.equal(await js(`return Guardar.ler('resultados',[]).length`),count);
 assert.equal(await js(`return JSON.stringify(S.jogos)`),games);
 const reopened=await js(`return Guardar.ler('automatico421:'+LL18.autoOptions('lotofacil').profile,{}).rodadas`);
 assert.ok(reopened.some(r=>JSON.stringify(r)===JSON.stringify(round)));
 console.log('ok — reabertura conserva histórico, jogos e pacote original');

 await reopen(`${source}
  globalThis.originalPut=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(){throw new DOMException('Falha simulada','QuotaExceededError');};`,
  `http://localhost:${port}/index.html`);
 assert.equal(await js(`return legacyQuota`),'QuotaExceededError');
 assert.ok(await js(`return LL18Storage.enabled&&!!localStorage.getItem('lotolab:automatico421:teste-migracao')&&Guardar.ler('automatico421:teste-migracao',{}).marcador.length===legacySize`));
 assert.equal(await js(`return await Guardar.gravarAsync('resultados',[{marcador:'sessao'}])`),false);
 assert.ok(await js(`const b=await LL18Backup.create(localStorage);return new Map(b.conteudo.entradas).get('lotolab:resultados')==='[{"marcador":"sessao"}]'`),'backup conserva dados da sessão quando a gravação falha');
 await js(`IDBObjectStore.prototype.put=originalPut;await Guardar.gravarAsync('resultados',[]);await Guardar.gravarAsync('automatico421:teste-migracao',{marcador:'recuperado'});`);
 await reopen(source,`http://localhost:${port}/index.html`);
 assert.equal(await js(`return Guardar.ler('automatico421:teste-migracao',{}).marcador`),'recuperado');
 assert.equal(await js(`return S.jogos[0].id`),'legado-teste');
 console.log('ok — migração interrompida preserva originais; nova tentativa confirma a gravação sem reverter para cópia antiga');
 completed=true;console.log('7 cenários de armazenamento passaram');
}finally{ws.close();close();await sleep(300);rmSync(profile,{recursive:true,force:true});}
function LLIMIT(){return 30*1024*1024;}
