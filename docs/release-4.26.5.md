# LotoLab 4.26.5

**Versão em desenvolvimento, não publicada.** Android `versionCode` 42. A versão publicada permanece 4.26.4; nenhum APK permanente desta atualização foi produzido ou substituído.

## Inteligência analítica

- Novo **Diagnóstico de frequência e estabilidade**, disponível no laboratório e nas sugestões automática/integrada. Examina todas as dezenas/posições do recorte, não apenas as selecionadas no jogo; a tabela não é ranking para apostar.
- Mostra contagem observada, contagem esperada sob sorteios uniformes, frequência e intervalo Wilson 95% **individual**. Os intervalos não são simultâneos e não decidem a sinalização conjunta.
- Frequência total: teste binomial bilateral exato. Mudança recente: teste de Fisher bilateral exato sobre os últimos 30 concursos versus até 120 anteriores, sem sobreposição. Exige ao menos 60 anteriores no trecho consecutivo final; não atravessa lacunas.
- Aplica **Holm conjuntamente a todos os p-valores brutos disponíveis** de frequência total e mudança recente. Não faz duas correções isoladas nem seleciona uma cauda favorável após observar os resultados.
- A leitura recente antiga também passa a respeitar o trecho consecutivo final e esclarece que sua coluna total inclui os recentes. A comparação de mudança fica exclusivamente no diagnóstico com janelas separadas.
- Bases com menos de 30 concursos não geram sinal de frequência total; Mega da Virada não recebe testes de frequência por concursos consecutivos.
- Corrige a apresentação da integridade na recomendação: conflitos e registros inválidos excluídos deixam de desaparecer quando a análise é reconstruída sobre registros já normalizados.

## Compatibilidade

Jogos, pesos, sementes do gerador, protocolos de rodadas, certificado Android, chaves de armazenamento e migração IndexedDB permanecem preservados. O diagnóstico é determinístico e funciona offline; não usa IA externa nem gera resultados fictícios. Cache pequeno e isolado evita repetir a matemática ao analisar jogos diferentes da mesma base.

## Limitações

Os testes pressupõem resultados independentes e um acervo sem seleção enviesada. Não autenticam a fonte nem certificam ausência de viés. Holm controla esta família de comparações no recorte atual; não controla a busca repetida por outros cortes ou modalidades. Sinais são exploratórios e exigem confirmação em período separado. Nenhum indicador altera probabilidades matemáticas, demonstra vantagem de aposta ou justifica aumentar o orçamento.

## Validação e publicação

Regressões específicas em `ferramentas/testar-diagnostico.mjs`, além das suítes existentes. A publicação final continua separada deste trabalho: exige CI aprovada e APKs assinados permanentemente, conferidos e correspondentes ao código final. Não instalar um candidato de revisão como atualização permanente.
