# Protocolo automático 4.21

`ui/lab-auto.js` é compartilhado entre o worker do aplicativo e `ferramentas/atualizar-aprendizado.mjs`. A unidade de avaliação é um concurso de uma modalidade, com o mesmo formato e as mesmas restrições. Alterar tamanho, fixas, exclusões, trevos ou janela cria um perfil separado. Quantidade e orçamento do lote comprado não alteram o experimento virtual.

## Hipóteses comparadas

O pacote contém dez hipóteses e um controle visível uniforme. Equilíbrio usa soma, paridade, amplitude, consecutivos, dispersão, faixas e finais. Frequência usa suavização para a proporção combinatória; recência usa decaimento exponencial 0,96. Atrasos são apenas uma hipótese competidora, sem pressupor compensação futura. Pares e trios usam associação suavizada; até 128 trios distribuídos por candidato limitam o custo na Lotomania. Transições contam relações entre concursos consecutivos. Perfil compara a distribuição recente de interseções com a referência hipergeométrica. Cobertura reduz redundância; a busca evolutiva aplica até 24 mutações locais em combinações válidas.

A população tem até 96 combinações distintas, mais o resultado evolutivo. Restrições muito fortes podem impedir jogos diferentes entre estratégias; isso é mantido no registro, sem inventar diversidade. O consenso maximiza concordância entre as dez hipóteses com um pequeno desempate por características padronizadas. Complementos são uniformes, salvo trevos fixados pelo usuário. Os métodos não cobrem todas as técnicas comerciais ou acadêmicas; numerologia, promessas de garantia e aumento de probabilidade por atraso não são alegações do aplicativo.

## Inicialização e adaptação

Com pelo menos 120 registros e os últimos 120 consecutivos, os 60 concursos finais são previstos cronologicamente: 30 para seleção e 30 para confirmação da escolha congelada. Cada previsão recebe somente os resultados anteriores. A inicialização é feita uma vez por perfil; uma base inicialmente insuficiente pode completá-la depois. Lacunas não contam como sequências completas e reiniciam recência/atrasos; transições nunca atravessam uma lacuna. Mega da Virada não é tratada como uma sequência de concursos comuns.

Para cada previsão, o controle estatístico é a média de 32 jogos uniformes independentes, com sementes definidas antes do alvo e as mesmas restrições. O controle visível não é escolhido pela pontuação dos candidatos. A comparação usa diferenças pareadas por concurso, bootstrap e permutação em blocos, 999 repetições e Holm nas 20 comparações históricas (10 métodos contra controle e consenso). A escolha exige intervalo positivo, três períodos positivos e resistência à retirada do melhor e do pior concurso.

Após a inicialização, as rodadas prospectivas são congeladas antes de receber o resultado. A partir de 60 observações, e depois a cada 30 novas observações, o motor avalia manter ou alterar o método. Além dos diagnósticos anteriores, exige testes válidos para consultas repetidas. Para diferenças normalizadas pelo máximo de acertos, usa a mistura de processos `exp(lambda*S - n*lambda²/2)` com lambdas predefinidos `[0.05,0.1,0.2,0.4,0.8,1.6,3.2]`. O inverso do maior valor acumulado da mistura fornece o p contínuo conservador; Bonferroni cobre as 30 hipóteses (acima do controle, acima do consenso e abaixo do controle para cada método). O retorno de um método persistentemente inferior ao controle também exige a comparação negativa com o controle. A validade depende da hipótese nula condicional de diferença média não positiva e diferenças limitadas; não afirma que os métodos necessariamente terão poder para detectar efeitos pequenos.

Essa proteção é por perfil. Explorar muitos perfis, modalidades ou protocolos e divulgar apenas o melhor não recebe uma garantia global de significância. Os intervalos de bootstrap da tabela são descritivos em consultas repetidas; a decisão automática tem o filtro sequencial adicional. Acertos não equivalem a lucro. Rateios e preços históricos ausentes não são imputados.

## Registro e operação

`aprendizado/*.json` guarda os pacotes padrão públicos, criação UTC, corte conhecido, assinatura da base, protocolo, sementes, jogos e decisões. O histórico de commits permite auditar o que foi publicado. A rotina de resultados roda às 01:17, 04:17 e 12:17 UTC diariamente e às 15:17 UTC aos domingos; o GitHub pode atrasar execuções. Ela confere pacotes existentes e prepara somente o próximo concurso conhecido. Não recria previsões dos concursos perdidos enquanto não houve execução.

O aplicativo importa o registro público e conserva qualquer rodada já registrada localmente para o mesmo alvo. Pacotes personalizados ficam no aparelho; ao reabrir, resultados pendentes são conferidos sem inventar pacotes para concursos intermediários. Uma falha de gravação é exibida, sem afirmar que o pacote está salvo. A memória não é truncada silenciosamente.

Uma rodada com corte igual/posterior ao alvo, duplicada ou com formato incompatível é rejeitada. Resultados sem data e registros criados depois da data do resultado (fuso de Brasília) não entram como prospectivos. A data, sem o horário oficial do sorteio, não prova precedência dentro do mesmo dia. O registro local não é um comprovante criptográfico; adulteração do relógio, do armazenamento ou dos arquivos de origem não é detectada integralmente. O funcionamento automático normal usa somente resultados já publicados, e a publicação do livro no GitHub fornece a trilha pública adicional.

## Referências metodológicas

- Hyndman e Athanasopoulos, validação temporal: https://otexts.com/fpp3/tscv.html
- Dwork et al., risco de reutilização adaptativa do conjunto de teste: https://arxiv.org/abs/1506.02629
- Howard et al., limites uniformes no tempo por supermartingais: https://arxiv.org/abs/1808.03204
- Regras oficiais de sorteios: https://loterias.caixa.gov.br/Paginas/regras-sorteios.aspx

São bases metodológicas para escolhas explícitas do protocolo, não validação externa deste aplicativo.
