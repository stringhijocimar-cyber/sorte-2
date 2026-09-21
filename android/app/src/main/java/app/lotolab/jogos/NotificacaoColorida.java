package app.lotolab.jogos;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;
import java.util.ArrayList;
import java.util.List;

final class NotificacaoColorida {
    static final String PREFS = "lotolab_notificacoes_v410", CANAL = "lotolab_conferencias_coloridas";
    static SharedPreferences preferencias(Context c) {return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);}
    static int[] numeros(JSONArray a) {
        if (a == null || a.length() > 100) return null;
        int[] n = new int[a.length()];
        for (int i=0;i<n.length;i++) {
            Object v=a.opt(i);
            if (v == null || !v.toString().matches("\\d{1,2}")) return null;
            n[i]=Integer.parseInt(v.toString());
        }
        return n;
    }
    // Os mesmos limites do volante. Recusa dados malformados antes de anunciar acertos.
    static int[] regra(String m) {
        switch(m) {
            case "mega-sena": return new int[]{1,60,6,6,20};
            case "lotofacil": return new int[]{1,25,15,15,20};
            case "quina": return new int[]{1,80,5,5,15};
            case "lotomania": return new int[]{0,100,20,50,50};
            case "dupla-sena": return new int[]{1,50,6,6,15};
            case "dia-de-sorte": return new int[]{1,31,7,7,15};
            case "timemania": return new int[]{1,80,7,10,10};
            case "mais-milionaria": return new int[]{1,50,6,6,12};
            default: return null;
        }
    }
    static boolean valida(JSONObject cf) {
        if (cf == null || cf.optInt("concurso",0) < 1) return false;
        int[] r=regra(cf.optString("modalidade"));
        return r != null && adicionaisValidos(cf) && ConferenciaRegras.validos(numeros(cf.optJSONArray("dezenas")),r[3],r[4],r[0],r[1])
            && ConferenciaRegras.validos(numeros(cf.optJSONArray("sorteadas")),r[2],r[2],r[0],r[1]);
    }
    static boolean adicionaisValidos(JSONObject cf) {
        String m=cf.optString("modalidade");
        if("mais-milionaria".equals(m))return opcionalValido(cf,"trevos",2,6,6)&&opcionalValido(cf,"trevosSorteados",2,2,6);
        return !"dupla-sena".equals(m)||opcionalValido(cf,"sorteadasSegundo",6,6,50);
    }
    private static boolean opcionalValido(JSONObject cf,String campo,int min,int max,int limite){
        return cf.isNull(campo)||ConferenciaRegras.validos(numeros(cf.optJSONArray(campo)),min,max,1,limite);
    }
    static int pontos(JSONObject cf){
        return ConferenciaRegras.pontos(cf.optString("modalidade"),numeros(cf.optJSONArray("dezenas")),numeros(cf.optJSONArray("sorteadas")),
            numeros(cf.optJSONArray("sorteadasSegundo")),numeros(cf.optJSONArray("trevos")),numeros(cf.optJSONArray("trevosSorteados")));
    }
    static String resumo(JSONObject cf){
        int h=ConferenciaRegras.acertos(numeros(cf.optJSONArray("dezenas")),numeros(cf.optJSONArray("sorteadas")));
        if("dupla-sena".equals(cf.optString("modalidade"))){
            int[] d=numeros(cf.optJSONArray("sorteadasSegundo"));
            return "1º: "+h+" · 2º: "+(d==null?"pendente":ConferenciaRegras.acertos(numeros(cf.optJSONArray("dezenas")),d));
        }
        if("mais-milionaria".equals(cf.optString("modalidade"))){
            int t=ConferenciaRegras.trevos(numeros(cf.optJSONArray("trevos")),numeros(cf.optJSONArray("trevosSorteados")));
            return h+" dezenas · "+(t<0?"trevos pendentes":t+" trevos");
        }
        return h+" acertos";
    }
    private static final class Grupo {
        final String titulo;final int[] jogo,sorteio;
        Grupo(String t,int[] j,int[] s){titulo=t;jogo=j;sorteio=s;}
    }
    private static List<Grupo> grupos(JSONObject cf){
        List<Grupo> gs=new ArrayList<>();String m=cf.optString("modalidade");int[] ds=numeros(cf.optJSONArray("dezenas"));
        gs.add(new Grupo("dupla-sena".equals(m)?"1º SORTEIO":"DEZENAS",ds,numeros(cf.optJSONArray("sorteadas"))));
        if("dupla-sena".equals(m))gs.add(new Grupo("2º SORTEIO"+(cf.isNull("sorteadasSegundo")?" · PENDENTE":""),ds,numeros(cf.optJSONArray("sorteadasSegundo"))));
        if("mais-milionaria".equals(m))gs.add(new Grupo("TREVOS"+(cf.isNull("trevos")||cf.isNull("trevosSorteados")?" · PENDENTES":""),numeros(cf.optJSONArray("trevos")),numeros(cf.optJSONArray("trevosSorteados"))));
        return gs;
    }
    static Bitmap imagem(JSONObject cf) {
        List<Grupo> gs=grupos(cf);int altura=70;
        for(Grupo g:gs)altura+=55+(g.jogo==null?0:(g.jogo.length+9)/10*90);
        Bitmap bitmap=Bitmap.createBitmap(1000,altura,Bitmap.Config.ARGB_8888);
        Canvas canvas=new Canvas(bitmap);canvas.drawColor(Color.rgb(17,24,33));
        Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);p.setTypeface(Typeface.create("sans-serif-medium",Typeface.BOLD));
        p.setTextSize(24);p.setColor(Color.WHITE);canvas.drawText("VERDE: ACERTO · VERMELHO: NÃO SORTEADA · CINZA: PENDENTE",25,35,p);
        float topo=65;
        for(Grupo g:gs){
            p.setTextAlign(Paint.Align.LEFT);p.setTextSize(25);p.setColor(Color.WHITE);canvas.drawText(g.titulo,25,topo,p);topo+=55;
            if(g.jogo==null)continue;
            for(int i=0;i<g.jogo.length;i++) {
                boolean hit=false;if(g.sorteio!=null)for(int d:g.sorteio)if(d==g.jogo[i]){hit=true;break;}
                float x=50+(i%10)*100,y=topo+(i/10)*90;
                p.setColor(g.sorteio==null?Color.rgb(70,78,92):hit?Color.rgb(21,125,71):Color.rgb(252,230,232));canvas.drawCircle(x,y,34,p);
                p.setColor(g.sorteio==null||hit?Color.WHITE:Color.rgb(146,45,60));p.setTextSize(30);p.setTextAlign(Paint.Align.CENTER);
                canvas.drawText(String.format(Locale.ROOT,"%02d",g.jogo[i]),x,y-(p.ascent()+p.descent())/2,p);
            }
            topo+=(g.jogo.length+9)/10*90;
        }
        return bitmap;
    }
    static synchronized boolean mostrar(Context c, JSONObject cf, String nome, boolean demonstracao) {
        if(!valida(cf))return false;
        NotificationManagerCompat manager=NotificationManagerCompat.from(c);
        if(!manager.areNotificationsEnabled())return false;
        NotificationManager nativeManager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26){
            NotificationChannel canal=new NotificationChannel(CANAL,"Conferência com dezenas",NotificationManager.IMPORTANCE_DEFAULT);
            canal.setDescription("Acertos e dezenas não sorteadas nos jogos acompanhados");nativeManager.createNotificationChannel(canal);
            if(nativeManager.getNotificationChannel(CANAL).getImportance()==NotificationManager.IMPORTANCE_NONE)return false;
        }
        String modalidade=cf.optString("modalidade"), chave=modalidade+":"+cf.optInt("concurso");
        SharedPreferences prefs=preferencias(c);
        String assinatura=cf.optString("jogo")+":"+cf.optJSONArray("dezenas")+":"+cf.optJSONArray("sorteadas")+":"+cf.optJSONArray("trevos")+":"+cf.optJSONArray("trevosSorteados")+":"+cf.optJSONArray("sorteadasSegundo");
        int enviado=prefs.getInt("enviado:"+modalidade,0);
        if(!demonstracao&&(enviado>cf.optInt("concurso")||(enviado==cf.optInt("concurso")&&assinatura.equals(prefs.getString("assinatura:"+modalidade,"")))))return true;
        int[] jogo=numeros(cf.optJSONArray("dezenas")),sorteio=numeros(cf.optJSONArray("sorteadas"));
        int acertos=ConferenciaRegras.acertos(jogo,sorteio), id=(chave.hashCode()&0x3fffffff)+10000;
        Intent intent=new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("lotolab_modalidade",modalidade);intent.putExtra("lotolab_jogo",cf.optString("jogo"));
        PendingIntent abrir=PendingIntent.getActivity(c,id,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        String titulo=(demonstracao?"Demonstração · ":"")+nome+": "+resumo(cf);
        String texto="Concurso "+cf.optInt("concurso")+" · comparando dezenas; confira o bilhete oficial.";
        // Texto acessível repete os números, pois a imagem sozinha não é lida por todos os serviços.
        StringBuilder descricao=new StringBuilder();
        for(Grupo g:grupos(cf)){
            descricao.append(g.titulo).append("; ");if(g.jogo==null)continue;
            for(int d:g.jogo){boolean hit=false;if(g.sorteio!=null)for(int n:g.sorteio)if(n==d){hit=true;break;}
                descricao.append(String.format(Locale.ROOT,"%02d",d)).append(g.sorteio==null?" pendente; ":hit?" acertou; ":" não sorteada; ");}
        }
        NotificationCompat.BigPictureStyle estilo=new NotificationCompat.BigPictureStyle()
            .bigPicture(imagem(cf)).setBigContentTitle(titulo).setSummaryText(texto)
            .setContentDescription(descricao.toString());
        NotificationCompat.Builder b=new NotificationCompat.Builder(c,CANAL)
            .setSmallIcon(R.drawable.ic_stat_icone).setContentTitle(titulo).setContentText(texto)
            .setColor(Color.rgb(130,80,223)).setStyle(estilo).setAutoCancel(true)
            .setContentIntent(abrir).setOnlyAlertOnce(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .addAction(0,"Ver jogo",abrir);
        try {manager.notify(id,b.build());}
        catch(SecurityException e){return false;}
        if(!demonstracao)prefs.edit().putInt("enviado:"+modalidade,cf.optInt("concurso")).putString("assinatura:"+modalidade,assinatura).apply();
        return true;
    }
}
