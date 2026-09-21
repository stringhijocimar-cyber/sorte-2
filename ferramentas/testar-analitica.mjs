import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const ctx=vm.createContext({console});
vm.runInContext(html.slice(html.indexOf('<script>')+8,html.indexOf('(function iniciar(){')),ctx);
const api=vm.runInContext('({MODALIDADES,intAuditar,audBase,audResumo,audUniforme,audDiagnostico,audSelecionar,audSelecionarRobusto,audRegistrar,audLerMemoria,audCompararMemoria,pesquisaMigrar,pesquisaEstabilidade,aptidao,vereditoPesquisa,audRenderResultado})',ctx);
const plain=x=>JSON.parse(JSON.stringify(x));
function terminar(g){let r;do{r=g.next();}while(!r.done);return r.value;}
function historico(m,n=100,seed=123){
  const c=api.MODALIDADES[m];let state=seed>>>0;
  const rnd=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
  return Array.from({length:n},(_,i)=>{
    const pool=Array.from({length:c.N},(_,d)=>d+c.base);
    for(let j=pool.length-1;j>0;j--){const k=Math.floor(rnd()*(j+1));[pool[k],pool[j]]=[pool[j],pool[k]];}
    return {modalidade:m,concurso:i+1,data:'2026-01-01',dezenas:pool.slice(0,c.k).sort((a,b)=>a-b)};
  });
}
const h=historico('mega-sena'),op={replicas:8,semente:'auditoria-413'},padrao=terminar(api.intAuditar('mega-sena',h,op));

