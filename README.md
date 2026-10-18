# Tá na mão!

Planner semanal pessoal, minimalista, inspirado no Weeklo.

## O que fica

- Planner semanal em duas colunas: ATRASADO, SEG, TER, QUA, QUI, SEX, SÁB e DOM.
- Home e planner semanal em visão compacta, sem rolagem da página; as listas completas abrem em janelas por dia.
- Um filtro multitag para tarefas e notas. Cada tarefa tem uma tag; notas podem ter várias. VIDA, TRABALHO e OUTRO vêm prontas; novas tags recebem cor automática.
- Planejar guarda tarefas sem data; tarefas só entram em ATRASADO quando a semana seguinte começa. Ordenação manual, tarefas concluídas com hora e mosaico de notas.
- Login/sincronização privada, snapshot local automático a cada 5 minutos e exportação JSON de backup.
- Navegação inferior Home, Tarefas, Notas e Configs.

## Privacidade

Sem login, tarefas e notas ficam no armazenamento local do navegador. Com login, os dados sincronizam pela conta Supabase, protegidos por RLS. O app usa somente a chave publicável no navegador; nenhuma chave secreta deve entrar no repositório.

## Supabase

- `supabase/schema.sql`: schema inicial.
- `supabase/migration-execution-date.sql`: Dia de execução.
- `supabase/migration-weekly-planner.sql`: planner minimalista e proteção da versão nova.
- `supabase/migration-tags.sql`: tags por tarefa e tabela privada de tags.
- `supabase/migration-ui-v53.sql`: tags nas notas e ordenação manual.

## Abrir localmente

```text
python3 -m http.server 8000
```

Abra `http://localhost:8000`.
