# Checklist de validação

Os 20 critérios de aceitação do §30, mapeados ao estado real. "Atendido" só
aparece quando existe teste automatizado que prova o critério — a coluna
*Evidência* nomeia o teste, para que qualquer um possa conferir em vez de
acreditar.

**Conclusão geral: o sistema NÃO está pronto.** 16 dos 20 critérios estão
atendidos sem ressalva, 1 atendido com ressalva (18: falta teste de componente
de interface) e 3 parcialmente (1: sem execução contra a API real da CAIXA;
16 e 20: dependem das telas que não existem). Nenhum critério ficou sem
nenhuma cobertura. O detalhamento está abaixo.

Reproduzir: `cd backend && python3 -m pytest -q` (360 testes, sem rede).

---

## Critérios

| # | Critério (§30) | Estado | Evidência |
|---|---|---|---|
| 1 | Importar corretamente o histórico de todas as modalidades | ⚠️ parcial | Conversão, validação e recusa testadas com respostas controladas (`test_ingestao.py`). **Ainda não executado contra a API real da CAIXA**: a política de rede deste ambiente bloqueia `servicebus2.caixa.gov.br` (403 no CONNECT). Existe `ferramentas/verificar_caixa.py` para você rodar de uma máquina com acesso — ele confere as 9 modalidades e nomeia campos ausentes, renomeados ou novos. |
| 2 | Atualizar novos concursos sem duplicidade | ✅ | `test_importa_apenas_o_que_falta`, `test_deduplica_contra_o_banco_e_dentro_do_lote`, `test_nada_a_fazer_quando_esta_em_dia`; e `UNIQUE(lottery_id, contest_number)` no schema |
| 3 | Gerar apenas jogos válidos | ✅ | `Modalidade.validar_aposta()` em toda aposta; `test_gera_jogos_validos`, `test_obrigatorios_aparecem_em_todos_os_jogos`, `test_excluidos_nao_aparecem`, `test_filtro_apertado_entrega_menos_e_nao_mente` (o gerador nunca completa o lote violando filtros) |
| 4 | Calcular corretamente combinações e probabilidades | ✅ | `test_probabilidade_da_sena_e_a_oficial` (1 em 50.063.860), `test_probabilidade_da_lotofacil_e_a_oficial` (1 em 3.268.760), `test_probabilidades_de_uma_modalidade_somam_um` |
| 5 | Executar backtests reproduzíveis | ✅ | `test_avaliacao_e_reproduzivel_com_a_mesma_semente`; semente gravada em `Avaliacao.semente` e `backtests.seed NOT NULL` |
| 6 | Separar desenvolvimento, validação e teste | ✅ | `test_particao_e_cronologica_e_nao_se_sobrepoe`, `test_particao_embaralhada_e_recusada`, `test_particao_sem_teste_e_recusada` |
| 7 | Comparar estratégias com milhares de jogos aleatórios | ✅ | 10.000 simulações em paralelo (`test_dez_mil_simulacoes_sao_viaveis`), com resultado **idêntico** a 1, 2 ou 4 processos (`test_resultado_identico_com_1_2_e_4_processos`). Endpoint `/backtests/assincrono` aceita até 100.000. |
| 8 | Calcular custos, prêmios, resultado líquido e ROI | ✅ | `test_metricas_de_carteira_conhecida`, `test_custo_usa_o_preco_do_concurso_nao_o_de_hoje`, `test_preco_respeita_a_data_do_concurso` |
| 9 | Aplicar intervalos de confiança | ✅ | Todo `Resultado` carrega IC; `test_nenhum_resultado_sai_sem_ic_e_efeito`, `test_wilson_bate_com_scipy`, `test_wilson_nunca_sai_do_intervalo_valido` |
| 10 | Corrigir múltiplos testes | ✅ | Bonferroni, Holm e BH conferidos contra `statsmodels` (`test_holm_e_bh_batem_com_statsmodels`); `test_relata_quem_perdeu_a_significancia` |
| 11 | Identificar risco de overfitting | ✅ | `overfitting.calcular()`; `test_degradacao_grande_eleva_o_risco`, `test_instabilidade_entre_janelas_eleva_o_risco`, `test_sem_janelas_cobra_metade_do_peso_e_avisa`. Os três instrumentos do §18 alimentam o índice por `robustez.risco_medido()`, e `test_medir_reduz_a_incerteza_do_indice` prova que medir muda o resultado — sem medição o índice fica preso no piso de 17,5 pontos cobrado por "não medido". **É heurística declarada, não medida oficial.** |
| 12 | Repetir testes em diferentes períodos | ✅ | Walk-forward expansiva e móvel (`test_walk_forward_expansiva_avanca_sem_sobrepor`, `test_walk_forward_movel_esquece_o_comeco`) **e** a matriz de estabilidade do §17 em `lab/robustez.py`: recortes antigo/intermediário/recente e janelas curtas/longas, cada recorte comparado com o acaso **dentro dele**. `Matriz.robusta` exige todos os recortes acima da mediana do acaso — travado por `test_robusta_exige_todos_os_recortes`; com um recorte só devolve `False` em vez do benefício da dúvida. Semente distinta por recorte, conferida no gerador (`test_cada_recorte_usa_semente_propria`), e nenhum recorte recebe o futuro como passado (`test_recortes_por_terco_nao_deixam_o_futuro_entrar`). |
| 13 | Exportar resultados | ✅ | CSV, XLSX e PDF sem dependência; o XLSX é validado lendo de volta com `openpyxl` (`test_xlsx_abre_em_leitor_independente`). O relatório recusa ser criado sem a seção de limitações (`test_relatorio_sem_limitacoes_e_recusado`). Endpoints `/jogos/exportar` e `/backtests/relatorio` entregam os arquivos. |
| 14 | Exibir avisos de limitações estatísticas | ✅ | O aviso fica **junto do dado**: o texto sobre filtros está colado aos controles de filtro, e o veredito estatístico (estimativa, faixa do acaso, p-valor, tamanho de efeito, leitura) fica no mesmo bloco do ROI. Verificado no navegador. Vale para as 2 telas existentes. |
| 15 | Não prometer capacidade de prever sorteios | ✅ | Nenhuma função de previsão existe; README e docstrings afirmam o contrário explicitamente. O `test_vocabulario.py` varre **o repositório inteiro** (Python, TypeScript, Markdown, SQL, HTML, JSON) procurando promessa de previsão ou de vantagem — a checagem é *por frase, exigindo negação*, porque os termos aparecem legitimamente dentro de negações. Um teste de sanidade confirma que a varredura ainda pega uma promessa real, e as isenções (arquivos que **citam** os termos, como a própria lista) são declaradas dentro do arquivo e limitadas a 4 por teste. |
| 16 | Funcionar em celular e computador | ⚠️ parcial | As 2 telas existentes são responsivas e verificadas a 1280px e 390px, **sem overflow horizontal**. As outras 12 telas não existem. |
| 17 | Possuir documentação técnica | ✅ | `README.md`, `ARQUITETURA.md`, `banco/schema.sql` comentado, docstrings em todos os módulos |
| 18 | Possuir testes automatizados | ✅ | 360 testes, ~36 s, sem rede: unitários, banco, API e integração, executados em SQLite **e** em PostgreSQL 16.13. ⚠️ A interface tem verificação ponta a ponta com Playwright, mas ainda não testes unitários de componente. |
| 19 | Permitir auditoria dos parâmetros utilizados | ✅ | `test_salva_backtest_com_semente_e_particao`, `test_backtest_sem_semente_e_recusado_pelo_banco`, `test_alteracao_cria_nova_versao_sem_apagar_a_anterior`, `test_auditoria_nao_expoe_alteracao_nem_remocao` |
| 20 | Atender segurança e jogo responsável | ⚠️ parcial | Segurança implementada e testada: scrypt com parâmetros no hash e detecção de rehash, tokens guardados só como hash, CSRF amarrado à sessão, limite de taxa com janela deslizante, HMAC do IP, anonimização na exclusão. Injeção de SQL testada com ataque real (`test_injecao_de_sql_nao_derruba_a_tabela`). **Falta jogo responsável na interface** (limite de orçamento, alertas, pausa) e as telas. |

