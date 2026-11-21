# Continuação CAS — LABORATÓRIO, NÃO PUBLICAR

Base `lab-cas-entidades-20261120-2131` (`090f55b`), descendente da main `712ea0a`; arquivos anteriores de tarefas/notas/logs permanecem experimentais. Este diretório não altera nem integra o aplicativo. SQL é intencionalmente bloqueado com exceção e não deve ser executado em Supabase ou dados reais.

## Progresso

1. `tag-cas-DRAFT.sql`: protótipo CAS para tags, considerando a chave `(owner_id,id)`, revisão monotônica, criação condicional e bloqueio/atualização por versão; deriva dono do JWT em vez de aceitar o campo de dono da entrada, restringe campos, preserva data de criação. Revoga INSERT/UPDATE/DELETE diretos de anon/authenticated/PUBLIC e para a transação se ainda houver privilégios herdados (incluindo por coluna). Exige coordenação de deploy, mudanças em todos os clientes e auditoria de privilégios/funções; não é migração pronta. Ainda não implementa recibos idempotentes, política de retenção, recuperação de resposta, exclusão física ou tratamento de relações financeiras.

2. `tag-cas-synthetic.py`: PostgreSQL 17 recém-inicializado em diretório temporário, somente socket local, sem TCP, sem credenciais nem banco remoto; usa `supabase/schema.sql` como esquema inicial sintético e identidades fictícias. `python3 laboratorio-recon/20261121-cas-seguro/tag-cas-synthetic.py` passou: bloqueio do draft, rollback com privilégio herdado por coluna, RLS de tags para duas contas, owner falsificado, escrita REST direta antiga negada, mesmo id para donos distintos, validação de campos, data de criação imutável, versão antiga e concorrência de duas sessões.

3. Controle negativo: uma função sintética antiga SECURITY DEFINER com EXECUTE por authenticated ainda modifica tabela após as revogações diretas; o teste demonstra o desvio dentro de transação revertida. Logo auditar/revogar todas funções e outros caminhos privilegiados é obrigatório; o teste NÃO prova que clientes antigos ou RPCs antigos estejam efetivamente bloqueados no ambiente real. Novo e velho cliente Supabase compartilham `authenticated`, logo concessão de RPC não identifica versão do cliente.

## Limites e bloqueios

Não há CAS de todas entidades, integração dos protótipos, replay idempotente para tags, migração segura de dados legados, RLS ou grants reais validados, bloqueio completo de clientes antigos, testes de PostgREST/Supabase real/browser, garantia para outras tabelas/triggers, transações financeiras multientidade, perda de resposta, inventário completo de escritores ou backup/restauração. RLS foi testada só em tags e no esquema de referência, não no catálogo real. Security definer pode burlar RLS; owner/superuser/BYPASSRLS também. O resultado RETURNING pode divergir após trigger AFTER; não foi testado. Adicionar coluna com default antes de inventário/backup e coordenação não demonstra migração segura. Não publicar nem declarar segurança resolvida.
