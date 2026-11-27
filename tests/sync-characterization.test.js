const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const espree = require('node:module').createRequire(require.resolve('eslint'))('espree');

// Caracterização do comportamento existente, usando somente dados fictícios.
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const ast = espree.parse(source, { ecmaVersion: 'latest', range: true });
const statements = ast.body[0].expression.callee.body.body;
function load(names, globals = {}) {
  const chunks = names.map(name => {
    const node = statements.find(item => item.type === 'FunctionDeclaration' && item.id.name === name);
    assert.ok(node, `Função ${name} não encontrada em app.js`);
    return source.slice(...node.range);
  });
  return vm.runInNewContext(`${chunks.join('\n')}\n({ ${names.join(', ')} })`, globals);
}
const plain = value => JSON.parse(JSON.stringify(value));

test('mergeById preserva registros diferentes e prioriza a versão mais recente', () => {
  const { mergeById } = load(['mergeById']);
  const local = [{ id: 'a', updatedAt: '2026-01-03T00:00:00Z', value: 'local' }];
  const remote = [{ id: 'a', updatedAt: '2026-01-02T00:00:00Z', value: 'remote' }, { id: 'b', updatedAt: '2026-01-01T00:00:00Z' }];
  assert.deepEqual(plain(mergeById(local, remote)), [local[0], remote[1]]);
  assert.deepEqual(plain(mergeById(remote, local)), [local[0], remote[1]]);
});

test('mergeById preserva exclusão mais recente e desempata a favor do local', () => {
  const { mergeById } = load(['mergeById']);
  const local = [{ id: 'a', updatedAt: '2026-01-03T00:00:00Z', deletedAt: '2026-01-03T00:00:00Z' }];
  const remote = [{ id: 'a', updatedAt: '2026-01-03T00:00:00Z', deletedAt: null }];
  assert.deepEqual(plain(mergeById(local, remote)), local);
  assert.deepEqual(plain(mergeById([], local)), local);
});

test('conversão financeira preserva proprietário, valores e exclusão', () => {
  const { financeToRow } = load(['financeToRow'], { session: { user: { id: 'owner-ficticio' } }, FINANCE_ENTRY_TAG_ID: 'entrada', FINANCE_EXIT_TAG_ID: 'saida' });
  const entry = { id: 'f1', title: 'Teste', kind: 'income', amount: 123.45, date: '2026-12-01', status: 'pending', createdAt: '2026-01-01', updatedAt: '2026-01-02', deletedAt: '2026-01-03' };
  const row = plain(financeToRow(entry));
  assert.equal(row.owner_id, 'owner-ficticio');
  assert.equal(row.amount, 123.45);
  assert.equal(row.movement_date, '2026-12-01');
  assert.equal(row.tag_id, 'entrada');
  assert.equal(row.deleted_at, '2026-01-03');
});

test('nota privada de outro proprietário não é enviada nem modificada', () => {
  const stored = [];
  const vault = { ownerId: 'outro-ficticio', salt: 's', verifierIv: 'i', verifierCiphertext: 'c' };
  const { privateVaultToRow } = load(['privateVaultToRow'], { session: { user: { id: 'owner-ficticio' } }, privateVault: vault, localStorage: { setItem: (...args) => stored.push(args) }, PRIVATE_VAULT_KEY: 'fake' });
  assert.equal(privateVaultToRow(), null);
  assert.deepEqual(stored, []);
  assert.equal(vault.ownerId, 'outro-ficticio');
});

test('caixinha não envia dados sem sessão ou data de atualização', async () => {
  const calls = [];
  const globals = { session: null, CLOUD_READY: true, financeState: { cashboxAmount: 100, cashboxUpdatedAt: '' }, cloudRequest: (...args) => calls.push(args), nowISO: () => '2026-01-01' };
  const { syncFinanceCashboxState } = load(['syncFinanceCashboxState'], globals);
  assert.equal(await syncFinanceCashboxState(), false);
  globals.session = { user: { id: 'owner-ficticio' } };
  assert.equal(await syncFinanceCashboxState(), false);
  assert.equal(calls.length, 0);
});

test('caixinha limita PATCH ao proprietário e usa POST apenas quando necessário', async () => {
  const calls = [];
  const globals = { session: { user: { id: 'owner-ficticio' } }, CLOUD_READY: true, financeState: { cashboxAmount: 100, cashboxUpdatedAt: '2026-01-02' }, nowISO: () => '2026-01-03', cloudRequest: async (...args) => { calls.push(args); return calls.length === 1 ? [] : null; } };
  const { syncFinanceCashboxState } = load(['syncFinanceCashboxState'], globals);
  assert.equal(await syncFinanceCashboxState(), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'nmm_finance_state?owner_id=eq.owner-ficticio');
  assert.equal(calls[0][1].method, 'PATCH');
  assert.equal(calls[1][1].method, 'POST');
  assert.equal(JSON.parse(calls[1][1].body).owner_id, 'owner-ficticio');
});

test('caixinha não tenta POST após falha do PATCH', async () => {
  const calls = [];
  const globals = { session: { user: { id: 'owner-ficticio' } }, CLOUD_READY: true, financeState: { cashboxAmount: 100, cashboxUpdatedAt: '2026-01-02' }, nowISO: () => '2026-01-03', cloudRequest: async (...args) => { calls.push(args); throw new Error('rede simulada'); } };
  const { syncFinanceCashboxState } = load(['syncFinanceCashboxState'], globals);
  await assert.rejects(syncFinanceCashboxState(), /rede simulada/);
  assert.equal(calls.length, 1);
});
