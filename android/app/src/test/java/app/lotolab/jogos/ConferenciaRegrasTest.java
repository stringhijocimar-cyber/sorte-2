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
}
