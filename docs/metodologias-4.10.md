# Metas de acertos e metodologias — LotoLab 4.10

Pesquisa consultada em 06/09/2026. O objetivo do motor é selecionar jogos válidos, evitar duplicatas e verificar a cobertura de uma meta dentro do limite informado. Isso não equivale a prever o resultado. O app acompanha jogos locais; não registra apostas.

## O que foi incorporado

- **Planejamento de participação:** limite para um período e de 1 a 31 concursos escolhidos. Distribuição igual, até 60 jogos simples por concurso; a reserva não é gasta. A tabela de modalidades mostra alternativas para o mesmo limite. Não é um controle do dinheiro efetivamente apostado.
- **Concurso declarado:** sugestões e fechamentos podem ser salvos para um concurso futuro específico. Assim, acompanhar o aplicativo não implica repetir apostas em todos os concursos.
- **Fechamento por meta:** uma base escolhida pelo usuário, ou preenchida aleatoriamente, alimenta uma busca gulosa de cobertura. A cada passo, entra a candidata que cobre mais cenários ainda não cobertos.
- **Verificação independente da busca:** enumera todos os resultados de `k` dezenas dentro da base, conta a melhor interseção com os jogos e informa cobertura, piso de acertos e condições. Não usa resultados históricos para escolher a base.
- **Comparação temporal:** além das médias, mostra quantos concursos tiveram ao menos um jogo em cada contagem exata de acertos. Vários jogos na mesma faixa contam uma vez naquele concurso.

## Modalidades numéricas presentes no motor

| Modalidade | Aposta mínima | Prêmio máximo com aposta mínima, por sorteio | Método e ressalva |
|---|---:|---|---|
| Mega-Sena | 6 de 60 · R$ 6,00 | 1 em 50.063.860 | Jogos únicos; fechamento condicional para 4, 5 ou 6 dezenas. |
| Lotofácil | 15 de 25 · R$ 3,50 | 1 em 3.268.760 | Cobertura verificada de 11 a 15 acertos. Aumentar a base pode elevar muito o número de jogos. |
| Quina | 5 de 80 · R$ 3,00 | 1 em 24.040.016 | Fechamento condicional para 2 a 5 acertos. |
| Lotomania | 50 de 100 · R$ 3,00 | aproximadamente 1 em 11.372.635 | Espelho com as outras 50 dezenas. Se o original faz h, o espelho faz 20−h. Piso 10 em um deles, abaixo da menor faixa positiva de prêmio. Zero acertos também tem faixa própria. |
| Dupla Sena | 6 de 50 · R$ 3,00 | 1 em 15.890.700 em cada sorteio | Duas extrações por concurso. O fechamento vale para uma extração; o histórico comparativo do app usa a primeira. |
| Dia de Sorte | 7 de 31 · R$ 2,50 | 1 em 2.629.575 | Cobertura para 4 a 7 dezenas. Mês da Sorte é faixa separada; completar no volante. |
| Timemania | 10 de 80 · R$ 3,50 | aproximadamente 1 em 26.472.637 | Cobertura das 7 sorteadas em jogos de 10. Time do Coração é faixa separada; completar no volante. |
| +Milionária | 6 de 50 + 2 de 6 trevos · R$ 6,00 | 1 em 238.360.500 | O fechamento cobre dezenas. Trevos devem ser completados; acertar as dezenas não confirma a faixa de premiação. |

