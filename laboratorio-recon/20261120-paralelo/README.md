# Laboratório paralelo 20/11/2026 — NÃO PUBLICAR

Experimentos independentes, somente dados fictícios. O arquivo está dividido em experimentos.tar.gz.b64.part1 até part7, nesta ordem; concatenar, decodificar base64 e descompactar tar.gz. SHA-256 do tar.gz: 319cc0b9380535ccf3e799b0c91c4a886719c445e2824ad91e756278328295b7. Contém 3 patches incrementais e 3 relatórios explicativos.

Base: reconstituir primeiro o patch integrado de laboratorio-recon/20261120-avanco sobre e8ac3b73f52768ddc9048bd1abf64f00510939c0. Os deltas são independentes e podem conflitar. Ler relatórios antes de aplicar; não são publicáveis nem migrações de produção.

Financeiro: protótipo PostgreSQL isolado, 14 verificações, autenticação simulada, app ainda não integrado e risco financeiro continua. Não presumir regra de estorno ao reabrir; investigar requisitos e comportamento existente.

Isolamento/CAS: protótipo com sincronização propositalmente suspensa, não implementa segregação de conta nem bloqueio de clientes antigos. Restauração e recorrência: inspeção parcial, restauração desativada, ajuste em recorrência mensal/anual mas deduplicação simultânea não resolvida.

Próximos passos: integrar e testar migração de legados, CAS em todas entidades, isolamento de contas/abas, prevenção de escritas legadas, operações financeiras transacionais com recuperação, restauração segura e recorrência concorrente. Só usar dados fictícios e banco isolado. Testar integração e navegador PC/celular; só publicar quando riscos de perda forem resolvidos e tudo passar; validar Pages, arquivos e layouts. O teste de perda financeira passa porque reproduz o bug, não é aprovação de segurança.
