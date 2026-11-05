/* Perfil observado em conjunto e estudo de carteiras de 15 dezenas. */
(function(root){
'use strict';
const L=root.LL18||(typeof require==='function'?require('./lab-core.js'):null);
const modalidade='lotofacil';
const dezenas=Array.from({length:25},(_,i)=>i+1);
const universo=(1<<25)-1;
const quantidadeEstudo=20;
const minimoTransicoes=30;
const corteRepeticao=2**22;
const mask=ds=>ds.reduce((bits,d)=>bits|(1<<(d-1)),0);
const ticket=bits=>({dezenas:dezenas.filter(d=>bits&(1<<(d-1)))});
const pop=L.bitCount;
const pares=mask(dezenas.filter(d=>d%2===0));
const primos=mask([2,3,5,7,11,13,17,19,23]);
const fibonacci=mask([1,2,3,5,8,13,21]);
const moldura=mask(dezenas.filter(d=>d<=5||d>=21||d%5<=1));
const linhas=Array.from({length:5},(_,i)=>31<<(i*5));
const colunas=Array.from({length:5},(_,i)=>0x108421<<i);
const grade=linhas.concat(colunas);
const somas=linhas.map((_,linha)=>Array.from({length:32},(_,bits)=>
 L.sum(dezenas.slice(linha*5,linha*5+5).filter((_,i)=>bits&(1<<i)))));
const faixas={
 soma:Array.from({length:10},(_,i)=>[120+15*i,i===9?270:134+15*i]),
 repeticao:[[5,7],[8,9],[10,11],[12,15]],
 consecutivos:[[4,7],[8,9],[10,11],[12,14]],
 sequencia:[[2,3],[4,5],[6,15]],
 moldura:[[6,8],[9,10],[11,12],[13,15]]
};
const indices=Object.fromEntries(Object.entries(faixas).map(([nome,limites])=>[nome,
 Array.from({length:nome==='soma'?271:16},(_,valor)=>limites.findIndex(([,maximo])=>valor<=maximo))]));
const soma=bits=>somas[0][bits&31]+somas[1][(bits>>>5)&31]+somas[2][(bits>>>10)&31]+
 somas[3][(bits>>>15)&31]+somas[4][bits>>>20];
const repeticao=(bits,anterior)=>indices.repeticao[pop(bits&anterior)];

function perfilEstatico(bits){
 const adjacentes=bits&(bits>>>1);
 const bloco4=adjacentes&(adjacentes>>>1)&(adjacentes>>>2);
 const bloco6=bloco4&(adjacentes>>>3)&(adjacentes>>>4);
 const sequencia=bloco6?2:bloco4?1:0;
 const grupoCheio=grade.some(grupo=>(bits&grupo)===grupo);
 // Campos disjuntos. A repetição entra depois, com referência ao concurso anterior.
 return indices.soma[soma(bits)]|(pop(bits&pares)<<4)|(pop(bits&primos)<<8)|(pop(bits&fibonacci)<<12)|
  (indices.consecutivos[pop(adjacentes)]<<15)|(sequencia<<17)|(indices.moldura[pop(bits&moldura)]<<19)|(Number(grupoCheio)<<21);
}

function contarTransicao(contexto,atual,anterior){
 if(!anterior||atual.concurso!==anterior.concurso+1)return;
 const chave=atual.perfil+repeticao(atual.bits,anterior.bits)*corteRepeticao;
 contexto.frequencias.set(chave,(contexto.frequencias.get(chave)||0)+1);
 contexto.comparaveis++;
}

function baseConjunta(base){
 const dados=base.rows.map((r,i)=>({concurso:r.concurso,bits:base.masks[i][0],perfil:perfilEstatico(base.masks[i][0])}));
 const contexto={frequencias:new Map(),comparaveis:0,dados};
 dados.forEach((atual,i)=>contarTransicao(contexto,atual,dados[i-1]));
 return contexto;
}

function forEachCombination(visitar){
 // Percorre cada máscara de 25 posições com exatamente 15 bits acesos.
 for(let bits=(1<<15)-1;bits<=universo;){
  if(visitar(bits)===false)return;
  const menorBit=bits&-bits;
  const avancado=bits+menorBit;
  bits=avancado|Math.floor(((avancado^bits)>>>2)/menorBit);
 }
}

let catalogo;
function catalogarPerfis(){
 if(catalogo)return catalogo;
 const tamanhos=new Map();
 forEachCombination(bits=>{
  const chave=perfilEstatico(bits);
  tamanhos.set(chave,(tamanhos.get(chave)||0)+1);
 });
 const grupos=new Map([...tamanhos].map(([chave,n])=>[chave,{jogos:new Uint32Array(n),posicao:0}]));
 forEachCombination(bits=>{
  const grupo=grupos.get(perfilEstatico(bits));
  grupo.jogos[grupo.posicao++]=bits;
 });
 catalogo=new Map([...grupos].map(([chave,grupo])=>[chave,grupo.jogos]));
 return catalogo;
}

function escolherPerfis(contexto,anterior,quantidade,fixas,excluidas,semente){
 const catalogo=catalogarPerfis();
 const ordem=[...contexto.frequencias].sort((a,b)=>b[1]-a[1]||a[0]-b[0]);
 const escolhidos=[];
 const permitida=bits=>(bits&fixas)===fixas&&!(bits&excluidas);
 const seed=L.hash(semente);
 // Desempate reproduzível. A quantidade do lote não muda a primeira escolha.
 const prioridade=bits=>Math.imul(bits^seed,0x9e3779b1)>>>0;
 for(let i=0;i<ordem.length&&escolhidos.length<quantidade;){
  const vezes=ordem[i][1],empatados=[];
  do{
   const chave=ordem[i++][0],classe=Math.floor(chave/corteRepeticao);
   for(const bits of catalogo.get(chave%corteRepeticao)||[]){
    if(permitida(bits)&&repeticao(bits,anterior)===classe)empatados.push(bits);
   }
  }while(i<ordem.length&&ordem[i][1]===vezes);
  empatados.sort((a,b)=>prioridade(b)-prioridade(a));
  escolhidos.push(...empatados.slice(0,quantidade-escolhidos.length));
 }
 if(escolhidos.length<quantidade){
  const usados=new Set(escolhidos);
  // Restrições podem excluir todos os perfis observados. Os demais têm zero ocorrência.
  forEachCombination(bits=>{
   if(permitida(bits)&&!usados.has(bits))escolhidos.push(bits);
   return escolhidos.length<quantidade;
  });
 }
 return escolhidos;
}

function descreverPerfil(bits,contexto,anterior){
 const jogo=ticket(bits);
 const p=L.patternProfile(modalidade,jogo);
 const total=soma(bits),repetidas=pop(bits&anterior.bits),molduraDoJogo=pop(bits&moldura);
 const vezes=contexto.frequencias.get(perfilEstatico(bits)+repeticao(bits,anterior.bits)*corteRepeticao)||0;
 const faixa=(nome,valor)=>faixas[nome][indices[nome][valor]];
 const grupoCheio=grade.some(grupo=>(bits&grupo)===grupo);
 return {vezes,comparaveis:contexto.comparaveis,percentual:100*vezes/contexto.comparaveis,referencia:anterior.concurso,
  soma:total,faixaSoma:faixa('soma',total),pares:p.pares,impares:p.impares,primos:p.primos,fibonacci:p.fibonacci,
  repetidas,faixaRepeticao:faixa('repeticao',repetidas),consecutivos:p.consecutivos,faixaConsecutivos:faixa('consecutivos',p.consecutivos),
  maiorSequencia:p.maiorSequencia,faixaSequencia:faixa('sequencia',p.maiorSequencia),moldura:molduraDoJogo,faixaMoldura:faixa('moldura',molduraDoJogo),
  linhas:p.linhas,colunas:p.colunas,grupoCheio};
}

function perfilConjuntoLotofacil(base,op={}){
 const contexto=baseConjunta(base),anterior=contexto.dados.at(-1);
 if(!anterior||base.meta.semRegistroAteCorte||contexto.comparaveis<minimoTransicoes)return null;
 const fixas=op.fixas||[],excluidas=op.excluidas||[],quantidade=op.quantidade||1;
 const escolhidos=escolherPerfis(contexto,anterior.bits,quantidade,mask(fixas),mask(excluidas),op.semente||'perfil-conjunto');
 return {jogos:escolhidos.map(ticket),perfis:escolhidos.map(bits=>descreverPerfil(bits,contexto,anterior)),
  candidatas:L.comb(25-fixas.length-excluidas.length,15-fixas.length)};
}

// Sorteio uniforme sem reposição por embaralhamento parcial. Reutiliza o vetor
// para evitar alocar 25 posições a cada um dos sorteios simulados.
function sorteador(random,base=dezenas){
 const pool=base.map(d=>1<<(d-1)),todos=mask(base);
 return ()=>{
  let bits=todos;
  for(let i=0;i<pool.length-15;i++){
   const j=i+Math.floor(random()*(pool.length-i));
   const retirado=pool[j];
   pool[j]=pool[i];pool[i]=retirado;bits^=retirado;
  }
  return bits;
 };
}

function carteiraUnica(sortear,aceitar=()=>true){
 const jogos=new Set();
 while(jogos.size<quantidadeEstudo){
  const bits=sortear();
  if(aceitar(bits))jogos.add(bits);
 }
 return [...jogos];
}

function carteirasDoEstudo(semente){
 const aleatoria=carteiraUnica(sorteador(L.rng(semente+':aleatoria')));
 const filtrada=carteiraUnica(sorteador(L.rng(semente+':filtrada')),bits=>{
  const total=soma(bits),quantosPares=pop(bits&pares);
  return total>=170&&total<=220&&(quantosPares===7||quantosPares===8);
 });
 const gerar=sorteador(L.rng(semente+':diversificada')),diversificada=[];
 while(diversificada.length<quantidadeEstudo){
  let melhor=null,menor=Infinity;
  for(let i=0;i<128;i++){
   const bits=gerar();
   if(diversificada.includes(bits))continue;
   let repetidas=0;
   for(const outro of diversificada)repetidas+=pop(outro&bits);
   if(repetidas<menor){melhor=bits;menor=repetidas;}
  }
  if(melhor!==null)diversificada.push(melhor);
 }
 const base=L.sample(dezenas,18,L.rng(semente+':base-18'));
 const fechamento18=carteiraUnica(sorteador(L.rng(semente+':fechamento-18'),base));
 return {base,carteiras:{aleatoria,filtrada,diversificada,fechamento18}};
}

function acumulador(){return {melhor:Array(16).fill(0),premiados:0};}
function conferirCarteira(jogos,sorteio,acc){
 let melhor=0;
 for(const bits of jogos){
  const acertos=pop(bits&sorteio);
  if(acertos>=11)acc.premiados++;
  if(acertos>melhor)melhor=acertos;
 }
 acc.melhor[melhor]++;
}

function resumoCarteira(acc,n){
 return {faixas:[11,12,13,14,15].map(minimo=>({minimo,vezes:L.sum(acc.melhor.slice(minimo)),
  percentual:100*L.sum(acc.melhor.slice(minimo))/n})),mediaPremiados:acc.premiados/n};
}

function sobreposicao(jogos){
 let coincidencias=0;
 jogos.forEach((bits,i)=>{for(let j=0;j<i;j++)coincidencias+=pop(bits&jogos[j]);});
 return coincidencias/L.comb(jogos.length,2);
}

function simularCarteirasLotofacil(op={},progresso=()=>{}){
 const n=op.amostras??1_000_000;
 if(!Number.isInteger(n)||n<1000||n>1_000_000)throw Error('Escolha de 1.000 a 1.000.000 de sorteios simulados.');
 const semente=String(op.semente||'carteiras-lotofacil'),{base,carteiras}=carteirasDoEstudo(semente);
 const avaliar=Object.entries(carteiras).map(([id,jogos])=>({id,jogos,acc:acumulador()}));
 const sorteio=sorteador(L.rng(semente+':sorteios-uniformes'));
 for(let i=1;i<=n;i++){
  const resultado=sorteio();
  for(const c of avaliar)conferirCarteira(c.jogos,resultado,c.acc);
  if(i%25_000===0||i===n)progresso({etapa:'Simulando sorteios',feitos:i,total:n});
 }
 return {semente,n,simulado:true,jogosPorCarteira:quantidadeEstudo,baseFechamento:base,custo:quantidadeEstudo*L.cfg(modalidade).preco,
  carteiras:avaliar.map(c=>({id:c.id,jogos:c.jogos.map(ticket),sobreposicao:sobreposicao(c.jogos),...resumoCarteira(c.acc,n)}))};
}

function avaliarPerfilConjuntoLotofacil(registros,op={},progresso=()=>{}){
 const base=L.history(modalidade,registros,{antesDe:op.antesDe??null});
 const n=op.concursos??100,referencias=32;
 if(![100,500,1000].includes(n))throw Error('Escolha uma janela de 100, 500 ou 1.000 concursos.');
 const inicio=base.rows.length-n;
 if(inicio<minimoTransicoes+1||base.rows.at(-1).concurso-base.rows[inicio-1].concurso!==n)
  throw Error('São necessários '+n+' concursos consecutivos para avaliar, com histórico anterior suficiente. Confira o corte e as lacunas da base.');
 const treino=L.history(modalidade,base.rows.slice(0,inicio));
 const contexto=baseConjunta(treino),perfil=acumulador(),controle=acumulador();
 if(contexto.comparaveis<minimoTransicoes)throw Error('A avaliação exige pelo menos 30 transições válidas antes do primeiro concurso de teste.');
 const semente=String(op.semente||'perfil-lotofacil-historico'),observacoes=[];
 let anterior=contexto.dados.at(-1);
 progresso({etapa:'Catalogando os jogos possíveis',feitos:0,total:n});
 for(let i=inicio;i<base.rows.length;i++){
  const concurso=base.rows[i].concurso,bits=base.masks[i][0],seed=semente+':'+concurso;
  const jogos=escolherPerfis(contexto,anterior.bits,quantidadeEstudo,0,0,seed);
  conferirCarteira(jogos,bits,perfil);
  const random=sorteador(L.rng(seed+':controle'));
  for(let r=0;r<referencias;r++)conferirCarteira(carteiraUnica(random),bits,controle);
  observacoes.push({concurso,treinoAte:anterior.concurso,jogos:jogos.map(ticket)});
  const atual={concurso,bits,perfil:perfilEstatico(bits)};
  contarTransicao(contexto,atual,anterior);anterior=atual;
  const feitos=i-inicio+1;
  if(feitos%10===0||feitos===n)progresso({etapa:'Avaliando concursos históricos',feitos,total:n});
 }
 return {semente,n,base:base.meta,inicio:base.rows[inicio].concurso,fim:base.meta.ultimo,referencias,jogosPorCarteira:quantidadeEstudo,
  custoAtual:quantidadeEstudo*L.cfg(modalidade).preco,carteiras:[{id:'perfil',...resumoCarteira(perfil,n)},
   {id:'aleatoria',...resumoCarteira(controle,n*referencias)}],observacoes};
}

Object.assign(L,{perfilConjuntoLotofacil,simularCarteirasLotofacil,avaliarPerfilConjuntoLotofacil});
if(typeof module!=='undefined'&&module.exports)module.exports=L;
})(globalThis);
