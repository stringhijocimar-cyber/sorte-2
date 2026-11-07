package app.lotolab.jogos;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;

/** Cache dos concursos públicos que o Android obteve com a tela fechada. */
final class ResultadosEmSegundoPlano {
    private static final int POR_MODALIDADE = 16;
    private static final String[] CAMPOS = {
        "numero", "dataApuracao", "listaDezenas", "listaDezenasSegundoSorteio",
        "trevosSorteados", "nomeTimeCoracaoMesSorte", "numeroTimeCoracao",
        "listaRateioPremio", "dataProximoConcurso", "numeroConcursoProximo",
        "valorEstimadoProximoConcurso", "acumulado"
    };

    private static SharedPreferences cache(Context c) {
        return c.getSharedPreferences("lotolab_resultados_android", Context.MODE_PRIVATE);
    }

    static synchronized boolean guardar(Context c, String modalidade, JSONObject bruto, long consulta) throws JSONException {
        SharedPreferences dados = cache(c);
        int concurso = bruto.getInt("numero");
        String prefixo = modalidade + ":", chave = prefixo + concurso;
        String anterior = dados.getString(chave, null);
        JSONObject resultado = new JSONObject();
        for (String campo : CAMPOS) {
            if (!bruto.isNull(campo)) resultado.put(campo, bruto.get(campo));
        }
        JSONArray rateio = resultado.optJSONArray("listaRateioPremio");
        if (rateio != null && rateio.length() == 0) resultado.remove("listaRateioPremio");
        if (anterior != null) {
            JSONObject salvo = new JSONObject(anterior);
            if (salvo.getLong("consultadoEm") > consulta) return true;
            JSONObject antigo = salvo.getJSONObject("resultado");
            if (antigo.getJSONArray("listaDezenas").toString().equals(resultado.getJSONArray("listaDezenas").toString())) {
                for (String campo : CAMPOS) {
                    if (resultado.isNull(campo) && !antigo.isNull(campo)) resultado.put(campo, antigo.get(campo));
                }
            }
            if (antigo.toString().equals(resultado.toString())) return true;
        }
        JSONObject entrada = new JSONObject().put("modalidade", modalidade)
            .put("consultadoEm", consulta).put("resultado", resultado);
        SharedPreferences.Editor gravacao = dados.edit().putString(chave, entrada.toString());
        ArrayList<Integer> concursos = new ArrayList<>();
        for (String id : dados.getAll().keySet()) {
            if (id.startsWith(prefixo) && !id.equals(chave)) concursos.add(Integer.parseInt(id.substring(prefixo.length())));
        }
        concursos.add(concurso);
        Collections.sort(concursos);
        for (int i = 0; i < concursos.size() - POR_MODALIDADE; i++) gravacao.remove(prefixo + concursos.get(i));
        return gravacao.commit();
    }

    static synchronized JSONArray listar(Context c) {
        JSONArray resultados = new JSONArray();
        for (Object valor : cache(c).getAll().values()) {
            if (valor instanceof String) {
                try { resultados.put(new JSONObject((String) valor)); }
                catch (JSONException e) { /* Uma entrada inválida não impede a leitura das demais. */ }
            }
        }
        return resultados;
    }
}
