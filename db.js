
const DB_NAME='hidro_db'; const DB_VERSION=1; let dbPromise=null;
function openDB(){ if(dbPromise) return dbPromise; dbPromise=new Promise((resolve,reject)=>{ const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{ const db=req.result;
    if(!db.objectStoreNames.contains('clients')) db.createObjectStore('clients',{keyPath:'id',autoIncrement:true});
    if(!db.objectStoreNames.contains('locations')){ const s=db.createObjectStore('locations',{keyPath:'id',autoIncrement:true}); s.createIndex('clientId','clientId'); }
    if(!db.objectStoreNames.contains('metals')){ const s=db.createObjectStore('metals',{keyPath:'id',autoIncrement:true}); s.createIndex('locationId','locationId'); s.createIndex('createdAt','createdAt'); }
  };
  req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); return dbPromise; }
async function tx(store,mode='readonly'){ const db=await openDB(); return db.transaction(store,mode).objectStore(store); }
export async function add(store,value){ const s=await tx(store,'readwrite'); return new Promise((res,rej)=>{ const r=s.add(value); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
export async function getAll(store,indexName=null,query=null,dir='next'){ const s=await tx(store); return new Promise((res,rej)=>{ const out=[]; let src=s; if(indexName) src=s.index(indexName); const r=src.openCursor(query,dir); r.onsuccess=()=>{ const c=r.result; if(c){ out.push(c.value); c.continue(); } else res(out); }; r.onerror=()=>rej(r.error); }); }
export async function clearAll(){ const db=await openDB(); return Promise.all(['clients','locations','metals'].map(n=> new Promise((res,rej)=>{ const r=db.transaction(n,'readwrite').objectStore(n).clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);}))); }

export async function del(store, key){ const s=await tx(store,'readwrite'); return new Promise((res,rej)=>{ const r=s.delete(key); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }
