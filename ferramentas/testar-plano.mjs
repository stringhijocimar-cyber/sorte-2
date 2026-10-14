import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const L=createRequire(import.meta.url)('../ui/lab-auto.js');
const shape=(m,n)=>{const t=L.randomTicket(m,L.rng('formato-teste'));if(n)t.dezenas=Array.from({length:n},(_,i)=>i+L.cfg(m).base);return t;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12);

test('Mega-Sena sem restrições tem contagem conhecida e referência 0,6',()=>{
 const p=L.recommendationPlan('mega-sena');assert.equal(p.combinacoesPrincipais,'50063860');assert.equal(p.combinacoesCompletas,p.combinacoesPrincipais);
 near(p.sobreposicaoReferencia,.6);assert.equal(p.fracaoPrincipal,1);assert.equal(p.unitario,6);
});
test('Lotofácil sem restrições tem C(25,15) e referência 9',()=>{
 const p=L.recommendationPlan('lotofacil');assert.equal(p.combinacoesPrincipais,'3268760');near(p.sobreposicaoReferencia,9);assert.equal(p.unitario,3.5);
});
test('contagem gigante da Lotomania não perde precisão e serializa',()=>{
 const p=L.recommendationPlan('lotomania');assert.equal(p.combinacoesPrincipais,'100891344545564193334812497256');assert.doesNotThrow(()=>JSON.stringify(p));
});
test('fixas e excluídas contam somente posições livres, enumeração independente',()=>{
 const fixed=[1,2,3,4],excluded=Array.from({length:52},(_,i)=>i+9),p=L.recommendationPlan('mega-sena',{fixas:fixed,excluidas:excluded,quantidade:6});
 const free=[5,6,7,8],tickets=free.flatMap((a,i)=>free.slice(i+1).map(b=>fixed.concat(a,b)));
 assert.equal(p.combinacoesPrincipais,String(tickets.length));assert.equal(p.viavel,true);
 const mean=tickets.flatMap(a=>tickets.map(b=>a.filter(x=>b.includes(x)).length)).reduce((a,b)=>a+b,0)/(tickets.length**2);
 near(p.sobreposicaoReferencia,mean);near(mean,5);assert.equal(p.aEscolher,2);assert.equal(p.livresDisponiveis,4);
 assert.ok(p.avisos.some(x=>/todas as configurações/.test(x)));
});
test('todas as dezenas fixas permitem um jogo e sobreposição total sem divisão por zero',()=>{
 const p=L.recommendationPlan('mega-sena',{fixas:[1,2,3,4,5,6],excluidas:Array.from({length:54},(_,i)=>i+7),quantidade:2});
 assert.equal(p.capacidadeMotor,'1');assert.equal(p.viavel,false);near(p.sobreposicaoReferencia,6);assert.throws(()=>L.assertRecommendationPlan(p),/somente 1/);
});
test('orçamento limita quantidade, não é aumentado e não confunde capacidade',()=>{
 const p=L.recommendationPlan('mega-sena',{quantidade:5,orcamento:12,fixas:[1,2,3,4,5],excluidas:Array.from({length:53},(_,i)=>i+8)});
 assert.equal(p.solicitados,5);assert.equal(p.efetivos,2);assert.equal(p.custo,12);assert.equal(p.capacidadeMotor,'2');assert.equal(p.viavel,true);assert.equal(p.reduzidoPorOrcamento,true);
});
test('orçamento insuficiente e valores inválidos não geram plano',()=>{
 for(const op of [{orcamento:5},{orcamento:NaN},{quantidade:1.5},{quantidade:61},{fixas:[1,1]},{fixas:[1],excluidas:[1]},{excluidas:[61]},{janela:-1},{antesDe:1.5}])assert.throws(()=>L.recommendationPlan('mega-sena',op));
 assert.throws(()=>L.recommendationPlan('quina',{trevosFixos:[1,2]}),/não se aplicam/);
});
test('formato ampliado conserva contagem, custo e complemento escolhido',()=>{
 const t=shape('mais-milionaria',7),op={formato:t,trevosFixos:[1,2,3],quantidade:2},p=L.recommendationPlan('mais-milionaria',op);
 assert.equal(p.unitario,126);assert.equal(p.custo,252);assert.deepEqual(p.formato.trevos,[1,2,3]);assert.equal(p.complementosPossiveis,'1');
 assert.deepEqual(t.trevos,shape('mais-milionaria',7).trevos); // não modifica entrada
});
test('identidade do automático inclui trevos, integrado exige dezenas diferentes',()=>{
 const op={fixas:[1,2,3,4,5,6],quantidade:2},a=L.recommendationPlan('mais-milionaria',op),b=L.recommendationPlan('mais-milionaria',op,'integrado');
 assert.equal(a.combinacoesPrincipais,'1');assert.equal(a.combinacoesCompletas,'15');assert.equal(a.viavel,true);assert.equal(b.viavel,false);assert.equal(b.capacidadeMotor,'1');
 const fixed=L.recommendationPlan('mais-milionaria',{...op,trevosFixos:[2,6]});assert.equal(fixed.viavel,false);
});
test('mês/time são complementos, não multiplicadores da capacidade integrada',()=>{
 const op={fixas:[1,2,3,4,5,6,7],quantidade:2};
 const a=L.recommendationPlan('dia-de-sorte',op),b=L.recommendationPlan('dia-de-sorte',op,'integrado');assert.equal(a.capacidadeMotor,'12');assert.equal(b.capacidadeMotor,'1');
});
test('Super Sete conta por coluna e não aceita fixas por dezena',()=>{
 const t={colunas:[[0,1],[0],[0],[0],[0],[0],[0]]},p=L.recommendationPlan('super-sete',{formato:t});
 assert.equal(p.combinacoesPrincipais,'45000000');near(p.sobreposicaoReferencia,1);assert.equal(p.unitario,6);
 assert.throws(()=>L.recommendationPlan('super-sete',{fixas:[1]}),/colunas/);
});
test('planos são independentes de histórico, semente de seleção e data',()=>{
 const op={fixas:[2],excluidas:[3],janela:50,antesDe:3000},a=L.recommendationPlan('mega-sena',op),b=L.recommendationPlan('mega-sena',{...op,semente:'diferente',agora:'2020-01-01'});assert.deepEqual(a,b);
 assert.ok(a.avisos.some(x=>/registros válidos/.test(x)));assert.equal(a.antesDe,3000);
});
test('motor automático recusa lote impossível antes de tocar histórico, progresso ou estado',()=>{
 let touched=false;const records={*[Symbol.iterator](){touched=true;throw Error('não deve ler histórico');}},state={rodadas:[]};let calls=0;
 assert.throws(()=>L.autoRecommend('mega-sena',records,state,{fixas:[1,2,3,4,5,6],quantidade:2},()=>calls++),/somente 1/);
 assert.equal(touched,false);assert.equal(calls,0);assert.deepEqual(state,{rodadas:[]});
});
test('motor integrado recusa antes de calibrar e entrega plano em configuração viável',()=>{
 let touched=false;const records={*[Symbol.iterator](){touched=true;throw Error('não deve ler');}};
 assert.throws(()=>L.recommend('mega-sena',records,{fixas:[1,2,3,4,5,6],quantidade:2}),/somente 1/);assert.equal(touched,false);
 const g=L.recommend('mega-sena',[],{quantidade:3,orcamento:12,semente:'plano'});assert.equal(g.plano.custo,g.custo);assert.equal(g.plano.efetivos,g.jogos.length);
});
const ctx=vm.createContext({LL18:L,console,setTimeout,clearTimeout});vm.runInContext(readFileSync(new URL('../ui/lab-ui.js',import.meta.url),'utf8'),ctx);
test('painel preserva inteiro gigante, escapa texto e não anuncia chance do lote',()=>{
 const p=L.recommendationPlan('lotomania');p.avisos.push('<script>alert(1)</script>');const html=ctx.LL18UI.recommendationPlanView(p);
 assert.ok(html.includes(BigInt(p.combinacoesPrincipais).toLocaleString('pt-BR')));assert.match(html,/Não é probabilidade de prêmio/);assert.doesNotMatch(html,/<script>/);assert.match(html,/Impacto das escolhas/);
});


test('dispatcher integrado recusa capacidade antes de monitorar ou ler registros',()=>{
 let touched=false,monitored=false;const messages=[],records={*[Symbol.iterator](){touched=true;throw Error('histórico indevido');}};
 const context=vm.createContext({LL18:{...L,monitor:()=>{monitored=true;throw Error('monitor indevido');}},self:{postMessage:m=>messages.push(m)}});
 vm.runInContext(readFileSync(new URL('../ui/lab-worker.js',import.meta.url),'utf8'),context);
 context.self.onmessage({data:{id:7,acao:'recomendar',modalidade:'mega-sena',registros:records,livro:[{modalidade:'mega-sena'}],op:{fixas:[1,2,3,4,5,6],quantidade:2}}});
 assert.equal(touched,false);assert.equal(monitored,false);assert.equal(messages.length,1);assert.match(messages[0].erro,/somente 1/);
});
