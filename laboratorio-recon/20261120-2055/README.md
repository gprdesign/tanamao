# 20261120-2055 laboratório — NÃO PUBLICAR

Preservação de protótipos e testes. NÃO aplicar SQL em produção nem deploy. Branch fonte ef774feb442053bcef014b49210ad0e83285507e. Reconstrua o tar.gz concatenando na ordem os arquivos experimentos.tar.gz.b64.part1 ... e decodificando base64.

Árvore combinada: aplicar integrado-final.patch à base e8ac3b73f52768ddc9048bd1abf64f00510939c0. CAS safety é incremental SOMENTE sobre e8ac3b7 + patch reconstruído de laboratorio-recon/20261120-avanco, NÃO sobre a árvore combinada final; há falso conflito de timestamp conhecido. Finance experimental é independente, baseado em ef774feb, NÃO aplicar sem comparar as versões e integrar. Leia os relatórios e os patches para instruções e limitações.

77 testes Node e 14 verificações Postgres no combinado; um teste passa por reproduzir perda financeira. Safety: 58 testes Node e Postgres sintético passam, mas timestamp Z versus +00:00 causa falso conflito após escrita. Finance SQL experimental: 21 verificações Postgres, 7 Node, sem integração com o app. Nenhum prova segurança em produção. Persistem riscos: escritores antigos, isolamento, migração, CAS em todas entidades, restauração, transações financeiras e recorrência; interface de pagamentos e restore do laboratório está suspensa. Não acessar dados reais.

Regra existente: pagamento com desconto parcial ou sem desconto; reabrir estorna exatamente deductedAmount; lançamentos gerais não mudam saldo.

Arquivo comprimido SHA-256: 7f4664dd9a07b1724e09d6124c8f6014d81a2916bf7f65da47e3b1e00ff7f035

Conteúdo:
integrado-final.patch: 197368 bytes sha256 aa77c473c8e0da159596490c2713c6da2c5fac2dbfe420c035a3af732d331137
recon-resultado.txt: 3111 bytes sha256 d64350cc5cb3f716a5016740db59dbb4e356ef177823f7c6be6db440ecf8ef10
recon-node.log: 14094 bytes sha256 0a6bbf9f7726a0498335d2ff65fad00af17eab7bc6fe5b5c602274d6a20fdfbd
recon-postgres.log: 824 bytes sha256 586329e4c9f35b5732c20817efedfd297da6b54145e7d939fdb16b55ee49d488
finance-experimental.patch: 40125 bytes sha256 ee872cad924bb9d9c201963a817beb51c01e451a82e9a69a4cf838cbc318e4a6
safety-cas-incremental.patch: 17979 bytes sha256 ef2ced4c38ef8705c2625ceca48df78efefcc560cc6bae768db0d5f23a284e34
safety-report.md: 6323 bytes sha256 6b68bd491601a59f32486d83f8e0451406a994005efad8b15f150d457c1d7476
safety-node.log: 10504 bytes sha256 4edc1cbec9cc18d41bb622555358191f7c0d259877b785eb952e1d71b59751ea
safety-postgres.log: 250 bytes sha256 7617c8f8b59f4229de9785c961ddd5c467e9afe6e1112533f9563f297f5f836a
