# LotoLab 4.26.0

A decisão automática passa a exigir melhora na média de acertos e na proximidade do prêmio máximo. O índice de proximidade é fixo, limitado e dá mais peso aos acertos altos; não representa uma probabilidade. Na +Milionária, exige também os trevos. Trevos ausentes ficam fora dessa métrica, sem serem contados como erro ou prêmio completo.

São comparados os mesmos jogos congelados antes de cada concurso. A escolha exige confirmação no teste separado, três períodos positivos, resistência à remoção do melhor resultado, correção conjunta de 40 comparações e controle para consultas repetidas. Corrigir um resultado atualiza sua apuração e invalida a calibração inicial quando necessário. A atualização conserva os registros originais do laboratório.

**Meus jogos → Backup** salva jogos de todas as modalidades, conferências, regras de jogo fixo/teimosinha, resultados, preferências e análises. No Android, um seletor permite escolher o arquivo e a gravação é conferida por leitura. A importação verifica SHA-256 e estrutura antes de escrever; uma falha de gravação tenta reverter ao estado anterior. Guarde uma cópia externa antes de restaurar.

Os APKs finais usam a assinatura permanente verificada. Instalações antigas com outro certificado precisam da [migração única com backup](atualizacoes-android.md). **Não desinstale a versão antiga antes de verificar o backup.** O APK `transferencia` destina-se apenas a essa migração; após conferir os dados, instale o APK final por cima.

Não foi demonstrado aumento da chance de prêmio. As novas medidas avaliam hipóteses e descrevem os acertos registrados. A migração e o seletor de arquivos ainda precisam da confirmação no aparelho do usuário.

Uma entrega automática de sugestões preserva a posição de leitura dos diagnósticos. Durante uma avaliação manual, os critérios permanecem bloqueados e a entrega automática aguarda o término do cálculo.
