#!/usr/bin/env python3
"""Confere o APK PRONTO, e não o código que deveria tê-lo produzido.

   uso: python3 ferramentas/conferir-apk.py caminho/do/arquivo.apk

Esta bateria existe por causa de um defeito que passou por todas as outras:
o android/app/build.gradle não aplicava o capacitor.build.gradle, então os
plugins nativos entravam no settings.gradle, compilavam (aparecendo no log,
com cara de tudo certo) e NUNCA viravam dependência do :app. As classes deles
não chegavam ao APK.

Nada ficava vermelho. O `cap sync` continuava escrevendo capacitor.plugins.json
listando os plugins, o Capacitor tentava carregá-los por reflexão e falhava
calado. O @capacitor/local-notifications ficou de fora de TODOS os APKs do
projeto por causa disso — era por isso que as notificações nunca funcionavam.

Testar o código não pegava. Testar a build não pegava, porque a build passava.
Só olhar dentro do arquivo que vai para o celular pega.
"""
import json, struct, sys, zipfile

def cadeias_do_dex(dados):
    """Lê o conjunto de cadeias do dex. `strings(1)` não serve: uma cadeia do
       dex é MUTF-8 precedida de um comprimento em ULEB128, e a busca ingênua
       encontra e perde coisas conforme o byte anterior."""
    n, off = struct.unpack_from('<II', dados, 0x38)
    saida = []
    for i in range(n):
        ini, = struct.unpack_from('<I', dados, off + 4 * i)
        p = ini
        while dados[p] & 0x80: p += 1          # pula o ULEB128
        p += 1
        saida.append(dados[p:dados.index(b'\x00', p)].decode('utf-8', 'replace'))
    return saida

def main():
    if len(sys.argv) < 2:
        print("uso: conferir-apk.py caminho.apk"); return 2
    caminho = sys.argv[1]
    linhas, falhas = [], 0

    def checar(titulo, ok, detalhe=""):
        nonlocal falhas
        linhas.append(f"  {'ok  ' if ok else 'FALHA'} {titulo}" + (f" — {detalhe}" if detalhe else ""))
        if not ok: falhas += 1

    with zipfile.ZipFile(caminho) as z:
        nomes = set(z.namelist())

        checar("o APK traz a página do app", "assets/public/index.html" in nomes)

        # ---- os plugins nativos declarados estão MESMO dentro? ----
        registro = "assets/capacitor.plugins.json"
        if registro not in nomes:
            checar("o APK declara os plugins nativos", False, "capacitor.plugins.json ausente")
        else:
            plugins = json.loads(z.read(registro))
            cadeias = set()
            for nome in sorted(n for n in nomes if n.startswith("classes") and n.endswith(".dex")):
                cadeias.update(cadeias_do_dex(z.read(nome)))
            checar("o APK tem classes compiladas para varrer", len(cadeias) > 100,
                   f"{len(cadeias)} cadeias no conjunto")
            for p in plugins:
                caminho_classe = p["classpath"]
                descritor = "L" + caminho_classe.replace(".", "/") + ";"
                checar(f"{p['pkg']} está de fato no APK",
                       descritor in cadeias,
                       "declarado mas ausente do dex" if descritor not in cadeias else caminho_classe)

        # ---- o executor em segundo plano ----
        cfg = "assets/capacitor.config.json"
        if cfg in nomes:
            c = json.loads(z.read(cfg))
            br = (c.get("plugins") or {}).get("BackgroundRunner")
            if br:
                alvo = "assets/public/" + br["src"]
                checar("o arquivo do executor viaja no APK", alvo in nomes, alvo)
                if alvo in nomes:
                    corpo = z.read(alvo).decode("utf-8", "replace")
                    checar("e escuta o evento que a configuração agenda",
                           f'"{br["event"]}"' in corpo or f"'{br['event']}'" in corpo,
                           br["event"])

    print("\n".join(linhas))
    print("\n" + "─" * 60)
    print(f"  {len(linhas) - falhas} conferências no APK, {falhas} problema(s)")
    print("─" * 60)
    return 1 if falhas else 0

sys.exit(main())
