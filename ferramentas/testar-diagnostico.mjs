import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const L=createRequire(import.meta.url)('../ui/lab-auto.js');
const read=m=>JSON.parse(readFileSync(new URL('../dados/'+m+'.json',import.meta.url),'utf8')).concursos;
const base=(m,rows,op={})=>L.history(m,rows,op);
const diagnosis=(m,rows,op={})=>L.frequencyDiagnosis(m,base(m,rows,op));
const near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);

test('massa binomial concorda com enumeração combinatória e permanece normalizada',()=>{
 for(const [n,p] of [[1,.1],[12,.1],[12,.6],[180,.1],[180,.6]]){
  const mass=L.binomialMass(n,p);near(L.sum(mass),1);
  mass.forEach((v,k)=>near(v,L.comb(n,k)*p**k*(1-p)**(n-k),1e-9));
 }
});
test('massa em milhares de concursos mantém moda finita e probabilidade total',()=>{
 for(const p of [.1,.6]){const mass=L.binomialMass(50000,p);near(L.sum(mass),1);assert.ok(mass.every(x=>Number.isFinite(x)&&x>=0));assert.ok(mass[Math.floor(50001*p)]>0);}
});
test('Fisher bilateral coincide com enumeração hipergeométrica independente',()=>{
 for(const [a,nA,b,nB] of [[1,10,9,14],[0,30,0,60],[30,30,60,60],[28,30,3,120],[18,30,36,60]]){
  const total=a+b,den=L.comb(nA+nB,total),lo=Math.max(0,total-nB),hi=Math.min(nA,total);
  const probs=Array.from({length:hi-lo+1},(_,i)=>L.comb(nA,i+lo)*L.comb(nB,total-i-lo)/den);
  const expected=L.sum(probs.filter(x=>x<=probs[a-lo]*(1+1e-10)));
  near(L.fisherExact(a,nA,b,nB),expected,1e-9);near(L.fisherExact(b,nB,a,nA),expected,1e-9);
 }
});
test('base vazia não inventa frequência zero observada ou p-valor',()=>{
 const d=diagnosis('mega-sena',[]);assert.equal(d.n,0);assert.equal(d.comparacoes,0);assert.equal(d.estado,'amostra-insuficiente');
 assert.equal(d.linhas.length,60);assert.ok(d.linhas.every(x=>x.percentual===null&&x.ic===null&&x.p===null&&x.pAjustado===null));
});
test('base curta mostra referência mas não aciona teste conjunto',()=>{
 const d=diagnosis('lotofacil',read('lotofacil').slice(0,29));assert.equal(d.comparacoes,0);assert.equal(d.sinais,0);assert.equal(d.janela.disponivel,false);
 assert.ok(d.linhas.every(x=>x.esperado===.6&&x.esperadoVezes===29*.6&&x.p===null));
});
test('Mega-Sena e Lotofácil usam todas as dezenas, não só as da combinação escolhida',()=>{
 for(const [m,N,k] of [['mega-sena',60,6],['lotofacil',25,15]]){
  const rows=read(m).slice(-180),d=diagnosis(m,rows);
  assert.equal(d.linhas.length,N);assert.equal(L.sum(d.linhas.map(x=>x.vezes)),rows.length*k);
  assert.ok(d.linhas.every(x=>x.esperado===k/N));assert.equal(d.comparacoes,2*N);
  assert.deepEqual(L.analyze(m,{dezenas:rows[0].dezenas},rows).diagnosticoFrequencia,L.analyze(m,{dezenas:rows[1].dezenas},rows).diagnosticoFrequencia);
 }
});
test('janelas recente e anterior são separadas e limitadas ao trecho consecutivo final',()=>{
 const rows=read('mega-sena').slice(-180),d=diagnosis('mega-sena',rows);
 assert.equal(d.janela.recente.n,30);assert.equal(d.janela.anterior.n,120);
 assert.equal(d.janela.anterior.concursos[1]+1,d.janela.recente.concursos[0]);
 const one=d.linhas[0];assert.equal(one.recente.vezes,rows.slice(-30).filter(r=>r.dezenas.includes(1)).length);
 assert.equal(one.recente.anteriorVezes,rows.slice(-150,-30).filter(r=>r.dezenas.includes(1)).length);
});
test('89 concursos finais impedem comparar janelas; 90 permitem',()=>{
 const rows=read('mega-sena').slice(-180),gap=rows.filter((_,i)=>i!==90),d=diagnosis('mega-sena',gap);
 assert.equal(d.janela.consecutivosFinais,89);assert.equal(d.janela.disponivel,false);assert.equal(d.comparacoes,60);
 const ready=diagnosis('mega-sena',rows.slice(-90));assert.equal(ready.janela.disponivel,true);assert.equal(ready.janela.anterior.n,60);
});
test('p-valores corrigidos usam Holm conjunto das duas famílias, com dependência permitida',()=>{
 const d=diagnosis('lotofacil',read('lotofacil').slice(-150));
 const entries=d.linhas.flatMap(x=>[{raw:x.p,adj:x.pAjustado},{raw:x.recente.p,adj:x.recente.pAjustado}]);
 const ordered=entries.slice().sort((a,b)=>a.raw-b.raw);let previous=0;
 ordered.forEach((x,i)=>{previous=Math.max(previous,Math.min(1,(ordered.length-i)*x.raw));near(x.adj,previous);assert.ok(x.adj>=x.raw);});
 assert.equal(d.sinais,d.linhas.filter(x=>x.sinalTotal||x.sinalRecente).length);
});
test('corte de concurso não usa futuro nem na massa nem nas janelas',()=>{
 const rows=read('mega-sena').slice(-200),cut=rows[180].concurso,op={antesDe:cut};
 const a=diagnosis('mega-sena',rows,op),b=diagnosis('mega-sena',rows.map(r=>r.concurso>=cut?{...r,dezenas:[1,2,3,4,5,6]}:r),op);
 assert.deepEqual(a,b);assert.equal(a.n,180);assert.equal(a.janela.recente.concursos[1],cut-1);
});
test('cache não permite adulterar a leitura seguinte e não modifica metadados',()=>{
 const b=base('mega-sena',read('mega-sena').slice(-150)),snapshot=structuredClone(b.meta),d=L.frequencyDiagnosis('mega-sena',b);
 d.linhas[0].vezes=123456;d.janela.recente.n=999;const again=L.frequencyDiagnosis('mega-sena',b);
 assert.notEqual(again.linhas[0].vezes,123456);assert.equal(again.janela.recente.n,30);assert.deepEqual(b.meta,snapshot);
});
test('especial anual não inventa janelas nem inclui resultados comuns',()=>{
 const rows=read('mega-sena'),d=diagnosis('mega-da-virada',rows);assert.equal(d.estado,'evento-anual');assert.equal(d.comparacoes,0);assert.deepEqual(d.linhas,[]);
});
test('Super Sete conta posições e não mistura dígitos de colunas diferentes',()=>{
 // Fixture explícita de unidade; não é acervo nem análise real.
 const rows=Array.from({length:90},(_,i)=>({modalidade:'super-sete',concurso:i+1,colunas:[[1],[1],[2],[3],[4],[5],[6]]}));
 const d=diagnosis('super-sete',rows);assert.equal(d.linhas.length,70);assert.equal(d.comparacoes,140);
 assert.equal(d.linhas.find(x=>x.dezena==='1:1').vezes,90);assert.equal(d.linhas.find(x=>x.dezena==='2:1').vezes,90);
 assert.equal(d.linhas.find(x=>x.dezena==='3:1').vezes,0);assert.ok(d.linhas.every(x=>x.esperado===.1));
});
test('recomendação conserva conflitos e inválidos na leitura operacional original',()=>{
 const rows=read('mega-sena').slice(-10),conflict={...rows[0],dezenas:[1,2,3,4,5,6]},invalid={...rows[1],concurso:99999,dezenas:[1]},raw=[...rows,conflict,invalid];
 const g=L.autoRecommend('mega-sena',raw,{}, {agora:'2026-10-10T12:00:00Z'});
 assert.equal(g.base.conflitos,1);assert.equal(g.principal.analise.saudeBase.conflitos,1);assert.equal(g.principal.analise.saudeBase.invalidos,1);
 assert.equal(g.principal.analise.diagnosticoFrequencia.n,g.base.n);
});
const ctx=vm.createContext({LL18:L,console,setTimeout,clearTimeout,LL18Check:{ticket:()=>'',board:()=>'',legend:()=>''}});
for(const f of ['lab-ui.js','lab-auto-ui.js'])vm.runInContext(readFileSync(new URL('../ui/'+f,import.meta.url),'utf8'),ctx);
test('diagnóstico compartilhado tem incerteza e escapa conteúdo externo',()=>{
 const d=diagnosis('lotofacil',read('lotofacil').slice(-100)),html=ctx.LL18UI.frequencyDiagnosisView(d);
 assert.match(html,/Diagnóstico de frequência e estabilidade/);assert.match(html,/IC 95% individual/);assert.match(html,/Holm aplicado conjuntamente/);assert.match(html,/Não é um ranking para apostar/);
 d.mensagem='<script>alert(1)</script>';d.linhas[0].dezena='<img onerror=alert(1)>';
 assert.doesNotMatch(ctx.LL18UI.frequencyDiagnosisView(d),/<script|<img/);
});
test('renderização automática inclui diagnóstico e não reescreve a rodada',()=>{
 const g=L.autoRecommend('lotofacil',read('lotofacil').slice(-10),{}, {agora:'2026-10-10T12:00:00Z'}),round=structuredClone(g.automatico.rodada);
 assert.match(ctx.LL18Auto.render(g),/Diagnóstico de frequência e estabilidade/);assert.deepEqual(g.automatico.rodada,round);
});
test('frequência recente de uma combinação não atravessa lacuna e distingue total sobreposto',()=>{
 const rows=read('mega-sena').slice(-100),gap=rows.filter((_,i)=>i!==84),b=base('mega-sena',gap),f=L.frequency('mega-sena',{dezenas:[1,2,3,4,5,6]},b);
 assert.equal(f[0].janelaRecente,15);near(f[0].frequenciaRecente,rows.slice(-15).filter(r=>r.dezenas.includes(1)).length/15);
 near(f[0].frequenciaLonga,b.rows.filter(r=>r.dezenas.includes(1)).length/b.rows.length);
});
test('diagnóstico binomial bilateral usa contagem observada, não cauda escolhida depois',()=>{
 const rows=read('lotofacil').slice(-30),d=diagnosis('lotofacil',rows);
 for(const x of d.linhas){
  const mass=Array.from({length:31},(_,k)=>L.comb(30,k)*.6**k*.4**(30-k));
  near(x.p,L.sum(mass.filter(v=>v<=mass[x.vezes]*(1+1e-10))),1e-10);
 }
});
