# Laboratório experimental, NÃO PUBLICAR

Base: commit 2d495c278acb3e5b7907de1e747e0a58bd87a290 da main. Gio autorizou publicar após validação, sem novas perguntas, mas as mudanças abaixo ainda são inseguras. Não houve alteração de dados reais nem deploy deste trabalho.

Os arquivos .patch.gz.b64 são patches gzip codificados em base64. Para arquivos em partes, concatenar por número, decodificar base64 e descomprimir. integrado.patch.gz.b64.part1 a part7 são o patch integrado (nome do arquivo sem o caractere invisível deste texto). SHA-256 do patch integrado: ee4c59e1cd496986a7615dd95e29eb3599e2244aa3b836b2b4377952764da27b. Patches separados de sync, backup, recur e finance são rascunhos anteriores, todos com base na main indicada.

Integração: sync, backup, recur e finance aplicados em laboratório; conflito do service worker resolvido preservando task-sync.js. Testes sintéticos integrados: 25 testes Node passaram, mais teste do bloqueio de contas da caixinha. Testes isolados não provam segurança fim a fim.

BLOQUEIOS: CAS SQL é rascunho não testado nem aplicado. Clientes antigos ainda podem sobrescrever; dados legados não têm migração nem escolha de conflitos; abas podem sobrescrever dados locais; demais entidades não estão protegidas; restauração de backup não foi implementada; pagamento/reabertura da caixinha foi bloqueado em vez de corrigido; recorrência financeira pode propagar edição de ocorrência individual; faltam testes transacionais, integração real e testes completos de PC/celular. NÃO DEPLOY até resolver e testar cada ponto, sem usar dados reais.

Após concluir, testar o GitHub Pages, arquivos servidos e layouts no PC e celular. Os testes do laboratório usam dados fictícios. Não há senhas nem dados reais conhecidos nestes rascunhos.
