package app.lotolab.jogos;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

@CapacitorPlugin(name="LotoLabBackup")
public class LotoLabBackupPlugin extends Plugin {
    private static final int LIMITE = 30 * 1024 * 1024;
    private volatile boolean ocupado;

    @PluginMethod public void salvar(PluginCall call) {
        String texto = call.getString("texto");
        String nome = call.getString("nome", "LotoLab-backup.json");
        if (texto == null || texto.getBytes(StandardCharsets.UTF_8).length > LIMITE ||
            !nome.matches("LotoLab-[A-Za-z0-9._-]+\\.json")) {
            call.reject("Backup inválido."); return;
        }
        if (ocupado) { call.reject("Há um salvamento em andamento."); return; }
        ocupado = true;
        String token = UUID.randomUUID().toString();
        File temporario = new File(getContext().getCacheDir(), "lotolab-backup-" + token + ".json");
        try (OutputStream out = new FileOutputStream(temporario)) {
            out.write(texto.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            temporario.delete(); ocupado = false; call.reject("Não foi possível preparar a cópia."); return;
        }
        // Não guarda um backup grande no Bundle da Activity: o seletor pode
        // recriar o processo ou girar a tela. O conteúdo permanece no cache privado.
        call.getData().remove("texto");
        call.getData().put("arquivoPendente", token);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, nome);
        try { startActivityForResult(call, intent, "arquivoEscolhido"); }
        catch (RuntimeException e) { temporario.delete(); ocupado = false; call.reject("Não foi possível abrir o seletor de arquivos."); }
    }

    @ActivityCallback private void arquivoEscolhido(PluginCall call, ActivityResult result) {
        ocupado = false;
        if (call == null) return;
        String token = call.getString("arquivoPendente", "");
        if (!token.matches("[a-f0-9-]{36}")) { call.reject("Cópia pendente inválida."); return; }
        File temporario = new File(getContext().getCacheDir(), "lotolab-backup-" + token + ".json");
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            temporario.delete();
            call.reject("Salvamento cancelado; dados preservados."); return;
        }
        Uri uri = result.getData().getData();
        // O seletor concede acesso somente ao arquivo escolhido, sem permissões gerais.
        new Thread(() -> {
            try {
                if (!temporario.isFile() || temporario.length() > LIMITE) throw new IllegalStateException();
                byte[] bytes;
                try (InputStream in = new FileInputStream(temporario); ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                    byte[] bloco = new byte[8192]; int n;
                    while ((n = in.read(bloco)) != -1) {
                        if (buffer.size() + n > LIMITE) throw new IllegalStateException();
                        buffer.write(bloco, 0, n);
                    }
                    bytes = buffer.toByteArray();
                }
                try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "w")) {
                    if (out == null) throw new IllegalStateException();
                    out.write(bytes); out.flush();
                }
                MessageDigest verificador = MessageDigest.getInstance("SHA-256");
                int total = 0;
                try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new IllegalStateException();
                    byte[] bloco = new byte[8192]; int n;
                    while ((n = in.read(bloco)) != -1) {
                        total += n;
                        if (total > LIMITE) throw new IllegalStateException();
                        verificador.update(bloco, 0, n);
                    }
                }
                byte[] esperado = MessageDigest.getInstance("SHA-256").digest(bytes);
                if (total != bytes.length || !MessageDigest.isEqual(esperado, verificador.digest())) throw new IllegalStateException();
                JSObject resposta = new JSObject(); resposta.put("salvo", true); call.resolve(resposta);
            } catch (Exception e) { call.reject("O arquivo não pôde ser verificado. Tente salvar em outra pasta antes de trocar de versão."); }
            finally { temporario.delete(); }
        }, "LotoLabBackup").start();
    }
}
