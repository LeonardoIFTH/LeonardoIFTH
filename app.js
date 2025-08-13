
import * as DB from './db.js';
const $=(s,c=document)=>c.querySelector(s); const $$=(s,c=document)=>Array.from(c.querySelectorAll(s));
// ----- Device isolation -----
function getOrCreateDeviceId(){
  try{
    let id = localStorage.getItem('ifth_device_id');
    if(!id){
      id = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      );
      localStorage.setItem('ifth_device_id', id);
    }
    return id;
  }catch{ return 'device-fallback'; }
}
const DEVICE_ID = getOrCreateDeviceId();

const PLACES=['banheiro feminino','banheiro masculino','lavabo masculino','lavabo feminino','banheiro manutenção','lavabo manutenção','pne','dml','vestiário','copa','restaurante','outro'];
const METAL_TYPES=['torneira','bacia sanitária','ducha higiênica','mictório','chuveiro','bebedouro','filtro de água','lava louças','lava roupas','forno auto limpante','cafeteira','maquina grande de venda de café','outro'];

let currentClientId=null; let currentLocationId=null;
try{ const saved=JSON.parse(localStorage.getItem('hidro_state')||'{}'); currentClientId=saved.clientId||null; currentLocationId=saved.locationId||null; }catch{}
function saveState(){ localStorage.setItem('hidro_state', JSON.stringify({clientId: currentClientId, locationId: currentLocationId})); }

function fileToDataURL(file){ return new Promise((resolve,reject)=>{ if(!file) return resolve(null); const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=()=>reject(r.error); r.readAsDataURL(file); }); }

let timerInt=null; let timerStart=0; let elapsedMs=0;
function updateTimeface(){ const s=Math.floor(elapsedMs/1000); const mm=String(Math.floor(s/60)).padStart(2,'0'); const ss=String(s%60).padStart(2,'0'); const tf=$('#timeface'); if(tf){ tf.childNodes[0].nodeValue = `${mm}:${ss}`; tf.style.setProperty('--progress', ((s%60)/60*100).toFixed(1)); } $('#timeSeconds').value=s; }
function startTimer(){ if(timerInt) return; timerStart=performance.now()-elapsedMs; timerInt=setInterval(()=>{ elapsedMs=performance.now()-timerStart; updateTimeface(); },200); const tf=$('#timeface'); if(tf) tf.classList.add('running'); }
function stopTimer(){ if(!timerInt) return; clearInterval(timerInt); timerInt=null; elapsedMs=performance.now()-timerStart; updateTimeface(); const tf=$('#timeface'); if(tf) tf.classList.remove('running'); }
function resetTimer(){ clearInterval(timerInt); timerInt=null; elapsedMs=0; timerStart=0; updateTimeface(); const tf=$('#timeface'); if(tf) tf.classList.remove('running'); }

function show(id){ $$('.page').forEach(p=>p.hidden=true); $('#'+id).hidden=false; $$('.nav a').forEach(a=>a.classList.toggle('active', a.getAttribute('href')==='#'+id));
  if(id==='metal'){ const mv=$('#measuredAtView'); if(mv) mv.value=new Date().toLocaleString(); }
  if(id==='view') renderTable();
}

