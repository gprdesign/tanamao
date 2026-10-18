# TA NA MÃO

PWA pessoal, minimalista, inspirado no Weeklo.

## O que fica

- Planner semanal em duas colunas: ATRASADO, SEG, TER, QUA, QUI, SEX, SÁB e DOM.
- Um único planner, filtrável por tags: VIDA, TRABALHO e OUTRO vêm prontas; novas tags recebem cor automática.
- Cada tarefa tem uma tag. Tarefa sem data fica em Planejar; arrastar para um dia ou escolher uma data define o Dia de execução. Data anterior a hoje aparece em ATRASADO.
- Conclusão simples de tarefas, notas, login/sincronização privada e exportação JSON de backup.
- Navegação inferior Home, Tarefas, Notas e Configs.

## Privacidade

Sem login, tarefas e notas ficam no armazenamento local do navegador. Com login, os dados sincronizam pela conta Supabase, protegidos por RLS. O app usa somente a chave publicável no navegador; nenhuma chave secreta deve entrar no repositório.

## Supabase

- `supabase/schema.sql`: schema inicial.
- `supabase/migration-execution-date.sql`: Dia de execução.
- `supabase/migration-weekly-planner.sql`: planner minimalista e proteção da versão nova.
- `supabase/migration-tags.sql`: tags por tarefa e tabela privada de tags.

## Abrir localmente

```text
python3 -m http.server 8000
```

Abra `http://localhost:8000`.
