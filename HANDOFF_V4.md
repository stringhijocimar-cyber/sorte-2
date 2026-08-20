# LotoLab — Handoff V4.2

## Estado canônico

- Versão do produto: **4.2.0**
- Rótulo: **V4.2**
- Branch fonte: **main**
- Camada visual: **Mockup Fidelity V4 + UI V4.2**
- Android: **versionCode 6** / **versionName 4.2.0**
- Arquivo `VERSION`: **4.2.0**
- `package.json`: **4.2.0**
- `package-lock.json`: **4.2.0**
- Manifesto canônico: `RELEASE_MANIFEST_V4.json`

## O que já está consolidado

A V4.2 está incorporada ao `main`. Além da identidade visual LotoLab e da camada Mockup Fidelity V4, esta revisão adiciona cores de contexto por modalidade e reforça a leitura dos resultados históricos: verde para concursos com ganhador e amarelo para acumulados/sem ganhador. As folhas visuais web e Android permanecem sincronizadas.

## Regra para continuação

Trate `main` como fonte de verdade. Não volte para a tag antiga `v38-visual-final`, pois ela representa a Visual Final V3. Preserve o motor ao fazer ajustes visuais e de versionamento. O número canônico da versão vem do arquivo `VERSION`, e o workflow de sincronização atualiza `package.json`, `package-lock.json` e `versionName` do Android sempre que `VERSION` muda.

## Estado de publicação

O código-fonte atual está versionado como **4.2.0**. A existência de uma Release na página “Versões” do GitHub é um estado separado do número presente no código-fonte.
