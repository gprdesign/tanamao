# Laboratório independente — NÃO PUBLICAR

## Situação
Isto é pesquisa em banco PostgreSQL descartável com identidades simuladas, não é migração, não integra o aplicativo e não corrige produção. Pagamento e reabertura permanecem bloqueados na árvore combinada existente. Não execute SQL em banco real. Não houve deploy nem acesso a dados reais.

## Reconstrução e integridade
A base remota `correcoes-laboratorio-20261120` foi lida no commit `13be6b3d4d162bd8cf02336dca02f13b441b83e7`.

1. Conforme `20261120-2055/README.md`, concatenar em ordem numérica `experimentos.tar.gz.b64.part1` a `part14`, decodificar base64 e extrair. SHA256 do arquivo comprimido conferido: `7f4664dd9a07b1724e09d6124c8f6014d81a2916bf7f65da47e3b1e00ff7f035`.
2. Na extração conferir `integrado-final.patch`: `aa77c473c8e0da159596490c2713c6da2c5fac2dbfe420c035a3af732d331137` e `finance-experimental.patch`: `ee872cad924bb9d9c201963a817beb51c01e451a82e9a69a4cf838cbc318e4a6`.
3. Conforme `20261120-finance-recur-confirmacao/README.md`, concatenar `finance-recur.tar.gz.b64.part1` a `part3`, decodificar e extrair: SHA256 `6651b682fe9eced50b837436fe99baf47c049d90b356dc20e6410a19a9691833`. O SQL financeiro copiado aqui tem SHA256 `b740c141fa59d2055fc8c58c1abf381c500ee712794b9421ff1ade5027b97338`.
4. A árvore combinada só é reconstruída numa cópia de `e8ac3b73f52768ddc9048bd1abf64f00510939c0`: aplicar `integrado-final.patch`, depois `recurrence-anchor-incremental.patch` aqui preservado. Não aplicar `finance-experimental.patch` por cima: é outra base (`ef774feb...`) e foi pensado para experimento independente. O SQL financeiro substituído isoladamente não está conectado ao app. Nenhuma destas árvores é candidata a deploy.

## Resultados reproduzidos
- `node --check app.js` e `node --test tests/*.test.js tests/*.test.cjs` no diretório da árvore combinada: **78/78**. Atenção: `finance-concurrency-risk.test.cjs` passa porque reproduz perda de depósito: não comprova correção. Rodar os testes no diretório errado gera falhas artificiais por caminhos relativos.
- `python3 finance-postgres-lab.py`: **22 verificações** em PostgreSQL temporário via socket Unix sem TCP. Testa concorrência, idempotência, rollback, saldo parcial e sem desconto, estorno exatamente do valor debitado, e RLS com identidade simulada. Contém o SQL de confirmação anterior, não é integração nova.
- `python3 test-recurrence-postgres.py`: **9 verificações** em PostgreSQL temporário. Protótipo novo `recurrence-daily-LAB-ONLY.sql` serializa conclusão, insere sucessor único, usa operação idempotente e checa revisão de regra; respeita limite, não ressuscita ocorrência apagada e informa `next_state` quando esta existe. Testa concorrência, rejeição de revisão velha, isolamento simulado e rollback. Só cobre recorrência diária abstrata, não o esquema nem a interface real.

## Bloqueios críticos antes de qualquer implantação
1. SQL financeiro é um modelo paralelo, não migração nem solução no app; aceita valor e ID de conta fornecidos pelo cliente sem validar a fonte autoritativa, e suas tabelas não reconciliam o estado real. É necessário projetar migração auditável, conciliar saldos/dívidas, preservar ID de operação entre retries/perda de resposta e impedir todos os escritores legados antes de liberar os controles. Confirmar novamente desconto quando concorrência alterar o saldo; nunca retry silencioso.
2. Lançamentos gerais não devem alterar saldo. Há testes antigos com stubs em árvore combinada, não prova de integração. Não transformar lançamento de receita/despesa automaticamente em depósito/saque.
3. Protótipo de recorrência é apenas diária e não está ligado às tarefas reais. Faltam semanal/mensal/anual, edição, pausa, migração, consistência de outros escritores, integração com Google Tasks e testes completos de múltiplos dispositivos. Revisão da série só protege se **todos** os escritores de regra a incrementarem atomicamente. Operações de outras origens não são impedidas pelo protótipo.
4. Os testes não verificam JWT/PostgREST/Supabase real, RLS/migrações de produção, service workers antigos, offline, interface desktop/mobile ou integração ponta a ponta. Nunca inferir segurança do teste isolado.
