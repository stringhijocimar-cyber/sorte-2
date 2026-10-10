# LotoLab 4.26.5

Hotfix para o aplicativo que permanecia travado na tela de abertura depois da atualização 4.26.4.

## Correções

- A primeira tela agora é desenhada antes da conferência automática dos jogos.
- A migração de dados antigos continua em segundo plano, sem prender o aplicativo no logo.
- A conferência de jogos fixos deixou de repetir uma busca em toda a lista para cada concurso. O processamento agora cresce de forma linear mesmo com históricos longos.
- Os dados antigos só são removidos depois que a gravação no IndexedDB é confirmada.
- Uma alteração feita durante a migração tem prioridade e não pode ser substituída pela cópia antiga.

## Instalação

Instale **LotoLab-4.26.5.apk** sobre a versão 4.26.4. O identificador e o certificado permanente são mantidos; não desinstale e não limpe os dados.

## Validação

A regressão de abertura inclui um jogo fixo com 4.000 concursos já conferidos, além dos testes de migração, quota, backup, restauração, interface e APK Android.
