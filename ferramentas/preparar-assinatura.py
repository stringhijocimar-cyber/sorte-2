"""Materializa os Secrets em arquivos privados temporários do runner.

Não gera uma chave nova. Recusa chave diferente do certificado cadastrado.
"""
import base64
import hashlib
import os
from pathlib import Path
import subprocess
import sys


def preparar(raiz, teste=False):
    campos = ('LOTOLAB_KEYSTORE_BASE64', 'LOTOLAB_STORE_PASSWORD',
              'LOTOLAB_KEY_ALIAS', 'LOTOLAB_KEY_PASSWORD', 'LOTOLAB_SIGNING_SHA256')
    if any(not os.environ.get(c) for c in campos):
        raise ValueError('Assinatura permanente incompleta. Nenhum APK final será publicado.')
    try:
        conteudo = base64.b64decode(os.environ[campos[0]], validate=True)
    except ValueError:
        raise ValueError('Keystore inválida.') from None
    if not 100 < len(conteudo) < 1_000_000:
        raise ValueError('Tamanho de keystore inválido.')
    senha = os.environ['LOTOLAB_STORE_PASSWORD']
    senha_chave = os.environ['LOTOLAB_KEY_PASSWORD']
    alias = os.environ['LOTOLAB_KEY_ALIAS']
    esperado = os.environ['LOTOLAB_SIGNING_SHA256'].replace(':', '').lower()
    if len(esperado) != 64 or any(c not in '0123456789abcdef' for c in esperado):
        raise ValueError('SHA-256 do certificado inválido.')
    pino = Path(raiz) / 'android/assinatura.sha256'
    if not teste and (not pino.exists() or pino.read_text().strip() != esperado):
        raise ValueError('Certificado diferente da assinatura permanente do projeto. Publicação bloqueada.')
    for valor in (senha, senha_chave, alias):
        if not valor or any(c in valor for c in '\r\n\x00'):
            raise ValueError('Propriedade de assinatura inválida.')
    destino = Path(raiz) / 'android'
    arquivo = destino / 'lotolab-release.jks'
    propriedades = destino / 'chave.properties'
    if arquivo.exists() or propriedades.exists():
        raise ValueError('Configuração local já existe; não será substituída.')
    os.umask(0o077)
    try:
        arquivo.write_bytes(conteudo)
        resultado = subprocess.run([
            'keytool', '-exportcert', '-keystore', str(arquivo), '-alias', alias,
            '-storepass:env', 'LOTOLAB_STORE_PASSWORD'
        ], capture_output=True, check=True)
        obtido = hashlib.sha256(resultado.stdout).hexdigest()
        if obtido != esperado:
            raise ValueError('Certificado diferente do cadastrado. Publicação bloqueada.')
        def escapar(valor):
            return ''.join('\\u%04x' % ord(c) if ord(c) > 127 else
                           '\\' + c if c in '\\:=#! ' else c for c in valor)
        propriedades.write_text(
            'storeFile=lotolab-release.jks\n' +
            'storePassword=' + escapar(senha) + '\n' +
            'keyAlias=' + escapar(alias) + '\n' +
            'keyPassword=' + escapar(senha_chave) + '\n', encoding='ascii')
        print('Assinatura permanente conferida; arquivos privados preparados.')
    except Exception:
        arquivo.unlink(missing_ok=True)
        propriedades.unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    try:
        preparar(Path(__file__).resolve().parent.parent)
    except subprocess.CalledProcessError:
        sys.exit('Não foi possível abrir o certificado. Confira os Secrets de assinatura.')
    except (ValueError, OSError) as e:
        sys.exit(str(e))
