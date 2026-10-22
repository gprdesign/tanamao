# Tá na mão!

Planner semanal pessoal, minimalista, inspirado no Weeklo.

## O que fica

- Planner semanal em duas colunas: ATRASADO, SEG, TER, QUA, QUI, SEX, SÁB e DOM.
- Home “MINHA SEMANA” com Próximos eventos, atalhos, Atrasado e as listas Hoje/Amanhã lado a lado; tags abaixo dos títulos.
- Sincronização Google Calendar somente leitura: agendas selecionadas, próximos 30 dias, exibidos na Home e atualizados a cada 15 min enquanto a autorização estiver válida.
- Planner semanal mostra todas as tarefas em cada dia; arraste no mouse ou use o puxador de toque para reordenar e mudar a data.
- Planejar e Concluídas ficam lado a lado e abrem painéis exclusivos na própria tela, em grades de 3×2 com botão MAIS.
- Tarefas mantêm conteúdo, link, checklist de etapas e conclusão no armazenamento local e na sincronização.
- Atrasadas ficam vermelhas; ao virar a semana, também aparecem como links para a tarefa original em ATRASADO, com REAGENDAR.
- Filtros multitag para tarefas e notas; cada tarefa tem uma tag e notas aceitam várias. Tags podem ser criadas na janela de nota.
- Notas aceitam link e PIN; notas fixadas ficam no topo e seguem sincronizadas.
- Modo glass preserva as cores do tema; abas e telas têm transições suaves. Interface ampliada para celular e tablet, com notas em três colunas nas telas web horizontais.
- Log de eventos com tags e criptografia individual pelo mesmo cofre das notas privadas.
- Login/sincronização privada, snapshot local automático a cada 5 minutos e exportação JSON de backup.
- Finanças com entradas/saídas, previsão/realizado, recorrências, parcelas, saldo do Banco Jota, Caixinha de Contas e cálculo diário até a próxima entrada prevista.
- Navegação inferior Home, Tarefas, Notas e Configs.

## Privacidade

Sem login, tarefas e notas ficam no armazenamento local do navegador. Com login, os dados sincronizam pela conta Supabase, protegidos por RLS. O app usa somente a chave publicável no navegador; nenhuma chave secreta deve entrar no repositório.

## Supabase

- `supabase/schema.sql`: schema inicial.
- `supabase/migration-execution-date.sql`: Dia de execução.
- `supabase/migration-weekly-planner.sql`: planner minimalista e proteção da versão nova.
- `supabase/migration-tags.sql`: tags por tarefa e tabela privada de tags.
- `supabase/migration-ui-v53.sql`: tags nas notas e ordenação manual.
- `supabase/migration-ui-v55.sql`: links e notas fixadas; aditiva, sem regravar registros existentes.
- `supabase/migration-logs-tags-lock.sql`: tags e criptografia individual para registros do Log.
- `supabase/migration-finance-ledger.sql`: lançamentos financeiros e recorrências.
- `supabase/migration-finance-daily-budget.sql`: tags automáticas ENTRADA/SAÍDA e saldo/Caixinha sincronizados.

## Abrir localmente

```text
python3 -m http.server 8000
```

Abra `http://localhost:8000`.
