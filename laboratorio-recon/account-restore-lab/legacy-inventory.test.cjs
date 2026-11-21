'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inventory}=require('./legacy-inventory.cjs');
test('known, sensitive and unknown app keys reported without ownership inference',()=>{const x=inventory(['tnm.weekly.tasks.v1','tnm.googleCalendar.access.v1','naMinhaMao.supabase.session.v1','tnm.weekly.autobackup.v1','other']);assert.deepEqual(x.available,['tnm.weekly.tasks.v1']);assert.equal(x.excluded.length,2);assert.deepEqual(x.unknown,['tnm.weekly.autobackup.v1']);assert(x.missing.includes('tnm.weekly.notes.v1'));assert.equal(x.owner,'UNVERIFIED');assert.equal(x.ready,false);});
test('duplicates and invalid key names fail closed',()=>{for(const keys of [['x','x'],[''],[null],null])assert.throws(()=>inventory(keys),/invalid/);});
