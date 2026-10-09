# Revisão técnica do LotoLab — 4.26.3

**Data:** 08/10/2026
**Projeto:** `stringhijocimar-cyber/sorte-2`
**Estado:** alterações locais, não publicadas. Android: `versionName` **4.26.3**, `versionCode` **40**.

Este relatório substitui a análise inicial de 07/10, que não incluía a validação visual completa e descrevia a divergência entre a fonte e `www/` ainda não corrigida.

## Conclusão

O trabalho anterior trouxe funcionalidades úteis, mas a revisão reproduziu falhas de cálculo, integração, interpretação da evidência, atualização e navegação. Foram corrigidas no código, não apenas documentadas. O HTML único foi regenerado e testado; a execução final da interface passou **513 verificações, sem falhas**.

O ganho é uma análise **mais correta, explicável e operacionalmente confiável**, não vantagem preditiva sobre sorteios uniformes e independentes. As novas métricas descritivas não alteram os jogos escolhidos nem são filtros de previsão.

A versão permanece **4.26.3**, pois estamos revisando o código local ainda não publicado. Não houve compilação, assinatura ou instalação de um APK novo, nem commit, push, PR ou publicação de release nesta sessão.

## 1. Achados e correções

| Achado reproduzido | Consequência | Correção aplicada |
|---|---|---|
| A média de linhas e colunas da Lotofácil era um escalar somando todas as posições. | A grade não tinha a comparação por posição anunciada no texto. | Cada linha e coluna agora tem sua própria média histórica vetorial. |
| O indicador de evidência não chegava ao ciclo automático da tela principal. | A melhoria anterior não aparecia no principal caminho do usuário. | Indicador incluído no automático e renderizadores compartilhados pelos fluxos. |
| Uma base grande sem validação podia receber classificação “boa”. | Impressão indevida de confiança científica. | Indicador explicitamente heurístico, estado de validação separado, tetos e descontos consultáveis. |
| Concursos anteriores ao início de uma janela eram tratados como lacunas internas. | Recortes recentes recebiam penalização artificial. | Recorte informado separadamente; descontos por lacunas internas e ausência até o corte. |
| Motor, relatórios e manifesto ainda declaravam versões antigas. | Identificação inconsistente da instalação. | Versão real do pacote propagada; trava automática de metadados. |
| Tokens dos módulos modificados e cache continuavam antigos. | Risco de misturar interface nova e motor antigo. | Tokens e cache atualizados; fonte e `www/` sincronizados e conferidos. |
| O service worker assumia a atualização mesmo após falha no pré-carregamento e limpava caches indiscriminadamente. | Casca offline incompleta e limpeza fora do escopo do app. | Instalação incompleta não substitui o worker anterior; limpeza restrita aos caches do LotoLab. |
| Pacote criado após a apuração, mas no mesmo dia, podia entrar na avaliação prospectiva. | Contaminação possível da evidência de estratégia. | Exigência conservadora de dia local estritamente anterior quando não há hora oficial verificável. |
| “Avaliar estratégias” apontava ao painel legado retirado. | Atalho sem destino funcional. | Redirecionamento ao Comitê de estratégias atual, com foco acessível. |
| Títulos novos usavam variável de cor inexistente no tema claro. | Contraste insuficiente. | Uso da variável `--tinta` do tema atual. |
| As tabelas novas alargavam o viewport móvel. | Toques reais atingiam elementos deslocados. | Largura dos painéis contida e rolagem interna das tabelas; teste contra o viewport visual. |

O problema móvel só ficou claro ao testar **toques reais**. O clique programático salvava corretamente, mas o cenário visual longo falhou em quatro verificações de salvamento. A reprodução curta mostrou viewport de layout maior que o visual. Depois da correção de largura, passaram tanto o teste por toque quanto a suíte completa. As execuções anteriores com falhas não foram tratadas como homologação bem-sucedida.

## 2. Mega-Sena e Lotofácil

A **Mega-Sena** apresenta dezenas baixas (1–30), altas (31–60), primos e soma, com média histórica e faixa central descritiva de 80%.

A **Lotofácil** apresenta moldura e miolo do volante 5×5, primos, soma, linhas/colunas completas e contagens e médias **por linha e por coluna**. A moldura tem 16 casas; o miolo tem 9. Isso descreve a geometria, não um padrão obrigatório do próximo sorteio.

A faixa central histórica usa os percentis 10 e 90 interpolados. **Não é intervalo de confiança nem previsão.** A quantidade de concursos permanece visível. Sem base, médias observadas ficam indisponíveis, em vez de virar zeros fictícios.

