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

/* ==================== mais de uma fonte para o "último" ====================

   O que o log do cron mostrou: a Caixa responde ao runner — o preenchimento de
   rateio fez vinte requisições por modalidade, todas bem-sucedidas —, mas o
   endpoint SEM número de concurso devolveu um concurso que já era conhecido.
   Resultado: "+0 novos" em todas as oito, todo dia, com verde no painel.

   Uma fonte só não tem como perceber isso. Agora o último concurso é procurado
   em várias, e vence a que estiver mais à frente: se a Caixa devolver 3762 e o
   espelho devolver 3764, o app leva 3764 e depois preenche o buraco pelo
   caminho normal, concurso a concurso.

   Fonte que falha é PULADA, nunca fatal: elas existem justamente porque
   qualquer uma pode sair do ar, e derrubar a atualização inteira por causa da
   terceira da lista seria trocar um defeito por outro. */

const ESPELHO = "https://loteriascaixa-api.herokuapp.com/api";

/* O espelho usa nomes de campo próprios. Traduz para o formato da Caixa, e daí
   em diante o resto do programa não sabe de onde o dado veio. */
function daFormaDoEspelho(j) {
  if (!j || typeof j !== "object") throw new Error("resposta vazia");
  const dezenas = j.dezenas || j.listaDezenas || [];
  return {
    numero: j.concurso ?? j.numero,
    dataApuracao: j.data || j.dataApuracao,
    listaDezenas: dezenas,
    listaRateioPremio: (j.premiacoes || []).map((p) => ({
      faixa: p.faixa,
      descricaoFaixa: p.descricao,
      numeroDeGanhadores: p.ganhadores,
      valorPremio: p.valorPremio,
    })),
    listaMunicipioUFGanhadores: j.localGanhadores || [],
    acumulou: j.acumulou,
  };
}

