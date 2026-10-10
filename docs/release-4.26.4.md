# LotoLab 4.26.4

Correção do travamento e da falha ao salvar sugestões depois de carregar históricos grandes. Android `versionCode` 41.

## Correções

- O histórico completo e os pacotes de análise deixam de disputar o limite do `localStorage` com os jogos salvos. Os dados volumosos usam IndexedDB, com gravação assíncrona; jogos e preferências continuam no armazenamento existente.
- A primeira abertura migra os dados volumosos e confere a leitura antes de retirar a cópia antiga. Uma falha conserva o original.
- A importação do histórico usa um índice por modalidade e concurso, reduzindo o trabalho repetido sem apagar os detalhes dos resultados existentes.
- Uma falha de gravação não dispara novamente a calibração a cada redesenho. O pacote permanece na sessão e pode ser gravado ao tocar em **Atualizar sugestão**.
- A mensagem de falha identifica o registro da análise e oferece nova tentativa e backup, sem atribuir a falha à memória livre do celular.
- O backup reúne os dois armazenamentos. A restauração dos dados volumosos é feita em uma transação; uma falha restaura também os jogos e preferências anteriores.

## Instalar

Baixe **LotoLab-4.26.4.apk** e instale por cima da 4.26.3. O APK usa o mesmo identificador e certificado permanente. Não é necessário desinstalar nem limpar os dados. A primeira abertura migra automaticamente os registros existentes.

O APK `transferencia` destina-se somente à [migração de instalações antigas com outro certificado](https://github.com/stringhijocimar-cyber/sorte-2/blob/main/docs/atualizacoes-android.md).

## Validação

A regressão de armazenamento usa Chrome real, a quota real do armazenamento antigo e o acervo completo do repositório. Confere migração, gravação da sugestão, reabertura, backup, restauração e preservação dos dados quando uma transação falha. A publicação exige também os testes do projeto e a conferência de conteúdo, integridade, identidade e certificado dos APKs finais.

O teste de instalação e uso no aparelho do usuário permanece pendente.