Regras, custos e faixas: [Mega-Sena](https://loterias.caixa.gov.br/Paginas/Mega-Sena.aspx), [Lotofácil](https://loterias.caixa.gov.br/Paginas/Lotofacil.aspx), [Quina](https://loterias.caixa.gov.br/Paginas/Quina.aspx), [Lotomania](https://loterias.caixa.gov.br/Paginas/Lotomania.aspx), [Dupla Sena](https://loterias.caixa.gov.br/Paginas/Dupla-Sena.aspx), [Dia de Sorte](https://loterias.caixa.gov.br/Paginas/Dia-de-Sorte.aspx), [Timemania](https://loterias.caixa.gov.br/Paginas/Timemania.aspx), [+Milionária](https://loterias.caixa.gov.br/Paginas/Mais-Milionaria.aspx).

## O significado da cobertura

Para universo de N dezenas, sorteio de k e base de v, a condição de todas as sorteadas estarem na base tem probabilidade `C(v,k)/C(N,k)`. Uma cobertura de 100% mostrada no app se refere aos cenários **dentro dessa base**, e exige a condição indicada. Fora da base, essa garantia não se aplica. Nos jogos com campos adicionais, ela trata somente dezenas.

A definição de desenho de cobertura e de esquema de loteria pode ser consultada na pesquisa de [Dan Gordon e no La Jolla Combinatorics Repository](https://dmgordon.org/covering-designs/) e no [capítulo sobre coberturas](https://www.dmgordon.org/papers/hcd.pdf). A aplicação aqui é uma implementação própria de busca e enumeração; não copia nem afirma reproduzir um desenho ótimo do repositório.

Limites computacionais: base de até 20 dezenas, no máximo 20.000 resultados condicionais e 800 candidatas. A enumeração final é exata dentro da condição, mesmo quando a busca é parcial. A busca pode não encontrar o menor fechamento. O algoritmo para quando cobre a meta ou esgota os jogos disponíveis; cobertura parcial nunca recebe garantia de meta. A Lotomania usa a identidade exata do espelho, porque enumerar bases de 50 dezenas seria impraticável no celular.

## Métodos pesquisados que não justificam previsão

Frequências, atrasos, paridade, quadrantes e sequências podem descrever dados ou definir hipóteses. Escolher um perfil não muda a probabilidade de uma combinação válida em sorteio uniforme. O teste deve separar treino e resultados posteriores; repetir buscas aumenta o risco de encontrar diferenças ao acaso. O comparador existente mantém referência uniforme, custo equivalente e correção das comparações.

Bolões repartem custo e eventuais prêmios. A tabela oficial de cada modalidade deve ser consultada quanto a cotas e tarifas. Acumulados alteram o valor potencial da premiação, sem alterar a chance do volante. Escolher combinações menos populares pode afetar a divisão do prêmio, mas o aplicativo não dispõe de dados das escolhas dos apostadores e não atribui um ganho numérico a isso.

## Modalidades com estrutura diferente

- [Super Sete](https://loterias.caixa.gov.br/Paginas/Super-Sete.aspx): sete colunas ordenadas, de 0 a 9. Aposta simples: R$ 3,00; chance principal 1 em 10 milhões. Números repetidos em colunas diferentes são válidos. Exige gerador por posição, fora do motor atual de conjuntos de dezenas.
- [Loteca](https://loterias.caixa.gov.br/Paginas/Loteca.aspx): prognósticos esportivos. Uma avaliação útil dependeria de dados dos jogos e probabilidades esportivas calibradas. Não é correto assumir que vitória, empate e derrota têm probabilidades iguais.
- [Federal](https://loterias.caixa.gov.br/Paginas/Federal.aspx): bilhetes, séries e extrações. Um gerador de dezenas não seleciona bilhetes disponíveis nem melhora a chance da série.
- Instantânea: a análise depende do plano de emissão e de prêmios de cada produto. O catálogo está no [portal oficial](https://loterias.caixa.gov.br/); dados de frequência de concursos não se aplicam.

Essas quatro modalidades são tratadas no guia do app, sem simular suporte de geração ou conferência que não existe.

## Notificações e validação

Acertos aparecem em círculos verdes, com texto branco; dezenas não sorteadas em vermelho suave. Legendas e rótulos acessíveis complementam a cor. Avisos antigos recuperam a comparação usando o jogo e o concurso armazenados.

No Android, a notificação expandida contém uma imagem desenhada no próprio aparelho com `NotificationCompat.BigPictureStyle`. Texto e ação abrem o jogo correspondente; nenhuma imagem ou jogo é enviado a um servidor. O exemplo no sino é identificado como demonstração e não cria aposta ou resultado real. Referência: [notificações expandíveis do Android](https://developer.android.com/develop/ui/compose/notifications/expanded).

O executor nativo agenda conferência periódica com WorkManager, a cada 30 minutos, condicionada a rede e bateria. A execução pode ser adiada pelo Android; não promete alerta no minuto do sorteio. Consulta o último resultado público da CAIXA para cada modalidade acompanhada, valida dezenas e datas e suprime avisos repetidos. Após a transferência do estado para o executor nativo, o runner antigo é desativado para evitar duplicações. Sem suporte nativo, a conferência interna continua funcionando. [Documentação WorkManager](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started).

Testes: `node ferramentas/testar-metas.mjs`, suítes existentes do motor e interface, `./gradlew testDebugUnitTest assembleDebug`, e inspeção do conteúdo final do APK. A aparência final da notificação ainda deve ser conferida no aparelho e na versão Android usada.
