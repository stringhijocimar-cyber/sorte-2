/** Capturas reais e regressões do layout. Não injeta HTML demonstrativo. */
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(process.env.LOTOLAB_LAYOUT_OUTPUT||join(root,'capturas-layout'));
mkdirSync(output,{recursive:true});
const port=14000+process.pid%800,debug=port+900;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const chrome=spawn(process.env.LOTOLAB_CHROME||'google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-proxy-server',`--remote-debugging-port=${debug}`,`--user-data-dir=${mkdtempSync(join(tmpdir(),'lotolab-layout-'))}`,'about:blank'],{stdio:'ignore'});
const close=()=>{server.kill();chrome.kill();};process.on('exit',close);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=90000){const begin=Date.now();while(Date.now()-begin<ms){if(await fn())return;await sleep(100);}throw Error('Tempo excedido: '+label);}
let target;await until(async()=>{try{target=await(await fetch(`http://127.0.0.1:${debug}/json/new?about:blank`,{method:'PUT'})).json();return !!target.webSocketDebuggerUrl;}catch{return false;}},'Chromium');
await until(async()=>{try{return (await fetch(`http://127.0.0.1:${port}/index.html`)).ok;}catch{return false;}},'HTTP');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let seq=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
ws.onclose=()=>{for(const p of pending.values())p.reject(Error('Chromium encerrado'));pending.clear();};
const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
async function js(code){const r=await cmd('Runtime.evaluate',{expression:`(async()=>{${code}})()`,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails));return r.result.value;}
async function viewport(width=412,height=1100){await cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:width<600});await sleep(100);}
async function shot(file,selector){
 await sleep(700); // A navegação da geração usa rolagem suave: aguardar sua estabilização.
 await js(`const e=document.querySelector(${JSON.stringify(selector)});const header=document.querySelector('header')?.getBoundingClientRect().bottom||0;window.scrollTo({top:e.getBoundingClientRect().top+scrollY-header-12,behavior:'instant'});`);await sleep(250);
 const data=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const path=join(output,file);writeFileSync(path,Buffer.from(data.data,'base64'));console.log('Captura real:',path);
}
async function tap(selector){
 await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'});`);await sleep(100);
 const p=await js(`const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);return {x,y,hit:e===h||e.contains(h),disabled:e.disabled};`);
 assert.ok(p.hit,selector+' atingível');assert.ok(!p.disabled,selector+' habilitado');
 await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,radiusX:2,radiusY:2,force:1}]});await cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(400);
}
const rows=mode=>JSON.parse(readFileSync(join(root,'dados/'+mode+'.json'),'utf8')).concursos.slice(-180);
async function recommend(mode,empty=false){
 await js(`S.resultados=${JSON.stringify(empty?[]:rows(mode))};S.modalidade=${JSON.stringify(mode)};S.intConfig={};S.intLotes={};S.buscaAutomatica=false;S.autoAnalise=false;irParaTela('sugestoes',{lateral:true});document.querySelector('#int-gerar').click();`);
 await until(()=>js(`return !!S.intLotes[${JSON.stringify(mode)}]?.laboratorio&&!intPendente`),'geração '+mode);
 await js(`document.documentElement.dataset.tema='escuro';`);await sleep(100);
}
let checks=0;const check=(ok,label)=>{assert.ok(ok,label);checks++;console.log('ok — '+label);};
try{
 await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Network.enable');await viewport();
 await cmd('Page.navigate',{url:`http://127.0.0.1:${port}/index.html`});
 await until(()=>js(`return !!globalThis.LL18UI&&!!globalThis.LL18Auto&&LL18Storage.started&&!!document.querySelector('.foco-hero')`),'abertura');
 await sleep(1000);await until(()=>js(`return !!globalThis.LL18UI&&LL18Storage.started`),'atualização PWA');
 await cmd('Network.setBlockedURLs',{urls:['*githubusercontent.com*','*caixa.gov.br*']});
 await cmd('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 await recommend('mega-sena');
 check(await js(`const save=document.querySelector('#int-salvar'),freq=document.querySelector('.ll-frequency-diagnosis');return !!(save.compareDocumentPosition(freq)&Node.DOCUMENT_POSITION_FOLLOWING)&&document.querySelectorAll('#int-salvar').length===1`),'Salvar único antes dos detalhes analíticos');
 check(await js(`return !document.querySelector('.auto-pack').open&&!document.querySelector('.auto-goal').open&&!document.querySelector('.ll-evidence').open`),'conteúdo de pesquisa recolhido, sem remover dados');
 check(await js(`return document.querySelector('.auto-lot-cost').textContent.includes(S.intLotes['mega-sena'].laboratorio.custo.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))`),'custo exibido igual ao motor');
 check(await js(`return parseFloat(getComputedStyle(document.querySelector('.auto-overview .int-help')).fontSize)>=14&&parseFloat(getComputedStyle(document.querySelector('#int-salvar')).fontSize)>=16`),'tipografia efetivamente legível');
 await shot('01-mega-sena-escuro.png','.auto-results');
 await tap('.auto-pack>summary');check(await js(`return document.querySelector('.auto-pack').open&&document.querySelectorAll('.auto-test').length===11`),'pacote virtual abre por toque');
 await tap('.auto-pack>summary');
 await js(`const e=document.querySelector('.auto-settings');e.open=true;e.dispatchEvent(new Event('toggle'));const field=document.querySelector('#int-orcamento');field.focus();field.value='12';field.dispatchEvent(new Event('input'));LL18_BRIDGE.deliver('mega-sena',S.intLotes['mega-sena'].laboratorio,S.resultados.slice());`);
 check(await js(`return document.activeElement?.id==='int-orcamento'&&document.querySelector('#int-orcamento').value==='12'&&document.querySelector('.auto-settings').open`),'entrega automática preserva edição, foco e personalização');
 await shot('02-configuracao.png','.auto-settings');
 await js(`document.querySelector('#int-orcamento').value='';document.querySelector('#int-orcamento').dispatchEvent(new Event('input'));document.querySelector('#int-fixas').value='1 2 3 4 5 6';document.querySelector('#int-fixas').dispatchEvent(new Event('input'));document.querySelector('#int-quantidade').value='2';document.querySelector('#int-quantidade').dispatchEvent(new Event('input'));`);
 check(await js(`return document.querySelector('#int-plan-preview').textContent.includes('O lote não cabe')`),'prévia conserva aviso de lote impossível');
 check(await js(`const e=document.querySelector('#int-plan-status');return e.getAttribute('role')==='status'&&e.textContent.includes('O lote não cabe')&&e.textContent.length<250`),'viabilidade anuncia apenas resumo acessível, não a tabela completa');
 await js(`document.querySelector('#int-fixas').value='';document.querySelector('#int-fixas').dispatchEvent(new Event('input'));document.querySelector('#int-quantidade').value='1';document.querySelector('#int-quantidade').dispatchEvent(new Event('input'));`);
 await tap('#int-salvar-opcoes input[value="teimosinha"]');
 await js(`const e=document.querySelector('#int-salvar-opcoes input[type=number]');e.value='3';e.dispatchEvent(new Event('input',{bubbles:true}));`);
 await tap('#int-salvar');check(await js(`return S.tela==='jogos'&&S.jogos.at(-1).acompanhamento==='teimosinha'&&S.jogos.at(-1).concursos===3`),'salvamento real mantém acompanhamento e dados');
 await recommend('lotofacil');
 await shot('03-lotofacil-escuro.png','.auto-results');
 for(const tema of ['escuro','claro']){
  await js(`document.documentElement.dataset.tema=${JSON.stringify(tema)};`);
  for(const width of [360,390,412,768,1280]){
   await viewport(width);
   check(await js(`return document.documentElement.scrollWidth<=visualViewport.width+1`),`sem overflow ${tema} ${width}px`);
  }
 }
 check(await js(`const lum=c=>{const rgb=c.match(/[0-9.]+/g).slice(0,3).map(v=>{const x=Number(v)/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};const a=lum(getComputedStyle(document.querySelector('.auto-lot-cost strong')).color),b=lum(getComputedStyle(document.querySelector('.auto-results')).backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;`),'contraste de custo/superfície no tema claro >= 4,5:1');
 await viewport(360);await js(`document.documentElement.style.fontSize='24px';`);
 check(await js(`return document.documentElement.scrollWidth<=visualViewport.width+1`),'texto ampliado 150% sem overflow em 360px');
 await js(`document.documentElement.style.fontSize='';`);
 await viewport();await shot('04-lotofacil-claro.png','.auto-results');
 await tap('[data-int-analisar="0"]');
 check(await js(`return document.querySelector('.ll-analysis-summary').textContent.includes('Descrição retrospectiva')&&document.querySelector('#ll-content').textContent.includes('Distribuição completa')`),'laboratório usa análise verdadeira da sugestão e indica origem retrospectiva');
 await shot('05-analise-lotofacil.png','.ll-analysis-summary');
 await viewport(1280,900);await shot('06-analise-desktop.png','#ll-lab');
 await viewport(412,1100);await js(`document.documentElement.dataset.tema='escuro';document.querySelector('.ll-special-profile').open=true;`);await shot('07-perfil-lotofacil.png','.ll-special-profile');
 await recommend('mega-sena',true);
 check(await js(`return S.intLotes['mega-sena'].laboratorio.base.n===0&&document.querySelector('.auto-results').textContent.includes('Sem histórico disponível')`),'estado sem histórico permanece explícito e não inventa evidência');
 const metrics={versao:await js(`return LL18.VERSION`),checks,capturas:7,fonte:'Resultados reais do acervo local, últimos 180 concursos. Não certifica última atualização oficial.'};
 writeFileSync(join(output,'validacao-layout.json'),JSON.stringify(metrics,null,2)+'\n');
 console.log(`${checks} verificações de layout passaram; 7 capturas reais.`);
}finally{ws.close();close();}