test('separação temporal tem treino, seleção e teste sem sobreposição',()=>{
  assert.deepEqual(plain(padrao.etapas),{treino:{n:40,primeiro:11,ultimo:50},selecao:{n:20,primeiro:51,ultimo:70},teste:{n:30,primeiro:71,ultimo:100}});
  assert.equal(padrao.final.n,30);
  for(const r of padrao.final.serie)assert.ok(r.treinoAte<r.concurso);
  assert.equal(padrao.final.serie.length,30);
  assert.equal(padrao.final.modo,padrao.escolha.modo);
});
test('alterar o teste final não muda a estratégia escolhida nem o primeiro lote',()=>{
  const mudou=h.map(r=>r.concurso>=71?{...r,dezenas:[1,2,3,4,5,6]}:r);
  const outro=terminar(api.intAuditar('mega-sena',mudou,op));
  assert.deepEqual(plain(outro.escolha),plain(padrao.escolha));
  assert.deepEqual(plain(outro.final.serie[0].jogos),plain(padrao.final.serie[0].jogos));
  assert.equal(outro.final.serie[0].assinaturaTreino,padrao.final.serie[0].assinaturaTreino);
  assert.deepEqual(plain(outro.comparacao.map(l=>l.selecao)),plain(padrao.comparacao.map(l=>l.selecao)));
});
test('avaliação reproduzível e insensível à ordem dos registros de entrada',()=>{
  const antes=JSON.stringify(h);
  assert.deepEqual(plain(terminar(api.intAuditar('mega-sena',h.slice().reverse(),op))),plain(padrao));
  assert.equal(JSON.stringify(h),antes);
});
test('referências não multiplicam concursos ou custo e histogramas contam lotes',()=>{
  assert.equal(padrao.custoPorEstrategia,30*3*6);
  assert.equal(padrao.final.n,30);
  assert.equal(padrao.final.faixas.reduce((s,r)=>s+r.concursos,0),30);
  assert.ok(Math.abs(padrao.final.faixas.reduce((s,r)=>s+r.referencia,0)-30)<1e-8);
  assert.equal(padrao.final.recortes.reduce((s,r)=>s+r.n,0),30);
  for(const r of padrao.final.serie)assert.ok(Math.abs(r.faixasReferencia.reduce((a,b)=>a+b,0)-1)<1e-8);
});
test('mesmo custo e sorteios válidos nas oito modalidades',()=>{
  for(const [m,c] of Object.entries(api.MODALIDADES)){
    const jogos=api.audUniforme(m,c.min,3,'oito-'+m);
    assert.equal(new Set(jogos.map(x=>x.join())).size,3);
    for(const ds of jogos){assert.equal(ds.length,c.min);assert.equal(new Set(ds).size,c.min);assert.ok(ds.every(d=>d>=c.base&&d<c.base+c.N));}
    const r=api.audResumo(jogos,historico(m,1)[0].dezenas);
    assert.ok(r.media>=0&&r.media<=c.k);assert.ok(r.melhor>=r.media&&r.melhor<=c.k);
  }
  const ampliado=terminar(api.intAuditar('mega-sena',h,{...op,tam:7}));
  assert.equal(ampliado.custoPorEstrategia,30*3*42);
  const zero=api.audUniforme('lotomania',50,10,'zero').some(ds=>ds.includes(0));assert.equal(zero,true);
});
test('lacunas e concursos conflitantes não são escondidos',()=>{
  const sem=h.filter(r=>r.concurso!==55);
  assert.equal(api.audBase('mega-sena',sem).consecutivos.length,45);
  assert.throws(()=>terminar(api.intAuditar('mega-sena',sem,op)),/consecutivos/);
  const conflito=[...h,{...h[54],dezenas:[1,2,3,4,5,6]}];
  assert.equal(api.audBase('mega-sena',conflito).conflitos,1);
  assert.throws(()=>terminar(api.intAuditar('mega-sena',conflito,op)),/consecutivos/);
  assert.deepEqual(plain(terminar(api.intAuditar('mega-sena',[...h,h[0]],op))).escolha,plain(padrao.escolha));
});
test('parâmetros impossíveis são recusados antes de executar simulações',()=>{
  for(const opc of [{tam:5},{quantidade:0},{quantidade:11},{replicas:0},{replicas:65},{concursos:29},{concursos:61},{metrica:'lucro'}])
    assert.throws(()=>terminar(api.intAuditar('mega-sena',h,opc)));
  assert.throws(()=>terminar(api.intAuditar('invalida',h)));
});
test('seleção usa só ganhos anteriores e mantém o acaso em empate',()=>{
  const linha=v=>Array.from({length:20},()=>({valor:{melhor:v},referencia:{melhor:2}}));
  assert.equal(api.audSelecionar({cobertura:linha(2),equilibrado:linha(2)},'melhor').modo,'uniforme');
  assert.equal(api.audSelecionar({cobertura:linha(1),equilibrado:linha(3)},'melhor').modo,'equilibrado');
});
test('incerteza e estabilidade distinguem ausência, efeito consistente e reversão',()=>{
  const serie=xs=>xs.map((d,i)=>({concurso:i+1,valor:{melhor:3+d},referencia:{melhor:3}}));
  const nulo=api.audDiagnostico(serie(Array(30).fill(0)),'melhor','nulo');
  assert.deepEqual(plain(nulo.intervalo),[0,0]);assert.equal(nulo.estavel,false);
  const positivo=api.audDiagnostico(serie(Array(30).fill(1)),'melhor','positivo');
  assert.deepEqual(plain(positivo.intervalo),[1,1]);assert.equal(positivo.estavel,true);
  const reversao=api.audDiagnostico(serie([...Array(20).fill(1),...Array(10).fill(-1)]),'melhor','reversao');
  assert.equal(reversao.estavel,false);assert.equal(reversao.positivos,2);
});
test('pesquisa adaptativa não considera inversão de sinal uma hipótese estável',()=>{
  const direta=api.pesquisaEstabilidade([.7,.6,.65,.72],.62);assert.equal(direta.consistente,true);assert.equal(direta.testeCoerente,true);
  const inversa=api.pesquisaEstabilidade([.3,.4,.35,.28],.38);assert.equal(inversa.consistente,true);assert.equal(inversa.testeCoerente,true);
  const trocada=api.pesquisaEstabilidade([.7,.3,.7,.3],.7);assert.equal(trocada.consistente,false);assert.ok(trocada.margem<0);
  assert.equal(api.pesquisaEstabilidade([.7,.6,.65,.72],.4).testeCoerente,false);
  assert.equal(api.pesquisaEstabilidade([.5,.5],.5).consistente,false);
  assert.equal(api.pesquisaEstabilidade([],.8).consistente,false);
});
test('aptidão penaliza reversões mesmo com AUC alto em valor absoluto',()=>{
  const rows=[0,1,0,1,0,1,0,1],X=rows.map(x=>[x]);
  const dados={X,y:[0,1,0,1,1,0,1,0],recortes:[[0,1],[2,3],[4,5],[6,7]]};
  const h={genes:[{primitivo:0,peso:1,transformacao:'linear'}]};
  assert.ok(api.aptidao(h,dados).valor<0);
});
test('relatório revela limites, amostra, faixas e neutraliza conteúdo HTML',()=>{
  const texto=api.audRenderResultado({...padrao,semente:'<img src=x onerror=alert(1)>'});
  assert.match(texto,/32 referências|8 lotes aleatórios/);assert.match(texto,/30 concursos/);
  assert.match(texto,/Zero ocorrências/);assert.match(texto,/não corrige novas tentativas/);
  assert.ok(!texto.includes('<img src=x'));
  assert.match(api.vereditoPesquisa({significativo:true,sobreviveu:false}),/não manteve/);
});

