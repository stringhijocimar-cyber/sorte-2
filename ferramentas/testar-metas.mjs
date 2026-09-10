import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const ctx=vm.createContext({console});
vm.runInContext(html.slice(html.indexOf('<script>')+8,html.indexOf('(function iniciar(){')),ctx);
const api=vm.runInContext('({MODALIDADES,metaPlano,metaFechamento,metaEspelho,metaConferencia,metaValidarConferencia,metaAvisoDados,metaAvisoHtml,metaBolinhas,metaFaixasObservadas,S,metaPlugin,metaRenderPlano})',ctx);
const foco=vm.runInContext('({metaBuscarMelhor,metaChanceTodas,focoConcurso})',ctx);
const terminar=g=>{let r;do{r=g.next();}while(!r.done);return r.value;};
// Enumeração independente do algoritmo e sem máscaras binárias.
function combos(a,k){if(k===0)return [[]];if(a.length<k)return [];return combos(a.slice(1),k-1).map(s=>[a[0],...s]).concat(combos(a.slice(1),k));}
test('planejamento respeita centavos, orçamento zero e número de participações',()=>{
  const p=api.metaPlano('lotofacil',20.99,2);assert.equal(p.porConcurso,2);assert.equal(p.gasto,14);assert.equal(p.sobra,6.99);
  assert.equal(api.metaPlano('mega-sena',0,2).porConcurso,0);
  assert.equal(api.metaPlano('mega-sena',12000,1).porConcurso,60);
  for(const [b,n] of [[-1,1],[NaN,1],[Infinity,1],[10,0],[10,1.5],[10,32]])assert.throws(()=>api.metaPlano('quina',b,n));
  for(const m of Object.keys(api.MODALIDADES))for(const b of [0,2.49,3,6.99,100,450])for(const n of [1,2,31]){
    const r=api.metaPlano(m,b,n);assert.ok(r.gasto<=b+1e-10);assert.equal(r.gasto,r.porConcurso*n*api.MODALIDADES[m].preco);
  }
});
for(const [m,c] of Object.entries(api.MODALIDADES).filter(([m])=>m!=='lotomania')){
  test(m+': cobertura e piso coincidem com enumeração independente',()=>{
    const pool=Array.from({length:c.min+2},(_,i)=>c.base+i),alvo=c.k-1;
    const r=terminar(api.metaFechamento(m,pool,alvo,4,'cobertura-teste'));
    const cenarios=combos(pool,c.k),melhores=cenarios.map(s=>Math.max(...r.jogos.map(j=>j.filter(d=>s.includes(d)).length)));
    assert.equal(r.total,cenarios.length);assert.equal(r.cobertos,melhores.filter(n=>n>=alvo).length);
    assert.equal(r.piso,Math.min(...melhores));assert.equal(r.completo,r.cobertos===r.total);
    assert.equal(r.custo,r.jogos.length*c.preco);assert.ok(r.jogos.length<=4);
    assert.equal(new Set(r.jogos.map(ds=>ds.join())).size,r.jogos.length);
    assert.ok(r.jogos.every(ds=>ds.length===c.min&&new Set(ds).size===c.min&&ds.every(d=>pool.includes(d))));
    assert.equal(JSON.stringify(r),JSON.stringify(terminar(api.metaFechamento(m,pool,alvo,4,'cobertura-teste'))));
  });
}
test('cobertura da sena parcial nunca declara garantia; condição tem chance própria',()=>{
  const r=terminar(api.metaFechamento('mega-sena',[1,2,3,4,5,6,7],6,2));
  assert.equal(r.cobertos,2);assert.equal(r.total,7);assert.equal(r.completo,false);assert.equal(r.piso,5);
  assert.ok(Math.abs(r.chanceCondicao-7/50063860)<1e-15);
});
test('cobertura completa para na meta e rejeita enumeração impraticável',()=>{
  const r=terminar(api.metaFechamento('lotofacil',Array.from({length:16},(_,i)=>i+1),14,60));
  assert.equal(r.completo,true);assert.equal(r.jogos.length,1);assert.equal(r.custo,3.5);
  for(const args of [['mega-sena',[1,2],5,3],['mega-sena',Array.from({length:20},(_,i)=>i+1),5,3],['quina',[1,2,3,4,5,6],1,3],['lotomania',[],20,3]])assert.throws(()=>terminar(api.metaFechamento(...args)));
});
test('Lotomania: espelho exato, inclui zero, conserva h + h_espelho = 20',()=>{
  const original=Array.from({length:50},(_,i)=>i*2),espelho=api.metaEspelho(original);
  assert.equal(espelho.length,50);assert.equal(espelho[0],1);assert.ok(original.every(d=>!espelho.includes(d)));
  for(let i=0;i<100;i++){
    const sorteio=Array.from({length:20},(_,j)=>(i+j*3)%100);
    const h=original.filter(n=>sorteio.includes(n)).length,h2=espelho.filter(n=>sorteio.includes(n)).length;
    assert.equal(h+h2,20);assert.ok(Math.max(h,h2)>=10);
  }
  assert.throws(()=>api.metaEspelho([1,2,3]));
});
test('avisos recalculam acertos e distinguem dezenas corretas, erradas e dados inválidos',()=>{
  const cf=api.metaConferencia({id:'a:b',modalidade:'mega-sena',dezenas:[1,2,3,4,5,6]},{concurso:12,dezenas:[1,2,3,4,7,8]});
  assert.equal(cf.acertos,4);assert.equal(api.metaValidarConferencia({...cf,acertos:6}).acertos,4);
  const h=api.metaBolinhas(cf.dezenas,cf.sorteadas);
  assert.equal((h.match(/class="dz acertou"/g)||[]).length,4);assert.equal((h.match(/class="dz errou"/g)||[]).length,2);
  assert.ok(h.includes('aria-label="05, não sorteada"'));
  for(const x of [{...cf,concurso:0},{...cf,dezenas:[1,1,3,4,5,6]},{...cf,sorteadas:[1,2,3,4,5,61]},{...cf,modalidade:'<script>'}])assert.equal(api.metaValidarConferencia(x),null);
});
test('avisos antigos ganham cores usando jogo e concurso, sem reinterpretar o texto',()=>{
  api.S.jogos=[{id:'a:b',modalidade:'mega-sena',dezenas:[1,2,3,4,5,6],conferencias:[{concurso:12,dezenas:[1,2,3,4,7,8]}]}];api.S.teimosinhas=[];
  assert.equal(api.metaAvisoDados({chave:'coincidencia:a:b:12'}).acertos,4);
  assert.equal(api.metaAvisoDados({texto:'6 acertos!'}),null);
  assert.ok(api.metaAvisoHtml({chave:'coincidencia:a:b:12'}).includes('data-aviso-jogo="a:b"'));
});
test('faixas contam concursos com ocorrência, e não somam bilhetes como eventos independentes',()=>{
  const fs=api.metaFaixasObservadas({serie:[{acertos:[5,5,4]},{acertos:[6,5,4]},{acertos:[0,1,2]}]},'mega-sena');
  assert.equal(fs.find(x=>x.acertos===5).concursos,2);assert.equal(fs.find(x=>x.acertos===6).concursos,1);
  assert.equal(api.metaPlugin(),null);
});
for(const tipo of ['objeto','promessa','rejeitada','excecao','ausente']){
  test('inicialização nativa não trava com listener '+tipo,async()=>{
    let inscricoes=0,espelhos=0;
    const handle={remove:async()=>{}};
    const plugin={destino:async()=>({}),sincronizar:async()=>{}};
    if(tipo!=='ausente')plugin.addListener=()=>{
      inscricoes++;
      if(tipo==='excecao')throw new Error('plugin indisponível');
      if(tipo==='rejeitada')return Promise.reject(new Error('não registrado'));
      return tipo==='objeto'?handle:Promise.resolve(handle);
    };
    const sandbox=vm.createContext({console,Capacitor:{isNativePlatform:()=>true,isPluginAvailable:()=>true,Plugins:{LotoLabNotificacoes:plugin}},espelharTeste:async()=>{espelhos++;}});
    vm.runInContext(html.slice(html.indexOf('<script>')+8,html.indexOf('(function iniciar(){')),sandbox);
    vm.runInContext('espelharParaSegundoPlano=espelharTeste',sandbox);
    await assert.doesNotReject(()=>vm.runInContext('metaLigarNativo()',sandbox));
    assert.equal(espelhos,1);
    if(['objeto','promessa'].includes(tipo)){
      await vm.runInContext('metaLigarNativo()',sandbox);assert.equal(inscricoes,1);
    }
  });
}
test('buscas adicionais preservam orçamento e nunca reduzem a cobertura da primeira',()=>{
  const pool=Array.from({length:12},(_,i)=>i+1),seed='comparar-cobertura';
  const primeira=terminar(api.metaFechamento('mega-sena',pool,4,2,seed+':0'));
  const melhor=terminar(foco.metaBuscarMelhor('mega-sena',pool,4,2,seed));
  assert.ok(melhor.cobertos>=primeira.cobertos);assert.ok(melhor.custo<=12);assert.ok(melhor.buscas<=3);
  const cenarios=combos(pool,6),acertos=cenarios.map(s=>Math.max(...melhor.jogos.map(j=>j.filter(d=>s.includes(d)).length)));
  assert.equal(melhor.cobertos,acertos.filter(h=>h>=4).length);assert.equal(melhor.piso,Math.min(...acertos));
});
test('meta máxima informa chance exata do lote sem somar resultados sobrepostos',()=>{
  const mega=terminar(foco.metaBuscarMelhor('mega-sena',[1,2,3,4,5,6,7],6,2));
  assert.equal(mega.buscas,1);assert.equal(foco.metaChanceTodas(mega),2/50063860);
  const time=terminar(foco.metaBuscarMelhor('timemania',Array.from({length:12},(_,i)=>i+1),7,3));
  const uniao=new Set(time.jogos.flatMap(j=>combos([...j],7).map(s=>s.join(','))));
  const total=Array.from({length:7},(_,i)=>(80-i)/(i+1)).reduce((a,b)=>a*b,1);
  assert.ok(Math.abs(foco.metaChanceTodas(time)-uniao.size/total)<1e-15);
  assert.equal(foco.metaChanceTodas({...mega,meta:5}),null);
});
test('missão acompanha só o concurso e modalidade declarados, recomputando os acertos',()=>{
  const jogos=[{id:'a',modalidade:'mega-sena',concursoAlvo:50,dezenas:[1,2,3,4,5,6]},
    {id:'b',modalidade:'mega-sena',concursoAlvo:49,dezenas:[1,2,3,4,7,8]},
    {id:'c',modalidade:'quina',concursoAlvo:50,dezenas:[1,2,3,4,5]}];
  const resultado={modalidade:'mega-sena',concurso:50,data:'2026-09-01',dezenas:[1,2,3,4,7,8]};
  assert.equal(foco.focoConcurso('mega-sena','',jogos,[]).alvo,null);
  assert.equal(foco.focoConcurso('mega-sena',50,jogos,[]).melhor,null);
  const r=foco.focoConcurso('mega-sena',50,jogos,[resultado]);
  assert.equal(r.jogos,1);assert.equal(r.melhor,4);assert.equal(r.faltam,2);assert.equal(r.atingiu,false);
  assert.equal(foco.focoConcurso('mega-sena',50,jogos,[{...resultado,dezenas:[1,2,3,4,5,6]}]).atingiu,true);
  assert.equal(foco.focoConcurso('mega-sena',50,jogos,[resultado,{...resultado,dezenas:[1,2,3,4,5,6]}]).melhor,null);
});
