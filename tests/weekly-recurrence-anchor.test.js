const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const recurrence = src.slice(src.indexOf('  function normalizeRecurrence('), src.indexOf('  function normalizeTaskSubtasks('));
const dates = src.slice(src.indexOf('  function isDateKey('), src.indexOf('  function formatDate('));
const context = vm.createContext({});
vm.runInContext(`${recurrence}\n${dates}\n`, context);
context.todayKey = () => '2024-01-01';

test('weekly recurrence reaches a distant anchor and skips weekdays before the anchor', () => {
  const rule = { frequency: 'weekly', anchorDate: '2025-01-08', interval: 1, weekdays: [1, 3] };
  assert.equal(context.nextRecurrenceDate('2024-01-01', rule), '2025-01-08');
});

test('weekly recurrence respects interval from the anchor week', () => {
  const rule = { frequency: 'weekly', anchorDate: '2025-01-08', interval: 2, weekdays: [1] };
  assert.equal(context.nextRecurrenceDate('2024-01-01', rule), '2025-01-20');
});

test('weekly recurrence returns no occurrence when until precedes the anchor', () => {
  const rule = { frequency: 'weekly', anchorDate: '2025-01-08', interval: 1, weekdays: [3], until: '2025-01-07' };
  assert.equal(context.nextRecurrenceDate('2024-01-01', rule), null);
});

test('weekly recurrence after the anchor still picks the next matching weekday', () => {
  const rule = { frequency: 'weekly', anchorDate: '2024-01-01', interval: 1, weekdays: [1, 5] };
  assert.equal(context.nextRecurrenceDate('2024-01-31', rule), '2024-02-02');
});
