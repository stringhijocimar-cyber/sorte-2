#!/usr/bin/env python3
"""Assina os candidatos do Actions com o backup privado, sem enviar a chave.

O certificado deve corresponder ao pino do projeto. Os arquivos compilados
devem conter exatamente a interface, o motor e o executor desta revisão.
Nenhum candidato com certificado de teste é disponibilizado como APK final.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile

RAIZ = Path(__file__).resolve().parent.parent


def sha256(path):
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def conferir_fontes(apk):
    paths = [RAIZ / name for name in ('index.html', 'sw.js', 'manifest.webmanifest')]
    for directory in ('ui', 'runner'):
        paths.extend(p for p in (RAIZ / directory).rglob('*') if p.is_file())
    with zipfile.ZipFile(apk) as archive:
        for path in paths:
            name = 'assets/public/' + path.relative_to(RAIZ).as_posix()
            if archive.read(name) != path.read_bytes():
                raise ValueError('O APK contém fontes diferentes desta revisão: ' + path.relative_to(RAIZ).as_posix())
    subprocess.run([sys.executable, str(RAIZ / 'ferramentas/conferir-apk.py'), str(apk)], check=True)


def assinar(compilacao, chave, destino, commit):
    compilacao, chave, destino = (Path(p).resolve() for p in (compilacao, chave, destino))
    versao = (RAIZ / 'VERSION').read_text().strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', versao):
        raise ValueError('Versão inválida.')
    if (compilacao / 'VERSION').read_text().strip() != versao:
        raise ValueError('A compilação não corresponde à versão atual.')
    if not re.fullmatch(r'[a-f0-9]{40}', commit) or (compilacao / 'commit.txt').read_text().strip() != commit:
        raise ValueError('A compilação não corresponde ao commit aprovado.')
    pino = (RAIZ / 'android/assinatura.sha256').read_text().strip()
    if (compilacao / 'assinatura.sha256').read_text().strip() != pino:
        raise ValueError('O certificado esperado da compilação é diferente do projeto.')
    dados = json.loads((chave / 'assinatura-privada.json').read_text())
    if dados.get('LOTOLAB_SIGNING_SHA256') != pino or not (chave / 'lotolab-release.jks').is_file():
        raise ValueError('Backup da assinatura permanente inválido.')
    ambiente = {**os.environ, **dados, 'ANDROID_SDK_ROOT': str(compilacao / 'sdk')}
    certificado = subprocess.run([
        'keytool', '-exportcert', '-keystore', str(chave / 'lotolab-release.jks'),
        '-alias', dados['LOTOLAB_KEY_ALIAS'], '-storepass:env', 'LOTOLAB_STORE_PASSWORD'
    ], env=ambiente, capture_output=True, check=True).stdout
    if hashlib.sha256(certificado).hexdigest() != pino:
        raise ValueError('A chave não corresponde ao certificado permanente. Assinatura bloqueada.')
    ferramentas = list((compilacao / 'sdk/build-tools').glob('*/lib/apksigner.jar'))
    if len(ferramentas) != 1:
        raise ValueError('Ferramentas de assinatura ausentes ou ambíguas.')
    jar = ferramentas[0]
    for nome in ('apksigner', 'aapt'):
        jar.parent.parent.joinpath(nome).chmod(0o700)
    checksums = {}
    for line in (compilacao / 'compilacao.sha256').read_text().splitlines():
        digest, name = line.split(maxsplit=1)
        checksums[name.lstrip('*')] = digest
    for nome in ('final-compilacao.apk', 'transferencia-compilacao.apk'):
        if checksums.get(nome) != sha256(compilacao / nome):
            raise ValueError('Candidato incompleto ou alterado: ' + nome)
        conferir_fontes(compilacao / nome)
    destino.mkdir(parents=True, exist_ok=True)
    saidas = []
    for modo, nome in (('final', f'LotoLab-{versao}.apk'), ('transferencia', f'LotoLab-{versao}-transferencia.apk')):
        arquivo = destino / nome
        if arquivo.exists():
            raise ValueError('O arquivo de destino já existe; use outra pasta.')
        temporario = destino / (nome + '.tmp.apk')
        try:
            subprocess.run([
                'java', '-jar', str(jar), 'sign', '--ks', str(chave / 'lotolab-release.jks'),
                '--ks-key-alias', dados['LOTOLAB_KEY_ALIAS'],
                '--ks-pass', 'env:LOTOLAB_STORE_PASSWORD', '--key-pass', 'env:LOTOLAB_KEY_PASSWORD',
                '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true',
                '--v3-signing-enabled', 'true', '--v4-signing-enabled', 'false',
                '--out', str(temporario), str(compilacao / (modo + '-compilacao.apk'))
            ], env=ambiente, capture_output=True, check=True)
            subprocess.run(['bash', str(RAIZ / 'ferramentas/conferir-assinatura.sh'), str(temporario), modo],
                           env=ambiente, cwd=RAIZ, check=True)
            conferir_fontes(temporario)
            temporario.rename(arquivo)
            saidas.append(arquivo)
        finally:
            temporario.unlink(missing_ok=True)
    (destino / f'LotoLab-{versao}.sha256').write_text(
        ''.join(sha256(p) + '  ' + p.name + '\n' for p in saidas), encoding='ascii')
    print('Os dois APKs foram assinados e verificados com o certificado permanente.')
    return saidas


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compilacao', required=True, type=Path)
    parser.add_argument('--chave', required=True, type=Path)
    parser.add_argument('--destino', required=True, type=Path)
    parser.add_argument('--commit', required=True)
    args = parser.parse_args()
    try:
        assinar(args.compilacao, args.chave, args.destino, args.commit)
    except subprocess.CalledProcessError:
        sys.exit('A assinatura ou a conferência do APK falhou. Nenhuma chave privada foi enviada.')
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as error:
        sys.exit(str(error))
