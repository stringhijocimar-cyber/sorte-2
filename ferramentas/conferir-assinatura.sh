#!/usr/bin/env bash
set -euo pipefail
apk="$1"
: "${LOTOLAB_SIGNING_SHA256:?Configure o SHA-256 do certificado permanente}"
sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
localizar() {
  if command -v rg >/dev/null 2>&1; then
    rg --files "$sdk/build-tools" -g "$1"
  else
    find "$sdk/build-tools" -type f -name "$1"
  fi | sort -V | tail -n 1
}
depuracao() {
  if command -v rg >/dev/null 2>&1; then
    rg -q '^application-debuggable' <<< "$metadados"
  else
    grep -q '^application-debuggable' <<< "$metadados"
  fi
}
assinador=$(localizar apksigner)
test -n "$assinador"
relatorio=$("$assinador" verify --verbose --print-certs "$apk")
# O SDK pode listar signatários por número ou por intervalo de API (v3.1).
# Todos precisam ter o mesmo certificado; certificados extras diferentes falham.
obtido=$(printf '%s\n' "$relatorio" | sed -nE 's/^(V[0-9.]+ )?Signer.* certificate SHA-256 digest: ([[:xdigit:]:]+)[[:space:]]*$/\2/p' | tr -d ':' | tr '[:upper:]' '[:lower:]' | sort -u)
esperado=$(printf '%s' "$LOTOLAB_SIGNING_SHA256" | tr -d ':' | tr '[:upper:]' '[:lower:]')
if [ "${3:-}" != teste ]; then
  test "$esperado" = "$(cat android/assinatura.sha256)"
fi
if [ "$obtido" != "$esperado" ]; then
  echo '::error::O APK não usa a assinatura permanente. Publicação bloqueada.'
  # O relatório contém certificados públicos, nunca a chave ou sua senha.
  printf 'Certificado esperado: %s\nCertificados encontrados: %s\n' "$esperado" "${obtido:-nenhum}"
  printf '%s\n' "$relatorio"
  exit 1
fi
echo 'APK verificado com a assinatura permanente.'
aapt=$(localizar aapt)
metadados=$("$aapt" dump badging "$apk")
versao=$(cat VERSION)
codigo=$(sed -nE 's/^[[:space:]]*versionCode[[:space:]]+([0-9]+)[[:space:]]*$/\1/p' android/app/build.gradle)
[[ "$codigo" =~ ^[0-9]+$ ]] || { echo '::error::versionCode do projeto ausente ou inválido.'; exit 1; }
case "$metadados" in
  *"package: name='app.lotolab.jogos'"*"versionCode='$codigo'"*"versionName='$versao'"*) ;;
  *) echo '::error::APK com identidade, versão ou versionCode incorreto.'; exit 1 ;;
esac
if [ "${2:-final}" = transferencia ]; then
  depuracao
else
  if depuracao; then
    echo '::error::O APK final não pode permitir depuração.'
    exit 1
  fi
fi