const FONTES_ULTIMO = [
  {
    nome: "caixa",
    buscar: async (slug) => buscar(slug, null),
  },
  {
    nome: "espelho",
    buscar: async (slug) => {
      const r = await fetch(`${ESPELHO}/${slug}/latest`, {
        headers: { Accept: "application/json", "User-Agent": "lotolab-atualizador" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return daFormaDoEspelho(await r.json());
    },
  },
];

/* Devolve o concurso mais alto entre as fontes que responderam, com o nome de
   quem o trouxe — o log precisa dizer QUEM está à frente, senão a próxima vez
   que isto travar vai custar a mesma investigação de hoje. */
async function buscarUltimoDeTodas(slug, modalidade) {
  const respostas = [];
  for (const f of FONTES_ULTIMO) {
    try {
      const r = converter(await f.buscar(slug), modalidade);
      respostas.push({ fonte: f.nome, r });
    } catch (e) {
      console.error(`  ${modalidade}/${f.nome}: ${e.message}`);
    }
  }
  if (!respostas.length) throw new Error("nenhuma fonte respondeu");
  respostas.sort((a, b) => b.r.concurso - a.r.concurso);
  const vencedora = respostas[0];
  if (respostas.length > 1) {
    const atras = respostas.slice(1)
      .filter((x) => x.r.concurso < vencedora.r.concurso)
      .map((x) => `${x.fonte}=${x.r.concurso}`);
    if (atras.length)
      console.log(`  ${modalidade}: ${vencedora.fonte}=${vencedora.r.concurso} ` +
        `à frente de ${atras.join(", ")}`);
  }
  return vencedora;
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
  dados.total = dados.concursos.length;

  /* Só grava se o CONTEÚDO mudou. Antes, `atualizado` era carimbado a cada
     execução e o arquivo era reescrito sempre — então o cron commitava todo
     dia mesmo sem trazer concurso nenhum, e o repositório parecia vivo
     enquanto os dados estavam parados há dois dias. Um commit por dia dizendo
     "Resultados atualizados automaticamente" sem nenhum resultado novo é pior
     que nenhum commit: ele esconde a falha atrás de atividade. */
  const caminho = join(PASTA, `${modalidade}.json`);
  const semCarimbo = (o) => {
    const c = Object.assign({}, o); delete c.atualizado; return JSON.stringify(c);
  };
  const novo = semCarimbo(dados);
  if (existsSync(caminho)) {
    try {
      if (semCarimbo(JSON.parse(readFileSync(caminho, "utf8"))) === novo) return false;
    } catch { /* arquivo ilegível: reescreve */ }
  }
  dados.atualizado = new Date().toISOString();
  writeFileSync(caminho, JSON.stringify(dados) + "\n", "utf8");
  return true;
}

/* ==================== o guarda de atraso ====================

   O defeito que motivou isto: o cron rodava todo dia, dava verde, commitava — e
   os dados estavam parados. A Lotofácil sorteia todo dia; ela ficou dois dias
   para trás sem que nada reclamasse, porque o script só falhava quando TODAS as
   oito modalidades falhavam de uma vez.

   O intervalo típico é medido do próprio histórico, e não escrito à mão: as
   loterias mudam de calendário, e uma tabela de dias da semana no código
   envelhece em silêncio. A mediana dos últimos trinta intervalos descreve o
   ritmo real, seja ele qual for.

   A folga é generosa — três vezes o intervalo típico, mais um dia — porque o
   objetivo é pegar "parou de funcionar", e não "o sorteio de ontem ainda não
   foi publicado". Feriado prolongado não pode virar alarme; três ciclos
   perdidos, sim.                                                            */
function intervaloTipico(concursos) {
  const datas = concursos
    .slice(-30).map((c) => c.data).filter(Boolean).sort();
  const gaps = [];
  for (let i = 1; i < datas.length; i++) {
    const d = (Date.parse(datas[i]) - Date.parse(datas[i - 1])) / 86400000;
    if (Number.isFinite(d) && d > 0) gaps.push(d);
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

function atrasoEmDias(concursos, agora) {
  const datas = concursos.map((c) => c.data).filter(Boolean).sort();
  if (!datas.length) return null;
  const d = (agora - Date.parse(datas[datas.length - 1])) / 86400000;
  return Number.isFinite(d) ? Math.floor(d) : null;
}

function avaliarAtraso(modalidade, concursos, agora) {
  const tipico = intervaloTipico(concursos);
  const atraso = atrasoEmDias(concursos, agora);
  if (tipico == null || atraso == null) return { modalidade, avaliavel: false };
  const limite = Math.ceil(tipico * 3) + 1;
  return { modalidade, avaliavel: true, tipico, atraso, limite,
           parado: atraso > limite };
}

/* As funções puras saem por aqui para poderem ser testadas sem rede. O resto do
   arquivo só roda quando ele é executado direto — importá-lo para testar o
   guarda de atraso não pode disparar oito buscas na Caixa. */
export { intervaloTipico, atrasoEmDias, avaliarAtraso };

const EXECUTANDO_DIRETO =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (!EXECUTANDO_DIRETO) {
  /* Importado por um teste: para por aqui. */
} else {

let mudou = 0, falhas = 0;
for (const [modalidade, cfg] of Object.entries(MODALIDADES)) {
  const dados = carregar(modalidade);
  const conhecidos = new Set(dados.concursos.map((c) => c.concurso));
  let ultimo, fonteDoUltimo;
  try {
    const v = await buscarUltimoDeTodas(cfg.slug, modalidade);
    ultimo = v.r; fonteDoUltimo = v.fonte;
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
    const escreveu = gravar(modalidade, dados);
    mudou += novos.length;
    const comGanhadores = dados.concursos.filter(temGanhadores).length;
    console.log(`${modalidade}: +${novos.length} novos (total ${dados.concursos.length}, ` +
      `${comGanhadores} com ganhadores, último ${ultimo.concurso} via ${fonteDoUltimo})` +
      `${escreveu ? "" : " — arquivo já estava igual"}`);
  } else {
    const comGanhadores = dados.concursos.filter(temGanhadores).length;
    console.log(`${modalidade}: em dia (${dados.concursos.length}, ` +
      `último ${ultimo.concurso} via ${fonteDoUltimo}, ` +
      `${comGanhadores} com ganhadores)`);
  }
}

console.log(`\n${mudou} concursos novos, ${falhas} modalidades falharam.`);

/* ---- o veredito ----
   Antes daqui só existia uma condição de erro: TODAS as oito modalidades
   falharem. Sete falhando davam verde, e nenhuma trazendo concurso novo também.
   Agora o critério é o resultado, e não o percurso: se os dados estão parados
   há mais de três ciclos, o cron fica vermelho — que é a única forma de alguém
   descobrir sem ir conferir à mão. */
const agora = Date.now();
const paradas = [];
for (const modalidade of Object.keys(MODALIDADES)) {
  const dados = carregar(modalidade);
  const v = avaliarAtraso(modalidade, dados.concursos, agora);
  if (!v.avaliavel) { console.log(`${modalidade}: sem datas para avaliar atraso`); continue; }
  const linha = `${modalidade}: último há ${v.atraso}d ` +
    `(típico ${v.tipico}d, limite ${v.limite}d)`;
  if (v.parado) { paradas.push(v); console.error(`PARADO  ${linha}`); }
  else console.log(`em dia  ${linha}`);
}

if (paradas.length) {
  console.error(`\n${paradas.length} modalidade(s) sem concurso novo além do esperado: ` +
    paradas.map((p) => `${p.modalidade} (${p.atraso}d)`).join(", "));
  console.error("A busca terminou sem erro, mas os dados não avançaram — é isso que " +
    "este código existe para não deixar passar em silêncio.");
  process.exit(2);
}
if (falhas === Object.keys(MODALIDADES).length) process.exit(1);

}   /* fim de EXECUTANDO_DIRETO */
