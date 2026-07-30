/**
 * Tela 1 — Gerador de jogos (§8).
 *
 * Mostra as métricas que dependem do método (custo, sobreposição, cobertura) e
 * a probabilidade, que NÃO depende. O aviso sobre filtros fica colado aos
 * controles de filtro, não no rodapé.
 */
import { useEffect, useState } from "react";
import { api, brl, inteiro, type LoteGerado, type Modalidade } from "./api";
import { Aviso, Campo, Dezena, Erro, Indicador } from "./componentes";

const entrada =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-acaso focus:outline-none focus:ring-2 focus:ring-acaso/30";

export function TelaGerador({ token }: { token: string }) {
  const [modalidades, setModalidades] = useState<Modalidade[]>([]);
  const [codigo, setCodigo] = useState("megasena");
  const [quantidade, setQuantidade] = useState(5);
  const [orcamento, setOrcamento] = useState("");
  const [paresMin, setParesMin] = useState("");
  const [paresMax, setParesMax] = useState("");
  const [maxConsecutivos, setMaxConsecutivos] = useState("");
  const [lote, setLote] = useState<LoteGerado | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api.modalidades().then(setModalidades).catch((e) => setErro(e.message));
  }, []);

  const modalidade = modalidades.find((m) => m.codigo === codigo);

  async function gerar() {
    setOcupado(true);
    setErro("");
    try {
      const corpo: Record<string, unknown> = { modalidade: codigo, quantidade };
      if (orcamento) corpo.orcamento_maximo = Number(orcamento);
      if (paresMin && paresMax) {
        corpo.pares_min = Number(paresMin);
        corpo.pares_max = Number(paresMax);
      }
      if (maxConsecutivos) corpo.max_consecutivos = Number(maxConsecutivos);
      setLote(await api.gerar(token, corpo));
    } catch (e) {
      setErro((e as Error).message);
      setLote(null);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-tinta">Gerador de jogos</h2>

        <Campo rotulo="modalidade">
          <select className={entrada} value={codigo} onChange={(e) => setCodigo(e.target.value)} data-teste="modalidade">
            {modalidades.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.nome}
              </option>
            ))}
          </select>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="quantidade">
            <input
              className={entrada}
              type="number"
              min={1}
              max={500}
              value={quantidade}
              onChange={(e) => setQuantidade(Number(e.target.value))}
              data-teste="quantidade"
            />
          </Campo>
          <Campo rotulo="orçamento (R$)" dica="limite de segurança">
            <input
              className={entrada}
              type="number"
              min={0}
              step="0.01"
              value={orcamento}
              onChange={(e) => setOrcamento(e.target.value)}
              placeholder="sem limite"
              data-teste="orcamento"
            />
          </Campo>
        </div>

        <fieldset className="space-y-3 rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">filtros</legend>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="pares mín.">
              <input className={entrada} type="number" min={0} value={paresMin}
                onChange={(e) => setParesMin(e.target.value)} data-teste="pares-min" />
            </Campo>
            <Campo rotulo="pares máx.">
              <input className={entrada} type="number" min={0} value={paresMax}
                onChange={(e) => setParesMax(e.target.value)} data-teste="pares-max" />
            </Campo>
          </div>
          <Campo rotulo="máx. consecutivos">
            <input className={entrada} type="number" min={1} value={maxConsecutivos}
              onChange={(e) => setMaxConsecutivos(e.target.value)} data-teste="max-consecutivos" />
          </Campo>
          <Aviso>
            Filtros restringem quais combinações o gerador aceita. <strong>Não</strong> tornam nenhuma
            dezena mais provável de ser sorteada — e podem excluir justamente a combinação sorteada.
          </Aviso>
        </fieldset>

        <button
          className="w-full rounded-md bg-tinta py-2.5 font-semibold text-white disabled:opacity-50"
          onClick={gerar}
          disabled={ocupado}
          data-teste="gerar"
        >
          {ocupado ? "gerando…" : `Gerar ${quantidade} jogo${quantidade > 1 ? "s" : ""}`}
        </button>

        {erro && <Erro mensagem={erro} />}
      </section>

      <section className="space-y-4">
        {modalidade && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Indicador rotulo="universo" valor={`${modalidade.universo[0]}–${modalidade.universo[1]}`} />
            <Indicador rotulo="sorteadas" valor={modalidade.dezenas_sorteadas} />
            <Indicador rotulo="preço" valor={brl(modalidade.preco_hoje)} detalhe="aposta simples" />
            <Indicador rotulo="combinações" valor={inteiro(modalidade.combinacoes)} />
          </div>
        )}

        {lote && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Indicador rotulo="custo" valor={brl(lote.custo_total)} />
              <Indicador
                rotulo="chance por jogo"
                valor={`1 em ${inteiro(Math.round(1 / lote.probabilidade_por_jogo))}`}
                detalhe="igual em qualquer método"
              />
              <Indicador rotulo="sobreposição" valor={lote.sobreposicao_media.toFixed(2)} detalhe="dezenas entre jogos" />
              <Indicador rotulo="semente" valor={lote.semente} detalhe="para reproduzir" />
            </div>

            {lote.avisos.map((a) => (
              <Aviso key={a} tom="atencao">{a}</Aviso>
            ))}

            <ul className="space-y-2" data-teste="jogos">
              {lote.jogos.map((jogo, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-3">
                  <span className="mr-2 font-mono text-xs text-slate-400">{String(i + 1).padStart(2, "0")}</span>
                  {jogo.map((d) => <Dezena key={d} n={d} />)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
