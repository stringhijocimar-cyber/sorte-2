import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Carrega o motor entregue ao usuário. Só a inicialização do DOM fica de fora.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const ctx=vm.createContext({console});
vm.runInContext(html.slice(html.indexOf('<script>')+8,html.indexOf('(function iniciar(){')),ctx);
const executar=(s)=>vm.runInContext(s,ctx);
const api=executar('({MODALIDADES,intGerarLote,intHistorico,intFrequencias,intDistribuicao,intChancePrincipal,custoDoJogo,intComparar,intCsv,intIncerteza})');
const normal=v=>JSON.parse(JSON.stringify(v));
const perto=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<t,`${a} ≠ ${b}`);
const terminar=g=>{let r;do{r=g.next();}while(!r.done);return r.value;};
const historico=(m,n=70)=>{
  const c=api.MODALIDADES[m];
  // Fixture independente do novo gerador: deslocamento de uma permutação.
  return Array.from({length:n},(_,i)=>({modalidade:m,concurso:i+1,data:'2026-01-01',
    dezenas:Array.from({length:c.N},(_,d)=>(d*17+i*13)%c.N+c.base).slice(0,c.k).sort((a,b)=>a-b)}));
};

test('preços oficiais, volantes fixos e combinações ampliadas',()=>{
  perto(api.custoDoJogo('mega-sena',6),6);perto(api.custoDoJogo('mega-sena',7),42);
  perto(api.custoDoJogo('lotofacil',16),56);perto(api.custoDoJogo('dupla-sena',6),3);
  perto(api.custoDoJogo('lotomania',50),3);perto(api.custoDoJogo('timemania',10),3.5);
});
for(const [m,c] of Object.entries(api.MODALIDADES)){
  test(`${m}: distribuição normalizada, média e chance principal`,()=>{
    for(const tam of new Set([c.min,c.max])){
      const dist=api.intDistribuicao(m,tam);
      perto(dist.reduce((s,r)=>s+r.p,0),1);
      perto(dist.reduce((s,r)=>s+r.p*r.acertos,0),tam*c.k/c.N);
    }
  });
  test(`${m}: lotes válidos, únicos e reprodutíveis nos três critérios`,()=>{
    for(const modo of ['uniforme','cobertura','equilibrado']){
      for(const tam of new Set([c.min,c.max])){
        const o={modo,semente:'teste-0',fixas:[c.base],excluidas:[c.base+c.N-1],historico:historico(m)};
        const a=api.intGerarLote(m,tam,6,o),b=api.intGerarLote(m,tam,6,o);
        assert.deepEqual(normal(a.jogos),normal(b.jogos));
        assert.equal(new Set(a.jogos.map(ds=>ds.join())).size,6);
        for(const ds of a.jogos){
          assert.equal(ds.length,tam);assert.equal(new Set(ds).size,tam);
          assert.ok(ds.includes(c.base));assert.ok(!ds.includes(c.base+c.N-1));
          assert.ok(ds.every(d=>d>=c.base&&d<c.base+c.N));
        }
        perto(a.metricas.custo,6*api.custoDoJogo(m,tam));
        assert.equal(a.modelo.origem,tam===c.k?'histórico':'referência aleatória do mesmo tamanho');
      }
    }
  });
}
test('chances publicadas de Mega-Sena e +Milionária; simetria da Lotomania',()=>{
  perto(1/api.intChancePrincipal('mega-sena',6),50063860,1e-5);
  perto(1/api.intChancePrincipal('mais-milionaria',6),238360500,1e-5);
  const lot=api.intDistribuicao('lotomania',50);
  perto(lot[0].p,lot[20].p);assert.equal(Math.floor(1/lot[20].p),11372635);
});
test('orçamento jamais excedido, centavos e restrições impossíveis',()=>{
  const r=api.intGerarLote('lotofacil',15,10,{semente:0,orcamento:10.49});
  assert.equal(r.jogos.length,2);assert.equal(r.metricas.custo,7);
  assert.equal(api.intGerarLote('lotofacil',15,10,{orcamento:10.5}).jogos.length,3);
  for(const o of [{orcamento:0},{orcamento:-1},{orcamento:'x'}, {fixas:'1',excluidas:'1'},
    {fixas:'1 2 3 4 5 6 7'},{fixas:'-1'}, {excluidas:'61'},{fixas:'1.5'},
    {fixas:'1 2 3 4 5 6'},{excluidas:Array.from({length:55},(_,i)=>i+1)}]){
    assert.throws(()=>api.intGerarLote('mega-sena',6,3,o));
  }
  for(const q of [0,-1,1.2,61,NaN]) assert.throws(()=>api.intGerarLote('mega-sena',6,q));
});
test('enumeração completa com universo restrito e zero da Lotomania',()=>{
  const excluidas=Array.from({length:53},(_,i)=>i+8);
  const r=api.intGerarLote('mega-sena',6,7,{excluidas,semente:0});
  assert.equal(new Set(r.jogos.map(ds=>ds.join())).size,7);
  const lot=api.intGerarLote('lotomania',50,1,{fixas:Array.from({length:50},(_,i)=>i)});
  assert.equal(lot.jogos[0][0],0);assert.equal(lot.jogos[0].length,50);
});
test('histórico ordenado; conflito, duplicação e registros inválidos não contam como evidência',()=>{
  const h=historico('mega-sena',10), antes=JSON.stringify(h);
  const r=api.intHistorico('mega-sena',[...h.slice().reverse(),h[0],{...h[1],dezenas:[1,2,3,4,5,6]},
    {...h[2],concurso:'inválido'},{...h[3],dezenas:[1,1,2,3,4,5]}]);
  assert.equal(r.hist.length,9);assert.equal(r.duplicados,2);assert.equal(r.invalidos,2);
  assert.equal(r.conflitos,1);assert.equal(r.lacunas,1);assert.equal(r.hist[0].concurso,1);
  assert.equal(JSON.stringify(h),antes);
  assert.equal(api.intHistorico('mega-sena',h,5).hist[0].concurso,6);
});
test('frequências e Wilson de referência conhecida',()=>{
  const h=Array.from({length:10},(_,i)=>({dezenas:i<5?[1,2,3,4,5,6]:[7,8,9,10,11,12]}));
  const d=api.intFrequencias('mega-sena',h)[0];
  assert.equal(d.vezes,5);assert.equal(d.atraso,5);perto(d.intervalo[0],.236593,.000001);
  perto(d.intervalo[1],.763407,.000001);
});
test('diversidade reduz a sobreposição em um conjunto de sementes, sem pesos de popularidade',()=>{
  let uniforme=0,cobertura=0;
  for(let s=0;s<12;s++){
    uniforme+=api.intGerarLote('mega-sena',6,10,{modo:'uniforme',semente:s}).metricas.sobreposicao;
    cobertura+=api.intGerarLote('mega-sena',6,10,{modo:'cobertura',semente:s}).metricas.sobreposicao;
  }
  assert.ok(cobertura<uniforme,`${cobertura} >= ${uniforme}`);
});
test('comparador não usa alvo nem futuro para montar os jogos e respeita a semente',()=>{
  const h=historico('mega-sena',55),o={concursos:10,quantidade:2,semente:'auditoria'};
  const a=terminar(api.intComparar('mega-sena',h,o));
  const b=terminar(api.intComparar('mega-sena',h,o));
  assert.deepEqual(normal(a),normal(b));
  const alterado=h.map(r=>r.concurso>=46?{...r,dezenas:[1,2,3,4,5,6]}:r);
  const f=terminar(api.intComparar('mega-sena',alterado,o));
  for(let i=0;i<a.linhas.length;i++){
    assert.deepEqual(normal(a.linhas[i].serie[0].jogos),normal(f.linhas[i].serie[0].jogos));
    for(const r of a.linhas[i].serie) assert.ok(r.treinoAte<r.concurso);
  }
  for(const r of a.linhas.filter(l=>l.p!==undefined)){
    assert.ok(r.pAjustado>=r.p);assert.ok(r.pAjustado<=1);
    assert.equal(r.recortes.length,3);assert.ok(r.intervalo[0]<=r.intervalo[1]);
  }
  assert.equal(a.custo,10*2*6);
  assert.throws(()=>terminar(api.intComparar('mega-sena',h.slice(0,49))));
});
test('nenhuma diferença é tratada como vantagem; CSV mantém proveniência e neutraliza fórmulas',()=>{
  const n=api.intIncerteza(Array(30).fill(0),'nulo');
  assert.equal(n.p,1);assert.deepEqual(normal(n.intervalo),[0,0]);
  const r=api.intGerarLote('mega-sena',6,1,{semente:'=HYPERLINK("x")'}),csv=api.intCsv(r);
  assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(csv.includes('Assinatura'));assert.ok(csv.includes('Custo estimado'));
});
