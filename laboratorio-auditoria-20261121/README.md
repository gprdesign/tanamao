# Auditoria experimental de 21/11/2026

NÃO PUBLICAR nem aplicar ao Supabase. Trabalhos independentes, não integrados, ainda com riscos críticos. Apenas dados fictícios. Base dos patches: 712ea0a69c49297e676a3f0b0a25843022169579.

1. Finanças e CAS: finance-cas.part01.b64 a part15.b64, concatenar na ordem, decodificar base64 e descompactar gzip. SHA-256 do patch: 224faa6c3300210185e5ef646d0f72d45cfeb74d78ede60a66015676bc8a436a. Commit local d16ae5e518816f630f4a0b93a6926e4a63d52c56.

2. Isolamento: isolamento.part01.b64 a part12.b64, concatenar na ordem, decodificar base64 e descompactar gzip. SHA-256 do patch: db467d45e342bfe01b5bd91209538bc5b9e4f215d6df76074fc41e7d3c0cdecd. Commit local e76e34f5576002d6465e9ad4ab2bb0395d3fe55f.

3. Calendário: calendario.patch.gz.b64, decodificar base64 e descompactar gzip. SHA-256 do patch: 203e1ff97329438590b5ad57565a56e056d8e37263fb9b725f791ae575e1ddb6. Commit local ae212af61cc1f558cded529dd6f96a85253690d1.

Aplicar cada patch somente em cópia isolada da base. Não combinar sem revisão; o aplicativo e banco ainda não foram integrados nem validados de ponta a ponta. Faltam segurança e migração, teste concorrente, PC e celular. Ver relatórios nos próprios patches.