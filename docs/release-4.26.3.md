# LotoLab 4.26.3

Atualização Android com `versionCode` 40 e assinatura permanente conferida.

## Melhorias

- Análises específicas da Mega-Sena e da Lotofácil: médias do histórico, soma, primos, distribuição no volante e repetição do último resultado disponível. Médias da Lotofácil corrigidas por posição.
- Cobertura e atualização do histórico nas sugestões, no laboratório e na área de dados, com identificação de lacunas, datas e fontes declaradas.
- Indicador operacional com estado de validação e limitações explícitas. A pontuação não representa probabilidade de prêmio.
- Avaliação prospectiva mais conservadora, preservando jogos e rodadas congeladas.
- Atalho Avaliar estratégias corrigido, contraste dos painéis nos dois temas e tabelas ajustadas à largura do celular.
- Versão, cache e distribuição offline sincronizados. Bolinhas nas sugestões e resultados; quadrados com colchetes somente nas cartelas abertas.

## Instalar a atualização

Baixe **LotoLab-4.26.3.apk** e abra o arquivo no Android. Ele mantém o identificador e o certificado das versões finais 4.26.0, 4.26.1 e 4.26.2 e pode ser instalado por cima, preservando os jogos e o histórico. Antes de atualizar, guarde uma cópia em **Meus jogos → Backup**.

O arquivo `transferencia` destina-se somente à [migração de instalações antigas com outro certificado](https://github.com/stringhijocimar-cyber/sorte-2/blob/main/docs/atualizacoes-android.md). Use o APK normal para a atualização habitual.

## Validação

Testes do motor, interface, distribuição e compilação Android aprovados no GitHub Actions. Os APKs finais tiveram conteúdo, identidade, integridade, certificado permanente e estado de depuração conferidos. A 4.26.2 usa versionCode 39 e a 4.26.3 usa 40 com o mesmo certificado. A instalação desta atualização ainda não foi testada no aparelho do usuário.

As análises descrevem o histórico; não foi demonstrado aumento da chance de prêmio.
