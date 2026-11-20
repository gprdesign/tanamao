const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const section = src.slice(src.indexOf('  function isDateKey('), src.indexOf('  function dateKey('));
const searchDate = src.match(/  function globalSearchDate\(value\)\{[^\n]+\}/)?.[0];
assert.ok(section && searchDate, 'date functions must be present');
const format = vm.runInNewContext(`${section}\n${searchDate}\nglobalSearchDate`);
for (const zone of ['America/Sao_Paulo', 'UTC', 'Pacific/Kiritimati', 'America/Los_Angeles']) {
  test(`calendar dates stay unchanged in ${zone}`, () => {
    process.env.TZ = zone;
    assert.equal(format('2026-11-24'), '24/11/2026');
    assert.equal(format('2024-02-29'), '29/02/2024');
    assert.equal(format('2027-01-01'), '01/01/2027');
    assert.equal(format('2026-02-30'), '2026-02-30');
    assert.equal(format(''), '');
  });
}
test('timestamps remain local instants', () => {
  process.env.TZ = 'America/Sao_Paulo';
  assert.equal(format('2026-11-24T00:00:00Z'), '23/11/2026');
  assert.equal(format('2026-11-24T12:00:00Z'), '24/11/2026');
  assert.equal(format('not a date'), 'not a date');
});
