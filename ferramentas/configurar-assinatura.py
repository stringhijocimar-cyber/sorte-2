"""Configura a assinatura uma vez; nunca substitui uma chave existente.

Requer JDK/keytool e, para cadastrar Secrets, GitHub CLI autenticado pelo dono.
O diretório privado deve ser guardado fora do Git e ter uma cópia de segurança.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys

REPOSITORIO = 'stringhijocimar-cyber/sorte-2'


def configurar(diretorio, somente_gerar=False, teste=False):
    if not shutil.which('keytool'):
        raise ValueError('Instale o JDK 17 para disponibilizar o keytool.')
    if not somente_gerar:
        if not shutil.which('gh'):
            raise ValueError('Instale o GitHub CLI e execute gh auth login.')
        subprocess.run(['gh', 'auth', 'status'], capture_output=True, check=True)
    diretorio = Path(diretorio).resolve()
    diretorio.mkdir(parents=True, exist_ok=True, mode=0o700)
    chave = diretorio / 'lotolab-release.jks'
    config = diretorio / 'assinatura-privada.json'
    if chave.exists() != config.exists():
        raise ValueError('Configuração incompleta. Recupere o backup; não crie outra chave.')
    pino = Path(__file__).resolve().parent.parent / 'android/assinatura.sha256'
    if not teste and pino.exists() and not chave.exists():
        raise ValueError('O projeto já possui uma chave permanente. Recupere o backup privado; não gere outra chave.')
    os.umask(0o077)
    if config.exists():
        dados = json.loads(config.read_text())
    else:
        senha = secrets.token_urlsafe(48)
        dados = {'LOTOLAB_STORE_PASSWORD': senha, 'LOTOLAB_KEY_PASSWORD': senha,
                 'LOTOLAB_KEY_ALIAS': 'lotolab'}
        ambiente = {**os.environ, **dados}
        subprocess.run(['keytool', '-genkeypair', '-keystore', str(chave),
                        '-storetype', 'JKS', '-alias', dados['LOTOLAB_KEY_ALIAS'],
                        '-keyalg', 'RSA', '-keysize', '3072', '-validity', '18250',
                        '-dname', 'CN=LotoLab, O=Jocimar Stringhi, C=BR',
                        '-storepass:env', 'LOTOLAB_STORE_PASSWORD',
                        '-keypass:env', 'LOTOLAB_KEY_PASSWORD'],
                       env=ambiente, capture_output=True, check=True)
        config.write_text(json.dumps(dados, indent=2) + '\n', encoding='utf-8')
        config.chmod(0o600)
        chave.chmod(0o600)
    ambiente = {**os.environ, **dados}
    certificado = subprocess.run([
        'keytool', '-exportcert', '-keystore', str(chave),
        '-alias', dados['LOTOLAB_KEY_ALIAS'], '-storepass:env', 'LOTOLAB_STORE_PASSWORD'
    ], env=ambiente, capture_output=True, check=True).stdout
    fingerprint = hashlib.sha256(certificado).hexdigest()
    if not teste and pino.exists() and pino.read_text().strip() != fingerprint:
        raise ValueError('Certificado diferente da assinatura permanente do projeto. Cadastro bloqueado.')
    anterior = dados.get('LOTOLAB_SIGNING_SHA256')
    if anterior and fingerprint != anterior:
        raise ValueError('Chave diferente do backup. Não será cadastrada.')
    dados['LOTOLAB_SIGNING_SHA256'] = fingerprint
    config.write_text(json.dumps(dados, indent=2) + '\n', encoding='utf-8')
    if not somente_gerar:
        dados['LOTOLAB_KEYSTORE_BASE64'] = base64.b64encode(chave.read_bytes()).decode()
        # O valor passa por stdin, não pela linha de comando nem pelos logs.
        for nome, valor in dados.items():
            subprocess.run(['gh', 'secret', 'set', nome, '--repo', REPOSITORIO],
                           input=valor.encode(), capture_output=True, check=True)
        print('Os cinco Secrets da assinatura permanente foram cadastrados.')
    print('Chave e senha guardadas em:', diretorio)
    print('Guarde uma cópia privada deste diretório. Não o publique nem o inclua no Git.')
    return fingerprint


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--diretorio', type=Path, default=Path.home() / '.lotolab-assinatura')
    parser.add_argument('--somente-gerar', action='store_true')
    args = parser.parse_args()
    try:
        configurar(args.diretorio, args.somente_gerar)
    except subprocess.CalledProcessError:
        sys.exit('Configuração interrompida. Confira a autenticação/permissão do GitHub e guarde o diretório privado.')
    except (ValueError, OSError) as e:
        sys.exit(str(e))
