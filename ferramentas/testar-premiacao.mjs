import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import L from '../ui/lab-core.js';
import {converter} from './atualizar-resultados.mjs';

const dezenas=(n,inicio=1)=>Array.from({length:n},(_,i)=>i+inicio);
const rateio=(...valores)=>valores.map((premio,i)=>({faixa:i+1,premio}));
const resultado=(n,valores,campos={})=>({concurso:10,data:'2026-11-04',origem:'caixa',dezenas:dezenas(n),rateio:rateio(...valores),...campos});
const apurar=(m,j,r)=>L.savedAward(m,{dezenas:j,...r.jogo},r);

test('Loto e Mega somam as combinações premiadas de um jogo ampliado',()=>{
 assert.deepEqual(apurar('lotofacil',dezenas(16),resultado(15,[100,10,5,2,1])),{premiado:true,premioCentavos:25000});
 assert.equal(apurar('mega-sena',dezenas(7),resultado(6,[100,10,5])).premioCentavos,16000);
});
test('Quina usa o valor da faixa, Lotomania aceita zero acertos',()=>{
 assert.equal(apurar('quina',[1,2,6,7,8],resultado(5,[100,10,5,2])).premioCentavos,200);
 assert.deepEqual(apurar('lotomania',dezenas(50,21),resultado(20,[100,10,5,4,3,2,1])),{premiado:true,premioCentavos:100});
});
test('Dupla Sena soma os rateios distintos dos dois sorteios',()=>{
 const r=resultado(6,[100,10,5,2,50,5,3,1],{dezenasSegundoSorteio:dezenas(6)});
 assert.deepEqual(apurar('dupla-sena',dezenas(6),r),{premiado:true,premioCentavos:15000});
 delete r.dezenasSegundoSorteio;
 assert.deepEqual(apurar('dupla-sena',dezenas(6),r),{premiado:true,premioCentavos:null});
});
test('+Milionária apura faixas de dezenas e trevos em cada combinação',()=>{
 const r=resultado(6,[100,10,5,4,3,2,1,1,1,1],{trevos:[1,2],jogo:{trevos:[1,2,3]}});
 assert.equal(apurar('mais-milionaria',dezenas(6),r).premioCentavos,12000);
 assert.equal(apurar('mais-milionaria',dezenas(6),{...r,jogo:{trevos:[3,4]}}).premioCentavos,1000);
 assert.deepEqual(apurar('mais-milionaria',dezenas(6),{...r,jogo:{}}),{premiado:null,premioCentavos:null});
});
test('Dia de Sorte multiplica mês por apostas simples e Timemania paga um prêmio pelo time',()=>{
 const r=resultado(7,[100,10,5,4,2.5],{mes:3,jogo:{mes:3}});
 assert.equal(apurar('dia-de-sorte',dezenas(8),r).premioCentavos,19000);
 assert.equal(apurar('dia-de-sorte',dezenas(8,8),r).premioCentavos,2000);
 assert.deepEqual(apurar('dia-de-sorte',dezenas(8,8),{...r,jogo:{}}),{premiado:null,premioCentavos:null});
 const t=resultado(7,[100,10,5,4,3,8.5],{timeNome:'GRÊMIO   / RS',jogo:{timeNome:'Gremio/RS'}});
 assert.equal(apurar('timemania',dezenas(10,8),t).premioCentavos,850);
 assert.equal(apurar('timemania',dezenas(10),t).premioCentavos,10850);
 assert.equal(apurar('timemania',dezenas(10,8),{...t,jogo:{timeNome:'Grêmio/PR'}}).premioCentavos,0);
});
test('somente rateio oficial disponível gera valor em reais',()=>{
 const r=resultado(6,[0,10,5]);
 assert.deepEqual(apurar('mega-sena',dezenas(6),r),{premiado:true,premioCentavos:null});
 assert.deepEqual(apurar('mega-sena',dezenas(6,8),r),{premiado:false,premioCentavos:0});
 assert.equal(apurar('mega-sena',dezenas(7),{...r,origemRateio:'espelho'}).premioCentavos,null);
 assert.equal(apurar('mega-sena',dezenas(6,8),{...r,rateio:[]}).premioCentavos,null);
 assert.equal(apurar('mega-sena',dezenas(6,3),{...r,rateio:rateio(10,2)}).premioCentavos,null);
 assert.equal(apurar('mega-sena',dezenas(7,2),{...r,origem:'repositorio',origemRateio:'caixa'}).premioCentavos,4500);
});
test('atualizador conserva mês, time e procedência da tabela',()=>{
 const raw={numero:10,dataApuracao:'04/11/2026',listaDezenas:dezenas(7),listaRateioPremio:[{faixa:1,valorPremio:100}]};
 assert.equal(converter({...raw,nomeTimeCoracaoMesSorte:' Março '},'dia-de-sorte').mes,3);
 const r=converter({...raw,nomeTimeCoracaoMesSorte:' AMERICA       /RN'},'timemania','espelho');
 assert.equal(r.timeNome,'AMERICA/RN');
 assert.equal(r.origemRateio,'espelho');
});

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function appDeTeste(plugin={}){
 const contexto=vm.createContext({LL18:L,Capacitor:{isNativePlatform:()=>true,
  isPluginAvailable:n=>n==='LotoLabNotificacoes',Plugins:{LotoLabNotificacoes:plugin}},
  document:{getElementById:()=>null}});
 vm.runInContext(html.slice(html.indexOf('<script>')+8,html.indexOf('(function iniciar(){')),contexto);
 return vm.runInContext(`
   S.autoAnalise=false;
   Guardar.gravar=()=>true;
   irParaTela=tela=>{S.tela=tela;};
   ({S,ganhosAcumulados,ganhoDoJogoNoConcurso,painelGanhos,importarResultadosDoAndroid,metaAbrirDestino})
 `,contexto);
}

