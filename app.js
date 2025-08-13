
import * as DB from './db.js';

// Helpers
const $ = (sel, ctx=document)=>ctx.querySelector(sel);
const $$ = (sel, ctx=document)=>Array.from(ctx.querySelectorAll(sel));

const PLACES = [
  'banheiro feminino','banheiro masculino','lavabo masculino','lavabo feminino',
  'banheiro manutenção','lavabo manutenção','pne','dml','vestiário','copa','restaurante'
];

const METAL_TYPES = [
  'torneira','bacia sanitária','ducha higiênica','mictório','chuveiro','bebedouro','filtro de água',
  'lava louças','lava roupas','forno auto limpante','cafeteira','maquina grande de venda de café','outro'
];

let currentClientId = null;
let currentTechnician = null;
let currentLocationId = null;

// Persist simple navigation state so return to app keeps context
try{
  const saved = JSON.parse(localStorage.getItem('hidro_state')||'{}');
  if(saved.clientId) currentClientId = saved.clientId;
  if(saved.locationId) currentLocationId = saved.locationId;
  if(saved.technician) currentTechnician = saved.technician;
}catch{}

function saveState(){
  localStorage.setItem('hidro_state', JSON.stringify({clientId: currentClientId, locationId: currentLocationId, technician: currentTechnician}));
}