---

## Validações específicas exigidas pelo §29

| Item | Estado | Evidência |
|---|---|---|
| Probabilidades | ✅ | valores oficiais conferidos; soma das probabilidades = 1 |
| Combinações | ✅ | `combinacoes_possiveis()` e `apostas_equivalentes()` testados |
| Custos | ✅ | preço pela data do concurso, aposta ampliada = C(n,k) apostas simples |
| Apuração dos prêmios | ⚠️ | apuração por interseção testada; **depende de rateio histórico completo**, que a fonte nem sempre traz. Ausência devolve 0 e é reportada, nunca estimada. |
| Separação temporal | ✅ | `test_particao_*` |
| Ausência de vazamento de dados | ✅ | `test_estrategia_nao_ve_o_futuro` — estratégia trapaceira instalada de propósito |
| Reprodutibilidade dos backtests | ✅ | `test_avaliacao_e_reproduzivel_com_a_mesma_semente`, `test_matriz_e_reproduzivel_com_a_mesma_semente` |
| Robustez (§17/§18) | ✅ | matriz de estabilidade por terços e por janelas; perturbação de ±5/10/20% um parâmetro por vez (`test_perturba_um_parametro_por_vez`); exclusão do melhor e do pior concurso (`test_concentracao_de_carteira_conhecida`). Sanidade: a estratégia aleatória **não** sai robusta contra o próprio acaso (`test_aleatorio_nao_sai_robusto_por_acidente`). |

