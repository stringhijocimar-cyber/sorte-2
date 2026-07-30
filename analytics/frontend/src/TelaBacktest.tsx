/**
 * Tela 2 — Backtest (§11 e §12).
 *
 * A regra desta tela: o percentil e o ROI nunca aparecem sozinhos. Um ROI de
 * +28% no percentil 95 parece excelente e costuma ser ruído — então o veredito
 * do teste vem ao lado, no mesmo bloco, e não numa aba "detalhes" que ninguém
 * abre.
 */
import { useState } from "react";
import { api, brl, pct, type Backtest } from "./api";
import { Aviso, Campo, Erro, Indicador } from "./componentes";

const entrada =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-acaso focus:outline-none focus:ring-2 focus:ring-acaso/30";

export function TelaBacktest({ token }: { token: string }) {
  const [codigo, setCodigo] = useState("megasena");
  const [jogos, setJogos] = useState(1);
  const [simulacoes, setSimulacoes] = useState(200);
  const [semente, setSemente] = useState(20260728);
  const [resultado, setResultado] = useState<Backtest | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function rodar() {
    setOcupado(true);
    setErro("");
    try {
      setResultado(
        await api.backtest(token, {
          modalidade: codigo,
          jogos_por_concurso: jogos,
          simulacoes,
          semente,
        }),
      );
    } catch (e) {
      setErro((e as Error).message);
      setResultado(null);
    } finally {
      setOcupado(false);
    }
  }

  const significativo = resultado ? resultado.teste.p_valor < 0.05 : false;

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-tinta">Backtest</h2>

        <Campo rotulo="modalidade">
          <select className={entrada} value={codigo} onChange={(e) => setCodigo(e.target.value)} data-teste="bt-modalidade">
            <option value="megasena">Mega-Sena</option>
            <option value="lotofacil">Lotofácil</option>
          </select>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="jogos por concurso">
            <input className={entrada} type="number" min={1} max={20} value={jogos}
              onChange={(e) => setJogos(Number(e.target.value))} data-teste="bt-jogos" />
          </Campo>
          <Campo rotulo="simulações">
            <input className={entrada} type="number" min={1} value={simulacoes}
              onChange={(e) => setSimulacoes(Number(e.target.value))} data-teste="bt-simulacoes" />
          </Campo>
        </div>

        <Campo rotulo="semente" dica="o mesmo valor reproduz o mesmo resultado">
          <input className={entrada} type="number" value={semente}
            onChange={(e) => setSemente(Number(e.target.value))} data-teste="bt-semente" />
        </Campo>

        <button
          className="w-full rounded-md bg-tinta py-2.5 font-semibold text-white disabled:opacity-50"
          onClick={rodar} disabled={ocupado} data-teste="bt-rodar"
        >
          {ocupado ? "rodando…" : "Rodar backtest"}
        </button>

        {erro && <Erro mensagem={erro} />}

        <Aviso>
          A estratégia só enxerga concursos <strong>anteriores</strong> ao que está sendo
          conferido. O custo usa o preço vigente na data de cada concurso.
        </Aviso>
      </section>

      <section className="space-y-4">
        {resultado && (
          <>
            <p className="font-mono text-xs text-slate-500" data-teste="bt-particao">{resultado.particao}</p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Indicador rotulo="custo" valor={brl(resultado.custo_total)} />
              <Indicador rotulo="prêmio" valor={brl(resultado.premio_bruto)} />
              <Indicador rotulo="líquido" valor={brl(resultado.resultado_liquido)} />
              <Indicador rotulo="ROI" valor={pct(resultado.roi)} data-teste="bt-roi" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Indicador rotulo="percentil vs acaso" valor={resultado.percentil_vs_aleatorio.toFixed(1)}
                detalhe={`${resultado.simulacoes} carteiras`} />
              <Indicador rotulo="pior queda" valor={brl(resultado.perda_maxima)} />
              <Indicador rotulo="maior seca" valor={`${resultado.maior_sequencia_sem_premio} concursos`} />
              <Indicador rotulo="semente" valor={resultado.semente} detalhe="para reproduzir" />
            </div>

            {/* O veredito fica colado ao número, não numa aba de detalhes. */}
            <div className="rounded-lg border border-slate-200 bg-white p-4" data-teste="bt-veredito">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {resultado.teste.nome}
              </h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm tabular-nums sm:grid-cols-4">
                <div><dt className="text-xs text-slate-500">estimativa</dt><dd>{resultado.teste.estimativa.toPrecision(4)}</dd></div>
                <div><dt className="text-xs text-slate-500">faixa do acaso</dt>
                  <dd>{resultado.teste.ic[0].toPrecision(3)} a {resultado.teste.ic[1].toPrecision(3)}</dd></div>
                <div><dt className="text-xs text-slate-500">p-valor</dt><dd>{resultado.teste.p_valor.toPrecision(3)}</dd></div>
                <div><dt className="text-xs text-slate-500">{resultado.teste.nome_efeito}</dt>
                  <dd>{resultado.teste.tamanho_efeito.toPrecision(3)}</dd></div>
              </dl>
              <p className="mt-3 text-sm text-slate-700">{resultado.teste.leitura}</p>
            </div>

            <Aviso tom={significativo ? "atencao" : "neutro"}>{resultado.aviso}</Aviso>
          </>
        )}

        {!resultado && !erro && (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            Rode um backtest para ver o desempenho comparado a carteiras aleatórias
            equivalentes.
          </p>
        )}
      </section>
    </div>
  );
}