test('protocolo completo mantém custos, amostra e limites nas oito modalidades',()=>{
  for(const [m,c] of Object.entries(api.MODALIDADES)){
    const r=terminar(api.intAuditar(m,historico(m,90),{...op,quantidade:1}));
    assert.equal(r.custoPorEstrategia,30*c.preco);
    assert.equal(r.final.n,30);
    assert.equal(r.final.faixas.reduce((a,b)=>a+b.concursos,0),30);
    assert.ok(Number.isFinite(r.final.delta));
    for(const x of r.final.serie){assert.ok(x.treinoAte<x.concurso);assert.equal(x.jogos[0].length,c.min);}
  }
});

test('pesquisa antiga perde conclusão em cache sem apagar sua população',()=>{
  const antigo={geracao:3,populacao:[{genes:[]}],assinatura:'90:100',conclusao:{sobreviveu:true}};
  const atual={versaoAnalitica:'4.13',conclusao:{sobreviveu:false},assinatura:'90:100'};
  const m=api.pesquisaMigrar({antigo,atual});
  assert.equal(m.antigo.conclusao,null);assert.equal(m.antigo.assinatura,null);assert.equal(m.antigo.geracao,3);assert.equal(m.antigo.populacao.length,1);
  assert.equal(m.atual.conclusao.sobreviveu,false);assert.equal(m.atual.assinatura,'90:100');
});

test('seleção ampliada rejeita um ganho médio que se inverte no último período',()=>{
  const linha=xs=>xs.map((d,i)=>({concurso:i+1,valor:{melhor:3+d},referencia:{melhor:3}}));
  const instavel=linha([...Array(60).fill(2),...Array(30).fill(-.2)]),zero=linha(Array(90).fill(0));
  assert.equal(api.audSelecionar({cobertura:instavel,equilibrado:zero},'melhor').modo,'cobertura');
  const r=api.audSelecionarRobusto({cobertura:instavel,equilibrado:zero},'melhor','robusto');
  assert.equal(r.modo,'uniforme');assert.equal(r.candidatos[0].apto,false);
  const estavel=linha(Array(90).fill(.25));
  assert.equal(api.audSelecionarRobusto({cobertura:instavel,equilibrado:estavel},'melhor','robusto').modo,'equilibrado');
});

test('seleção ampliada mantém referência quando não há diferença ou há incerteza',()=>{
  const linha=xs=>xs.map((d,i)=>({concurso:i+1,valor:{media:3+d},referencia:{media:3}}));
  const zero=linha(Array(90).fill(0));
  assert.equal(api.audSelecionarRobusto({cobertura:zero,equilibrado:zero},'media','zero').modo,'uniforme');
  const fraca=linha(Array.from({length:90},(_,i)=>i%30===0?.1:0));
  assert.equal(api.audSelecionarRobusto({cobertura:fraca,equilibrado:zero},'media','fraca').modo,'uniforme');
});

