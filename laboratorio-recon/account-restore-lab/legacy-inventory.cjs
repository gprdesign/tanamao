'use strict';
// Synthetic only: accepts key names, never reads storage, values or credentials.
// This is an inventory, NOT an ownership check, backup or migration instruction.
const dataKeys=Object.freeze(['tnm.weekly.tasks.v1','tnm.weekly.notes.v1','tnm.weekly.logs.v1','tnm.weekly.finance.v1','tnm.weekly.financeState.v1','tnm.weekly.bankTransactions.v1','tnm.weekly.userSettings.v1','tnm.weekly.privateVault.v1','tnm.weekly.privateRows.v1','tnm.weekly.tags.v1','naMinhaMao.tasks.v1','naMinhaMao.notes.v1']);
const sensitive=new Set(['naMinhaMao.supabase.session.v1','tnm.googleCalendar.access.v1']);
const scope=k=>k.startsWith('tnm.')||k.startsWith('naMinhaMao.')||k.startsWith('naMinhaMao_');
function inventory(keys) {
 if(!Array.isArray(keys)||keys.some(k=>typeof k!=='string'||!k)||new Set(keys).size!==keys.length) throw Error('invalid or duplicate key');
 const available=[],unknown=[],excluded=[];
 for(const key of keys){if(sensitive.has(key)) excluded.push(key);else if(dataKeys.includes(key))available.push(key);else if(scope(key))unknown.push(key);}
 return {mode:'INVENTORY_ONLY_NOT_AUTHORIZED',available:available.sort(),unknown:unknown.sort(),excluded:excluded.sort(),missing:dataKeys.filter(k=>!keys.includes(k)).sort(),owner:'UNVERIFIED',ready:false};
}
module.exports={inventory};
