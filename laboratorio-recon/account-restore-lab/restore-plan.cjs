'use strict';
// LAB ONLY — pure preview. NEVER use to write/import production data.
// The caller must obtain and verify identity, ownership and an externally durable backup independently.
const crypto = require('node:crypto');
const groups = Object.freeze({tasks:'id',notes:'id',logs:'id',financeEntries:'id',bankTransactions:'transactionKey',privateNotesEncrypted:'id',tags:'id'});
const singletons = Object.freeze(['financeState','privateVault','userSettings']);
const bad = new Set(['__proto__','prototype','constructor']);
function json(value) {
  if(value===null || typeof value==='string' || typeof value==='boolean') return JSON.stringify(value);
  if(typeof value==='number' && Number.isFinite(value)) return JSON.stringify(value);
  if(Array.isArray(value)) { for(let i=0;i<value.length;i++) if(!Object.hasOwn(value,i)) throw Error('sparse array'); return '['+value.map(json).join(',')+']'; }
  if(value && Object.getPrototypeOf(value)===Object.prototype) return '{'+Object.keys(value).sort().map(k=>{if(bad.has(k))throw Error('unsafe property');return JSON.stringify(k)+':'+json(value[k]);}).join(',')+'}';
  throw Error('non-JSON value');
}
const copy = value => JSON.parse(json(value));
const hash = value => crypto.createHash('sha256').update(json(value),'utf8').digest('hex');
function index(array,key,where){
  if(!Array.isArray(array)) throw Error('missing or invalid collection: '+where);
  const m=new Map();
  for(const row of array){if(!row||typeof row!=='object'||Array.isArray(row)||typeof row[key]!=='string'||!row[key].trim()||bad.has(row[key])||m.has(row[key])) throw Error('invalid or duplicate ID: '+where);m.set(row[key],copy(row));}
  return m;
}
function validate(snapshot,label,owner){
  if(!snapshot || snapshot.format!=='tnm-lab-snapshot-v1' || snapshot.owner!==owner || !snapshot.data || Object.getPrototypeOf(snapshot.data)!==Object.prototype) throw Error('invalid snapshot or owner mismatch: '+label);
  const allowed=[...Object.keys(groups),...singletons];
  if(Object.keys(snapshot.data).some(k=>!allowed.includes(k))) throw Error('unknown field: '+label);
  const maps={};
  const checkOwner = item => {if(item && typeof item==='object') for(const k of ['owner_id','ownerId']) if(Object.hasOwn(item,k) && item[k]!==owner) throw Error('record owner mismatch: '+label);};
  for(const [group,key] of Object.entries(groups)) { maps[group]=index(snapshot.data[group],key,label+'.'+group); for(const item of maps[group].values()) checkOwner(item); }
  for(const name of singletons) { if(!Object.hasOwn(snapshot.data,name) || (snapshot.data[name]!==null && (typeof snapshot.data[name]!=='object'||Array.isArray(snapshot.data[name])))) throw Error('missing or invalid singleton: '+name); checkOwner(snapshot.data[name]); }
  json(snapshot);
  return maps;
}
function preview({owner,source,target,choices={}}){
  if(typeof owner!=='string'||!owner.trim()) throw Error('owner required');
  if(!choices||Object.getPrototypeOf(choices)!==Object.prototype) throw Error('invalid choices');
  const s=validate(source,'source',owner),t=validate(target,'target',owner);
  const sourceHash=hash(source),targetHash=hash(target),items=[],unresolved=[];
  const allowedChoices=new Set();
  const add=(kind,id,sv,tv,sourcePresent,targetPresent)=>{
    const token=JSON.stringify([kind,id]);
    if(!sourcePresent){items.push({kind,id,decision:'keep-target'});return;}
    if(!targetPresent){allowedChoices.add(token);const decision=Object.hasOwn(choices,token)?choices[token]:null;if(decision==='keep-target'||decision==='use-source')items.push({kind,id,decision});else unresolved.push({kind,id,reason:'source-only'});return;}
    if(json(sv)===json(tv)){items.push({kind,id,decision:'equal'});return;}
    allowedChoices.add(token);
    // An explicit selection is a preview, not an authorization to overwrite.
    const decision=Object.hasOwn(choices,token)?choices[token]:null;
    if(decision!=='keep-target' && decision!=='use-source') unresolved.push({kind,id,reason:'conflict'});
    else items.push({kind,id,decision});
  };
  for(const group of Object.keys(groups)) for(const id of new Set([...s[group].keys(),...t[group].keys()])) add(group,id,s[group].get(id),t[group].get(id),s[group].has(id),t[group].has(id));
  for(const name of singletons) add(name,'singleton',source.data[name],target.data[name],true,true);
  if(Object.keys(choices).some(k=>!allowedChoices.has(k) || !['keep-target','use-source'].includes(choices[k]))) throw Error('unknown or invalid choice');
  return {mode:'PREVIEW_ONLY_NOT_AUTHORIZED',owner,sourceHash,targetHash,items,unresolved,ready:false};
}
module.exports={preview,hash};
