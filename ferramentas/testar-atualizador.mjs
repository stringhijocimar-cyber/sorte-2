/**
 * Testa o guarda de atraso do atualizador de resultados.
 *
 *     node ferramentas/testar-atualizador.mjs
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * O cron de resultados rodava todo dia, dava verde e commitava — e os dados
 * estavam parados. A Lotofácil sorteia todo dia e ficou dois dias para trás sem
 * que nada reclamasse. Duas coisas escondiam isso:
 *
 *   1. O script só saía com erro quando as OITO modalidades falhavam de uma vez.
 *      Sete falhando davam verde. Nenhuma trazendo concurso novo também.
 *   2. `atualizado` era carimbado a cada execução e o arquivo reescrito sempre,
 *      então havia um commit por dia mesmo sem nenhum resultado novo. O
 *      repositório parecia vivo enquanto os dados estavam congelados.
 *
 * O conserto muda o critério de "a busca terminou" para "os dados avançaram".
 * Este teste cobra o guarda que faz isso — sem rede, com históricos montados à
 * mão, porque um teste que depende do serviço da Caixa estar de pé mede a
 * Caixa e não o código.
 */
import { intervaloTipico, atrasoEmDias, avaliarAtraso }
  from "./atualizar-resultados.mjs";

let passou = 0, falhou = 0;
const linhas = [];
const checar = (t, c, d = "") => {
  if (c) { passou++; linhas.push(`  ok   ${t}${d ? " — " + d : ""}`); }
  else { falhou++; linhas.push(`  FALHA ${t}${d ? " — " + d : ""}`); }
};
const secao = (t) => linhas.push(`\n${t}`);

const dia = (s) => ({ concurso: 1, data: s });
const AGORA = Date.parse("2026-08-16T12:00:00Z");

secao("1. O ritmo é medido do próprio histórico");

const diaria = ["2026-08-10","2026-08-11","2026-08-12","2026-08-13","2026-08-14"].map(dia);
const semanal = ["2026-07-12","2026-07-19","2026-07-26","2026-08-02","2026-08-06"].map(dia);

checar("uma diária tem intervalo típico de 1 dia", intervaloTipico(diaria) === 1);
checar("uma semanal tem intervalo típico de 7 dias", intervaloTipico(semanal) === 7,
  String(intervaloTipico(semanal)));
/* O ritmo não pode ser tabela escrita à mão: as loterias mudam de calendário, e
   uma lista de dias da semana no código envelhece em silêncio. */
checar("intervalo irregular não quebra a medida",
  intervaloTipico(["2026-08-01","2026-08-03","2026-08-04","2026-08-09"].map(dia)) > 0);
checar("histórico sem datas não tem ritmo", intervaloTipico([{concurso:1}]) === null);
checar("histórico vazio não tem ritmo", intervaloTipico([]) === null);

secao("2. O atraso é medido em dias de calendário");

checar("dois dias desde o último", atrasoEmDias(diaria, AGORA) === 2,
  String(atrasoEmDias(diaria, AGORA)));
checar("sem datas, não há atraso a medir", atrasoEmDias([{concurso:1}], AGORA) === null);

secao("3. O limite acompanha o ritmo da modalidade");

const vDiaria = avaliarAtraso("lotofacil", diaria, AGORA);
const vSemanal = avaliarAtraso("semanal", semanal, AGORA);
checar("o limite de uma diária é curto", vDiaria.limite === 4,
  `limite=${vDiaria.limite}`);
checar("e o de uma semanal é longo", vSemanal.limite === 22,
  `limite=${vSemanal.limite}`);
/* A folga é generosa de propósito: o alvo é "parou de funcionar", não "o
   sorteio de ontem ainda não foi publicado". Feriado não pode virar alarme. */
checar("dois dias numa diária ainda não é parada", vDiaria.parado === false,
  `atraso=${vDiaria.atraso} limite=${vDiaria.limite}`);
checar("dez dias numa semanal ainda não é parada", vSemanal.parado === false,
  `atraso=${vSemanal.atraso} limite=${vSemanal.limite}`);

secao("4. O que o guarda existe para pegar");

const parada = ["2026-08-01","2026-08-02","2026-08-03","2026-08-04","2026-08-05"].map(dia);
const vParada = avaliarAtraso("lotofacil", parada, AGORA);
checar("uma diária parada há onze dias é acusada", vParada.parado === true,
  `atraso=${vParada.atraso} limite=${vParada.limite}`);

const semanalParada = ["2026-05-01","2026-05-08","2026-05-15","2026-05-22","2026-05-29"].map(dia);
checar("uma semanal parada há meses também",
  avaliarAtraso("s", semanalParada, AGORA).parado === true);

secao("5. Ausência de dado não vira alarme falso");

/* Um alarme que dispara sem base ensina a ignorar alarme — e aí o alarme
   verdadeiro passa junto. Sem datas, o guarda se cala. */
checar("sem datas, não é avaliável", avaliarAtraso("x", [{concurso:1}], AGORA).avaliavel === false);
checar("lista vazia não é avaliável", avaliarAtraso("x", [], AGORA).avaliavel === false);
checar("e não avaliável nunca é 'parado'",
  avaliarAtraso("x", [], AGORA).parado === undefined);
checar("uma única data não inventa ritmo",
  avaliarAtraso("x", [dia("2026-08-14")], AGORA).avaliavel === false);

secao("6. Os dados reais do repositório");

/* Isto não é asserção sobre o mundo — é um retrato. Se o repositório estiver
   parado, o cron já vai ficar vermelho por conta própria; aqui a linha serve
   para quem lê o log saber o estado sem abrir os arquivos. */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const PASTA = join(dirname(fileURLToPath(import.meta.url)), "..", "dados");
let retratados = 0;
for (const m of ["lotofacil", "mega-sena", "quina", "timemania",
                 "dia-de-sorte", "dupla-sena", "lotomania", "mais-milionaria"]) {
  const caminho = join(PASTA, `${m}.json`);
  if (!existsSync(caminho)) continue;
  try {
    const d = JSON.parse(readFileSync(caminho, "utf8"));
    const v = avaliarAtraso(m, d.concursos || [], Date.now());
    if (!v.avaliavel) continue;
    retratados++;
    linhas.push(`  · ${m}: último há ${v.atraso}d (típico ${v.tipico}d, ` +
      `limite ${v.limite}d)${v.parado ? "  ← PARADO" : ""}`);
  } catch { /* arquivo ilegível é problema de outro teste */ }
}
checar("os arquivos de dados são legíveis e datados", retratados >= 6,
  `${retratados} modalidades retratadas`);

console.log(linhas.join("\n"));
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passou} passaram, ${falhou} falharam`);
console.log("─".repeat(60));
process.exit(falhou === 0 ? 0 : 1);
