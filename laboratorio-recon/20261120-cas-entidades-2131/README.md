# Laboratório CAS — INCOMPLETO, NÃO PUBLICAR

Trabalho isolado para pesquisa com dados sintéticos. Nenhum banco Supabase, conta, dado real, deploy ou branch compartilhada alterado. Estes quatro arquivos estão nesta pasta de laboratório, não no app de produção. SQL tem hard stop deliberado. Scripts removem o hard stop exclusivamente em memória, em um cluster PostgreSQL novo e descartável sem TCP.

## Conteúdo e limitações importantes

1. `migration-note-log-cas-DRAFT.sql`: CAS de notas/logs no backend experimental, revisão monotônica, lock de linha, dono derivado de auth.uid(), conflito sem vazamento, escrita por lista explícita, coluna de criação imutável, campos faltantes/extras rejeitados, retorno da linha persistida. Testa recusa de grant herdado e remove escrita direta de anon/authenticated. NÃO integrado ao app. Não implementa replay idempotente em notas/logs; resposta perdida requer leitura e reconciliação. A alteração exclui escritores antigos, não migra dados legados e não comprova catálogo/grants/funções indiretas reais.

2. `migration-task-cas-idempotent-DRAFT.sql`: wrapper de operação idempotente no CAS de tarefas do experimento de segurança. Registro e alteração são atômicos. Retentativa de mesma operação e payload devolve resultado histórico; payload diferente é recusado. IDs por conta. O resultado histórico não prova estado atual: cliente deve reler e reconciliar; não deve atualizar baseline cegamente. O app não chama esse wrapper; o draft revoga RPC antiga de authenticated e, portanto, é incompatível com app atual até integração coordenada. O armazenamento duplica payload/resposta privados, sem expiração, e precisa de política de retenção, limites, proteção, controle de acesso, backups e auditoria antes de sequer considerar uso. Não cobre operações com efeitos em múltiplas tabelas nem garante semântica financeira.

3. `tests/note-log-cas-disposable-pg.py`, `tests/task-cas-once-disposable-pg.py`: testes PostgreSQL sintéticos. Arquivos precisam ser colocados na árvore reconstruída conforme abaixo.

4. Recuperada e verificada a correção anterior de timestamp de tarefas do commit `de90e6d`: comparação tipada por instante para timestamps designados, com precisão submilissegundo, sem tratar textos, datas simples e JSON arbitrário como instantes; não é CAS genérico para outras entidades. Não foi desenvolvida neste trabalho. `tests/task-cas-disposable-pg.py` imprime KNOWN FALSE CONFLICT pela comparação textual no teste antigo; o teste de timestamp integrado do Node valida a solução específica.

## Reconstrução e testes (somente laboratório local)

Requer git, Python 3, Node 20, PostgreSQL 17 instalado em `/usr/lib/postgresql/17/bin` ou variável `PG_BIN` e usuário não root. Executar no diretório vazio, sem credenciais e sem conexão externa com banco:

```bash
git clone https://github.com/gprdesign/tanamao.git cas-src
cd cas-src
git checkout lab-cas-entidades-20261120-2131
mkdir -p /tmp/tnm-cas-rebuild
python3 - <<'PY'
from pathlib import Path
import base64, gzip, hashlib, io, tarfile
out=Path('/tmp/tnm-cas-rebuild')
p=Path('laboratorio-recon/20261120-avanco')
a=b''.join((p/f'integrado.patch.gz.b64.part{i}').read_bytes() for i in range(1,7))
b=gzip.decompress(base64.b64decode(a)); assert hashlib.sha256(b).hexdigest()=='ef49c7c34692ce5502ee5eeb98a8c69481b234290322056360bc57f751946d83'; (out/'avanco.patch').write_bytes(b)
p=Path('laboratorio-recon/20261120-2055')
a=b''.join((p/f'experimentos.tar.gz.b64.part{i}').read_bytes() for i in range(1,15)); b=base64.b64decode(a)
assert hashlib.sha256(b).hexdigest()=='7f4664dd9a07b1724e09d6124c8f6014d81a2916bf7f65da47e3b1e00ff7f035'
with tarfile.open(fileobj=io.BytesIO(b),mode='r:gz') as t:
    safety=t.extractfile('safety-cas-incremental.patch').read()
assert hashlib.sha256(safety).hexdigest()=='ef2ced4c38ef8705c2625ceca48df78efefcc560cc6bae768db0d5f23a284e34'; (out/'safety.patch').write_bytes(safety)
b=gzip.decompress(base64.b64decode(Path('laboratorio-recon/20261120-cas-timestamps-task/timestamps-task-incremental.patch.gz.b64').read_bytes()))
assert hashlib.sha256(b).hexdigest()=='f1358dcddd431831beef4efb851dfe44bc633d8a5c63ae0ce3bfba261b3158a3'; (out/'timestamps.patch').write_bytes(b)
PY
git worktree add /tmp/tnm-cas-rebuild/work e8ac3b73f52768ddc9048bd1abf64f00510939c0
LAB="$PWD/laboratorio-recon/20261120-cas-entidades-2131"
cd /tmp/tnm-cas-rebuild/work
git apply /tmp/tnm-cas-rebuild/avanco.patch
git apply /tmp/tnm-cas-rebuild/safety.patch
git apply /tmp/tnm-cas-rebuild/timestamps.patch
cp "$LAB/migration-note-log-cas-DRAFT.sql" "$LAB/migration-task-cas-idempotent-DRAFT.sql" supabase/
cp "$LAB/note-log-cas-disposable-pg.py" "$LAB/task-cas-once-disposable-pg.py" tests/
node --check app.js && node --check task-sync.js
node --test tests/*.test.js tests/*.test.cjs
python3 tests/task-cas-disposable-pg.py
python3 tests/note-log-cas-disposable-pg.py
python3 tests/task-cas-once-disposable-pg.py
```

Resultados: 61/61 Node, três scripts PostgreSQL 17 aprovados em clusters artificiais sem TCP. Corridas com processos independentes testadas para operações de nota/log, tarefas e idempotência de tarefas; rollback, conflitos de dono, inputs inválidos e grants sintéticos testados. Vários testes Node são de mocks e há teste que reproduz risco financeiro; não provam segurança geral.

## O que falta — CRÍTICO

CAS das demais entidades e integração completa dos protótipos ao aplicativo, bases por conta e coordenação entre abas, migração legada, isolamento e escrita antiga, proteção de grants efetivos (inclusive funções indiretas/roles/triggers reais), snapshot consistente sem offset/cutoff perigoso, perda de resposta e resolução de conflito. App ainda faz upserts diretos em tags, notas, logs, finanças, transações, settings e cofre; também PATCH do banco e estado financeiro e dashboard financeiro separado. Tarefas usam RPC diferente do wrapper. `RETURNING` não garante ausência de modificação posterior por trigger AFTER nem confirma campos não modelados. Finanças exigem integração transacional e idempotente, não só CAS; restauração, recorrência e compatibilidade com branch financeiro de outro agente também não foram integradas aqui. Sem teste integrado PostgREST/Supabase/browser, sem dados reais. NÃO EXECUTAR SQL EM PRODUÇÃO, NÃO DEPLOYAR.
