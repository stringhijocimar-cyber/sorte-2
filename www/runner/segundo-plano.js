/* Conferência com o app fechado.
 *
 * Este arquivo NÃO roda na WebView. O Background Runner o executa num motor
 * JavaScript separado, agendado pelo WorkManager do Android, sem DOM, sem
 * localStorage e sem acesso a nada do index.html. Só existe aqui o que este
 * arquivo traz.
 *
 * Por isso ele não recalcula regra nenhuma. Quem decide o que é coincidência
 * digna de aviso continua sendo o app: ele espelha para o CapacitorKV as
 * faixas de cada modalidade e os jogos salvos, e aqui só se conta acerto e se
 * compara com o número que veio. Duplicar `faixas.includes(acertos)` nos dois
 * lados criaria duas verdades que divergem na primeira vez que uma mudar.
 *
 * O que este arquivo pode fazer sozinho, e o app não: acordar sem ninguém
 * abrir nada.
 */

const CHAVE_ESTADO = "lotolab:bg:estado";   /* escrito pelo app */
const CHAVE_VISTOS = "lotolab:bg:vistos";   /* escrito aqui */

/* As mesmas fontes do app, na mesma ordem de preferência. Aqui não há CORS —
 * o executor é nativo —, então a Caixa direta tende a bastar; os espelhos
 * ficam porque um serviço fora do ar não pode significar aviso não entregue. */
const FONTES = [
  (slug, n) => `https://servicebus2.caixa.gov.br/portaldeloterias/api/${slug}` + (n ? `/${n}` : ""),
  (slug, n) => `https://api.guidi.dev.br/loteria/${slug}/` + (n || "ultimo"),
  (slug, n) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(
    `https://servicebus2.caixa.gov.br/portaldeloterias/api/${slug}` + (n ? `/${n}` : "")),
];

const TEMPO_LIMITE = 15000;

function lerJson(chave, padrao){
  try{
    const v = CapacitorKV.get(chave);
    if(!v || !v.value) return padrao;
    return JSON.parse(v.value);
  }catch(e){ return padrao; }
}

/* Aceita os dois formatos que as fontes devolvem: o da Caixa (numero,
 * listaDezenas) e o do espelho (concurso, dezenas). */
function normalizar(bruto){
  if(!bruto) return null;
  const cru = bruto.listaDezenas || bruto.dezenas || bruto.dezenasOrdemSorteio || [];
  const dezenas = cru.map(x => parseInt(String(x), 10)).filter(n => !isNaN(n));
  const concurso = parseInt(bruto.numero != null ? bruto.numero : bruto.concurso, 10);
  if(isNaN(concurso) || !dezenas.length) return null;
  return {concurso, dezenas};
}

async function buscar(slug){
  for(const montar of FONTES){
    try{
      const resp = await fetch(montar(slug, null), {
        method: "GET", headers: {Accept: "application/json"},
      });
      if(!resp.ok) continue;
      const r = normalizar(await resp.json());
      if(r) return r;
    }catch(e){ /* próxima fonte */ }
  }
  return null;
}

/* Um jogo cobre este concurso? Mesmas três formas do app, na mesma ordem:
 * concurso declarado, faixa de teimosinha, ou todo concurso desde que o jogo
 * foi salvo. */
function jogoCobre(jogo, concurso){
  if(jogo.concursoAlvo != null) return Number(jogo.concursoAlvo) === concurso;
  if(jogo.deConcurso != null && jogo.concursos != null){
    const de = Number(jogo.deConcurso);
    return concurso >= de && concurso < de + Number(jogo.concursos);
  }
  return true;
}

/* O núcleo, separado de propósito: é o único pedaço com decisão dentro, e
 * assim a bateria consegue rodá-lo em Node e conferir que ele concorda com o
 * app diante das mesmas entradas. */
function coincidencias(jogos, modalidade, resultado, faixas){
  const sorteadas = {};
  for(const d of resultado.dezenas) sorteadas[d] = true;
  const achados = [];
  for(const j of jogos){
    if(j.modalidade !== modalidade) continue;
    if(!jogoCobre(j, resultado.concurso)) continue;
    let acertos = 0;
    for(const d of (j.dezenas || [])) if(sorteadas[d]) acertos++;
    if(faixas.indexOf(acertos) !== -1)
      achados.push({acertos, jogo: j.id, concurso: resultado.concurso});
  }
  return achados;
}

/* O app não consegue escrever no CapacitorKV: o plugin não expõe isso à
 * WebView. Então ele despacha este evento com o estado, e quem grava é o
 * executor — que é justamente quem vai ler depois, quando ninguém estiver
 * olhando. */
addEventListener("guardarEstado", (resolve, reject, args) => {
  try{
    if(args && typeof args.estado === "string")
      CapacitorKV.set(CHAVE_ESTADO, args.estado);
    resolve();
  }catch(e){ resolve(); }
});

addEventListener("conferirSorteios", async (resolve, reject) => {
  try{
    const estado = lerJson(CHAVE_ESTADO, null);
    if(!estado || estado.ligado === false || !estado.jogos || !estado.jogos.length)
      return resolve();

    const vistos = lerJson(CHAVE_VISTOS, {});
    let melhor = null, total = 0;

    for(const chave of Object.keys(estado.modalidades || {})){
      const m = estado.modalidades[chave];
      if(!m || !m.slug) continue;
      /* Nada a conferir nesta modalidade: nem busca. Rádio ligado à toa é
         bateria gasta por nada. */
      if(!estado.jogos.some(j => j.modalidade === chave)) continue;

      const r = await buscar(m.slug);
      if(!r) continue;
      if(Number(vistos[chave] || 0) >= r.concurso) continue;

      const achados = coincidencias(estado.jogos, chave, r, m.faixas || []);
      total += achados.length;
      for(const a of achados)
        if(!melhor || a.acertos > melhor.acertos)
          melhor = {acertos: a.acertos, nome: m.nome, concurso: a.concurso};

      vistos[chave] = r.concurso;
    }

    CapacitorKV.set(CHAVE_VISTOS, JSON.stringify(vistos));

    if(total){
      /* Mesmo texto neutro do app: coincidência, nunca prêmio. O aparelho não
         sabe se houve prêmio — quem sabe é o volante oficial. */
      CapacitorNotifications.schedule([{
        id: Math.floor(Date.now() / 1000) % 2147483647,
        title: total === 1 ? "Um jogo seu coincidiu" : `${total} jogos seus coincidiram`,
        body: melhor
          ? `${melhor.acertos} coincidências na ${melhor.nome}, concurso ${melhor.concurso}.`
          : "Abra o LotoLab para ver qual jogo e qual concurso.",
      }]);
    }
    resolve();
  }catch(e){
    /* Rejeitar sem resolver deixaria o processo pendurado até o Android o
       matar, e o WorkManager registraria falha. Falhar em silêncio é o
       comportamento certo aqui: sem rede é o caso comum. */
    resolve();
  }
});
