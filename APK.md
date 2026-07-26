# Gerar o APK do zero

Tudo que é preciso para reconstruir os artefatos Android em uma máquina limpa.

## Pré-requisitos

- Node 18+ e npm
- JDK 17
- Android SDK com plataforma 35 e build-tools 35.0.0
- `ANDROID_HOME` apontando para o SDK

## Passos

```bash
cd lotolab-app

# 1. a pasta www/ é a raiz web que o Capacitor empacota
mkdir -p www
cp index.html manifest.webmanifest sw.js icone*.png icone.svg www/

# 2. dependências e projeto Android
npm install
npx cap add android          # só na primeira vez
npx cap sync android         # sempre que o index.html mudar

# 3. ícones adaptativos e splash, a partir de icone-maskable.png
python3 ferramentas/gerar-icones.py

# 4. build
cd android
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleDebug                       # APK de teste
./gradlew assembleRelease bundleRelease        # APK assinado + AAB
```

> `npx cap add android` regenera o projeto do template e **descarta os ajustes
> abaixo**. Depois de rodá-lo, reaplique-os — eles estão versionados em
> `android/`, então basta `git checkout android/` se você usa git.

## Saídas

```
android/app/build/outputs/apk/debug/app-debug.apk
android/app/build/outputs/apk/release/app-release.apk
android/app/build/outputs/bundle/release/app-release.aab
```

## Assinatura

A keystore não está no repositório, e não deve estar. Para criar a sua:

```bash
cd android
keytool -genkeypair -v -keystore lotolab.jks -alias lotolab \
  -keyalg RSA -keysize 4096 -validity 10950

cat > chave.properties <<'EOF'
storeFile=lotolab.jks
storePassword=SUA_SENHA
keyAlias=lotolab
keyPassword=SUA_SENHA
EOF
```

`android/.gitignore` já bloqueia `chave.properties` e `*.jks`.

Sem esses dois arquivos o projeto continua compilando: `assembleDebug`
funciona normalmente e o release sai sem assinatura.

**Guarde a keystore e as senhas.** Perdê-las significa não conseguir mais
publicar atualização do app na Play Store — a loja identifica o app pela
assinatura, e não há como recuperar.

## O que foi ajustado no projeto Android gerado

| Arquivo | Ajuste |
|---|---|
| `variables.gradle` | `minSdkVersion` 22 → **23**; compile/target 34 → **35** |
| `app/build.gradle` | `versionName` "1.0" → **"1.0.0"**, `versionCode` 1; bloco de assinatura lendo `chave.properties` |
| `AndroidManifest.xml` | `INTERNET` removida; permissão de receiver do AndroidX removida; `screenOrientation="portrait"`; backup desativado |
| `res/values/styles.xml` | Splash com fundo `#0F1E2E`, sem texto, sem animação (`animationDuration` 0) |
| `res/values/colors.xml` | Paleta naval; `ic_launcher_background` = `#0F1E2E` |
| `res/mipmap-anydpi-v26/` | Ícone adaptativo com camada monocromática (tema do Android 13+) |
| `res/mipmap-*/` | Ícones legado e camada de frente, 5 densidades, gerados de `icone-maskable.png` |
| `res/xml/data_extraction_rules.xml` | Nada vai para backup em nuvem nem para transferência entre aparelhos |
| removidos | `drawable-land-*`, `drawable-port-*` (splashes do template) |

## Verificar o resultado

```bash
# deve imprimir apenas "package: app.lotolab.jogos" — nenhuma permissão
$ANDROID_HOME/build-tools/35.0.0/aapt dump permissions \
  android/app/build/outputs/apk/release/app-release.apk

# versão, minSdk e orientação
$ANDROID_HOME/build-tools/35.0.0/aapt dump badging \
  android/app/build/outputs/apk/release/app-release.apk | head -5

# assinatura
$ANDROID_HOME/build-tools/35.0.0/apksigner verify --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
```

## Testes

```bash
node ferramentas/testar-motor.mjs                      # 103 testes de lógica

python3 -m http.server 8123 --bind 127.0.0.1 &         # numa aba
cd www && node --experimental-websocket ../ferramentas/testar-interface.mjs
                                                        # 42 testes de interface
```

O teste de motor extrai o `<script>` do `index.html` e o executa em uma VM:
o código testado é o que roda no aparelho, sem cópia paralela. O teste de
interface dirige um Chrome headless pelo protocolo DevTools e grava as
capturas em `capturas/`.

Evite a porta 5060 nos testes de interface: o Chrome a bloqueia por ser porta
de SIP (`ERR_UNSAFE_PORT`).
