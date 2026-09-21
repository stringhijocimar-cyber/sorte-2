/** Regressões de distribuição: primeiro worker offline, reabertura e HTML único.
 * Requer Chrome, configurável em LOTOLAB_CHROME. Sobe e encerra seu servidor.
 * Usa resultados do acervo; o jogo de exemplo existe somente neste teste. */
import {spawn} from 'node:child_process';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=join(dirname(fileURLToPath(import.meta.url)),'..'),port=12000+process.pid%1000,debug=port+1000;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const chrome=spawn(process.env.LOTOLAB_CHROME||'google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-proxy-server',`--remote-debugging-port=${debug}`,`--user-data-dir=${mkdtempSync(join(tmpdir(),'lotolab-dist-'))}`,'about:blank'],{stdio:['ignore','ignore','inherit']});
let completed=false;
const close=()=>{server.kill();chrome.kill();};process.on('exit',()=>{if(!completed)process.exitCode=1;close();});
server.on('error',e=>{throw e;});chrome.on('error',e=>{throw e;});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=45000){const start=Date.now();while(Date.now()-start<ms){if(await fn())return;await sleep(150);}throw Error('Tempo excedido: '+label);}
let target;await until(async()=>{try{const r=await fetch(`http://127.0.0.1:${debug}/json/new?about:blank`,{method:'PUT'});target=await r.json();return !!target.webSocketDebuggerUrl;}catch{return false;}},'Chrome');
await until(async()=>{try{return(await fetch(`http://127.0.0.1:${port}/index.html`)).ok;}catch{return false;}},'servidor');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let seq=0;const pending=new Map();
ws.onclose=()=>{for(const p of pending.values())p.reject(Error('Chrome encerrou antes de responder.'));pending.clear();};
ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
async function js(code){const r=await cmd('Runtime.evaluate',{expression:`(()=>{${code}})()`,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails));return r.result.value;}
async function ready(){await until(()=>js('return !!globalThis.LL18UI && typeof S!=="undefined"'),'app');}
async function recommend(){
 await js(`S.modalidade='mega-sena';S.intConfig={};S.intLotes={};irParaTela('sugestoes',{lateral:true});document.querySelector('#int-semente').value='distribuicao-419';document.querySelector('#int-gerar').click();`);
 await until(async()=>{
  const s=await js(`return {pronto:!!S.intLotes['mega-sena']?.laboratorio,ocupado:!!document.querySelector('#int-gerar')?.disabled,tela:S.tela,mensagem:document.querySelector('#int-mensagem')?.textContent,concursos:S.resultados.length}`);
  if(s.pronto)return true;
  if(!s.ocupado)throw Error('Recomendação interrompida: '+JSON.stringify(s));
  return false;
 },'recomendação offline',90000);
 assert.ok(await js(`const r=S.intLotes['mega-sena'];return r.jogos.length===1&&r.laboratorio.motor==='integrado'&&r.laboratorio.principal.analise.jogo.dezenas.join()===r.jogos[0].join()`));
}
async function analyze(){await js(`S.modalidade='mega-sena';irParaTela('estatisticas',{lateral:true});const e=document.querySelector('#ll-texto');e.value='14 23 53 56 57 60';e.dispatchEvent(new Event('input'));document.querySelector('[data-ll-action="analisar"]').click();`);await until(()=>js(`return !document.querySelector('[data-ll-action="cancelar"]')&&document.querySelector('#ll-content').textContent.includes('Distribuição completa')`),'worker analítico',90000);}
try{
 await cmd('Page.enable');await cmd('Runtime.enable');
 await cmd('Page.navigate',{url:`http://127.0.0.1:${port}/index.html`});await ready();console.log('app HTTP pronto');
 await until(()=>js(`return !!navigator.serviceWorker.controller`),'controle do service worker');
 assert.ok(await js(`return caches.match('./ui/lab-worker.js').then(Boolean)`),'worker foi pré-armazenado');
 assert.ok(await js(`return caches.match('./ui/lab-recommendation.js').then(Boolean)`),'motor integrado pré-armazenado');
 console.log('cache pronto');
 // Também corta fontes externas: encerrar só o servidor não impede a busca
 // diária de atualizar a base enquanto o HTML único é testado na CI.
 await cmd('Network.enable');
 await cmd('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 // Nenhuma análise foi executada online. Encerra o servidor de verdade.
 server.kill();await new Promise(r=>server.once('exit',r));console.log('servidor encerrado');
 await cmd('Page.reload');await sleep(300);await ready();
 const rows=JSON.parse(readFileSync(join(root,'dados/mega-sena.json'),'utf8')).concursos.slice(0,120);
 await js(`S.resultados=${JSON.stringify(rows)};S.buscaAutomatica=false;S.pesquisaAutomatica=false;`);
 await analyze();
 assert.ok(await js(`return document.querySelector('#ll-content').textContent.includes('2.000 jogos aleatórios')&&document.querySelector('#ll-content').textContent.includes('120 concursos')`));
 console.log('ok — primeiro worker offline analisa 120 resultados e 2.000 referências, com servidor desligado');
 await recommend();console.log('ok — recomendação integrada funciona offline com a mesma base');
 const first=rows.slice(0,2).sort((a,b)=>a.concurso-b.concurso);
 await js(`Guardar.gravar('resultados',${JSON.stringify(first)});Guardar.gravar('laboratorio418',{lotes:[{modalidade:'mega-sena',geradoAte:${first[0].concurso},concursoAlvo:${first[1].concurso},jogos:[{dezenas:[14,23,53,56,57,60]}]}],historicoExtra:[],tentativas:[],monitor:{},comites:{}});`);
 await cmd('Page.reload');await sleep(300);await ready();
 await until(()=>js(`return Guardar.ler('laboratorio418',{}).monitor?.['mega-sena']?.observacoes?.length===1`),'conferência ao reabrir');
 assert.equal(await js(`return Guardar.ler('laboratorio418',{}).monitor['mega-sena'].diagnostico.acao`),'MANTER');
 console.log('ok — reabrir reconcilia lote prospectivo sem novo download e mantém estratégia após um concurso');
 await cmd('Page.navigate',{url:pathToFileURL(join(root,'lotolab-completo.html')).href});await sleep(300);await ready();
 assert.equal(await js(`return location.protocol`),'file:');
 assert.equal(await js(`return typeof LL18_WORKER_SOURCE`),'string');
 await analyze();
 assert.ok(await js(`const t=document.querySelector('#ll-content').textContent;return t.includes('600 concursos')&&t.includes('2.000 jogos aleatórios')`));
 console.log('ok — HTML único file:// executa worker Blob com 600 concursos e 2.000 referências');
 await recommend();console.log('ok — HTML único também gera a recomendação integrada');
 completed=true;
 console.log('5 testes de distribuição passaram');
}finally{ws.close();close();}
