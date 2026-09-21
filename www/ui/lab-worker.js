if(typeof LL18==='undefined')importScripts('lab-core.js','lab-strategies.js','lab-recommendation.js');
self.onmessage=event=>{
 const {id,acao,modalidade:m,jogo,registros=[],op={},jogos=[],livro=[]}=event.data;
 const progress=p=>self.postMessage({id,progresso:p});
 try{let resultado;
  switch(acao){
   case 'recomendar':resultado=LL18.recommend(m,registros,op,progress);break;
   case 'analisar':resultado={analise:LL18.analyze(m,jogo,registros,op),aderencia:LL18.reference(m,jogo,registros,op)};break;
   case 'grupos':resultado=LL18.groupPage(m,jogo,registros,op);break;
   case 'gerar':resultado=LL18.generate(m,registros,op);resultado.explicacoes.forEach((e,i)=>{e.aderencia=LL18.reference(m,e.jogo,registros,{...op,semente:op.semente+':referencia'});const a=LL18.analyze(m,e.jogo,registros,op);e.dezenas=a.dezenas;e.complementos=a.complementos;e.pares=LL18.groupPage(m,e.jogo,registros,{...op,tamanho:2,limite:10});e.trios=LL18.groupPage(m,e.jogo,registros,{...op,tamanho:3,limite:10});progress({feitos:i+1,total:resultado.gerados,etapa:'Explicando jogos'});});break;
   case 'diversificar':resultado=LL18.diversify(m,registros,jogos,op);break;
   case 'comite':resultado=LL18.backtest(m,registros,op,progress);break;
   case 'simular':resultado=LL18.monteCarlo(m,jogo,op);break;
   case 'mudanca':resultado=LL18.drift(m,registros,jogo,op);break;
   case 'acompanhar':resultado=LL18.monitor(m,registros,livro);break;
   default:throw Error('Análise desconhecida.');
  }self.postMessage({id,resultado});
 }catch(e){self.postMessage({id,erro:e.message||String(e)});}
};
