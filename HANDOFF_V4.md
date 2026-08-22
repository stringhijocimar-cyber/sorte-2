# LotoLab — Handoff V4.3

## Estado canônico

- Versão do produto: **4.3.0**
- Rótulo: **V4.3**
- Branch fonte: **main**
- Camada visual: **Mockup Fidelity V4 + visual aprovado V4.3**
- Android: **versionCode 7** / **versionName 4.3.0**
- Arquivo `VERSION`: **4.3.0**
- `package.json`: **4.3.0**
- `package-lock.json`: **4.3.0**
- Manifesto canônico: `RELEASE_MANIFEST_V4.json`

## O que já está consolidado

A V4.3 está incorporada ao `main`. Ela aplica ao aplicativo real a direção visual aprovada: identidade escura com acentos roxos, hierarquia mais forte de cards e navegação, cores de contexto por modalidade e leitura semântica independente dos resultados — verde para concurso com ganhador e amarelo para acumulado/sem ganhador.

A integração mantém `index.html` e `www/index.html` sincronizados, inclui a folha `ui/lotolab-ui-v4-3.css` também em `www/ui`, e atualiza o Service Worker para carregar a nova camada visual offline.

## Validação da integração

Na validação do PR da V4.3, passaram as suítes do motor, interface, atualizador, XML Android, reprodutibilidade, ícones e referência dourada. O ajuste foi tratado como camada visual, sem reescrita do motor estatístico.

## Regra para continuação

Trate `main` como fonte de verdade. Não volte para a tag antiga `v38-visual-final`, pois ela representa a Visual Final V3. Preserve o motor ao fazer ajustes visuais e de versionamento. O número canônico da versão vem do arquivo `VERSION`.

## Estado de publicação

O código-fonte atual está versionado como **4.3.0**. A existência de uma Release na página “Versões” do GitHub é um estado separado do número presente no código-fonte.
