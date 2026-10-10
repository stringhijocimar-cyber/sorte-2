# LotoLab — revisão de inteligência analítica

**Data:** 10/10/2026. **Última versão publicada verificada:** [4.26.4](https://github.com/stringhijocimar-cyber/sorte-2/releases/tag/v4.26.4). **Base do trabalho:** `main` em `2ea9105f9200347e9f819af5da080d4ef8d4bd71`. **Melhoria preparada:** 4.26.5, Android versionCode 42, ainda não publicada.

## Conclusão

O aplicativo já tem mais rigor que um simples gerador de “dezenas quentes”: valida resultados, compara estratégias com o acaso, separa seleção e teste, acompanha pacotes congelados e controla consultas prospectivas repetidas. A 4.26.4 resolveu uma limitação operacional importante com IndexedDB para históricos e pacotes volumosos.

A principal lacuna agora é **transformar contagens em interpretação confiável**, não acrescentar mais filtros arbitrários. O usuário precisa distinguir uma frequência observada, uma mudança exploratória e uma evidência independente de benefício. Em sorteios independentes, histórico, atraso e aparência de equilíbrio não mudam a chance matemática de uma combinação específica.

Nesta revisão foram implementadas melhorias de interpretação e integridade, preservando a seleção de jogos. Não foi adicionado um chatbot nem um modelo externo: a matemática é determinística, auditável e disponível offline.

## Problemas encontrados e correções

| Achado na 4.26.4 | Consequência | Correção preparada na 4.26.5 |
| --- | --- | --- |
| A tabela de frequência usa só as dezenas escolhidas | Pode esconder o efeito de selecionar um jogo com base no mesmo histórico | Diagnóstico independente da combinação, examinando todo o universo |
| “Recente / longa” mistura períodos sobrepostos | Não permite concluir mudança de comportamento | Últimos 30 versus 60–120 anteriores, sem sobreposição |
| A frequência recente antiga atravessa lacunas | 30 linhas podem não representar 30 concursos consecutivos | Frequência antiga e diagnóstico respeitam o trecho consecutivo final |
| Contagens e desvios sem controle conjunto dos números examinados | Procurar muitas dezenas favorece sinais por acaso | Binomial exato e Fisher exato, com Holm único dos p-valores brutos dos dois testes |
| Incerteza não aparece de forma útil na tela principal | Precisão aparente pode ser confundida com confiança de previsão | Contagem esperada, IC Wilson 95% individual, p ajustado e avisos explícitos |
| Reanalisar registros já normalizados apaga conflitos/inválidos dos painéis de integridade | A recomendação pode parecer usar uma base mais íntegra que a original | Os painéis passam a usar os metadados originais da base efetiva |

## Como o novo diagnóstico funciona

### Frequência total do recorte

Para uma dezena de Mega-Sena, a frequência matemática marginal por concurso é `6/60 = 10%`; para Lotofácil, `15/25 = 60%`. O diagnóstico compara a contagem observada com a distribuição binomial correspondente, sob as hipóteses declaradas de independência dos resultados e ausência de seleção enviesada no acervo.

O teste é bilateral exato por ordenação das probabilidades: não escolhe uma cauda favorável depois de observar a frequência. Com menos de 30 concursos, o painel mostra contagens e referência, mas não sinaliza diferenças.

### Mudança recente

Compara os últimos **30 concursos** com até **120 anteriores**, exigindo no mínimo **60 anteriores**. Os dois períodos não se sobrepõem e precisam estar no mesmo trecho contínuo do recorte. Usa Fisher bilateral exato para comparar proporções.

Uma lacuna recente que deixe menos de 90 concursos consecutivos desabilita essa comparação; os dados não são preenchidos artificialmente. A Mega da Virada não recebe este diagnóstico por janelas de concursos comuns.

### Controle e limites

- São examinadas todas as 60 dezenas de Mega-Sena e todas as 25 de Lotofácil, não só as do jogo principal.
- Holm é aplicado **conjuntamente** aos testes disponíveis: até 120 comparações na Mega-Sena e 50 na Lotofácil. A dependência entre dezenas não invalida o controle familiar de Holm sob p-valores válidos.
- O IC Wilson é **individual**, não simultâneo. Não é usado sozinho para destacar sinais.
- “Total” significa total da base efetiva depois de corte e janela; os limites são informados.
- Sinal significa diferença exploratória neste recorte, **não uma dezena recomendada**. Falta de sinal não prova ausência de viés.
- A correção não cobre procurar o recorte mais favorável em consultas sucessivas. Também não autentica a fonte nem confirma que a hipótese de independência foi atendida.

## Resultado no acervo real do repositório

Nenhum dado fictício foi usado nesta análise. Os resultados abaixo descrevem o acervo disponível no commit-base, não afirmam que ele contém o último sorteio oficial ou que sua origem foi autenticada nesta revisão.

| Modalidade | Acervo analisado | Data do último concurso | Comparações conjuntas | Dezenas com sinal exploratório |
| --- | --- | --- | --- | --- |
| Mega-Sena | 1–3068, 3.068 concursos | 08/10/2026 | 120 | 0 |
| Lotofácil | 1–3801, 3.801 concursos | 09/10/2026 | 50 | 2 |

Mega-Sena: anterior 2919–3038, recente 3039–3068. Lotofácil: anterior 3652–3771, recente 3772–3801. Os períodos recentes têm 30 resultados; os anteriores, 120.

As duas diferenças da Lotofácil precisam de **verificação dos dados e confirmação em outro período**. Não foi produzido um ranking de apostas nem ajustados os pesos do gerador com esses sinais. Reanalisar um período selecionado a posteriori não seria confirmação independente.

O cálculo adicional levou aproximadamente 14 ms na Mega-Sena e 13 ms na Lotofácil neste sandbox; não é uma garantia de desempenho em celulares. Um cache limitado reutiliza o diagnóstico entre jogos da mesma base, com cópias defensivas.

## Compatibilidade e evidências

Comparação direta do motor da 4.26.4 com o código novo, em 180 resultados reais por modalidade e lotes de três jogos, confirmou igualdade de **jogos, custo, semente, calibração, perfil, estado, rodadas e assinatura da base**, para Mega-Sena e Lotofácil. O diagnóstico não entra na escolha automática.

O certificado, os módulos de armazenamento/backup e os protocolos de avaliação não foram alterados. As referências douradas permaneceram idênticas.

| Validação local | Resultado |
| --- | --- |
| Diagnóstico novo | 18 testes aprovados |
| Revisão funcional | 27 aprovados |
| Laboratório | 25 aprovados |
| Recomendação integrada | 21 aprovados |
| Ciclo automático | 32 aprovados |
| Backup | 6 aprovados |
| Assinatura/backup nativo | 23 aprovados |
| Distribuição em Chromium | 7 cenários offline aprovados, incluindo salvamento por toque e HTML único |
| Metadados, sintaxe e distribuição `www/` | Conferidos |
| XML Android | 11 arquivos bem-formados |

A CI no pull request executará também o motor amplo, a interface completa, regressão de armazenamento e a compilação Android. A revisão local não substitui homologação no aparelho do usuário.

## Próximas melhorias com maior valor

1. **Diagnóstico prospectivo específico por faixa de acertos.** O ciclo já mede média e utilidade cúbica para acertos altos. Um próximo painel pode acompanhar taxas por faixa com denominador, controle e incerteza pré-declarados; deve evitar premiar uma estratégia por uma ocorrência rara isolada e preservar avaliação independente.
2. **Diversidade da carteira medida no objetivo, não só em pares/trios.** A carteira hoje usa união de grupos e sobreposição. É útil comparar concentração e distribuição de acertos de lotes de mesmo tamanho/formato/orçamento, com referência apropriada. Redundância menor não equivale automaticamente a maior probabilidade de qualquer prêmio.
3. **Impacto das restrições explicado antes da geração.** Fixas, exclusões e janelas personalizadas alteram o universo avaliado. Um resumo poderia informar quantas combinações são possíveis, quando a comparação usa a mesma população e por que um formato não pode completar o lote. Isso evita interpretar evidência de jogos livres como validação de filtros personalizados.

Essas etapas exigem critérios e testes próprios; não foram anunciadas como implementadas nesta revisão. O melhor avanço de “inteligência” é explicar quando **não há informação suficiente para mudar o método**, em vez de forçar um vencedor.

## Estado de entrega

Código preparado em `melhorias/inteligencia-pos-4.26.4`, para revisão por pull request. A 4.26.5 não deve ser confundida com uma release instalável. Não houve merge na main, publicação de APK permanente ou substituição da release 4.26.4 neste trabalho.
