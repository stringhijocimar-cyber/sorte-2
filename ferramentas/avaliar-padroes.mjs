// Protocolo fixo. Não procura sementes nem ajusta pesos após ver o teste.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const L=createRequire(import.meta.url)('../ui/lab-strategies.js');
const options={treino:120,validacao:60,teste:60,quantidade:1,referencias:32,candidatos:60,semente:'padroes-protocolo-1'};
const reports=[];
for(const modalidade of ['mega-sena','lotofacil']){
 const bytes=readFileSync(new URL('../dados/'+modalidade+'.json',import.meta.url)),records=JSON.parse(bytes).concursos;
 const result=L.backtest(modalidade,records,options);
 if(result.estado!=='concluído')throw Error(modalidade+': '+result.estado);
 const select=x=>({id:x.id,n:x.n,mediaAcertos:x.mediaAcertos,diferencaAoAcaso:x.media,ic95:x.ic,pAjustado:x.pAjustado,periodos:x.periodos});
 const paired=L.paired(result.observacoes.padroes.slice(options.validacao).map((r,i)=>r.valor-result.observacoes.semelhanca[options.validacao+i].valor),options.semente+':comparacao:'+modalidade);
 reports.push({modalidade,fonte:'dados/'+modalidade+'.json',sha256:createHash('sha256').update(bytes).digest('hex'),opcoes:options,
  particao:result.particao,selecaoAntesDoTeste:result.selecao.escolha,champion:result.champion,
  validacao:result.selecao.resultados.filter(x=>['padroes','semelhanca','uniforme'].includes(x.id)).map(select),
  teste:result.challengers.filter(x=>['padroes','semelhanca','uniforme'].includes(x.id)).map(select),
  remocoes:result.remocoes.filter(x=>['sem-primos','sem-fibonacci','sem-sequencia','sem-grade'].includes(x.id)).map(select),
  comparacaoDiretaExploratoria:{...paired,nota:'Padrões menos semelhança; análise adicional sem correção própria, não seleciona estratégia.'},
  mensagem:result.mensagem,limites:result.limites});
 console.error(modalidade+': '+result.mensagem);
}
console.log(JSON.stringify({protocolo:'padroes-protocolo-1',nota:'Retrospectivo; acertos de dezenas, não lucro nem probabilidade de prêmio. Não ativa o novo método na recomendação automática.',reports},null,2));
