# LotoLab 4.26.4

Patch de distribuição com `versionCode` 41. A preparação do código não equivale à publicação do APK: a release final exige assinatura com o certificado permanente e conferência dos binários.

## O que muda

A identificação da interface, do motor, dos pacotes e dos assets passa para 4.26.4. O cache PWA foi atualizado e o HTML único foi regenerado com os resultados incorporados da branch principal. Nesse acervo, a Mega-Sena termina no concurso 3068, de 08/10/2026, e a Lotofácil no concurso 3800, de 08/10/2026; isso não certifica o último resultado oficial em tempo real.

As análises específicas da Mega-Sena e da Lotofácil, o painel de cobertura do histórico, o indicador operacional e a avaliação prospectiva conservadora permanecem disponíveis. Não foram alterados os protocolos de rodadas, os jogos congelados, as chaves de armazenamento ou o certificado público esperado. Esta versão não apresenta uma nova correção de armazenamento, pois nenhuma alteração desse tipo foi encontrada na branch remota mencionada.

A conferência de publicação passa a exigir o **versionCode** exato do projeto, além da identidade, versão, assinatura e ausência de depuração no APK final. Isso impede que um arquivo com código Android antigo seja aceito como atualização. Os testes do cache e da assinatura usam agora os metadados atuais, sem depender de números fixos de versões anteriores.

## Atualização Android

Quando a release assinada estiver disponível, o arquivo normal será **LotoLab-4.26.4.apk**. Mantendo o identificador e o certificado permanente da 4.26.3, com versionCode maior, ele será compatível com atualização por cima dessa versão. A instalação em aparelho físico ainda depende de conferência no dispositivo. Antes de atualizar, guarde uma cópia em **Meus jogos → Backup**.

O arquivo `transferencia` destina-se somente à [migração de instalações antigas com outro certificado](https://github.com/stringhijocimar-cyber/sorte-2/blob/main/docs/atualizacoes-android.md). Use o APK normal para atualização habitual. Não desinstale a versão atual para resolver conflito de assinatura sem preservar e verificar os dados.

## Estado de validação e publicação

As verificações desta versão ficam registradas no pull request e no GitHub Actions. Candidatos de compilação assinados com chave de teste não são arquivos finais instaláveis. A publicação depende do backup privado da chave permanente ou de uma configuração de assinatura já disponível no GitHub. Nenhuma chave nova será criada para substituir a assinatura existente.

As análises descrevem o histórico; não foi demonstrado aumento da chance de prêmio.
