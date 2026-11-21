# Experimento de prévia de restauração — NÃO PUBLICAR

Este diretório é um módulo Node independente, não integrado ao aplicativo nem ao Supabase. Não executa restauração, importação, migração, backup ou escritas. Não trabalha com dados reais. O parâmetro `owner` e as etiquetas de proprietário são apenas dados do chamador: NÃO provam autenticação, posse do backup ou autorização. Todos os cenários são fictícios.

## Reconstrução e base

Na branch `correcoes-laboratorio-20261120`, referência verificada em `1f62de090599bc095fc53860f4dbb37f5add22e5`, concatenar em ordem numérica as 14 partes de `laboratorio-recon/20261120-2055/experimentos.tar.gz.b64.partN` e decodificar base64. O arquivo binário tem SHA-256 `7f4664dd9a07b1724e09d6124c8f6014d81a2916bf7f65da47e3b1e00ff7f035`. O `integrado-final.patch` dentro dele tem SHA-256 `aa77c473c8e0da159596490c2713c6da2c5fac2dbfe420c035a3af732d331137`; aplicar somente em cópia isolada da base `e8ac3b73f52768ddc9048bd1abf64f00510939c0`, depois de `git apply --check`. Esse patch já contém o trabalho `isolation-next`; NÃO aplicar de novo. Não aplicar ao main nem à branch corrente sem integração cuidadosa.

Este diretório é um incremento independente, não contido nesse arquivo. Para reproduzir os testes completos, copie este diretório para a árvore reconstruída; execute `node --test laboratorio-recon/account-restore-lab/restore-plan.test.cjs tests/*.test.js tests/*.test.cjs`. No teste em 20/11/2026, 90/90 passaram; destes, 13 são novos e 77 da base. Um teste da base passa por reproduzir perda financeira, não por corrigi-la. PostgreSQL não foi executado nesta rodada.

## O que a prévia faz

1. Exige formato experimental explícito e coleções completas, identificadores não duplicados, dados JSON válidos e marcações de proprietário consistentes, rejeitando campos desconhecidos. Tokens não fazem parte do formato. Isso NÃO identifica nem autentica usuários.

2. Produz hashes SHA-256 dos snapshots de entrada e inventário com decisões ou conflitos, sem incluir o conteúdo dos registros na resposta. Distingue conta suposta, categorias e IDs; requer escolha explícita para dados apenas na origem e divergências, inclusive tombstones e dados financeiros. Itens existentes somente no destino são preservados. Isso não produz plano executável e não garante consistência das relações entre registros.

3. Não altera objetos, arquivos ou storage. `ready` é sempre false, mesmo sem conflitos. Os hashes detectam mudanças apenas se comparados e verificados pelo consumidor, não garantem backup externo, procedência nem estado atual do servidor.

## Bloqueios para liberação

1. Isolamento de contas não existe ainda; localStorage é compartilhado por origem/perfil. Freio por Web Locks e eventos é apenas experimental, não garante confidencialidade ou atomicidade contra clientes antigos. Clientes antigos, outras abas, outros dispositivos, requisições em voo e acesso direto à API podem contornar proteção do frontend. Não remover o freio de sincronização do laboratório.

2. Falta autenticação forte de propriedade dos dados e autoria dos backups, snapshot consistente com todas as entidades e cópia externa verificável, confirmação humana real, transação/CAS, idempotência, tratamento de concorrência, tombstones, relacionamentos e restauração com rollback recuperável. Em particular financeState, financeEntries e bankTransactions não podem ser restaurados separadamente como uma operação segura.

3. Falta travar escritores antigos no backend via RLS/grants e endpoints versionados, auditar clientes (incluindo Banco Jota), e testar isolamento real multi-conta/multi-aba, desconexão, quota, rede, PostgreSQL descartável, navegador PC e celular. SQL experimental é somente laboratório: nunca executar na produção.

4. Esta prévia usa Node crypto e um formato artificial, não aceita diretamente os backups reais v7–v9. Não há migração ou restauração funcional nem deploy autorizado. Não publicável.