### Repetição do último resultado

O painel mostra a interseção com o último resultado disponível e a referência combinatória uniforme. Para aposta simples, a média de interseção é **0,6** na Mega-Sena e **9** na Lotofácil; esses valores foram verificados nos testes. Não tornam dezenas repetidas mais ou menos prováveis.

A probabilidade exata considera o tamanho real do volante e o tamanho regulamentar do sorteio. A média histórica entre resultados usa somente concursos consecutivos válidos, sem atravessar lacunas ou conflitos excluídos. A numeração anual da Mega da Virada não é tratada como sequência comum.

### Apostas ampliadas

O jogo ampliado é identificado. As médias do histórico são explicitamente de **resultados simples**, e os percentis diretos de comparação ficam desativados quando os tamanhos diferem. A referência combinatória usa corretamente o tamanho ampliado do volante.

## 3. Significado do indicador operacional

O indicador é uma **regra heurística não calibrada cientificamente** para comunicar tamanho, continuidade, integridade e disponibilidade de validação. Os descontos e o teto aplicado podem ser consultados na interface.

| Situação | Tratamento |
|---|---|
| Nenhum concurso válido | Pontuação zero. |
| Menos de 30 concursos | Teto de 49/100. |
| Validação não executada ou insuficiente | Teto de 69/100. |
| Lacunas, conflitos, registros inválidos, datas ou complementos ausentes | Limitações explícitas e descontos limitados. |
| Recorte iniciado em concurso tardio | Recorte descrito sem presumir lacunas internas nos concursos anteriores. |
| Teste separado ou acompanhamento prospectivo | Estado apresentado sem afirmar vantagem futura. |

**Pontuação alta não significa chance alta de prêmio, confiança estatística, lucro ou estratégia vencedora.** Acertos históricos não aumentam esse indicador.

## 4. Integridade temporal e preservação

O protocolo dos bilhetes e a identidade dos perfis foram preservados. O protocolo de **avaliação** passou a `objetivo-426-3` para reprocessar o critério temporal. Rodadas já registradas não são reescritas. Decisões antigas permanecem no histórico e recebem revalidação conservadora; a seleção volta à referência inicial até nova confirmação, sem mudar o pacote congelado já exibido.

A rejeição de pacotes do mesmo dia é deliberadamente conservadora: os dados atuais têm data, não hora oficial verificável de apuração. Isso pode excluir pacotes legítimos feitos pela manhã. O app não deve chamar o conjunto ambíguo de evidência prospectiva comprovada.

A **referência de semelhança histórica é retrospectiva**: os perfis são reconstruídos sobre o acervo disponível, omitindo o próprio resultado. Não é um retrato do conhecimento existente na data de cada exemplo histórico. Essa distinção foi explicada na interface; os pesos não foram alterados. O backtest cronológico é um caminho distinto, com testes de exclusão do alvo e do futuro.

Relógio e armazenamento locais também não constituem uma trilha de criação certificada por terceiros. A revisão não promete proteção absoluta contra adulteração deliberada do aparelho.

## 5. Distribuição e manutenção

A sincronização de `index.html`, `sw.js`, manifesto, `ui/` e `runner/` para `www/` agora usa Node, sem depender de comandos de cópia específicos do shell. A checagem exige conteúdo e listas de arquivos iguais. Se um asset removido da fonte sobrar na distribuição, a ferramenta falha explicitamente: não apaga automaticamente arquivos extras.

A CI recebe a trava de versão e as novas regressões. Os nomes dos APKs de preview usam `VERSION`, sem número antigo fixo. Testes da interface que exigiam o painel retirado foram substituídos por verificações do fluxo atual; os cálculos legados continuam na suíte analítica específica.

O HTML único contém módulos, estilos, worker e recorte do acervo embutidos. Foi verificado em `file://`, sem precisar de uma pasta `ui/` ao lado. Ele **não atualiza um APK instalado**. Seu histórico é o acervo do projeto: não foram baixados resultados externos novos nesta revisão.

## 6. Testes executados

Os números abaixo são verificações de suítes distintas, não concursos analisados ou probabilidades de sucesso.

