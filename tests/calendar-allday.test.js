const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const helpers = src.slice(src.indexOf('  function isDateKey('), src.indexOf('  function todayKey('));
const allDay = src.slice(src.indexOf('  function allDayEventIncludesDate('), src.indexOf('  function calendarEventTimeLabel('));
const normalize = src.slice(src.indexOf('  function normalizeCalendarEvent('), src.indexOf('  function calendarEventIsPast('));
const countdown = src.slice(src.indexOf('  function dashboardCountdownLabel('), src.indexOf('  function dashboardEventDateTime('));
const context = vm.createContext({ normalizeLink: () => '', calendarEventIsDismissed: e => e.id === 'dismissed', calendarEventOrder: () => 0, calendarEvents: [] });
vm.runInContext(`${helpers}\n${allDay}\n${normalize}\n${countdown}`, context);
for (const zone of ['America/Sao_Paulo', 'UTC', 'Pacific/Kiritimati', 'America/Los_Angeles']) {
  test(`all-day range is start-inclusive and end-exclusive in ${zone}`, () => {
    process.env.TZ = zone;
    const event = {startAt:'2026-12-31',endAt:'2027-01-03'};
    assert.equal(context.allDayEventIncludesDate(event, '2026-12-30'), false);
    assert.equal(context.allDayEventIncludesDate(event, '2026-12-31'), true);
    assert.equal(context.allDayEventIncludesDate(event, '2027-01-01'), true);
    assert.equal(context.allDayEventIncludesDate(event, '2027-01-02'), true);
    assert.equal(context.allDayEventIncludesDate(event, '2027-01-03'), false);
    assert.equal(context.allDayEventIncludesDate({startAt:'2026-11-24'}, '2026-11-24'), true);
    assert.equal(context.allDayEventIncludesDate({startAt:'2026-11-24',endAt:'2026-11-24'}, '2026-11-25'), false);
    assert.equal(context.allDayEventIncludesDate({startAt:'2026-02-30'}, '2026-02-30'), false);
  });
}
test('day list includes a continuing all-day event, excludes dismissed events and handles timed local dates', () => {
  process.env.TZ = 'America/Sao_Paulo';
  context.calendarEvents = [
    {id:'multi',summary:'Viagem',start:{date:'2026-11-23'},end:{date:'2026-11-26'}},
    {id:'dismissed',summary:'Oculto',start:{date:'2026-11-23'},end:{date:'2026-11-26'}},
    {id:'timed',summary:'Reunião',start:{dateTime:'2026-11-25T01:00:00Z'}},
  ];
  assert.deepEqual(Array.from(context.getCalendarEventsForDate('2026-11-24'), e => e.id), ['multi','timed']);
  assert.deepEqual(Array.from(context.getCalendarEventsForDate('2026-11-25'), e => e.id), ['multi']);
  assert.equal(context.getCalendarEventsForDate('2026-11-26').length, 0);
});
test('ongoing all-day event is marked HOJE based on supplied clock', () => {
  process.env.TZ = 'America/Sao_Paulo';
  const e={allDay:true,startAt:'2026-11-23',endAt:'2026-11-26'};
  assert.equal(context.dashboardCountdownLabel(e, new Date('2026-11-24T15:00:00-03:00').getTime()), 'HOJE');
});