test('Resultados soma ganhos por jogo sem duplicar apostas ou incluir acompanhamentos',()=>{
 const app=appDeTeste(),m='mega-sena';
 const a={id:'a',modalidade:m,dezenas:dezenas(6),acompanhamento:'fixo',deConcurso:10,
  apostasPagas:{10:600,11:600,12:600,99:600}};
 const b={id:'b',modalidade:m,dezenas:dezenas(6),acompanhamento:'fixo',deConcurso:10};
 app.S.jogos=[a,b];app.S.teimosinhas=[{...a}];
 const historico=[resultado(6,[100],{modalidade:m}),resultado(6,[20],{modalidade:m,concurso:11}),
  resultado(6,[],{modalidade:m,concurso:12}),...Array.from({length:43},(_,i)=>resultado(6,[50],{modalidade:m,concurso:13+i}))];
 const ganhos=app.ganhosAcumulados(m,historico);
 assert.equal(ganhos.jogos.size,1);
 assert.equal(ganhos.geral.centavos,12000);
 assert.equal(ganhos.geral.apurados,2);
 assert.equal(ganhos.geral.pendentes,1);
 assert.match(app.painelGanhos(ganhos),/R\$\s*120,00.*1 pendente/);
 const primeiro=app.ganhoDoJogoNoConcurso(a,historico[0],ganhos);
 assert.match(primeiro,/Prêmio neste concurso/);
 assert.equal(primeiro.match(/R\$\s*100,00/g)?.length,2);
 assert.match(app.ganhoDoJogoNoConcurso(b,historico[0],ganhos),/Valor em acompanhamento/);
});

test('resultado recebido com o app fechado abre offline, recebe rateio e mantém uma entrada por concurso',async()=>{
 const m='mega-sena',concurso=3051,consultadoEm=Date.parse('2026-11-05T00:15:00Z');
 const base={numero:concurso,dataApuracao:'04/11/2026',listaDezenas:['01','02','03','04','05','06']};
 let entradas=[{modalidade:m,consultadoEm,resultado:base},
  {modalidade:m,consultadoEm,resultado:{...base,numero:3052,listaDezenas:['01','01','03','04','05','06']}}];
 const app=appDeTeste({resultados:async()=>({concursos:entradas}),destino:async()=>({modalidade:m,concurso})});
 app.S.jogos=[{id:'nativo',modalidade:m,dezenas:dezenas(6),concursoAlvo:concurso,apostasPagas:{[concurso]:600}}];
 await app.metaAbrirDestino();
 assert.equal(app.S.tela,'resultados');
 assert.equal(app.S.concursoAberto,concurso);
 assert.equal(app.S.resultados.length,1);
 assert.equal(app.S.jogos[0].conferencias[0].acertos,6);
 assert.equal(app.ganhosAcumulados(m,app.S.resultados).geral.pendentes,1);
 entradas=[{modalidade:m,consultadoEm:consultadoEm+900000,resultado:{...base,
  listaRateioPremio:[{faixa:1,numeroDeGanhadores:1,valorPremio:100}]}}];
 assert.equal((await app.importarResultadosDoAndroid()).alterados,1);
 assert.equal((await app.importarResultadosDoAndroid()).alterados,0);
 assert.equal(app.S.resultados.length,1);
 assert.equal(app.ganhosAcumulados(m,app.S.resultados).geral.centavos,10000);
 entradas=[{modalidade:m,consultadoEm,resultado:{...base,listaRateioPremio:[{faixa:1,valorPremio:50}]}}];
 assert.equal((await app.importarResultadosDoAndroid()).alterados,0);
 assert.equal(app.ganhosAcumulados(m,app.S.resultados).geral.centavos,10000);
});
