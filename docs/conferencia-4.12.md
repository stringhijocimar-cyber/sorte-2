# Conferência por modalidade — 4.12

A +Milionária e a Dupla Sena precisam de campos que não cabem numa única lista de dezenas. Esta atualização preserva esses campos da origem até o jogo salvo, a meta e a notificação.

## Regras e origem

- [+Milionária — CAIXA](https://loterias.caixa.gov.br/Paginas/mais-milionaria.aspx): prêmio principal com seis dezenas entre 50 e dois trevos entre seis. A geração desta versão usa exatamente dois trevos; o custo é R$ 6 por combinação simples. Volantes com mais dezenas multiplicam o custo por C(n, 6).
- [Dupla Sena — CAIXA](https://loterias.caixa.gov.br/Paginas/dupla-sena.aspx): o mesmo bilhete participa de dois sorteios, com faixas de três a seis acertos em cada um. As listas são conferidas separadamente.
- [Resposta oficial da +Milionária](https://servicebus2.caixa.gov.br/portaldeloterias/api/maismilionaria): o campo `trevosSorteados` é separado de `listaDezenas`. Não usamos `dezenasSorteadasOrdemSorteio` para extrair as dezenas principais, pois essa lista pode incluir trevos. O segundo sorteio usa `listaDezenasSegundoSorteio`.
- [CapacitorHttp v6](https://capacitorjs.com/docs/v6/apis/http): chamadas nativas diretas para os resultados públicos da CAIXA, com limites de conexão, leitura e espera total. O restante dos recursos continua usando a busca web existente.

Regras consultadas em 07/09/2026. Sem promessa de prever resultados ou garantir premiação.

## Geração, cobertura e orçamento

O usuário pode definir um par de trevos para o lote ou deixar o campo vazio. Nesse caso, cada jogo recebe uma amostra uniforme de dois trevos, usando uma sequência reproduzível independente da seleção das dezenas. Mudar os trevos não altera a seleção das dezenas. A assinatura de um jogo inclui ambos os campos; dois pares distintos não são descartados como se fossem a mesma aposta.

O fechamento verifica a cobertura das dezenas. Acertar seis dezenas e os dois trevos exige que os campos coincidam no mesmo jogo. Para a meta máxima de um fechamento de jogos simples distintos da +Milionária, cada jogo cobre um resultado completo diferente: a chance exata é o número de jogos dividido por C(50, 6) × C(6, 2). Isso não torna um par mais provável nem transforma cobertura condicional em garantia incondicional.

Na Dupla Sena, a meta usa a maior contagem de um dos dois sorteios. Nunca considera a união das listas. As probabilidades e o teste histórico das estratégias continuam identificados por sorteio, usando o primeiro no histórico.

## Dados incompletos e atualização

Trevos e segundo sorteio ausentes ficam pendentes. Valores repetidos, quantidades erradas e números fora do volante são rejeitados. Não interpretamos ausência como zero acertos.

O atualizador salva os campos adicionais e pode preencher registros antigos no modo `--completar`, respeitando seu limite de consultas. Não reconstruímos campos históricos que a fonte não informou. O app procura uma fonte com detalhes sem aceitar um concurso anterior ao que já recebeu. Uma resposta parcial do mesmo sorteio conserva detalhes conhecidos.

Ao completar um resultado, o índice é renovado e a conferência existente é atualizada. Um segundo sorteio que alcance uma faixa pode criar um aviso se nenhum existia; o mesmo jogo/concurso não produz avisos duplicados. O Android atualiza a notificação existente quando os dados mudam, com alerta sonoro único.

## Apresentação e limites

As bolinhas verdes têm números brancos; as não sorteadas usam vermelho suave. Os grupos têm títulos, contagens, legendas e descrições acessíveis. No Android, expanda o aviso para ver a imagem; campos ainda sem resultado ficam cinza.

Jogos antigos da +Milionária podem receber seus trevos em **Meus jogos → Ver na cartela**. O app não preenche esses jogos antigos com pares aleatórios.

Não atribuímos um valor de prêmio da +Milionária a uma contagem que conhece apenas dezenas. Pagamento, múltiplas faixas de volantes ampliados e validade do bilhete precisam ser conferidos na fonte oficial. As demais seis modalidades mantêm seus geradores; Mês da Sorte e Time do Coração continuam fora da conferência adicional desta versão.

## Verificação

`testar-complementos.mjs` verifica formatos de origem, ausência e corrupção de campos, reprodução de trevos, orçamento, CSV, identidade dos jogos, meta no mesmo bilhete, separação dos sorteios, atualização sem duplicação e transporte nativo com tempo limite. Os testes de interface exercitam os controles por toque em Chrome, incluindo preenchimento de trevos antigos e grupos nas notificações. Os testes Java cobrem validação, contagem, prioridade e separação dos sorteios.

A CI também executa as suítes anteriores, compara raiz e `www`, compila o APK e inspeciona seus arquivos. A validação automatizada não substitui a instalação e observação das notificações em um aparelho físico.
