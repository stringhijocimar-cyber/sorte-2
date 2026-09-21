import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),ctx=vm.createContext({console});
vm.runInContext(html.slice(html.indexOf('<script>')+8,html.indexOf('(function iniciar(){')),ctx);
const api=vm.runInContext('({MODALIDADES,recAnalisar,recGrupos,recCoberturaRecente,recValidarDezenas,combinacoes})',ctx);
const plain=x=>JSON.parse(JSON.stringify(x));
const jogo=[2,4,35,46,54,60];
const linha=(n,ds,m='mega-sena')=>({modalidade:m,concurso:n,data:'2026-01-01',dezenas:ds});
const hist=[linha(1,jogo),linha(2,[2,4,35,46,54,59]),linha(3,[2,4,35,46,57,58]),linha(4,[2,4,35,55,56,57]),linha(5,[2,4,50,51,52,53]),linha(6,[1,3,5,7,9,11]),linha(7,jogo)];

test('contagens exatas e acumuladas não confundem concursos com subconjuntos',()=>{
  const r=api.recAnalisar('mega-sena',jogo,hist);
  assert.deepEqual(plain(r.faixas.map(f=>f.exatos.vezes)),[1,0,1,1,1,1,2]);
  assert.equal(r.faixas.reduce((n,f)=>n+f.exatos.vezes,0),hist.length);
  assert.equal(r.faixas[5].minimos.vezes,3);assert.equal(r.faixas[4].minimos.vezes,4);
  const quintetos=api.recGrupos(r,5);assert.equal(quintetos.quantidade,6);
  assert.equal(quintetos.linhas.find(x=>x.dezenas.join()==='2,4,35,46,54').vezes,3);
  assert.equal(quintetos.categorias.find(x=>x.vezes===2).grupos,5);
  assert.equal(quintetos.categorias.find(x=>x.vezes===3).grupos,1);
});
test('o concurso analisado e o futuro são excluídos antes de qualquer medida',()=>{
  const antes=api.recAnalisar('mega-sena',jogo,hist,{antesDe:7});
  assert.equal(antes.base.hist.length,6);assert.equal(antes.faixas[6].exatos.vezes,1);
  const novo=hist.map(r=>r.concurso>=7?{...r,dezenas:[1,3,5,7,9,11]}:r).concat(linha(8,jogo));
  assert.deepEqual(plain(api.recAnalisar('mega-sena',jogo,novo,{antesDe:7})),plain(antes));
  assert.equal(api.recAnalisar('mega-sena',jogo,hist,{antesDe:1}).base.hist.length,0);
});
test('intervalos usam distância entre concursos; ausência atual não entra na média',()=>{
  const r=api.recAnalisar('mega-sena',jogo,hist),a=r.faixas[6].exatos;
  assert.equal(a.intervalos,1);assert.equal(a.intervaloMedio,6);assert.equal(a.intervaloMaximo,6);assert.equal(a.desdeUltima,0);
  const parcial=api.recAnalisar('mega-sena',jogo,hist.slice(0,6));
  assert.equal(parcial.faixas[6].exatos.desdeUltima,5);assert.equal(parcial.faixas[6].exatos.intervaloMedio,null);
});
test('lacunas invalidam intervalos que as atravessam sem apagar contagens observadas',()=>{
  const sem=hist.filter(r=>r.concurso!==4),r=api.recAnalisar('mega-sena',jogo,sem);
  assert.equal(r.base.lacunas,1);assert.equal(r.faixas[6].exatos.vezes,2);
  assert.equal(r.faixas[6].exatos.intervalos,0);assert.equal(r.faixas[6].exatos.intervalosIncompletos,1);
  assert.equal(r.faixas[5].exatos.desdeUltima,null);assert.equal(r.faixas[6].exatos.desdeUltima,0);
  const ponta=api.recAnalisar('mega-sena',jogo,hist,{antesDe:10});
  assert.equal(ponta.base.faltantesNoFinal,2);assert.equal(ponta.faixas[6].exatos.desdeUltima,null);
});
test('duplicatas, conflitos, registros inválidos e outras modalidades não inflacionam ocorrências',()=>{
  const bag=[...hist,linha(1,jogo.slice().reverse()),linha(2,[1,3,5,7,9,11]),linha(9,[2,2,3,4,5,6]),linha(30,[1,2,3,4,5],'quina')];
  const r=api.recAnalisar('mega-sena',jogo,bag);
  assert.equal(r.base.hist.length,6);assert.equal(r.base.conflitos,1);assert.equal(r.base.invalidos,1);
  assert.equal(r.faixas[5].exatos.vezes,0);assert.equal(r.faixas[6].exatos.vezes,2);
  assert.deepEqual(plain(api.recAnalisar('mega-sena',jogo,bag.slice().reverse())),plain(r));
});
test('probabilidade teórica não muda por a combinação ter ou não aparecido',()=>{
  const a=api.recAnalisar('mega-sena',jogo,hist),b=api.recAnalisar('mega-sena',[1,3,5,7,9,11],hist);
  assert.deepEqual(plain(a.faixas.map(x=>x.pExata)),plain(b.faixas.map(x=>x.pExata)));
  assert.ok(Math.abs(a.faixas[6].pExata-1/50063860)<1e-14);
  assert.ok(Math.abs(a.faixas.reduce((s,x)=>s+x.pExata,0)-1)<1e-12);
});
test('subconjuntos conferem com contagem bruta independente e identidade combinatória',()=>{
  const r=api.recAnalisar('mega-sena',jogo,hist);
  for(let tam=1;tam<=6;tam++){
    const g=api.recGrupos(r,tam);assert.equal(g.quantidade,api.combinacoes(6,tam));
    for(const sub of g.linhas)assert.equal(sub.vezes,hist.filter(x=>sub.dezenas.every(d=>x.dezenas.includes(d))).length);
    const esperada=hist.reduce((s,x)=>s+api.combinacoes(x.dezenas.filter(d=>jogo.includes(d)).length,tam),0);
    assert.equal(g.linhas.reduce((s,x)=>s+x.vezes,0),esperada);
    assert.equal(g.categorias.reduce((s,x)=>s+x.grupos,0),g.quantidade);
  }
});
test('segundo sorteio da Dupla Sena é separado; ausência não vira zero acertos',()=>{
  const h=[{...linha(1,[1,2,3,4,5,6],'dupla-sena'),dezenasSegundoSorteio:[10,11,12,13,14,15]},linha(2,[1,2,3,4,5,6],'dupla-sena')];
  assert.equal(api.recAnalisar('dupla-sena',[1,2,3,4,5,6],h).faixas[6].exatos.vezes,2);
  const r=api.recAnalisar('dupla-sena',[10,11,12,13,14,15],h,{sorteio:2});
  assert.equal(r.base.hist.length,1);assert.equal(r.base.invalidos,1);assert.equal(r.faixas[6].exatos.vezes,1);
});
test('oito modalidades, volantes ampliados e zero da Lotomania mantêm a contagem correta',()=>{
  for(const [m,c] of Object.entries(api.MODALIDADES)){
    const ds=Array.from({length:c.min},(_,i)=>i+c.base),alvo=Array.from({length:c.k},(_,i)=>i+c.base);
    const r=api.recAnalisar(m,ds,[linha(1,alvo,m)]);
    assert.equal(r.faixas[c.k].exatos.vezes,1);
    assert.equal(r.faixas.reduce((s,x)=>s+x.exatos.vezes,0),1);
    assert.ok(Math.abs(r.faixas.reduce((s,x)=>s+x.pExata,0)-1)<1e-10);
  }
  const r=api.recAnalisar('mega-sena',[...jogo,1],hist);
  assert.ok(r.faixas[6].pExata>1/50063860);
});
test('limite evita explosão combinatória sem apresentar amostragem como contagem exata',()=>{
  const ds=Array.from({length:50},(_,i)=>i),r=api.recAnalisar('lotomania',ds,[]);
  assert.throws(()=>api.recGrupos(r,20),/grupos/);
  assert.equal(api.recGrupos(r,2).quantidade,1225);
});
test('dezenas repetidas, fora do universo e parâmetros inválidos são recusados',()=>{
  for(const ds of [[],[2,2,3,4,5,6],[0,2,3,4,5,6],[61],[1.5],'<img src=x>'])assert.throws(()=>api.recAnalisar('mega-sena',ds,hist));
  for(const op of [{antesDe:0},{antesDe:1.5},{sorteio:2}])assert.throws(()=>api.recAnalisar('mega-sena',jogo,hist,op));
  assert.throws(()=>api.recAnalisar('__proto__',jogo,hist));
});
test('cobertura em vários concursos distingue união de dezenas e coincidência no mesmo sorteio',()=>{
  const h=[linha(1,[2,4,35,1,3,5]),linha(2,[46,54,60,7,9,11])],r=api.recAnalisar('mega-sena',jogo,h);
  assert.equal(r.faixas[6].exatos.vezes,0);assert.equal(api.recCoberturaRecente(r)[6],2);assert.equal(api.recCoberturaRecente(r)[3],1);
  const lacuna=api.recAnalisar('mega-sena',jogo,[h[0],{...h[1],concurso:3}]);
  assert.equal(api.recCoberturaRecente(lacuna)[6],null);
});