---

## Cobertura de testes por tipo (§29)

| Tipo | Estado |
|---|---|
| Unitários | ✅ 360 |
| Estatísticos | ✅ conferidos contra SciPy e statsmodels |
| Regras de cada modalidade | ✅ 9 modalidades |
| Geração de combinações | ✅ validade, faixa, ordem, não-duplicidade, obrigatórios/excluídos, orçamento, filtros |
| Não duplicidade | ✅ importação e geração |
| Atualização de concursos | ✅ incremental, falha isolada, fallback, CSV |
| Integração | ✅ histórico do banco alimentando o motor de backtest |
| API | ✅ 36 testes ponta a ponta, motores reais |
| Banco de dados | ✅ 35 testes, executados em SQLite **e** em PostgreSQL 16.13 real; `schema.sql` aplicado sem erro |
| Robustez e sobreajuste | ✅ 33 testes de `robustez.py` + os de `overfitting.py` |
| Vocabulário proibido | ✅ 8 testes; varredura do repositório inteiro, por frase, exigindo negação |
| Interface | ⚠️ 2 telas verificadas ponta a ponta com Playwright contra a API real |
| End-to-end | ✅ login, geração com filtros, orçamento, backtest e erro da API |

---

## O que impede declarar o sistema pronto

Em ordem de impacto:

1. **Nenhuma execução contra a API real da CAIXA.** Toda a importação foi
   exercitada com respostas controladas, e o formato real pode divergir do que
   assumi. A política de rede deste ambiente bloqueia o domínio da CAIXA, então
   a verificação não pôde ser feita aqui. Rode `python3
   ferramentas/verificar_caixa.py` de uma máquina com acesso: ele sai com
   código 1 e nomeia exatamente o que divergiu.
2. **Só 2 das 14 telas.** Gerador e Backtest funcionam de verdade; as outras
   doze do §24 não existem. Foi escolha deliberada: duas telas que executam o
   código real valem mais que catorze que parecem executar. A matriz de
   estabilidade e a análise de robustez já existem no motor e ainda **não**
   têm tela nem endpoint — hoje só chegam a quem chama a biblioteca.
3. **Jogo responsável ainda não tem interface.** O limite de orçamento existe
   no modelo e o gerador respeita orçamento, mas alertas, pausa e histórico de
   gastos dependem de tela.
4. **Preços e faixas conferidos apenas contra fontes públicas.** Um preço
   histórico errado contamina o ROI de todo o período. Precisa de conferência
   contra o portal oficial antes de qualquer uso sério.

---

## Regra permanente

> Sempre que uma metodologia apresentar resultado aparentemente superior,
> executar validação fora da amostra, Monte Carlo e correção para múltiplos
> testes. *(§33)*

Isto já é o comportamento padrão de `avaliar_periodo()`: a comparação contra
carteiras aleatórias e o teste de permutação não são opcionais, e o resultado
sai com IC e tamanho de efeito ao lado.

A demonstração de ponta a ponta existe para exercitar exatamente esse caso: uma
carteira com **ROI +28,57%** no **percentil 95,8** — e o veredito *"diferença
compatível com acaso"*, porque o ganho inteiro veio de uma única quadra, com
seca de 25 concursos e queda acumulada de R$ 437,50.