async function init(){
  $$('.nav a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault(); show(a.getAttribute('href').slice(1));}));

  // Client
  $('#clientForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name=$('#clientName').value.trim(); const proj=$('#projectNumber').value.trim();
    if(!name){ alert('Informe o nome do cliente'); return; }
    currentClientId=await DB.add('clients', { deviceId: DEVICE_ID, name, projectNumber: proj, createdAt: Date.now()});
    saveState(); $('#clientForm').reset(); show('location');
  });

  // Location
  const placeSel=$('#place'); PLACES.forEach(p=>{ const o=document.createElement('option'); o.value=p; o.textContent=p; placeSel.appendChild(o); });
  placeSel.addEventListener('change', ()=> $('#placeOtherWrap').hidden = placeSel.value!=='outro' );
  $('#locationForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!currentClientId){ alert('Cadastre um cliente.'); show('client'); return; }
    const tower=$('#tower').value.trim(); const floor=$('#floor').value.trim(); const sector=$('#sector').value.trim(); const place=$('#place').value; const placeOther=(place==='outro')?$('#placeOther').value.trim():'';
    currentLocationId=await DB.add('locations', { deviceId: DEVICE_ID, clientId: currentClientId, tower, floor, sector, place, placeOther, createdAt: Date.now()});
    saveState(); $('#locationForm').reset(); $('#placeOtherWrap').hidden=true; show('metal');
  });

  // Metal
  const typeSel=$('#metalType'); METAL_TYPES.forEach(t=>{ const o=document.createElement('option'); o.value=t; o.textContent=t; typeSel.appendChild(o); });
  typeSel.addEventListener('change', renderMetalFields);
  $('#btnStart').addEventListener('click', startTimer); $('#btnStop').addEventListener('click', stopTimer); $('#btnReset').addEventListener('click', resetTimer); updateTimeface();

  $('#metalForm').addEventListener('submit', async (e)=>{
    e.preventDefault(); if(!currentLocationId){ alert('Cadastre um local.'); show('location'); return; }
    const type=$('#metalType').value; const qty=parseInt($('#quantity').value||'1',10);
    const number=$('#number').value.trim(); const brand=$('#brand').value.trim(); const model=$('#model').value.trim(); const notes=$('#notes').value.trim();
    const timeSeconds=parseInt($('#timeSeconds').value||'0',10); const volumeMl=parseFloat($('#volumeMl').value||'0');
    const measuredAt=new Date().toISOString();
    const photoFile=$('#photo').files?.[0]; let photoDataUrl=null; try{ photoDataUrl=await fileToDataURL(photoFile);}catch{}
    let flowLpm=null; if(volumeMl>0 && timeSeconds>0){ const liters=volumeMl/1000; flowLpm=Math.round(((liters/timeSeconds)*60)*1000)/1000; }
    const payload={deviceId: DEVICE_ID, locationId: currentLocationId, type, quantity:isNaN(qty)?1:qty, number, brand, model, notes, timeSeconds:isNaN(timeSeconds)?0:timeSeconds, volumeMl:isNaN(volumeMl)?0:volumeMl, flowLpm, measuredAt, photoDataUrl, createdAt: Date.now()};
    await DB.add('metals', payload);
    $('#metalForm').reset(); resetTimer(); $('#metalType').value=type; renderMetalFields();
    const t=$('#toast'); t.textContent='Metal salvo!'; t.style.opacity=1; setTimeout(()=>t.style.opacity=0,1400);
  });

  // SW
  if('serviceWorker' in navigator){ try{ navigator.serviceWorker.register('./sw.js'); }catch(e){} }
}
function renderMetalFields(){ const t=$('#metalType').value; const showTimer=(t==='torneira'||t==='chuveiro'||t==='outro'); $('#timerWrap').hidden=!showTimer; $('#volumeWrap').hidden=!showTimer; $('#numberWrap').hidden=!(t==='torneira'||t==='outro'); $('#brandWrap').hidden=(t==='ducha higiênica'); $('#modelWrap').hidden=(t==='ducha higiênica'); }
async function renderTable(){ const tbody=$('#tblBody'); tbody.innerHTML=''; let rows=await DB.getAll('metals','createdAt',null,'prev'); rows = rows.filter(r => r.deviceId === DEVICE_ID); const locs=await DB.getAll('locations'); const clients=await DB.getAll('clients');
  for(const m of rows){ const loc=locs.find(l=>l.id===m.locationId); const cli=loc?clients.find(c=>c.id===loc.clientId):null; const place=loc?(loc.place==='outro'?(loc.placeOther||'outro'):loc.place):'-';
    const tr=document.createElement('tr'); tr.innerHTML=`
      <td>${cli?(cli.name||'-'):'-'}</td>
      <td>${cli?(cli.projectNumber||'-'):'-'}</td>
      <td>${loc?(loc.tower||'-'):'-'}</td>
      <td>${loc?(loc.floor||'-'):'-'}</td>
      <td>${loc?(loc.sector||'-'):'-'}</td>
      <td>${place}</td>
      <td>${m.type}${m.quantity?` (${m.quantity})`:''}${m.number?` • Nº ${m.number}`:''}</td>
      <td>${m.brand||'-'}</td>
      <td>${m.model||'-'}</td>
      <td>${(m.timeSeconds??0)||0}</td>
      <td>${(m.volumeMl??0)||0}</td>
      <td>${(m.flowLpm??0)?(m.flowLpm).toFixed(3):'-'}</td>
      <td>${m.measuredAt? new Date(m.measuredAt).toLocaleString(): '-'}</td>
      <td>${m.notes || '-'}</td>
      <td>${m.photoDataUrl? `<img class="img-thumb" src="${m.photoDataUrl}"/>` : '-'}</td>`;
    tbody.appendChild(tr);
  }
}
function formatDateNoComma(d){ const p=(n)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
function toCSVRow(arr){ return arr.map(v=>{ if(v==null) v=''; v=String(v); if(v.includes('"')||v.includes(',')||v.includes('\n')) v='"'+v.replace(/"/g,'""')+'"'; return v; }).join(','); }
document.getElementById('btnExport')?.addEventListener('click', async ()=>{
  let rows=await DB.getAll('metals','createdAt',null,'next'); rows = rows.filter(r => r.deviceId === DEVICE_ID); const locs=await DB.getAll('locations'); const clients=await DB.getAll('clients');
  const header=['Cliente','Projeto','Torre','Andar','Setor','Local','Metal','Marca','Modelo','Tempo (s)','Volume (mL)','Vazão (L/min)','Data/Hora','Observações'];
  const lines=[toCSVRow(header)];
  for(const m of rows){ const loc=locs.find(l=>l.id===m.locationId); const cli=loc?clients.find(c=>c.id===loc.clientId):null; const place=loc?(loc.place==='outro'?(loc.placeOther||'outro'):loc.place):'';
    lines.push(toCSVRow([
      cli?.name||'', cli?.projectNumber||'', loc?.tower||'', loc?.floor||'', loc?.sector||'', place||'',
      (m.type||'') + (m.quantity?` (${m.quantity})`:'') + (m.number?` • Nº ${m.number}`:''),
      m.brand||'', m.model||'', m.timeSeconds||0, m.volumeMl||0, (m.flowLpm!=null? m.flowLpm.toFixed(3):''),
      (m.measuredAt? formatDateNoComma(new Date(m.measuredAt)) : ''),
      m.notes||''
    ]));
  }
  const blob=new Blob([lines.join('\n')],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='registros.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500);
});
document.getElementById('btnDeleteAll')?.addEventListener('click', async ()=>{
  if(!confirm('Excluir todos os dados deste dispositivo?')) return;
  // Delete metals for this device
  const metals = await DB.getAll('metals'); for(const m of metals){ if(m.deviceId === DEVICE_ID){ await DB.del('metals', m.id); } }
  // Optionally clean up locations/clients with this deviceId (not strictly required, but good hygiene)
  const locs = await DB.getAll('locations'); for(const l of locs){ if(l.deviceId === DEVICE_ID){ await DB.del('locations', l.id); } }
  const clients = await DB.getAll('clients'); for(const c of clients){ if(c.deviceId === DEVICE_ID){ await DB.del('clients', c.id); } }
  localStorage.removeItem('hidro_state');
  location.reload();
});
window.addEventListener('hashchange', ()=>{ const id=location.hash.slice(1)||'client'; show(id); });
document.addEventListener('DOMContentLoaded', init);
