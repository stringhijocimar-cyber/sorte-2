"""Verifica reutilização da chave, bloqueio de assinatura errada e backup seguro."""
import base64
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import shlex
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

RAIZ = Path(__file__).resolve().parent.parent


def importar(nome):
    spec = importlib.util.spec_from_file_location(nome, RAIZ / 'ferramentas' / (nome + '.py'))
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


configurar = importar('configurar-assinatura')
preparar = importar('preparar-assinatura')
migrar = importar('migrar-dados-android')


class Assinatura(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporario = tempfile.TemporaryDirectory()
        cls.diretorio = Path(cls.temporario.name)
        cls.sha = configurar.configurar(cls.diretorio, somente_gerar=True, teste=True)
        cls.privados = json.loads((cls.diretorio / 'assinatura-privada.json').read_text())
        cls.chave = (cls.diretorio / 'lotolab-release.jks').read_bytes()
        cls.ambiente = {**cls.privados,
                       'LOTOLAB_KEYSTORE_BASE64': base64.b64encode(cls.chave).decode()}

    @classmethod
    def tearDownClass(cls):
        cls.temporario.cleanup()

    def test_reexecucao_mantem_exatamente_a_chave(self):
        self.assertEqual(configurar.configurar(self.diretorio, somente_gerar=True, teste=True), self.sha)
        self.assertEqual((self.diretorio / 'lotolab-release.jks').read_bytes(), self.chave)

    def test_configuracao_parcial_nao_cria_outra_chave(self):
        with tempfile.TemporaryDirectory() as d:
            Path(d, 'lotolab-release.jks').write_bytes(self.chave)
            with self.assertRaisesRegex(ValueError, 'incompleta'):
                configurar.configurar(d, somente_gerar=True)
            self.assertEqual(Path(d, 'lotolab-release.jks').read_bytes(), self.chave)

    def test_materializa_somente_se_certificado_confere(self):
        with tempfile.TemporaryDirectory() as d:
            Path(d, 'android').mkdir()
            Path(d, 'android/assinatura.sha256').write_text(self.sha)
            with patch.dict(os.environ, self.ambiente):
                preparar.preparar(d)
            self.assertEqual(Path(d, 'android/lotolab-release.jks').read_bytes(), self.chave)
            if os.name != 'nt':
                self.assertEqual(Path(d, 'android/chave.properties').stat().st_mode & 0o777, 0o600)

    def test_certificado_errado_bloqueia_e_limpa_arquivos(self):
        with tempfile.TemporaryDirectory() as d:
            Path(d, 'android').mkdir()
            Path(d, 'android/assinatura.sha256').write_text(self.sha)
            with patch.dict(os.environ, {**self.ambiente, 'LOTOLAB_SIGNING_SHA256': '0' * 64}):
                with self.assertRaisesRegex(ValueError, 'diferente'):
                    preparar.preparar(d)
            self.assertFalse(Path(d, 'android/lotolab-release.jks').exists())
            self.assertFalse(Path(d, 'android/chave.properties').exists())

    def test_pin_publico_impede_cadastrar_chave_nova(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError, 'já possui'):
                configurar.configurar(d, somente_gerar=True)
            self.assertFalse(Path(d, 'lotolab-release.jks').exists())

    def test_falta_de_segredo_nao_gera_assinatura(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, 'incompleta'):
                preparar.preparar(d)
            self.assertFalse(Path(d, 'android/lotolab-release.jks').exists())


class Backup(unittest.TestCase):
    def setUp(self):
        self.temporario = tempfile.TemporaryDirectory()
        self.arquivo = Path(self.temporario.name) / 'LotoLab-dados-teste.tar'

    def tearDown(self):
        self.temporario.cleanup()

    def criar(self, extra=None):
        with tarfile.open(self.arquivo, 'w') as tar:
            conteudo = b'lotolab:jogos [1,2,3] lotolab:resultados []'
            item = tarfile.TarInfo('app_webview/Default/Local Storage/leveldb/000003.log')
            item.size = len(conteudo)
            tar.addfile(item, io.BytesIO(conteudo))
            if extra:
                tar.addfile(extra)
        Path(str(self.arquivo) + '.sha256').write_text(migrar.digest(self.arquivo) + '  dados.tar\n')

    def test_preserva_os_bytes_do_armazenamento(self):
        self.criar()
        self.assertEqual(migrar.validar(self.arquivo), 1)
        with tarfile.open(self.arquivo) as tar:
            self.assertIn(b'lotolab:jogos', tar.extractfile(tar.getmembers()[0]).read())

    def test_backup_alterado_e_recusado(self):
        self.criar()
        with self.arquivo.open('r+b') as f:
            f.seek(600)
            f.write(b'alterado')
        with self.assertRaisesRegex(ValueError, 'alterado'):
            migrar.validar(self.arquivo)

    def test_traversal_e_recusado_mesmo_com_hash_valido(self):
        self.criar(tarfile.TarInfo('app_webview/../../fora'))
        with self.assertRaisesRegex(ValueError, 'caminhos'):
            migrar.validar(self.arquivo)

    def test_symlink_e_recusado(self):
        item = tarfile.TarInfo('app_webview/atalho')
        item.type = tarfile.SYMTYPE
        item.linkname = '/data/outro-app'
        self.criar(item)
        with self.assertRaisesRegex(ValueError, 'tipos'):
            migrar.validar(self.arquivo)

    def test_backup_sem_jogos_e_recusado(self):
        with tarfile.open(self.arquivo, 'w') as tar:
            tar.addfile(tarfile.TarInfo('shared_prefs/estado.xml'))
        with self.assertRaisesRegex(ValueError, 'armazenamento'):
            migrar.validar(self.arquivo, exigir_hash=False)

    def test_restauracao_nao_toca_instalacao_antiga(self):
        self.criar()
        aparelho = object.__new__(migrar.Aparelho)
        aparelho.texto = lambda *args: 'versionName=4.24.0\n'
        aparelho.comando = lambda *args, **kwargs: self.fail('Não pode escrever na instalação antiga')
        with self.assertRaisesRegex(ValueError, 'versão de transferência'):
            aparelho.restaurar(self.arquivo, '4.25.1')

    def test_cancelamento_nao_substitui_dados(self):
        self.criar()
        aparelho = object.__new__(migrar.Aparelho)
        aparelho.texto = lambda *args: 'versionName=4.25.1\n'
        aparelho.acesso = lambda: None
        aparelho.comando = lambda *args, **kwargs: self.fail('Não pode escrever após cancelar')
        with patch('builtins.input', return_value='CANCELAR'):
            with self.assertRaisesRegex(ValueError, 'cancelada'):
                aparelho.restaurar(self.arquivo, '4.25.1')

    def test_backup_e_restauracao_preservam_bytes_e_guardam_destino(self):
        # Transporte simulado; arquivos reais e a mesma rotina de validação.
        dispositivo = Path(self.temporario.name) / 'aparelho'
        local = dispositivo / 'app_webview/Default/Local Storage/leveldb/000003.log'
        prefs = dispositivo / 'shared_prefs/estado.xml'
        local.parent.mkdir(parents=True)
        prefs.parent.mkdir(parents=True)
        jogos = b'lotolab:jogos: fixos, teimosinhas e historico\x00\xff'
        local.write_bytes(jogos)
        prefs.write_bytes(b'<map><string name="estado">dados antigos</string></map>')
        aparelho = object.__new__(migrar.Aparelho)
        aparelho.texto = lambda *args: 'versionName=4.25.1\n'
        aparelho.parar = lambda: None
        aparelho.existe = lambda p: (dispositivo / p).is_dir()
        def comando(*args, **kwargs):
            if args[0] == 'exec-out':
                with tarfile.open(fileobj=kwargs['stdout'], mode='w|') as tar:
                    for pasta in migrar.RAIZES:
                        tar.add(dispositivo / pasta, arcname=pasta)
            elif 'rm' in args:
                for pasta in migrar.RAIZES:
                    shutil.rmtree(dispositivo / pasta)
            elif '-xf' in args:
                with tarfile.open(fileobj=kwargs['stdin']) as tar:
                    tar.extractall(dispositivo, filter='data')
            else:
                self.fail('Comando inesperado: ' + repr(args))
        aparelho.comando = comando
        aparelho.backup(self.arquivo)
        self.assertEqual(migrar.validar(self.arquivo), 2)
        local.write_bytes(b'estado novo antes de restaurar')
        with patch('builtins.input', return_value='RESTAURAR'):
            aparelho.restaurar(self.arquivo, '4.25.1')
        self.assertEqual(local.read_bytes(), jogos)
        self.assertIn(b'dados antigos', prefs.read_bytes())
        retorno = list(Path(self.temporario.name).glob('LotoLab-dados-antes-restauracao-*.tar'))
        self.assertEqual(len(retorno), 1)
        with tarfile.open(retorno[0]) as tar:
            self.assertEqual(tar.extractfile('app_webview/Default/Local Storage/leveldb/000003.log').read(),
                             b'estado novo antes de restaurar')


@unittest.skipIf(os.name == 'nt', 'O verificador bash roda no runner Linux')
class RelatorioAssinatura(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        p = Path(self.tmp.name)
        self.bin = p / 'bin'
        self.bin.mkdir()
        self.sdk = p / 'sdk/build-tools/35.0.0'
        self.sdk.mkdir(parents=True)
        for nome in ['find', 'sort', 'tail', 'tr', 'sed', 'grep', 'cat']:
            (self.bin / nome).symlink_to(shutil.which(nome))
        self.sha = 'a' * 64
        self.env = {**os.environ, 'PATH': str(self.bin),
                    'ANDROID_SDK_ROOT': str(p / 'sdk'), 'LOTOLAB_SIGNING_SHA256': self.sha}

    def tearDown(self):
        self.tmp.cleanup()

    def verificar(self, linhas, modo='final', debug=False):
        signer = self.sdk / 'apksigner'
        signer.write_text("#!/bin/sh\nprintf '%s\\n' " + shlex.quote('\n'.join(linhas)) + '\n')
        signer.chmod(0o700)
        badging = "package: name='app.lotolab.jogos' versionCode='36' versionName='4.25.1'"
        if debug:
            badging += '\napplication-debuggable'
        aapt = self.sdk / 'aapt'
        aapt.write_text("#!/bin/sh\nprintf '%s\\n' " + shlex.quote(badging) + '\n')
        aapt.chmod(0o700)
        return subprocess.run(['/usr/bin/bash', str(RAIZ / 'ferramentas/conferir-assinatura.sh'),
                               'teste.apk', modo, 'teste'], env=self.env, cwd=RAIZ,
                              capture_output=True).returncode

    def test_formato_numerado_sem_ripgrep(self):
        self.assertEqual(self.verificar(['Signer #1 certificate SHA-256 digest: ' + self.sha]), 0)

    def test_intervalos_de_api_com_mesmo_certificado(self):
        self.assertEqual(self.verificar([
            'Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: ' + self.sha,
            'Signer (minSdkVersion=24, maxSdkVersion=32) certificate SHA-256 digest: ' + self.sha]), 0)

    def test_certificado_diferente_em_um_intervalo_bloqueia(self):
        self.assertNotEqual(self.verificar([
            'Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: ' + self.sha,
            'Signer (minSdkVersion=24, maxSdkVersion=32) certificate SHA-256 digest: ' + 'b' * 64]), 0)

    def test_segundo_signatario_diferente_bloqueia(self):
        self.assertNotEqual(self.verificar([
            'Signer #1 certificate SHA-256 digest: ' + self.sha,
            'Signer #2 certificate SHA-256 digest: ' + 'b' * 64]), 0)

    def test_hash_de_chave_publica_nao_substitui_certificado(self):
        self.assertNotEqual(self.verificar(['Signer #1 public key SHA-256 digest: ' + self.sha]), 0)

    def test_final_nao_permite_depuracao(self):
        self.assertNotEqual(self.verificar(['Signer #1 certificate SHA-256 digest: ' + self.sha], debug=True), 0)

    def test_transferencia_exige_depuracao(self):
        linhas = ['Signer #1 certificate SHA-256 digest: ' + self.sha]
        self.assertNotEqual(self.verificar(linhas, modo='transferencia'), 0)
        self.assertEqual(self.verificar(linhas, modo='transferencia', debug=True), 0)


if __name__ == '__main__':
    unittest.main()
