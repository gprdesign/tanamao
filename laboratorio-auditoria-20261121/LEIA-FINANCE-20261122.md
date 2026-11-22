# Continuação financeira experimental

As partes finance-revisao-20261122.part01.b64 e part02.b64 contêm um patch gzip/base64 sobre o resultado do patch finance-cas anterior, commit local d16ae5e518816f630f4a0b93a6926e4a63d52c56. O patch novo produz o commit local 2f1e45ac0d7d0094dfc8af541d90e4215efdcd82; SHA-256 do patch descompactado: 710fdbe16e7a511f5aa80a96d9c1d9e45a8f681ad5747750c69fd3b1d00b38de.

O experimento valida recibos e revisões de transação, protege contra releitura desatualizada e preserva intenção para repetir com mesmo identificador. Testado com PostgreSQL descartável e dados falsos. Não cobre todo o aplicativo e mantém SQL bloqueado; não publicar nem aplicar em produção.