test('90 concursos de seleção ficam separados do teste e não enxergam seu futuro',()=>{
  const hist=historico('mega-sena',160),opc={...op,rigor:'ampliado',quantidade:1};
  const r=terminar(api.intAuditar('mega-sena',hist,opc));
  assert.deepEqual(plain(r.etapas),{treino:{n:40,primeiro:1,ultimo:40},selecao:{n:90,primeiro:41,ultimo:130},teste:{n:30,primeiro:131,ultimo:160}});
  const outro=terminar(api.intAuditar('mega-sena',hist.map(x=>x.concurso>130?{...x,dezenas:[1,2,3,4,5,6]}:x),opc));
  assert.deepEqual(plain(outro.escolha),plain(r.escolha));
  assert.deepEqual(plain(outro.final.serie[0].jogos),plain(r.final.serie[0].jogos));
  assert.equal(r.final.n,30);assert.equal(r.custoPorEstrategia,30*6);
  assert.deepEqual(plain(terminar(api.intAuditar('mega-sena',hist.slice().reverse(),opc))),plain(r));
  assert.throws(()=>terminar(api.intAuditar('mega-sena',hist.slice(1),opc)),/160 concursos/);
  assert.throws(()=>terminar(api.intAuditar('mega-sena',hist,{...opc,rigor:'ignorar'})),/inválida/);
});

test('memória guarda tentativas negativas e reconhece repetição exata sem inflar contagem',()=>{
  const m1=api.audRegistrar({},padrao,'2026-09-10T10:00:00Z');
  const m2=api.audRegistrar(m1,padrao,'2026-09-10T11:00:00Z');
  assert.equal(m2.entradas.length,1);assert.equal(m2.entradas[0].repeticoes,2);
  assert.equal(m1.entradas[0].repeticoes,1);
  const m3=api.audRegistrar(m2,{...padrao,semente:'outra tentativa',status:'nao-confirmada'});
  assert.equal(m3.entradas.length,2);assert.equal(m3.entradas[1].status,'nao-confirmada');
  assert.equal(api.audCompararMemoria(m3.entradas,'mega-sena').reutilizados,30);
  assert.deepEqual(plain(api.audLerMemoria(JSON.parse(JSON.stringify(m3)))),plain(m3));
});

test('memória distingue período novo, sobreposição parcial e perda de consistência',()=>{
  const r={...padrao,status:'diferenca-exploratoria',escolha:{modo:'cobertura'}};
  let m=api.audRegistrar({},r);
  const novo={...r,status:'nao-confirmada',base:{...r.base,ultimo:115},etapas:{...r.etapas,teste:{n:30,primeiro:86,ultimo:115}}};
  m=api.audRegistrar(m,novo);
  const cmp=api.audCompararMemoria(m.entradas,'mega-sena');
  assert.equal(cmp.reutilizados,15);assert.equal(cmp.perdeuConsistencia,true);
  const independente={...novo,base:{...novo.base,ultimo:145},etapas:{...novo.etapas,teste:{n:30,primeiro:116,ultimo:145}}};
  m=api.audRegistrar(m,independente);
  assert.equal(api.audCompararMemoria(m.entradas,'mega-sena').reutilizados,0);
  assert.equal(api.audCompararMemoria(m.entradas,'lotofacil').reutilizados,0);
});

test('memória rejeita estado corrompido e tem tamanho limitado',()=>{
  for(const v of [null,[],{entradas:[null,{}, {modalidade:'__proto__'}]}])assert.equal(api.audLerMemoria(v).entradas.length,0);
  let mem={};for(let i=0;i<45;i++)mem=api.audRegistrar(mem,{...padrao,semente:'tentativa-'+i});
  assert.equal(mem.entradas.length,40);assert.equal(mem.entradas[0].semente,'tentativa-5');
  assert.ok(JSON.stringify(mem).length<80000);
  assert.equal(api.audLerMemoria({entradas:[{...mem.entradas[0],ultimo:1e10}]}).entradas.length,0);
});

test('análise ampliada funciona nas oito modalidades com amostra real e mesmo custo',()=>{
  for(const [m,c] of Object.entries(api.MODALIDADES)){
    const r=terminar(api.intAuditar(m,historico(m,160),{...op,rigor:'ampliado',quantidade:1}));
    assert.equal(r.final.n,30);assert.equal(r.etapas.selecao.n,90);
    assert.equal(r.custoPorEstrategia,30*c.preco);
    for(const x of r.final.serie){assert.ok(x.treinoAte<x.concurso);assert.equal(x.jogos[0].length,c.min);}
    const html=api.audRenderResultado(r);
    assert.match(html,/97,5%/);assert.match(html,/Por que o app fez esta escolha/);
  }
});
