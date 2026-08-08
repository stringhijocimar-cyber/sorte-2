/**
 * Baixa os resultados das loterias e grava em dados/{modalidade}.json.
 *
 * Roda no GitHub Actions, não no aparelho. Essa é a decisão de arquitetura
 * inteira: um runner do GitHub é um servidor, então não há CORS, não há
 * bloqueio de origem e não há dependência de proxy de terceiro. O app depois
 * lê o JSON de raw.githubusercontent.com, que serve com CORS liberado e
 * disponibilidade de CDN.
 *
 * O caminho antigo — app chamando a Caixa direto — falha no navegador por
 * CORS, e os espelhos públicos saem do ar. Este não tem nenhum dos dois
 * problemas.
 *
 * É incremental: lê o que já está no arquivo e busca só o que falta, do mais
 * novo para trás. Rodar todo dia custa uma requisição por modalidade.
 *
 *     node ferramentas/atualizar-resultados.mjs            # incremental
 *     node ferramentas/atualizar-resultados.mjs --tudo     # backfill completo
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASTA = join(RAIZ, "dados");
const BASE = "https://servicebus2.caixa.gov.br/portaldeloterias/api";

const MODALIDADES = {
  "mega-sena": { slug: "megasena", k: 6 },
  "lotofacil": { slug: "lotofacil", k: 15 },
  "quina": { slug: "quina", k: 5 },
  "lotomania": { slug: "lotomania", k: 20 },
  "dupla-sena": { slug: "duplasena", k: 6 },
  "dia-de-sorte": { slug: "diadesorte", k: 7 },
  "timemania": { slug: "timemania", k: 7 },
  "mais-milionaria": { slug: "maismilionaria", k: 6 },
};

const TUDO = process.argv.includes("--tudo");
/* --completar: revisita concursos que o app JÁ tem mas que entraram sem o
   rateio, e preenche só isso. É o que faz a tela conseguir dizer "teve
   ganhador" em vez de "não informado" — e a diferença entre as duas frases é a
   diferença entre informar e enganar. Vai do mais recente para o mais antigo,
   porque é o recente que as pessoas consultam. */
const COMPLETAR = process.argv.includes("--completar");
//: Teto por execução. Sem ele, um backfill de Lotofácil faria três mil
//: requisições numa tacada e o serviço cortaria no meio.
const TETO = TUDO ? 400 : 25;
//: Orçamento próprio do backfill de rateio, por modalidade e por execução.
const TETO_COMPLETAR = Number(
  (process.argv.find((a) => a.startsWith("--completar-teto=")) || "").split("=")[1] || 120);

//: Um concurso "sabe" dos ganhadores quando traz a faixa 1 com número.
const temGanhadores = (c) => {
  const f1 = (c.rateio || []).find((f) => f.faixa === 1);
  return !!f1 && Number.isFinite(f1.ganhadores);
};

const dataBr = (s) => {
  const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(s || "").slice(0, 10);
};

/* Converte a resposta da Caixa no registro do app. Recusa o que não
   reconhece: gravar um concurso pela metade contamina o histórico
   permanentemente, e ninguém vai reparar. */
function converter(bruto, modalidade) {
  const cfg = MODALIDADES[modalidade];
  const dezenas = (bruto.listaDezenas || [])
    .map((x) => parseInt(String(x), 10))
    .filter(Number.isFinite);
  if (dezenas.length !== cfg.k)
    throw new Error(`${dezenas.length} dezenas, esperava ${cfg.k}`);
  const concurso = parseInt(bruto.numero, 10);
  if (!Number.isFinite(concurso)) throw new Error("sem número de concurso");

  const r = {
    concurso,
    data: dataBr(bruto.dataApuracao),
    dezenas: dezenas.sort((a, b) => a - b),
    modalidade,
    origem: "caixa",
  };
  const rateio = (bruto.listaRateioPremio || []).map((f) => ({
    faixa: parseInt(f.faixa, 10),
    descricao: String(f.descricaoFaixa || "").trim(),
    ganhadores: parseInt(f.numeroDeGanhadores, 10) || 0,
    premio: Number(f.valorPremio) || 0,
  })).filter((f) => Number.isFinite(f.faixa));
  if (rateio.length) r.rateio = rateio;

  const cidades = (bruto.listaMunicipioUFGanhadores || []).map((g) => ({
    municipio: String(g.municipio || "").trim(),
    uf: String(g.uf || "").trim(),
    ganhadores: parseInt(g.ganhadores, 10) || 1,
  })).filter((g) => g.municipio);
  if (cidades.length) r.cidades = cidades;

  if (bruto.dataProximoConcurso) r.dataProximo = dataBr(bruto.dataProximoConcurso);
  const est = Number(bruto.valorEstimadoProximoConcurso);
  if (Number.isFinite(est) && est > 0) r.estimativaProximo = est;
  if (bruto.numeroConcursoProximo)
    r.concursoProximo = parseInt(bruto.numeroConcursoProximo, 10);
  if (typeof bruto.acumulado === "boolean") r.acumulou = bruto.acumulado;
  return r;
}

