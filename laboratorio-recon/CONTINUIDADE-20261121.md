# Continuidade 21/11: LABORATÓRIO, NÃO PUBLICAR

A main avançou para 712ea0a; não aplicar patches antigos sobre ela sem reconciliar e testar. Sem alterações em dados reais ou Supabase nesta etapa.

## Trabalhos preservados

1. lab-isolamento-novo-20261121, commit 67fb60c67cbf6a0f1e54d9ba05dbf74663b94c0b: prévia experimental de restauração e validações relacionais. README de reconstrução do patch e instruções na branch. Testes reproduzidos: 28 testes Node do laboratório, 5 testes básicos e demonstração local de fence em PostgreSQL descartável. Restauração efetiva segue desativada; prévia não autoriza restore.

2. lab-cas-seguro-20261121, commit 472ef494857f98b5d3782358c85af34d134bc7f4: CAS experimental de etiquetas com owner via sessão, RLS e testes adversariais em PostgreSQL descartável. Reproduzido: teste passou. Teste negativo demonstra que RPC legada SECURITY DEFINER pode contornar REVOKE de escrita direta; inventariar e proteger TODOS os caminhos de escrita. Outras entidades e migração ainda não concluídas.

3. lab-finance-continuacao-20261121, commit 3090a9d0bf739cdf7e4a56babf89170055b9e72f: testes locais descartáveis de finanças transacionais (22 cenários), pagamento que consulta catálogo fictício (10) e recorrência diária (10). Reexecutados e passaram. Simulação de perda de resposta, não falha real de rede. Não integra o app, não cobre todas as operações ou recorrências, nem é migração para produção.

## Para continuar

Desenvolver e integrar, sem perda de dados, isolamento multi-conta e multi-aba; inventário e bloqueio atômico de clientes e funções antigas; migração de legados; CAS de todas entidades; restauração segura com recuperação; transações financeiras e idempotência de ponta a ponta; recorrência completa. Conciliar com 712ea0a. Utilizar apenas dados fictícios e PostgreSQL descartável. Adicionar testes de conflito, migração, quota, offline, atualização durante operação, retentativa com chave durável, RLS e RPC antigas; integrar em app e validar navegador desktop e celular. Nenhum protótipo acima está pronto para publicar. Só liberar quando todos riscos de perda estiverem resolvidos e os testes completos passarem; validar Pages e arquivos/layouts após deploy.