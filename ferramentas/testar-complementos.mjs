import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {converter,daFormaDoEspelho} from './atualizar-resultados.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function contexto(){
  const memoria=new Map();
  const ctx=vm.createContext({console,setTimeout:()=>0,localStorage:{getItem:k=>memoria.get(k)??null,setItem:(k,v)=>memoria.set(k,v)},document:{querySelector:()=>null,querySelectorAll:()=>[]}});
  vm.runInContext(html.slice(html.indexOf('<script>')+8,html.indexOf('(function iniciar(){')),ctx);
  return {ctx,a:vm.runInContext('({S,normalizarCaixa,normalizarEspelho,intGerarLote,intCsv,metaConferencia,metaValidarConferencia,focoConcurso,metaAvisoHtml,metaAvisoDados,guardarResultados,conferenciaAutomatica,lerTrevos,trevosDoLote,chaveDoJogo,premioDoAcerto})',ctx)};
}
const base={numero:100,dataApuracao:'07/09/2026',listaDezenas:['01','02','03','04','05','06']};
const jogo=m=>({id:'t',modalidade:m,data:'2026-09-01',concursoAlvo:100,dezenas:[1,2,3,4,5,6],conferencias:[]});
const limpar=x=>JSON.parse(JSON.stringify(x));
test('CAIXA e atualizador preservam trevos e segundo sorteio em campos separados',()=>{
  const {a}=contexto();
  for(const [m,extra,campo] of [['mais-milionaria',{trevosSorteados:['02','06']},'trevos'],['dupla-sena',{listaDezenasSegundoSorteio:['07','08','09','10','11','12']},'dezenasSegundoSorteio']]){
    const raw={...base,...extra,dezenasSorteadasOrdemSorteio:['40','41','42','43','44','45','01','06']};
    const app=a.normalizarCaixa(raw,m),job=converter(raw,m);
    assert.deepEqual(limpar(app[campo]),job[campo]);assert.deepEqual(limpar(app.dezenas),[1,2,3,4,5,6]);
    const mirror={concurso:100,data:'07/09/2026',dezenas:base.listaDezenas,[campo]:extra[Object.keys(extra)[0]]};
    assert.deepEqual(limpar(a.normalizarEspelho(mirror,m)[campo]),converter(daFormaDoEspelho(mirror),m)[campo]);
  }
});
test('campos ausentes permanecem ausentes e campos malformados são recusados em ambas as fontes',()=>{
  const {a}=contexto();
  for(const fn of [a.normalizarCaixa,converter]){
    assert.equal(fn(base,'mais-milionaria').trevos,undefined);
    assert.equal(fn(base,'dupla-sena').dezenasSegundoSorteio,undefined);
    for(const t of [[],[1],[1,1],[0,6],[1,7],['1x',2],[1,2,3]])assert.throws(()=>fn({...base,trevosSorteados:t},'mais-milionaria'));
    for(const ds of [[1,2,3,4,5],[1,2,3,4,5,5],[1,2,3,4,5,51]])assert.throws(()=>fn({...base,listaDezenasSegundoSorteio:ds},'dupla-sena'));
  }
});
test('trevos reproduzíveis, duas opções válidas por jogo e preço com o mesmo orçamento',()=>{
  const {a}=contexto(),op={semente:'auditavel',modo:'uniforme',orcamento:18};
  const r=a.intGerarLote('mais-milionaria',6,8,op),fixo=a.intGerarLote('mais-milionaria',6,8,{...op,trevos:'02 06'});
  assert.equal(r.jogos.length,3);assert.equal(r.metricas.custo,18);assert.equal(r.metricas.unitario,6);
  assert.deepEqual(limpar(r),limpar(a.intGerarLote('mais-milionaria',6,8,op)));
  assert.deepEqual(limpar(r.jogos),limpar(fixo.jogos));
  for(const t of r.trevos){assert.equal(t.length,2);assert.equal(new Set(t).size,2);assert.ok(t.every(n=>n>=1&&n<=6));}
  assert.ok(fixo.trevos.every(t=>t.join()==='2,6'));assert.match(a.intCsv(fixo),/"Trevos"/);assert.match(a.intCsv(fixo),/"02 06"/);
  assert.throws(()=>a.intGerarLote('mais-milionaria',6,1,{trevos:'01 02 03'}));
  assert.notEqual(a.chaveDoJogo({...jogo('mais-milionaria'),trevos:[1,2]}),a.chaveDoJogo({...jogo('mais-milionaria'),trevos:[1,3]}));
  assert.equal(a.chaveDoJogo({...jogo('mais-milionaria'),trevos:[2,1]}),a.chaveDoJogo({...jogo('mais-milionaria'),trevos:[1,2]}));
});
test('meta máxima exige seis dezenas e dois trevos no MESMO jogo, sem somar bilhetes',()=>{
  const {a}=contexto(),m='mais-milionaria',r=a.normalizarCaixa({...base,trevosSorteados:[1,2]},m);
  const j={...jogo(m),trevos:[3,4]},outro={...jogo(m),id:'outro',dezenas:[7,8,9,10,11,12],trevos:[1,2]};
  assert.equal(a.focoConcurso(m,100,[j,outro],[r]).atingiu,false);
  assert.equal(a.focoConcurso(m,100,[{...j,trevos:undefined}],[r]).atingiu,false);
  assert.equal(a.focoConcurso(m,100,[{...j,trevos:[1,2]}],[{...r,trevos:undefined}]).atingiu,false);
  assert.equal(a.focoConcurso(m,100,[{...j,trevos:[1,2]}],[r]).atingiu,true);
  const cf=a.metaValidarConferencia({...a.metaConferencia(j,r),acertosTrevos:2});assert.equal(cf.acertosTrevos,0);
  assert.equal(a.metaValidarConferencia({...cf,trevos:[1,1]}),null);
  assert.equal(a.premioDoAcerto({...r,rateio:[{faixa:1,premio:100}]},6,m),null);
});
test('Dupla Sena usa o melhor sorteio inteiro e nunca a união das duas listas',()=>{
  const {a}=contexto(),m='dupla-sena',j=jogo(m);
  const parcial={modalidade:m,concurso:100,dezenas:[1,2,3,7,8,9],dezenasSegundoSorteio:[4,5,6,10,11,12]};
  assert.equal(a.focoConcurso(m,100,[j],[parcial]).melhor,3);
  assert.equal(a.focoConcurso(m,100,[j],[parcial]).atingiu,false);
  const r={...parcial,dezenasSegundoSorteio:j.dezenas};
  const f=a.focoConcurso(m,100,[j],[r]);assert.equal(f.atingiu,true);assert.equal(f.melhor,6);assert.equal(f.conferencia.acertos,3);assert.equal(f.conferencia.acertosSegundo,6);
  assert.equal(a.metaValidarConferencia(a.metaConferencia(j,{...r,dezenasSegundoSorteio:undefined})).acertosSegundo,null);
  assert.equal(a.focoConcurso(m,100,[j],[r,{...r,dezenasSegundoSorteio:[7,8,9,10,11,12]}]).melhor,null);
});
test('enriquecimento preserva conferências e avisos sem repetir; fonte parcial não apaga detalhes',()=>{
  const {a}=contexto(),m='dupla-sena',j=jogo(m),r={modalidade:m,concurso:100,data:'2026-09-07',dezenas:[1,2,3,7,8,9]};
  a.S.jogos=[j];a.S.teimosinhas=[];a.S.avisos=[];a.S.resultados=[r];
  assert.equal(a.conferenciaAutomatica().novas,1);const avisos=a.S.avisos.length;
  const cheio={...r,dezenasSegundoSorteio:j.dezenas};a.guardarResultados([cheio]);
  assert.equal(a.conferenciaAutomatica().novas,0);assert.equal(j.conferencias.length,1);assert.equal(j.conferencias[0].acertosSegundo,6);assert.equal(a.S.avisos.length,avisos);
  a.guardarResultados([r]);assert.deepEqual(limpar(a.S.resultados[0].dezenasSegundoSorteio),j.dezenas);
  const aviso=a.metaAvisoDados(a.S.avisos[0]);assert.equal(aviso.acertosSegundo,6);assert.match(a.S.avisos[0].titulo,/2º: 6/);
  a.guardarResultados([{...r,dezenas:[7,8,9,10,11,12]}]);assert.equal(a.S.resultados[0].dezenasSegundoSorteio,undefined);a.conferenciaAutomatica();assert.equal(j.conferencias[0].acertos,0);assert.equal(j.conferencias[0].dezenasSegundoSorteio,undefined);assert.match(a.S.avisos[0].titulo,/1º: 0 · 2º: pendente/);
});
test('notificações separam bolinhas de trevos e dois sorteios; dados ausentes não ficam vermelhos',()=>{
  const {a}=contexto(),m='mais-milionaria',j={...jogo(m),trevos:[1,2]},r={modalidade:m,concurso:100,dezenas:[1,2,3,7,8,9],trevos:[1,6]};
  const h=a.metaAvisoHtml({conferencia:a.metaConferencia(j,r)});
  assert.match(h,/Trevos · 1 de 2/);assert.equal((h.match(/class="dz acertou"/g)||[]).length,4);assert.equal((h.match(/class="dz errou"/g)||[]).length,4);
  const pendente=a.metaAvisoHtml({conferencia:a.metaConferencia(j,{...r,trevos:undefined})});assert.match(pendente,/conferência pendente/);assert.equal((pendente.match(/class="dz errou"/g)||[]).length,3);
  const dupla=a.metaAvisoHtml({conferencia:a.metaConferencia(jogo('dupla-sena'),{concurso:100,dezenas:[7,8,9,10,11,12],dezenasSegundoSorteio:[1,2,3,4,5,6]})});
  assert.match(dupla,/2º sorteio · 6 de 6/);assert.equal((dupla.match(/class="dz acertou"/g)||[]).length,6);
});
test('busca procura detalhes sem retroceder o concurso nem aceitar outro número solicitado',async()=>{
  const {ctx}=contexto();
  vm.runInContext(`ordemDeFontes=()=>[{id:'parcial',nome:'parcial',url:()=>'',converter:()=>({modalidade:'dupla-sena',concurso:100,dezenas:[1,2,3,4,5,6]})},{id:'completa',nome:'completa',url:()=>'',converter:()=>({modalidade:'dupla-sena',concurso:100,dezenas:[1,2,3,4,5,6],dezenasSegundoSorteio:[7,8,9,10,11,12]})}];buscarComLimite=async()=>({ok:true,json:async()=>({})});`,ctx);
  assert.equal((await vm.runInContext(`buscarNaCaixa('dupla-sena',100)`,ctx)).fonte,'completa');
  vm.runInContext(`const original=ordemDeFontes;ordemDeFontes=()=>original().map((f,i)=>i?{...f,converter:()=>({modalidade:'dupla-sena',concurso:99,dezenas:[1,2,3,4,5,6],dezenasSegundoSorteio:[7,8,9,10,11,12]})}:f);`,ctx);
  assert.equal((await vm.runInContext(`buscarNaCaixa('dupla-sena',null)`,ctx)).concurso,100);
  await assert.rejects(()=>vm.runInContext(`buscarNaCaixa('dupla-sena',101)`,ctx));
});
test('segundo sorteio publicado depois cria um único aviso quando só ele atinge a faixa',()=>{
  const {a}=contexto(),m='dupla-sena',j=jogo(m),r={modalidade:m,concurso:100,data:'2026-09-07',dezenas:[7,8,9,10,11,12]};
  a.S.jogos=[j];a.S.teimosinhas=[];a.S.avisos=[];a.S.resultados=[r];
  a.conferenciaAutomatica();assert.equal(a.S.avisos.length,0);
  a.guardarResultados([{...r,dezenasSegundoSorteio:j.dezenas}]);
  const conferida=a.conferenciaAutomatica();assert.equal(conferida.novas,0);assert.equal(conferida.premios,1);assert.equal(conferida.resumos[m].acertosSegundo,6);
  a.conferenciaAutomatica();assert.equal(a.S.avisos.length,1);assert.equal(j.conferencias.length,1);
});
test('Android usa HTTP nativo somente para resultados oficiais e respeita tempo limite',async()=>{
  const {ctx}=contexto();Object.assign(ctx,{setTimeout,clearTimeout,AbortController});
  vm.runInContext(`var chamadas=[],web=0;fetch=async()=>{web++;return {ok:true,json:async()=>({web:true})};};Capacitor={isNativePlatform:()=>true,isPluginAvailable:n=>n==='CapacitorHttp',Plugins:{CapacitorHttp:{get:async o=>{chamadas.push(o);return {status:200,data:'{"numero":100}'};}}}};`,ctx);
  const r=await vm.runInContext(`buscarComLimite('https://servicebus2.caixa.gov.br/portaldeloterias/api/duplasena',200)`,ctx);assert.equal(r.ok,true);assert.equal((await r.json()).numero,100);
  assert.equal(vm.runInContext('chamadas[0].connectTimeout',ctx),200);assert.equal(vm.runInContext('web',ctx),0);
  await vm.runInContext(`buscarComLimite('https://raw.githubusercontent.com/x.json',200)`,ctx);assert.equal(vm.runInContext('web',ctx),1);
  vm.runInContext(`Capacitor.Plugins.CapacitorHttp.get=()=>new Promise(()=>{});`,ctx);
  await assert.rejects(()=>vm.runInContext(`buscarComLimite('https://servicebus2.caixa.gov.br/portaldeloterias/api/duplasena',5)`,ctx),{name:'TimeoutError'});
});
