# Laboratório de isolamento — NÃO PUBLICAR

Base: main `712ea0a69c49297e676a3f0b0a25843022169579`. Este incremento é parcial e NÃO resolve isolamento multi-conta, multi-aba ou restauração. Não aplicar em produção como correção completa.

## Código em app.js

A exportação manual v9 conserva tombstones, configurações e um inventário de valores brutos de chaves conhecidas, incluindo cópia automática e dados legados; preserva originais, não exporta intencionalmente os caches de autenticação, não migra nem restaura nada. `ownership: unverified` deixa claro que dados locais podem pertencer a mais de uma conta. Erro de leitura de localStorage e alteração detectada entre as duas leituras impedem o download. O arquivo contém dados pessoais, inclusive dados de diferentes contas e backups antigos, e deve ser protegido. Não é uma auditoria de segredos no conteúdo livre do usuário. A exportação v9 não foi testada com consumidores externos; a compatibilidade com o formato v8 é desconhecida.

## Limites críticos

- Duas leituras não são transação: ABA, alterações simultâneas durante a leitura, divergência estado em memória/localStorage e ausência de chaves desconhecidas podem levar a cópia incompleta ou inconsistente. Não há isolamento por conta ou aba, nem prova de propriedade.
- Continua existente a fusão de dados locais genéricos com a conta que entrar e atualização de estado por outras abas. Atualizações remotas e clientes antigos não estão protegidos. NÃO executar este app com dados reais.
- Backup automático ainda sobrescreve o snapshot anterior e omite tombstones. A exportação não protege exclusão do dispositivo nem fornece restauração. Nenhum restore deve ser habilitado a partir desse arquivo sem um desenho transacional, validação de proprietário, recuperação externa e resolução de conflitos.
- Faltam fence de clientes antigos e todos os caminhos RPC/REST, CAS por entidade, migração conservadora auditável, RLS, locks, testes transacionais reais, compatibilidade, casos de quota, offline, troca de sessão e testes do app completo no navegador desktop e mobile.
- O laboratório `lab-isolamento-novo-20261121` permanece uma prévia sem autorização ou capacidade de restore e não foi aplicado à main: fazia rollback de `712ea0a` em dados legados e privacidade. Seus patches exigem reconciliação manual.

## Reproduzir testes

`node --check app.js && node --test tests/*.test.js tests/*.test.cjs`. Testes de concorrência de exportação simulam um valor modificado entre leituras; não provam segurança com duas abas reais. Não houve conexão ao Supabase nem deploy.


O arquivo patch.gz.b64 contém `git diff --binary` da base 712ea0a ao commit local 0bdfdda6de550070cc9fb4ef4cd652611fc213c3. Decodificar base64, descomprimir e revisar; não aplicar em produção.
