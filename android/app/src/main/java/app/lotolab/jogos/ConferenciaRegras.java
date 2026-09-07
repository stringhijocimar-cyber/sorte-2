package app.lotolab.jogos;

import java.util.HashSet;
import java.util.Set;

/** Regras comuns ao desenho e à conferência nativa; sem dependências Android. */
public final class ConferenciaRegras {
    private ConferenciaRegras() {}
    public static boolean validos(int[] dezenas, int min, int max, int base, int universo) {
        if (dezenas == null || dezenas.length < min || dezenas.length > max) return false;
        Set<Integer> vistos = new HashSet<>();
        for (int d : dezenas) if (d < base || d >= base + universo || !vistos.add(d)) return false;
        return true;
    }
    public static int acertos(int[] jogo, int[] sorteio) {
        Set<Integer> sorteadas = new HashSet<>();
        for (int n : sorteio) sorteadas.add(n);
        int n = 0; for (int d : jogo) if (sorteadas.contains(d)) n++;
        return n;
    }
    public static boolean cobre(int alvo, int inicio, int quantidade, String criado, int concurso, String data) {
        if (alvo > 0) return concurso == alvo;
        if (inicio > 0) return quantidade > 0 && concurso >= inicio && (long)concurso < (long)inicio + quantidade;
        return criado != null && data != null && criado.matches("\\d{4}-\\d{2}-\\d{2}")
            && data.matches("\\d{4}-\\d{2}-\\d{2}") && data.compareTo(criado) >= 0;
    }
}
