'use strict';
// SYNTHETIC LAB ONLY: separate database, not authentication and not wired to app.
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TnmMultiTabLab = factory();
})(globalThis, function() {
  const valid = x => typeof x === 'string' && x.length > 0 && x.length <= 200 && !/[\u0000-\u001f]/.test(x);
  class Stale extends Error { constructor() { super('Sessão ou revisão obsoleta'); this.name = 'Stale'; } }
  function open(idb, name) {
    if (!idb || !valid(name) || !name.startsWith('synthetic-')) return Promise.reject(Error('Somente banco sintético'));
    return new Promise((resolve,reject) => {
      let done=false; const req=idb.open(name,1);
      req.onupgradeneeded=()=>{ if(done){req.transaction.abort();return;} req.result.createObjectStore('fence'); req.result.createObjectStore('values',{keyPath:['owner','key']}); };
      req.onblocked=()=>{if(!done){done=true;reject(Error('Banco bloqueado'));}};
      req.onerror=()=>{if(!done){done=true;reject(req.error||Error('Abertura falhou'));}};
      req.onsuccess=()=>{if(done){req.result.close();return;}done=true;req.result.onversionchange=()=>req.result.close();resolve(req.result);};
    });
  }
  function controller(db) {
    let token=null, localEpoch=0, pending=Promise.resolve(); const active=new Set();
    function revoke() { token=null; localEpoch++; for(const tx of active) {try{tx.abort();}catch{}} }
    function transact(stores, mode, callback) {
      return new Promise((resolve,reject)=>{
        let tx, result, error;
        try { tx=db.transaction(stores,mode); active.add(tx); }
        catch(e) {reject(e);return;}
        const fail=e=>{error=e;try{tx.abort();}catch{}};
        tx.oncomplete=()=>{active.delete(tx);resolve(result);};
        tx.onabort=tx.onerror=()=>{active.delete(tx);reject(error||tx.error||Error('Transação cancelada'));};
        try {callback(tx, x=>{result=x;}, fail);}catch(e){fail(e);}
      });
    }
    function transition(owner) {
      revoke(); const epoch=localEpoch;
      if(owner!==null && !valid(owner)) return Promise.reject(Error('Conta inválida'));
      // Serialize local transitions, but never start a superseded pending transition.
      const op=pending.catch(()=>{}).then(async()=>{
        if(epoch!==localEpoch) throw new Stale();
        const t=await transact(['fence'],'readwrite',(tx,done,fail)=>{
          const store=tx.objectStore('fence'), req=store.get('session');
          req.onsuccess=()=>{const prev=req.result;
            if(prev && (!Number.isSafeInteger(prev.generation)||prev.generation<1||prev.generation===Number.MAX_SAFE_INTEGER)) return fail(Error('Geração inválida'));
            const next={generation:prev?prev.generation+1:1,owner}; store.put(next,'session'); done(next);
          };
        });
        if(epoch!==localEpoch) throw new Stale();
        token=owner===null?null:t; return t;
      });
      pending=op; return op;
    }
    function adopt(owner) {
      revoke(); const epoch=localEpoch;
      if(!valid(owner)) return Promise.reject(Error('Conta inválida'));
      return transact(['fence'],'readonly',(tx,done,fail)=>{
        const req=tx.objectStore('fence').get('session');
        req.onsuccess=()=>{const s=req.result; if(!s||s.owner!==owner||!Number.isSafeInteger(s.generation)||s.generation<1) return fail(new Stale()); done(s);};
      }).then(t=>{if(epoch!==localEpoch) throw new Stale(); token=t; return t;});
    }
    function run(key,expected,json,write) {
      if(!valid(key) || (write && (!Number.isSafeInteger(expected)||expected<0 || typeof json!=='string'))) return Promise.reject(Error('Entrada inválida'));
      if(write) {try{JSON.parse(json);}catch{return Promise.reject(Error('JSON inválido'));}}
      if(!token) return Promise.reject(new Stale());
      const captured=token, epoch=localEpoch;
      return transact(['fence','values'],write?'readwrite':'readonly',(tx,done,fail)=>{
        const r=tx.objectStore('fence').get('session');
        r.onsuccess=()=>{
          const current=r.result;
          if(!current||current.owner!==captured.owner||current.generation!==captured.generation) return fail(new Stale());
          const store=tx.objectStore('values'), get=store.get([captured.owner,key]);
          get.onsuccess=()=>{
            const row=get.result, revision=row?row.revision:0;
            if(row && (!Number.isSafeInteger(revision)||revision<1||typeof row.json!=='string')) return fail(Error('Registro inválido'));
            if(write){if(revision!==expected) return fail(new Stale()); if(revision===Number.MAX_SAFE_INTEGER)return fail(Error('Revisão esgotada')); store.put({owner:captured.owner,key,revision:revision+1,json}); done({revision:revision+1});}
            else done(row?{revision,json:row.json}:{revision:0,json:null});
          };
        };
      }).then(result=>{if(epoch!==localEpoch||token!==captured)throw new Stale();return result;});
    }
    return Object.freeze({transition,adopt,read:key=>run(key,0,null,false),compareAndSet:(key,revision,json)=>run(key,revision,json,true), revoke});
  }
  return Object.freeze({open,controller,Stale});
});