// File to dataURL promise (reliable on mobile)
function fileToDataURL(file){
  return new Promise((resolve, reject)=>{
    if(!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = ()=> reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Timer
let timerInt = null;
let timerStart = 0;
let elapsedMs = 0;

function updateTimeface(){
  const s = Math.floor(elapsedMs/1000);
  const mm = String(Math.floor(s/60)).padStart(2,'0');
  const ss = String(s%60).padStart(2,'0');
  $('#timeface').textContent = `${mm}:${ss}`;
  $('#timeSeconds').value = s;
}

function startTimer(){
  if(timerInt) return;
  timerStart = performance.now() - elapsedMs;
  timerInt = setInterval(()=>{
    elapsedMs = performance.now() - timerStart;
    updateTimeface();
  }, 200);
}
function stopTimer(){
  if(!timerInt) return;
  clearInterval(timerInt); timerInt = null;
  elapsedMs = performance.now() - timerStart;
  updateTimeface();
}
function resetTimer(){
  clearInterval(timerInt); timerInt = null;
  elapsedMs = 0; timerStart = 0; updateTimeface();
}

function show(pageId){
  // measuredAtView refresh and technician badge
  if(pageId==='metal'){
    const mv = $('#measuredAtView');
    if(mv){ mv.value = new Date().toLocaleString(); }
  }

  // Update measuredAtView on metal page
  if(pageId==='metal'){
    const now=new Date(); const f=now.toLocaleString();
    const mv = document.querySelector('#measuredAtView'); if(mv){ mv.value=f; }
  }

  $$('.page').forEach(p=>p.hidden=true);
  $('#'+pageId).hidden=false;
  // set active nav
  $$('.nav a').forEach(a=>a.classList.toggle('active', a.getAttribute('href')==='#'+pageId));
}

async function init(){
  const warn = document.querySelector('#envWarn');
  if(warn && (location.protocol !== 'https:' && location.hostname !== 'localhost')){
    warn.style.display = 'inline-flex';
    warn.textContent = 'Para funcionar offline após instalar, acesse por HTTPS (ex.: GitHub Pages/Netlify) ou localhost. HTTP em rede local não permite Service Worker.';
  }

  // Hide manual measuredAt and add a display-only field
  const measuredInput = $('#measuredAt');
  if(measuredInput){
    const wrapper = measuredInput.closest('.row') || measuredInput.parentElement;
    measuredInput.disabled = true;
    measuredInput.style.display = 'none';
    const view = document.createElement('input');
    view.id = 'measuredAtView';
    view.disabled = true;
    view.placeholder = 'Gerada automaticamente no envio';
    const label = document.createElement('label');
    label.textContent = 'Data/Hora (auto)';
    // Insert after photo field container
    const photo = $('#photo');
    if(photo && photo.parentElement){
      photo.parentElement.parentElement.appendChild(label);
      photo.parentElement.parentElement.appendChild(view);
    } else if(wrapper && wrapper.parentElement){
      wrapper.parentElement.appendChild(label);
      wrapper.parentElement.appendChild(view);
    }
  }

  // Nav
  $$('.nav a').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      const target = a.getAttribute('href').slice(1);
      show(target);
      if(target==='view'){ renderTable(); }
    });
  });

  // Client form
  $('#clientForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = $('#clientName').value.trim();
    const proj = $('#projectNumber').value.trim();
    const tech = $('#technicianName').value.trim();
    if(!name){ alert('Informe o nome do cliente'); return; }
    currentClientId = await DB.add('clients', {name, projectNumber: proj, technician: tech, createdAt: Date.now()});
    saveState();
    // reset and go to location page
    $('#clientForm').reset();
    show('location');
  });

  // Location setup
  const placeSel = $('#place');
  PLACES.forEach(p=>{
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p;
    placeSel.appendChild(opt);
  });
  placeSel.addEventListener('change', ()=>{
    $('#placeOtherWrap').hidden = placeSel.value !== 'outro';
  });
  // include 'outro' explicitly
  const outOpt = document.createElement('option');
  outOpt.value='outro'; outOpt.textContent='outro (digite)';
  placeSel.appendChild(outOpt);

  $('#locationForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!currentClientId){ alert('Cadastre primeiro um cliente.'); show('client'); return; }
    const floor = $('#floor').value.trim();
    const sector = $('#sector').value.trim();
    const place = $('#place').value;
    const placeOther = (place==='outro') ? $('#placeOther').value.trim() : '';
    currentLocationId = await DB.add('locations', {clientId: currentClientId, floor, sector, place, placeOther, createdAt: Date.now()});
    saveState();
    $('#locationForm').reset();
    $('#placeOtherWrap').hidden = true;
    show('metal');
  });

  // Metal type options
  const typeSel = $('#metalType');
  METAL_TYPES.forEach(p=>{
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p;
    typeSel.appendChild(opt);
  });
  typeSel.addEventListener('change', renderMetalFields);

  // Timer buttons
  $('#btnStart').addEventListener('click', startTimer);
  $('#btnStop').addEventListener('click', stopTimer);
  $('#btnReset').addEventListener('click', resetTimer);
  updateTimeface();

  // Metal form submit
  $('#metalForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!currentLocationId){ alert('Cadastre primeiro um local.'); show('location'); return; }

    const type = $('#metalType').value;
    const qty = parseInt($('#quantity').value || '1', 10);
    const number = $('#number').value.trim();
    const brand = $('#brand').value.trim();
    const model = $('#model').value.trim();
    const notes = $('#notes').value.trim();
    const timeSeconds = parseInt($('#timeSeconds').value || '0', 10);
    const volumeMl = parseFloat($('#volumeMl').value || '0');
    const measuredAt = new Date().toISOString();
    // photo
    const photoFile = $('#photo').files && $('#photo').files[0];
    let photoDataUrl = null;
    try{
      photoDataUrl = await fileToDataURL(photoFile);
    }catch(err){
      console.warn('Erro lendo foto:', err);
      photoDataUrl = null;
    }

    // flow calculation: mL to L, then L/min
    let flowLpm = null;
    if(volumeMl>0 && timeSeconds>0){
      const liters = volumeMl / 1000;
      flowLpm = (liters / timeSeconds) * 60;
      flowLpm = Math.round(flowLpm*1000)/1000;
    }

    const payload = {
      locationId: currentLocationId, type, quantity: isNaN(qty)?1:qty, number, brand, model, notes,
      timeSeconds: isNaN(timeSeconds)?0:timeSeconds, volumeMl: isNaN(volumeMl)?0:volumeMl, flowLpm,
      measuredAt, photoDataUrl, createdAt: Date.now()
    };

    await DB.add('metals', payload);

    // Reset metal form + timer
    $('#metalForm').reset();
    resetTimer();
    // Keep type for faster repeated entries
    $('#metalType').value = type;
    renderMetalFields();

    // Toast simple
    const t = $('#toast');
    t.textContent = 'Metal salvo!';
    t.style.opacity = 1;
    setTimeout(()=> t.style.opacity = 0, 1400);
  });

  // Default page
  show('client');
  // If we already have state, jump ahead
  if(currentClientId) show('location');
  if(currentLocationId) show('metal');

  // View page render if opened directly
  if(location.hash === '#view'){ show('view'); renderTable(); }

  // Register service worker
  if('serviceWorker' in navigator){
    try { navigator.serviceWorker.register('./sw.js'); } catch(e){ console.warn('SW fail', e); }
  }
}

function renderMetalFields(){
  const t = $('#metalType').value;
  const showTimer = (t==='torneira' || t==='chuveiro' || t==='outro');
  $('#timerWrap').hidden = !showTimer;
  $('#volumeWrap').hidden = !showTimer;

  // dynamic groups
  const showBrandModel = (t!=='ducha higiênica' && t!=='outro') ? true : true; // most types have brand/model, and "outro" too
  const showNumber = (t==='torneira' || t==='outro');

  $('#brandWrap').hidden = (t==='ducha higiênica');
  $('#modelWrap').hidden = (t==='ducha higiênica');
  $('#numberWrap').hidden = !showNumber;

  // quantity for all except torneira/outro with single? Keep quantity visible for all types except explicit single-number types
  $('#quantityWrap').hidden = (t==='torneira' || t==='outro') ? false : false; // keep qty for all as requested
}

async function renderTable(){
  const tbody = $('#tblBody');
  tbody.innerHTML = '';
  const rows = await DB.getAll('metals', 'createdAt', null, 'prev'); // newest first

  for(const m of rows){
    // Get location & client
    // This keeps simple: fetch all each time (small datasets on device)
    const locs = await DB.getAll('locations');
    const clients = await DB.getAll('clients');
    const loc = locs.find(l=> l.id === m.locationId);
    const cli = loc ? clients.find(c=> c.id === loc.clientId) : null;

    const place = loc ? (loc.place==='outro' ? (loc.placeOther || 'outro') : loc.place) : '-';
    const whereStr = loc ? `Andar ${loc.floor || '-'} • ${loc.sector || '-'} • ${place}` : '-';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${cli ? (cli.name || '-') : '-'}</td>
      <td>${cli ? (cli.projectNumber || '-') : '-'}</td>
      <td>${cli ? (cli.technician || '-') : '-'}</td>
      <td>${loc ? (loc.floor || '-') : '-'}</td>
      <td>${loc ? (loc.sector || '-') : '-'}</td>
      <td>${loc ? (loc.place==='outro' ? (loc.placeOther || 'outro') : loc.place) : '-'}</td>
      <td>${m.type}${m.quantity ? ` (${m.quantity})` : ''}${m.number ? ` • Nº ${m.number}` : ''}</td>
      <td>${m.brand || '-'}</td>
      <td>${m.model || '-'}</td>
      <td>${(m.timeSeconds??0)||0}</td>
      <td>${(m.volumeMl??0)||0}</td>
      <td>${(m.flowLpm??0) ? (m.flowLpm).toFixed(3) : '-'}</td>
      <td>${m.measuredAt ? new Date(m.measuredAt).toLocaleString() : '-'}</td>
      <td>${m.notes || '-'}</td>
      <td>${m.photoDataUrl ? `<img class="img-thumb" src="${m.photoDataUrl}"/>` : '-'}</td>
    `;
    tbody.appendChild(tr);
  }
}

function toCSVRow(arr){
  return arr.map(v=>{
    if(v==null) v='';
    v = String(v);
    if(v.includes('"') || v.includes(',') || v.includes('\n')){
      v = '"' + v.replace(/"/g,'""') + '"';
    }
    return v;
  }).join(',');
}

$('#btnExport')?.addEventListener('click', async ()=>{
  const rows = await DB.getAll('metals', 'createdAt', null, 'next'); // old to new in CSV
  const locs = await DB.getAll('locations'); const clients = await DB.getAll('clients');
  const header = ['Cliente','Projeto','Técnico','Andar','Setor','Local','Tipo','Quantidade','Nº','Marca','Modelo','Tempo (s)','Volume (mL)','Vazão (L/min)','Data/Hora','Observações'];
  const lines = [toCSVRow(header)];
  for(const m of rows){
    const loc = locs.find(l=> l.id === m.locationId);
    const cli = loc ? clients.find(c=> c.id === loc.clientId) : null;
    const place = loc ? (loc.place==='outro' ? (loc.placeOther || 'outro') : loc.place) : '';
    lines.push(toCSVRow([
      cli?.name || '', cli?.projectNumber || '', loc?.floor || '', loc?.sector || '', loc?.floor || '', loc?.sector || '', place || '',
      m.type || '', m.quantity || '', m.number || '', m.brand || '', m.model || '',
      m.timeSeconds || 0, m.volumeMl || 0, (m.flowLpm!=null? m.flowLpm.toFixed(3):''), m.measuredAt || '', m.notes || ''
    ]));
  }
  const blob = new Blob([lines.join('\n')], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'registros.csv'; a.click();
  setTimeout(()=> URL.revokeObjectURL(url), 2000);
});

$('#btnDeleteAll')?.addEventListener('click', async ()=>{
  if(confirm('Tem certeza que deseja excluir todos os dados? Esta ação não pode ser desfeita.')){
    await DB.clearAll();
    localStorage.removeItem('hidro_state');
    alert('Todos os dados foram excluídos.');
    location.reload();
  }
});

window.addEventListener('hashchange', ()=>{
  const id = location.hash.slice(1) || 'client';
  show(id);
  if(id==='view'){ renderTable(); }
});

document.addEventListener('DOMContentLoaded', init);
