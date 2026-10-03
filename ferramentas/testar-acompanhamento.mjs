import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const storage=new Map();
function app(){
 const ctx=vm.createContext({console,setTimeout:()=>0,clearTimeout(){},localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)}});
 vm.runInContext(readFileSync(new URL('../ui/lab-core.js',import.meta.url),'utf8'),ctx);
 vm.runInContext(html.slice(html.indexOf('<script>')+8,html.indexOf('(function iniciar(){')),ctx);
 return vm.runInContext('({S,Guardar,planoAcompanhamento,jogoCobreResultado,resumoAcompanhamento,conferenciaAutomatica,concursosDoJogo,motivoSemConferencia,cartela,LL18_BRIDGE})',ctx);
}
const runner=vm.createContext({addEventListener(){}});
vm.runInContext(readFileSync(new URL('../runner/segundo-plano.js',import.meta.url),'utf8'),runner);
const a=app(),m='mega-sena';
const jogo=(tipo,n=3)=>({id:tipo,modalidade:m,dezenas:[1,2,3,4,5,6],data:'2026-10-01',conferencias:[],...a.planoAcompanhamento(tipo,100,n)});
const resultado=(concurso,dezenas=[1,2,3,7,8,9])=>({modalidade:m,concurso,data:'2026-10-02',dezenas});
test('concurso único, teimosinha e fixo têm início e término próprios, também no executor',()=>{
 for(const [tipo,expected] of [['unico',[100]],['teimosinha',[100,101,102]],['fixo',[100,101,102,103,50000]]]){
  const j=jogo(tipo),ns=[99,100,101,102,103,50000];
  assert.deepEqual(ns.filter(n=>a.jogoCobreResultado(j,resultado(n))),expected);
  assert.deepEqual(ns.filter(n=>runner.jogoCobre(j,n)),expected);
  assert.equal(a.jogoCobreResultado(j,{...resultado(100),modalidade:'quina'}),false);
 }
});
test('duração inválida é rejeitada, sem truncar casas decimais',()=>{
 for(const n of ['',0,1,2.5,-1,Infinity,10001])assert.throws(()=>a.planoAcompanhamento('teimosinha',100,n));
 for(const n of [0,1.2,NaN,-4])assert.throws(()=>a.planoAcompanhamento('fixo',n));
 assert.throws(()=>a.planoAcompanhamento('desconhecido',100));
 assert.equal(a.planoAcompanhamento('teimosinha',100,12).concursos,12);
});
test('fixo continua após acerto máximo, reapertura e novo resultado; excluir interrompe',()=>{
 a.S.jogos=[jogo('fixo')];a.S.teimosinhas=[];a.S.resultados=[resultado(99),resultado(100,[1,2,3,4,5,6]),resultado(101)];
 assert.equal(a.conferenciaAutomatica().novas,2);
 assert.equal(a.conferenciaAutomatica().novas,0);
 const b=app();b.S.jogos=b.Guardar.ler('jogos',[]);b.S.resultados=[resultado(102)];
 assert.equal(b.conferenciaAutomatica().novas,1);
 assert.deepEqual(Array.from(b.S.jogos[0].conferencias,x=>x.concurso),[100,101,102]);
 b.S.jogos=[];b.Guardar.gravar('jogos',[]);b.S.resultados.push(resultado(103));
 assert.equal(b.conferenciaAutomatica().novas,0);
 assert.equal(b.Guardar.ler('jogos',[]).length,0);
});
test('teimosinha mantém histórico, conta resultados ausentes e aceita correção sem duplicar',()=>{
 const j=jogo('teimosinha');a.S.jogos=[j];a.S.resultados=[resultado(100),resultado(102),resultado(103)];
 assert.equal(a.conferenciaAutomatica().novas,2);
 assert.equal(a.resumoAcompanhamento(j).pendentes,1);
 a.S.resultados=[resultado(100,[1,2,3,4,5,6]),resultado(101),resultado(102),resultado(103)];
 assert.equal(a.conferenciaAutomatica().novas,1);
 assert.equal(j.conferencias.length,3);assert.equal(j.conferencias.find(c=>c.concurso===100).acertos,6);
 const r=a.resumoAcompanhamento(j);assert.equal(r.pendentes,0);assert.equal(r.media,4);assert.equal(r.melhor,6);
 assert.equal(a.S.jogos.length,1);assert.equal(a.motivoSemConferencia(j,resultado(103)),'teimosinha terminou no 102');
});
test('jogos legados conservam concurso-alvo, faixa ou data de criação',()=>{
 const legacy={modalidade:m,data:'2026-10-02'};
 assert.equal(a.jogoCobreResultado(legacy,{...resultado(99),data:'2026-10-01'}),false);
 assert.equal(a.jogoCobreResultado(legacy,resultado(99)),true);
 assert.equal(a.jogoCobreResultado({...legacy,concursoAlvo:100,deConcurso:90,concursos:50},resultado(101)),false);
});
test('análise prospectiva mantém o concurso original da sugestão repetida',()=>{
 a.S.jogos=[{...jogo('fixo'),inteligencia:{motor:'automatico',concursoOriginal:100,geradoAte:99}}];
 const batches=a.LL18_BRIDGE.recommendationBatches();
 assert.equal(batches.length,1);assert.equal(batches[0].concursoAlvo,100);assert.equal(batches[0].geradoAte,99);
 assert.deepEqual(Array.from(batches[0].jogos[0].dezenas),[1,2,3,4,5,6]);
});
test('cartelas físicas têm grade correta e estados independentes da cor da modalidade',()=>{
 const mega=a.cartela(m,[1,2,3,4,5,6],{sorteadas:[1,2,3,7,8,9]});
 assert.equal((mega.match(/data-casa=/g)||[]).length,60);
 assert.equal((mega.match(/class="casa acertou"/g)||[]).length,3);
 assert.equal((mega.match(/class="casa sorteada"/g)||[]).length,3);
 assert.equal((mega.match(/class="casa errou"/g)||[]).length,3);
 assert.ok(mega.includes('grid-template-columns:repeat(10,1fr)'));
 const lf=a.cartela('lotofacil',[],{});
 assert.equal((lf.match(/data-casa=/g)||[]).length,25);assert.ok(lf.includes('grid-template-columns:repeat(5,1fr)'));
 assert.ok(lf.includes('não é comprovante de aposta'));
});
