
// Minimal IndexedDB helper
const DB_NAME = 'hidro_db';
const DB_VERSION = 1;
let dbPromise = null;

function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e)=>{
      const db = req.result;
      if(!db.objectStoreNames.contains('clients')){
        db.createObjectStore('clients', {keyPath:'id', autoIncrement:true});
      }
      if(!db.objectStoreNames.contains('locations')){
        const s = db.createObjectStore('locations', {keyPath:'id', autoIncrement:true});
        s.createIndex('clientId', 'clientId');
      }
      if(!db.objectStoreNames.contains('metals')){
        const s = db.createObjectStore('metals', {keyPath:'id', autoIncrement:true});
        s.createIndex('locationId', 'locationId');
        s.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode='readonly'){
  const db = await openDB();
  return db.transaction(store, mode).objectStore(store);
}

export async function add(store, value){
  const s = await tx(store, 'readwrite');
  return new Promise((resolve, reject)=>{
    const req = s.add(value);
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}

export async function getAll(store, indexName=null, query=null, direction='next'){
  const s = await tx(store);
  return new Promise((resolve, reject)=>{
    const out = [];
    let source = s;
    if(indexName){ source = s.index(indexName); }
    const req = source.openCursor(query, direction);
    req.onsuccess = ()=>{
      const c = req.result;
      if(c){ out.push(c.value); c.continue(); }
      else resolve(out);
    };
    req.onerror = ()=>reject(req.error);
  });
}

export async function clearAll(){
  const db = await openDB();
  return Promise.all(['clients','locations','metals'].map(name => {
    return new Promise((resolve, reject)=>{
      const req = db.transaction(name,'readwrite').objectStore(name).clear();
      req.onsuccess = ()=>resolve();
      req.onerror = ()=>reject(req.error);
    });
  }));
}
