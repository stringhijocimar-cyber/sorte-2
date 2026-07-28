#!/usr/bin/env python3
"""
Servidor local para testar o app no celular.

    python3 servir.py            # porta 8080
    python3 servir.py 3000

Não precisa de nada instalado além do Python. O app em si não precisa nem
disso: é HTML, CSS e JavaScript puros. Este script existe só porque o Android
não registra service worker em arquivo aberto direto (file://) — precisa vir
por HTTP.
"""
import functools
import http.server
import socket
import sys
from pathlib import Path

porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
raiz = Path(__file__).resolve().parent

with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except OSError:
        ip = "127.0.0.1"

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(raiz))
print(f"LotoLab servindo {raiz}\n")
print(f"  neste computador : http://127.0.0.1:{porta}")
print(f"  no celular       : http://{ip}:{porta}")
print("\n  No Chrome do Android: Menu ⋮ → Adicionar à tela inicial")
print("  (com HTTPS, o Chrome oferece 'Instalar aplicativo' sozinho)\n")
print("  Ctrl+C para encerrar.")
http.server.ThreadingHTTPServer(("0.0.0.0", porta), handler).serve_forever()
