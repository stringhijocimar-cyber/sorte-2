"""Transfere dados de instalações antigas de depuração sem recuperar a chave.

Não desinstala nem instala aplicativos. Backup vem antes de qualquer troca.
Restauração só é permitida no APK de transferência, com confirmação explícita.
"""
import argparse
import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime

PACOTE = 'app.lotolab.jogos'
RAIZES = ('app_webview', 'shared_prefs')
LIMITE = 512 * 1024 * 1024


def digest(arquivo):
    h = hashlib.sha256()
    with Path(arquivo).open('rb') as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b''):
            h.update(bloco)
    return h.hexdigest()


def validar(arquivo, exigir_hash=True):
    arquivo = Path(arquivo)
    if arquivo.stat().st_size > LIMITE:
        raise ValueError('Backup maior que o limite de 512 MB.')
    if exigir_hash:
        soma = Path(str(arquivo) + '.sha256')
        esperado = soma.read_text().split()[0]
        if not re.fullmatch('[a-f0-9]{64}', esperado) or digest(arquivo) != esperado:
            raise ValueError('Backup alterado ou incompleto. Restauração bloqueada.')
    total, arquivos, armazenamento = 0, 0, False
    with tarfile.open(arquivo, 'r:') as tar:
        for membro in tar:
            caminho = PurePosixPath(membro.name)
            if (caminho.is_absolute() or '..' in caminho.parts or '\\' in membro.name or
                    not caminho.parts or caminho.parts[0] not in RAIZES or
                    not (membro.isfile() or membro.isdir())):
                raise ValueError('Backup contém caminhos ou tipos de arquivo não permitidos.')
            total += membro.size
            if total > LIMITE:
                raise ValueError('Conteúdo do backup excede 512 MB.')
            if membro.isfile():
                arquivos += 1
                if ('/Local Storage/' in membro.name and
                        membro.name.endswith(('.log', '.ldb')) and membro.size > 0):
                    armazenamento = True
                # Ler até o fim detecta arquivos truncados, sem extrair no computador.
                with tar.extractfile(membro) as f:
                    while f.read(1024 * 1024):
                        pass
    if not armazenamento:
        raise ValueError('Não foi encontrado o armazenamento local dos jogos. Mantenha o app antigo instalado.')
    return arquivos


