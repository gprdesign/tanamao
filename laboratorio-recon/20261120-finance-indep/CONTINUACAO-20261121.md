# Continuação — EXPERIMENTO, NÃO PUBLICAR

Base da branch `correcoes-laboratorio-20261120`: `13be6b3d4d162bd8cf02336dca02f13b441b83e7`. Pesquisa anterior: `lab-finance-recur-indep-20261120-2131` em `8e82495`. A main observada estava em `712ea0a69c49297e676a3f0b0a25843022169579`; não foi modificada nem usada como base de aplicação deste experimento.

## Novidade

`finance-authoritative-LAB-ONLY.sql` acrescenta a modelo isolado catálogo de contas, versão, bloqueio de linha, valor obtido do catálogo, confirmação do débito efetivo, e registro de operação verificada. Uma repetição da mesma chave e mesmo payload retorna o resultado anterior mesmo após edição da conta; alterar payload é erro. O experimento revoga a chamada direta da função financeira antiga apenas no schema fictício. Também inclui teste de resposta descartada após alteração da série na recorrência diária experimental.

Execute somente em PostgreSQL descartável com dados e autenticação fictícios:

1. `python3 laboratorio-recon/20261120-finance-indep/finance-postgres-lab.py` — 22 verificações.
2. `python3 laboratorio-recon/20261120-finance-indep/test-authoritative-postgres.py` — 10 verificações, incluindo 12 repetições concorrentes, alteração concorrente que obriga reconfirmação e rollback em falha final.
3. `python3 laboratorio-recon/20261120-finance-indep/test-recurrence-postgres.py` — 10 verificações.

Perda de resposta simulada descartando resultado retornado e repetindo com a mesma chave, não desligando rede nem testando PostgREST. Os scripts inicializam um cluster temporário, usam somente socket Unix, RLS e `auth.uid()` simulados. Não comprovam Supabase, autenticação real, navegador nem offline.

## Integração futura — NÃO aplicar este SQL como migração

1. Comparar primeiro o estado e todas as alterações presentes na main `712ea0a` e posteriores. O patch de pesquisa é separado, baseado no laboratório e não é aplicável diretamente na main.
2. Desenhar migração de dados reais com revisão, cópia, conciliação de dívidas/saldos, política de rollback e aprovação humana. O catálogo fictício não está conectado aos dados reais e não possui writer de edição ou controle completo do ciclo de vida. Definir uma ordem de locks única e exigir incremento atômico da revisão em **todos** os escritores. Fechar todos os caminhos legados, clientes antigos e RPCs concorrentes antes de habilitar escrita. Garantir unicidade da chave entre todos os caminhos de operação.
3. Projetar mecanismo durável do lado cliente por usuário para armazenar chave e payload antes do envio; recuperar após reload, falha ou perda de resposta, repetindo exatamente o mesmo pedido, sem retry silencioso com valor modificado. Confirmar débitos novamente quando saldo/versão mudarem. O modelo responde com o resultado original, que pode estar desatualizado, então atualizar o estado atual em leitura separada sem repetir a operação.
4. Adaptar pagamento, pagamento sem desconto, reabertura, depósitos e saques ao esquema autoritativo do app, com atomicidade, autorização, conferência da origem de conta/valor, auditoria e estorno do valor realmente debitado. O wrapper novo só cobre pagamento com débito; revogar a função antiga isoladamente também deixaria indisponíveis os demais comandos. Lançamentos gerais não devem modificar saldos.
5. Projetar recorrência real com diário/semanal/mensal/anual, versões, fuso, edição, pausa, exclusão, migração, isolamento e Google Tasks. O protótipo só modela diário, sem app, e protege revisão apenas se todos os escritores colaborarem.
6. Antes de qualquer publicação, testar migração, múltiplos clientes, rede e perda real de resposta, PostgREST/JWT/RLS, dados sintéticos, service worker antigo, offline e interface desktop/celular; revisar riscos e obter validação independente. Não houve deploy, acesso ao Supabase real nem a dados reais.
