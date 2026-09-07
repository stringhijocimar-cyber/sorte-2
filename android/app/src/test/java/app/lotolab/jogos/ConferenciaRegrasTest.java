package app.lotolab.jogos;
import org.junit.Test;
import static org.junit.Assert.*;

public class ConferenciaRegrasTest {
    @Test public void recusaDezenasInvalidas(){
        assertTrue(ConferenciaRegras.validos(new int[]{0,1,99},3,3,0,100));
        assertFalse(ConferenciaRegras.validos(new int[]{1,1,3},3,3,1,60));
        assertFalse(ConferenciaRegras.validos(new int[]{1,2,61},3,3,1,60));
        assertFalse(ConferenciaRegras.validos(null,3,3,1,60));
    }
    @Test public void contaAcertosSemDependerDaOrdem(){
        assertEquals(4,ConferenciaRegras.acertos(new int[]{1,2,3,4,5,6},new int[]{7,8,4,3,2,1}));
    }
    @Test public void concursoDeclaradoTemPrioridade(){
        assertTrue(ConferenciaRegras.cobre(10,1,99,"2026-09-08",10,"2026-09-07"));
        assertFalse(ConferenciaRegras.cobre(10,1,99,"2026-09-01",11,"2026-09-07"));
    }
    @Test public void teimosinhaRespeitaInicioEFim(){
        assertTrue(ConferenciaRegras.cobre(0,10,2,"",11,"2026-09-07"));
        assertFalse(ConferenciaRegras.cobre(0,10,2,"",12,"2026-09-07"));
        assertFalse(ConferenciaRegras.cobre(0,10,2,"",9,"2026-09-07"));
    }
    @Test public void jogoSemAlvoNaoContaSorteiosAnteriores(){
        assertFalse(ConferenciaRegras.cobre(0,0,0,"2026-09-07",10,"2026-09-06"));
        assertTrue(ConferenciaRegras.cobre(0,0,0,"2026-09-07",10,"2026-09-07"));
        assertFalse(ConferenciaRegras.cobre(0,0,0,"",10,"2026-09-07"));
    }
    @Test public void trevosAusentesNaoViraramZero(){
        assertEquals(-1,ConferenciaRegras.trevos(null,new int[]{1,2}));
        assertEquals(-1,ConferenciaRegras.trevos(new int[]{1,1},new int[]{1,2}));
        assertEquals(0,ConferenciaRegras.trevos(new int[]{3,4},new int[]{1,2}));
        assertEquals(2,ConferenciaRegras.trevos(new int[]{2,1},new int[]{1,2}));
    }
    @Test public void doisSorteiosNuncaSomamSuasDezenas(){
        int[] j={1,2,3,4,5,6};
        assertEquals(12,ConferenciaRegras.pontos("dupla-sena",j,new int[]{1,2,3,7,8,9},new int[]{4,5,6,10,11,12},null,null));
        assertEquals(24,ConferenciaRegras.pontos("dupla-sena",j,new int[]{7,8,9,10,11,12},j,null,null));
    }
    @Test public void prioridadeMantemDezenasETrevosNoMesmoJogo(){
        int[] j={1,2,3,4,5,6};
        assertEquals(26,ConferenciaRegras.pontos("mais-milionaria",j,j,null,new int[]{1,2},new int[]{1,2}));
        assertEquals(23,ConferenciaRegras.pontos("mais-milionaria",j,j,null,null,new int[]{1,2}));
        assertTrue(ConferenciaRegras.pontos("mais-milionaria",j,j,null,null,new int[]{1,2})>ConferenciaRegras.pontos("mais-milionaria",j,new int[]{1,2,3,4,5,7},null,new int[]{1,2},new int[]{1,2}));
    }
}