class Aparelho:
    def __init__(self, adb='adb', serial=None):
        self.adb = adb
        dispositivos = subprocess.run([adb, 'devices'], capture_output=True, text=True,
                                      check=True).stdout
        autorizados = [linha.split()[0] for linha in dispositivos.splitlines()
                       if re.fullmatch(r'\S+\s+device', linha.strip())]
        if serial:
            if serial not in autorizados:
                raise ValueError('Aparelho não autorizado. Confira o aviso de depuração USB no celular.')
            self.serial = serial
        elif len(autorizados) == 1:
            self.serial = autorizados[0]
        else:
            raise ValueError('Conecte um único celular autorizado ou informe --serial.')

    def comando(self, *args, **kwargs):
        return subprocess.run([self.adb, '-s', self.serial, *args], check=True,
                              stderr=subprocess.PIPE, **kwargs)

    def texto(self, *args):
        return self.comando(*args, stdout=subprocess.PIPE).stdout.decode('utf-8', 'replace')

    def acesso(self):
        self.texto('shell', 'run-as', PACOTE, 'id')

    def existe(self, pasta):
        try:
            self.comando('shell', 'run-as', PACOTE, 'test', '-d', pasta,
                         stdout=subprocess.DEVNULL)
            return True
        except subprocess.CalledProcessError:
            return False

    def parar(self):
        self.comando('shell', 'am', 'force-stop', PACOTE, stdout=subprocess.DEVNULL)

    def backup(self, arquivo):
        arquivo = Path(arquivo).resolve()
        soma = Path(str(arquivo) + '.sha256')
        if arquivo.exists() or soma.exists():
            raise ValueError('Arquivo já existe; escolha outro nome para preservar o backup.')
        arquivo.parent.mkdir(parents=True, exist_ok=True)
        self.acesso()
        self.parar()
        pastas = [p for p in RAIZES if self.existe(p)]
        if 'app_webview' not in pastas:
            raise ValueError('Abra o LotoLab antigo uma vez e tente novamente.')
        os.umask(0o077)
        temporario = None
        try:
            with tempfile.NamedTemporaryFile(dir=arquivo.parent, delete=False) as f:
                temporario = Path(f.name)
                self.comando('exec-out', 'run-as', PACOTE, 'tar', '-cf', '-', *pastas,
                             stdout=f)
            quantidade = validar(temporario, exigir_hash=False)
            with arquivo.open('xb') as destino, temporario.open('rb') as origem:
                shutil.copyfileobj(origem, destino)
            with soma.open('x', encoding='utf-8') as f:
                f.write(digest(arquivo) + '  ' + arquivo.name + '\n')
            validar(arquivo)
            print(f'Backup verificado: {arquivo} ({quantidade} arquivos).')
            print('Guarde também o arquivo .sha256 e uma segunda cópia antes da troca.')
        finally:
            if temporario:
                temporario.unlink(missing_ok=True)

    def restaurar(self, arquivo, versao):
        arquivo = Path(arquivo).resolve()
        validar(arquivo)
        pacote = self.texto('shell', 'dumpsys', 'package', PACOTE)
        encontrada = re.search(r'^\s*versionName=(\S+)\s*$', pacote, re.M)
        if not encontrada or encontrada.group(1) != versao:
            raise ValueError('Restauração permitida somente na versão de transferência indicada.')
        self.acesso()  # APK final não permite run-as.
        print('Esta ação substituirá os dados do APK de transferência pelo backup validado.')
        if input('Digite RESTAURAR para confirmar: ').strip() != 'RESTAURAR':
            raise ValueError('Restauração cancelada; dados preservados.')
        self.parar()
        # Guarda a instalação de destino antes de substituir arquivos existentes.
        if self.existe('app_webview'):
            retorno = arquivo.with_name('LotoLab-dados-antes-restauracao-' +
                                        datetime.now().strftime('%Y%m%d-%H%M%S') + '.tar')
            self.backup(retorno)
        # Não mistura duas bases LevelDB: arquivos de log antigos causariam corrupção.
        self.comando('shell', 'run-as', PACOTE, 'rm', '-rf', *RAIZES,
                     stdout=subprocess.DEVNULL)
        with arquivo.open('rb') as f:
            self.comando('shell', '-T', 'run-as', PACOTE, 'tar', '-xf', '-',
                         stdin=f, stdout=subprocess.DEVNULL)
        print('Arquivos restaurados. Abra o LotoLab e confira seus jogos e histórico.')
        print('Após conferir, instale o APK final assinado por cima do APK de transferência.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('acao', choices=['backup', 'validar', 'restaurar'])
    parser.add_argument('--arquivo', required=True, type=Path)
    parser.add_argument('--adb', default='adb')
    parser.add_argument('--serial')
    parser.add_argument('--versao-transferencia', default=(Path(__file__).resolve().parents[1] / 'VERSION').read_text().strip())
    args = parser.parse_args()
    try:
        if args.acao == 'validar':
            print('Backup íntegro:', validar(args.arquivo), 'arquivos.')
        else:
            aparelho = Aparelho(args.adb, args.serial)
            if args.acao == 'backup':
                aparelho.backup(args.arquivo)
            else:
                aparelho.restaurar(args.arquivo, args.versao_transferencia)
    except subprocess.CalledProcessError:
        sys.exit('Comando Android falhou. Confira a conexão e mantenha o app antigo instalado se o backup ainda não foi verificado.')
    except (ValueError, OSError, tarfile.TarError, EOFError, IndexError) as e:
        sys.exit(str(e))
