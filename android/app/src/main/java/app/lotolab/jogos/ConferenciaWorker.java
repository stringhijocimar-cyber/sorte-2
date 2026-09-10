package app.lotolab.jogos;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;

/** Busca apenas resultados públicos, sem enviar jogos ou dados do usuário. */
public class ConferenciaWorker extends Worker {
    public ConferenciaWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}
    private JSONObject buscar(String slug) throws Exception {
        if(!slug.matches("megasena|lotofacil|quina|lotomania|duplasena|diadesorte|timemania|maismilionaria"))throw new IllegalArgumentException();
        HttpURLConnection conn=(HttpURLConnection)new URL("https://servicebus2.caixa.gov.br/portaldeloterias/api/"+slug).openConnection();
        conn.setConnectTimeout(12000);conn.setReadTimeout(12000);conn.setRequestProperty("Accept","application/json");
        try {
            if(conn.getResponseCode()!=200)throw new IllegalStateException("Resultado indisponível");
            try(InputStream in=conn.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buffer=new byte[4096];int n;
                while((n=in.read(buffer))!=-1){out.write(buffer,0,n);if(out.size()>1000000)throw new IllegalStateException("Resposta excessiva");}
                return new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));
            }
        }finally{conn.disconnect();}
    }
    private String iso(String s) throws Exception {
        SimpleDateFormat entrada=new SimpleDateFormat("dd/MM/yyyy",Locale.ROOT);entrada.setLenient(false);
        if(!s.matches("\\d{2}/\\d{2}/\\d{4}"))throw new IllegalArgumentException("Data inválida");
        Date d=entrada.parse(s);return new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).format(d);
    }
    @NonNull @Override public Result doWork(){
        SharedPreferences prefs=NotificacaoColorida.preferencias(getApplicationContext());
        boolean falhou=false;
        try {
            JSONObject estado=new JSONObject(prefs.getString("estado","{}"));
            if(!estado.optBoolean("ligado",false))return Result.success();
            JSONObject mods=estado.optJSONObject("modalidades"),conhecidos=estado.optJSONObject("conhecidos"),completos=estado.optJSONObject("completos");
            JSONArray jogos=estado.optJSONArray("jogos");
            if(mods==null||jogos==null||jogos.length()==0)return Result.success();
            Iterator<String> it=mods.keys();
            while(it.hasNext()&&!isStopped()){
                String m=it.next();JSONObject mod=mods.optJSONObject(m);
                if(mod==null||NotificacaoColorida.regra(m)==null)continue;
                boolean tem=false;for(int i=0;i<jogos.length();i++)if(m.equals(jogos.getJSONObject(i).optString("modalidade"))){tem=true;break;}
                if(!tem)continue;
                try {
                    JSONObject r=buscar(mod.getString("slug"));int n=r.getInt("numero");
                    int visto=prefs.getInt("visto:"+m,0),conhecido=conhecidos==null?0:conhecidos.optInt(m,0);
                    boolean especial="mais-milionaria".equals(m)||"dupla-sena".equals(m);
                    if(n<Math.max(visto,conhecido)||(!especial&&n<=Math.max(visto,conhecido))||(n==visto&&prefs.getBoolean("completo:"+m,false))||(completos!=null&&n<=completos.optInt(m,0)))continue;
                    String data=iso(r.getString("dataApuracao"));JSONArray dezenas=r.getJSONArray("listaDezenas");
                    int[] sorteio=NotificacaoColorida.numeros(dezenas),regra=NotificacaoColorida.regra(m);
                    if(!ConferenciaRegras.validos(sorteio,regra[2],regra[2],regra[0],regra[1]))continue;
                    JSONObject melhor=null;int maior=Integer.MIN_VALUE;
                    for(int i=0;i<jogos.length();i++){
                        JSONObject j=jogos.getJSONObject(i);if(!m.equals(j.optString("modalidade")))continue;
                        if(!ConferenciaRegras.cobre(j.optInt("concursoAlvo",0),j.optInt("deConcurso",0),j.optInt("concursos",0),j.optString("data"),n,data))continue;
                        JSONObject cf=new JSONObject().put("modalidade",m).put("concurso",n).put("jogo",j.optString("id"))
                            .put("dezenas",j.getJSONArray("dezenas")).put("sorteadas",dezenas);
                        if("mais-milionaria".equals(m)){
                            if(!j.isNull("trevos"))cf.put("trevos",j.getJSONArray("trevos"));
                            if(!r.isNull("trevosSorteados"))cf.put("trevosSorteados",r.getJSONArray("trevosSorteados"));
                        }
                        if("dupla-sena".equals(m)&&!r.isNull("listaDezenasSegundoSorteio"))cf.put("sorteadasSegundo",r.getJSONArray("listaDezenasSegundoSorteio"));
                        if(!NotificacaoColorida.valida(cf))continue;
                        int acertos=NotificacaoColorida.pontos(cf);
                        if(acertos>maior){maior=acertos;melhor=cf;}
                    }
                    // Um resumo por modalidade e concurso, inclusive quando não houve faixa de prêmio.
                    if(melhor!=null&&!NotificacaoColorida.mostrar(getApplicationContext(),melhor,mod.optString("nome",m),false))continue;
                    boolean completo=!especial||("mais-milionaria".equals(m)?ConferenciaRegras.validos(NotificacaoColorida.numeros(r.optJSONArray("trevosSorteados")),2,2,1,6):ConferenciaRegras.validos(NotificacaoColorida.numeros(r.optJSONArray("listaDezenasSegundoSorteio")),6,6,1,50));
                    prefs.edit().putInt("visto:"+m,n).putBoolean("completo:"+m,completo).apply();
                }catch(Exception e){falhou=true;}
            }
        }catch(Exception e){return Result.failure();}
        return falhou&&getRunAttemptCount()<2?Result.retry():Result.success();
    }
}
