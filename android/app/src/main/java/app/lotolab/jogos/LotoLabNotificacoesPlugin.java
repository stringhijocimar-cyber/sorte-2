package app.lotolab.jogos;

import android.content.Intent;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name="LotoLabNotificacoes")
public class LotoLabNotificacoesPlugin extends Plugin {
    private static final String TRABALHO="lotolab_conferencia_colorida_v410";
    private String modalidade="",jogo="";
    private int concurso;
    private void receber(Intent i){if(i!=null&&i.hasExtra("lotolab_modalidade")){
        modalidade=i.getStringExtra("lotolab_modalidade");jogo=i.getStringExtra("lotolab_jogo");
        concurso=i.getIntExtra("lotolab_concurso",0);
        i.removeExtra("lotolab_modalidade");i.removeExtra("lotolab_jogo");i.removeExtra("lotolab_concurso");
    }}
    @Override public void load(){receber(getActivity().getIntent());}
    @Override protected void handleOnNewIntent(Intent i){super.handleOnNewIntent(i);receber(i);notifyListeners("abrirJogo",new JSObject());}
    @PluginMethod public void destino(PluginCall call){
        JSObject r=new JSObject();r.put("modalidade",modalidade);r.put("jogo",jogo);r.put("concurso",concurso);
        modalidade="";jogo="";concurso=0;call.resolve(r);
    }
    @PluginMethod public void resultados(PluginCall call){
        JSObject r=new JSObject();
        r.put("concursos",ResultadosEmSegundoPlano.listar(getContext()));
        call.resolve(r);
    }
    @PluginMethod public void mostrar(PluginCall call){
        JSObject cf=call.getObject("conferencia");
        if(!NotificacaoColorida.valida(cf)){call.reject("Conferência inválida");return;}
        boolean ok=NotificacaoColorida.mostrar(getContext(),cf,call.getString("nome","LotoLab"),call.getBoolean("demonstracao",false));
        JSObject r=new JSObject();r.put("exibida",ok);call.resolve(r);
    }
    @PluginMethod public void sincronizar(PluginCall call){
        JSObject estado=call.getObject("estado");
        if(estado==null||estado.toString().length()>4000000){call.reject("Estado inválido");return;}
        if(!NotificacaoColorida.preferencias(getContext()).edit().putString("estado",estado.toString()).commit()){
            call.reject("Não foi possível guardar o estado");return;
        }
        WorkManager manager=WorkManager.getInstance(getContext());
        if(!estado.optBoolean("ligado",false)||estado.optJSONObject("modalidades")==null||estado.optJSONObject("modalidades").length()==0){
            manager.cancelUniqueWork(TRABALHO);manager.cancelUniqueWork(TRABALHO+"_agora");call.resolve();return;
        }
        Constraints constraints=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest trabalho=new PeriodicWorkRequest.Builder(ConferenciaWorker.class,15,TimeUnit.MINUTES)
            .setConstraints(constraints).build();
        // UPDATE migra instalações que ainda tinham o período de 30 minutos.
        manager.enqueueUniquePeriodicWork(TRABALHO,ExistingPeriodicWorkPolicy.UPDATE,trabalho);
        manager.enqueueUniqueWork(TRABALHO+"_agora",ExistingWorkPolicy.KEEP,
            new OneTimeWorkRequest.Builder(ConferenciaWorker.class).setConstraints(constraints).build());
        call.resolve();
    }
}
