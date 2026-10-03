#!/usr/bin/env bash
set -euo pipefail
apk="$1"
: "${LOTOLAB_SIGNING_SHA256:?Configure o SHA-256 do certificado permanente}"
sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
assinador=$(rg --files "$sdk/build-tools" -g apksigner | sort -V | tail -n 1)
test -n "$assinador"
relatorio=$("$assinador" verify --verbose --print-certs "$apk")
obtido=$(printf '%s\n' "$relatorio" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | tr -d ':' | tr '[:upper:]' '[:lower:]')
esperado=$(printf '%s' "$LOTOLAB_SIGNING_SHA256" | tr -d ':' | tr '[:upper:]' '[:lower:]')
if [ "${3:-}" != teste ]; then
  test "$esperado" = "$(cat android/assinatura.sha256)"
fi
if [ "$obtido" != "$esperado" ]; then
  echo '::error::O APK não usa a assinatura permanente. Publicação bloqueada.'
  exit 1
fi
echo 'APK verificado com a assinatura permanente.'
aapt=$(rg --files "$sdk/build-tools" -g aapt | sort -V | tail -n 1)
metadados=$("$aapt" dump badging "$apk")
versao=$(cat VERSION)
case "$metadados" in
  *"package: name='app.lotolab.jogos'"*"versionName='$versao'"*) ;;
  *) echo '::error::APK com identidade ou versão incorreta.'; exit 1 ;;
esac
if [ "${2:-final}" = transferencia ]; then
  printf '%s\n' "$metadados" | rg -q '^application-debuggable'
else
  if printf '%s\n' "$metadados" | rg -q '^application-debuggable'; then
    echo '::error::O APK final não pode permitir depuração.'
    exit 1
  fi
fi