async function buscar(slug, concurso) {
  const url = `${BASE}/${slug}` + (concurso ? `/${concurso}` : "");
  const resp = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "lotolab-atualizador" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

function carregar(modalidade) {
  const caminho = join(PASTA, `${modalidade}.json`);
  if (!existsSync(caminho)) return { modalidade, concursos: [] };
  try {
    return JSON.parse(readFileSync(caminho, "utf8"));
  } catch {
    return { modalidade, concursos: [] };
  }
}

function gravar(modalidade, dados) {
  mkdirSync(PASTA, { recursive: true });
  dados.concursos.sort((a, b) => a.concurso - b.concurso);
  dados.atualizado = new Date().toISOString();
  dados.total = dados.concursos.length;
  writeFileSync(join(PASTA, `${modalidade}.json`),
    JSON.stringify(dados) + "\n", "utf8");
}

let mudou = 0, falhas = 0;
for (const [modalidade, cfg] of Object.entries(MODALIDADES)) {
  const dados = carregar(modalidade);
  const conhecidos = new Set(dados.concursos.map((c) => c.concurso));
  let ultimo;
  try {
    ultimo = converter(await buscar(cfg.slug, null), modalidade);
  } catch (e) {
    console.error(`${modalidade}: falhou ao buscar o último — ${e.message}`);
    falhas++;
    continue;
  }

  const novos = [];
  if (!conhecidos.has(ultimo.concurso)) novos.push(ultimo);

  /* Preenche os buracos para trás. O `dataProximo` e a estimativa só valem no
     concurso mais recente, então são removidos dos antigos: manter aumentaria
     o arquivo sem informar nada. */
  for (let n = ultimo.concurso - 1, feitos = 0; n >= 1 && feitos < TETO; n--) {
    if (conhecidos.has(n)) { if (!TUDO) break; else continue; }
    try {
      const r = converter(await buscar(cfg.slug, n), modalidade);
      delete r.dataProximo; delete r.estimativaProximo;
      delete r.concursoProximo; delete r.acumulou;
      novos.push(r);
      feitos++;
    } catch (e) {
      console.error(`${modalidade} #${n}: ${e.message}`);
      break;
    }
  }

  /* Backfill do rateio nos concursos que já estavam no arquivo sem ele. */
  let completados = 0;
  if (COMPLETAR) {
    const semRateio = dados.concursos
      .filter((c) => !temGanhadores(c))
      .sort((a, b) => b.concurso - a.concurso)
      .slice(0, TETO_COMPLETAR);
    for (const alvo of semRateio) {
      try {
        const r = converter(await buscar(cfg.slug, alvo.concurso), modalidade);
        if (!temGanhadores(r)) continue;
        /* Mescla: o que já existia manda, o rateio e as cidades entram. Trocar
           o objeto inteiro apagaria campos que só o registro antigo tem. */
        if (r.rateio) alvo.rateio = r.rateio;
        if (r.cidades && r.cidades.length) alvo.cidades = r.cidades;
        completados++;
      } catch (e) {
        console.error(`${modalidade} #${alvo.concurso} (rateio): ${e.message}`);
        break;
      }
    }
    if (completados) {
      console.log(`${modalidade}: rateio preenchido em ${completados} concursos`);
    }
  }

  if (novos.length || completados) {
    dados.concursos = dados.concursos
      .filter((c) => !novos.some((n) => n.concurso === c.concurso))
      .concat(novos);
    gravar(modalidade, dados);
    mudou += novos.length;
    const comGanhadores = dados.concursos.filter(temGanhadores).length;
    console.log(`${modalidade}: +${novos.length} novos (total ${dados.concursos.length}, ` +
      `${comGanhadores} com ganhadores)`);
  } else {
    const comGanhadores = dados.concursos.filter(temGanhadores).length;
    console.log(`${modalidade}: em dia (${dados.concursos.length}, ` +
      `${comGanhadores} com ganhadores)`);
  }
}

console.log(`\n${mudou} concursos novos, ${falhas} modalidades falharam.`);
if (falhas === Object.keys(MODALIDADES).length) process.exit(1);
