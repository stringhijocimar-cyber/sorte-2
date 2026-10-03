# Atualizações do LotoLab sem perder os jogos

A 4.24 e a 4.25 foram publicadas com certificados de depuração diferentes. A chave privada de cada compilação não foi guardada. Um APK contém o certificado público, mas não a chave que permitiria assinar uma atualização compatível.

A correção usa uma chave permanente para todos os próximos APKs finais, conserva o identificador `app.lotolab.jogos` e aumenta o `versionCode`. A publicação verifica o certificado antes de disponibilizar os arquivos. Um APK de revisão nunca vira release final. Releases existentes não são apagadas nem substituídas.

## Cadastrar a chave permanente uma única vez

Uma chave permanente foi criada e seu certificado está fixado em `android/assinatura.sha256`. É necessário ser administrador do repositório. Extraia o backup privado **LotoLab-Assinatura-Permanente.zip**. Em um computador com Python 3, JDK 17 e GitHub CLI, execute:

```sh
gh auth login
python ferramentas/configurar-assinatura.py --diretorio CAMINHO_DA_PASTA_EXTRAIDA
```

O comando verifica a chave contra o certificado fixado e cadastra cinco Secrets do GitHub Actions. Ao executar novamente, reutiliza a mesma chave. Guarde uma cópia privada desse diretório; ela contém a chave e sua senha. Não adicione esses arquivos ao Git nem aos artefatos públicos do Actions. Se o backup não estiver disponível, o comando recusa criar uma chave substituta.

Se a chave já tiver sido criada em outro computador, transfira o diretório privado completo e use `--diretorio CAMINHO`. Não gere outra chave para um app já publicado com assinatura permanente.

Os Secrets são `LOTOLAB_KEYSTORE_BASE64`, `LOTOLAB_STORE_PASSWORD`, `LOTOLAB_KEY_ALIAS`, `LOTOLAB_KEY_PASSWORD` e `LOTOLAB_SIGNING_SHA256`. O último identifica o certificado esperado; trocar apenas o keystore bloqueia a publicação. Na ausência dos Secrets, os testes continuam e a publicação permanece bloqueada. Após o cadastro, execute **Actions → Publicar APK assinado → Run workflow**, usando o branch `main`.

## Transferir os dados de uma instalação antiga

Este procedimento é uma migração única; não é uma atualização compatível com a assinatura perdida. Ele foi preparado para os APKs antigos de depuração distribuídos neste repositório. Requer computador, Python 3, Android Platform Tools (`adb`) e depuração USB autorizada pelo dono do celular. Não exige root. O computador precisa enxergar o celular como `device` em `adb devices`.

1. **Mantenha o app antigo instalado.** Abra-o e confira se os jogos estão salvos.
2. Execute o backup. O comando encerra o app para copiar uma base consistente e não altera os dados salvos:

   ```sh
   python ferramentas/migrar-dados-android.py backup --arquivo LotoLab-dados-antigos.tar
   python ferramentas/migrar-dados-android.py validar --arquivo LotoLab-dados-antigos.tar
   ```

3. Guarde uma segunda cópia dos arquivos `.tar` e `.tar.sha256`. O backup inclui o armazenamento da WebView e as preferências nativas: jogos, resultados, histórico, regras de acompanhamento e memória de análise. A verificação confirma integridade e presença do armazenamento; a conferência dos dados no aparelho ocorrerá após restaurar.
4. **Somente após o backup verificado e a publicação da versão assinada**, baixe os dois APKs da mesma release. O APK **transferencia** permite restaurar os arquivos; o APK **final** desativa essa permissão e será o aplicativo de uso normal.
5. Remova a instalação antiga, instale `LotoLab-4.25.1-transferencia.apk` e execute:

   ```sh
   python ferramentas/migrar-dados-android.py restaurar --arquivo LotoLab-dados-antigos.tar
   ```

   O comando exige confirmação digitada, recusa backup incompleto, impede caminhos externos ao app e guarda uma cópia do destino antes de substituir dados existentes. Se o aparelho não permitir `run-as` ou se o backup falhar, interrompa o procedimento e conserve a instalação antiga.

6. Abra o aplicativo e confira quantidade de jogos, dezenas, histórico e acompanhamento fixo/teimosinha. Depois instale **LotoLab-4.25.1.apk por cima** do APK de transferência. Os dois usam a mesma assinatura. Reautorize as notificações caso o Android solicite.
7. Nas próximas versões finais assinadas com essa chave, instale o APK por cima, como atualização normal. O backup da migração continua guardado até você confirmar seus dados.

O procedimento ainda precisa ser confirmado no celular do usuário. O script não instala nem desinstala aplicativos automaticamente. Não use o APK de transferência como versão permanente.

Referências: [assinatura de aplicativos Android](https://developer.android.com/studio/publish/app-signing), [Android Debug Bridge](https://developer.android.com/tools/adb) e [Secrets do GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