| Verificação | Resultado |
|---|---|
| Regressões novas da revisão | 18 passaram; 0 falhas. |
| Laboratório | 25 passaram; 0 falhas. |
| Recomendação integrada | 21 passaram; 0 falhas. |
| Ciclo automático | 30 passaram; 0 falhas; repetido após a correção temporal. |
| Motor amplo | 808 passaram; 0 falhas. |
| Inteligência existente | 25 passaram; 0 falhas. |
| Avaliação analítica legada | 21 passaram; 0 falhas. |
| Recorrência | 12 passaram; 0 falhas. |
| Backup | 6 passaram; 0 falhas. |
| Metas | 22 passaram; 0 falhas. |
| Complementos | 10 passaram; 0 falhas. |
| Acompanhamento | 7 passaram; 0 falhas. |
| Atualizador | 18 passaram; 0 falhas. |
| Infraestrutura de assinatura | 22 testes passaram; não equivale a assinar um APK. |
| Interface completa no Chromium | 513 passaram; 0 falhas na execução final. |
| Distribuição offline e HTML único | 7 cenários passaram, incluindo salvamento por toque real. |
| Sintaxe, referências douradas, XML Android, versão, distribuição e diff | Sem inconsistência detectada nas verificações executadas. |

Os cenários offline verificaram primeiro worker com servidor desligado, análise e referências aleatórias, sugestão automática, perfis das modalidades, salvamento, reabertura/reconciliação e HTML único com worker Blob. A interface final cobriu navegação, modalidades, larguras, temas, pacotes congelados, teimosinha, jogo fixo, backup e formatos especiais.

Testes oferecem cobertura de regressão, **não prova de ausência de todos os defeitos**. A ponte Android foi simulada no navegador; não houve teste desta versão instalada em aparelho físico. O motor amplo e as suítes auxiliares foram executados durante a revisão; as alterações tardias foram rechecadas nos testes temporais, automáticos e visuais afetados.

## 7. Próximas melhorias recomendadas

| Prioridade | Próximo trabalho | Motivo |
|---|---|---|
| Alta | Compilar com certificado permanente e testar instalação/atualização em Android real. | Versão e testes de infraestrutura não garantem assinatura compatível ou comportamento nativo. |
| Alta | Adicionar hora oficial da apuração e trilha confiável de criação das rodadas. | Permite avaliar registros do mesmo dia sem presumir anterioridade. |
| Média | Modularizar o grande `index.html` e retirar código legado após checar compatibilidade. | Reduz caminhos duplicados, atalhos órfãos e testes desatualizados. |
| Média | Priorizar critérios objetivos separados, reavaliando a necessidade de uma pontuação única. | Evita interpretar um número operacional como evidência de previsão. |
| Média | Melhorar a transparência sobre atualização e cobertura do acervo. | Dados antigos ou recortados não devem aparentar representar resultados recém-publicados ou todo o histórico. |

**Recomendação final:** a base está melhor preparada para a entrega Android, mas não deve ser apresentada como APK final antes de compilação assinada e teste em dispositivo. O ganho já obtido é correção e clareza da análise, não promessa de acerto.

## 8. Continuação autorizada — 08/10/2026

A melhoria de transparência do acervo recomendada na seção 7 foi implementada. **Cobertura e atualização do histórico** aparece no laboratório, em Dados e nas sugestões automática/integrada, incluindo a data do último concurso, cobertura apenas dentro do recorte, trecho consecutivo final e fontes declaradas. Datas ausentes não são supridas pela data de download; datas invertidas ou futuras ficam sinalizadas. Recortes históricos e Mega da Virada não recebem alerta artificial de atraso. A idade depende do relógio do aparelho e não certifica o último resultado oficial. O diagnóstico é exportado no JSON e não altera assinaturas, pesos, pontuação operacional ou jogos.

Os dados novos de `origin/main` foram incorporados por fast-forward, sem reescrever as melhorias: commit `78f9611`. O acervo incorporado termina na Mega-Sena 3067 (06/10/2026) e Lotofácil 3799 (07/10/2026). O HTML único foi regenerado. A afirmação anterior de que não foram incorporados resultados externos aplica-se à etapa anterior, não a esta continuidade.

**Validação desta etapa:** 27 regressões da revisão, 25 testes de laboratório, 21 de recomendação, 30 do automático e sete cenários offline passaram. Sintaxe, XML, distribuição, versão e referência dourada conferidos. As 513 verificações visuais registradas anteriormente são da revisão anterior; a CI do PR reexecutará o conjunto completo para esta continuação, sem presumir seu resultado.

O trabalho está na branch `melhorias/lotolab-4.26.3-revisao`, preparado para pull request. Não foi autorizado merge automático ou release pública. A leitura dos nomes dos secrets de assinatura falhou com HTTP 403 da integração; não é possível concluir daí se os secrets existem ou não. A assinatura permanente permanece uma pendência, e nenhum APK de revisão/debug deve ser apresentado como atualização final.
