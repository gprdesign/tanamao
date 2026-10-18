# Tá na mão!

Planner semanal pessoal, minimalista, inspirado no Weeklo.

## O que fica

- Planner semanal em duas colunas: ATRASADO, SEG, TER, QUA, QUI, SEX, SÁB e DOM.
- Home “MINHA SEMANA” com Atrasado, Hoje, Amanhã e Próximos; atalhos clicáveis e tags no fim de cada linha.
- Planner semanal mostra todas as tarefas em cada dia; arraste entre dias e Planejar para mudar a data ou ordenar.
- Planejar e Concluídas abrem como painéis exclusivos na própria tela, em grades de 3×2 com botão MAIS.
- Atrasadas ficam vermelhas; ao virar a semana, também aparecem como links para a tarefa original em ATRASADO, com REAGENDAR.
- Filtros multitag para tarefas e notas; cada tarefa tem uma tag e notas aceitam várias. VIDA, TRABALHO e OUTRO vêm prontas.
- Modo glass preserva as cores do tema; abas e telas têm transições suaves. Interface ampliada para celular e tablet, com notas em três colunas nas telas web horizontais.
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
