
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

const PLACES=['banheiro feminino','banheiro masculino','lavabo feminino','lavabo masculino','vestiário feminino','vestiário masculino','pne','dml','copa','restaurante','quiosque','refeitório','outro'];
const METAL_TYPES=['torneira','bacia sanitária','ducha higiênica','mictório','chuveiro','bebedouro','filtro de água','lava louças','lava roupas','forno auto limpante','cafeteira','maquina grande de venda de café','outro'];

let currentClientId=null; let currentLocationId=null;
try{ const saved=JSON.parse(localStorage.getItem('hidro_state')||'{}'); currentClientId=saved.clientId||null; currentLocationId=saved.locationId||null; }catch{}
function saveState(){ localStorage.setItem('hidro_state', JSON.stringify({clientId: currentClientId, locationId: currentLocationId})); }

function fileToDataURL(file){ return new Promise((resolve,reject)=>{ if(!file) return resolve(null); const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=()=>reject(r.error); r.readAsDataURL(file); }); }

async function fileToJpegDataURL(file){
  if(!file) return null;
  try {
    if(file.type === 'image/jpeg' || file.type === 'image/jpg'){
      return await fileToDataURL(file);
    }
    const dataUrl = await fileToDataURL(file);
    return await new Promise((resolve, reject)=>{
      const img = new Image();
      img.onload=()=>{
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img,0,0);
        canvas.toBlob(blob=>{
          if(!blob){ reject(new Error('Falha ao converter imagem para JPEG.')); return; }
          const reader = new FileReader();
          reader.onload=()=>resolve(reader.result);
          reader.onerror=()=>reject(reader.error);
          reader.readAsDataURL(blob);
        }, 'image/jpeg',0.92);
      };
      img.onerror=()=>reject(new Error('Não foi possível carregar a imagem para conversão.'));
      img.src = dataUrl;
    });
  } catch(err){
    console.error('Erro ao converter imagem para JPEG:', err);
    return null;
  }
}

let timerInt=null; let timerStart=0; let elapsedMs=0;
let visitReportEntries=[];
let currentFeature='home';
function updateTimeface(){ const totalMs = elapsedMs; const minutes = Math.floor(totalMs / 60000); const seconds = Math.floor((totalMs % 60000) / 1000); const cs = Math.floor((totalMs % 1000) / 10); const mm = String(minutes).padStart(2, '0'); const ss = String(seconds).padStart(2, '0'); const css = String(cs).padStart(2, '0'); const tf = $('#timeface'); if(tf){ tf.childNodes[0].nodeValue = `${mm}:${ss}:${css}`; tf.style.setProperty('--progress', ((seconds % 60) / 60 * 100).toFixed(1)); } $('#timeSeconds').value = Math.floor(totalMs / 1000); }
function startTimer(){ if(timerInt) return; timerStart=performance.now()-elapsedMs; timerInt=setInterval(()=>{ elapsedMs=performance.now()-timerStart; updateTimeface(); },100); const tf=$('#timeface'); if(tf) tf.classList.add('running'); }
function stopTimer(){ if(!timerInt) return; clearInterval(timerInt); timerInt=null; elapsedMs=performance.now()-timerStart; updateTimeface(); const tf=$('#timeface'); if(tf) tf.classList.remove('running'); showVolumePopup(); }
function resetTimer(){ clearInterval(timerInt); timerInt=null; elapsedMs=0; timerStart=0; updateTimeface(); const tf=$('#timeface'); if(tf) tf.classList.remove('running'); hideVolumePopup(); }

function setMode(mode, activeId=''){
  const links = $$('.nav a');
  links.forEach(a=>{ a.classList.remove('active'); a.style.display='none'; });

  // Sempre home visível
  const home = $$('.nav a.home')[0];
  if(home){ home.style.display='flex'; }

  if(mode === 'metal'){
    $$('.nav a.metal-flow').forEach(a=>{ a.style.display='flex'; });
  }

  // Registros aparece quando não está em home
  const registros = $$('.nav a.registros')[0];
  if(registros){
    registros.style.display = mode === 'home' ? 'none' : 'flex';
  }

  const effectiveId = activeId === 'view' ? 'view' : activeId;
  const current = effectiveId ? $(`.nav a[href="#${effectiveId}"]`) : null;
  if(current){ current.classList.add('active'); }
}

function show(id){
  $$('.page').forEach(p=>p.hidden=true);
  $('#'+id).hidden=false;
  $$('.nav a').forEach(a=>a.classList.remove('active'));
  if(id!=='home'){
    const tab=$$('.nav a[href="#'+id+'"][class*="nav-link"]')[0];
    if(tab) tab.classList.add('active');
  }
  if(['client','location','metal'].includes(id)){
    currentFeature='metal';
    setMode('metal', id);
  }
  if(id==='hidrometer'){
    currentFeature='hidrometer';
    setMode('hidrometer', id);
  }
  if(id==='visitreport'){
    currentFeature='visitreport';
    setMode('visitreport', id);
  }
  if(id==='view'){
    if(currentFeature==='metal') setMode('metal', id);
    else setMode('view', id);
  }
  if(id==='home'){
    currentFeature='home';
    setMode('home', id);
  }
  if(id==='metal'){ const mv=$('#measuredAtView'); if(mv) mv.value=new Date().toLocaleString(); }
  if(id==='view') renderTable();
  if(id==='visitreport'){ 
    renderVisitEntries();
    // Reset estado do campo "outro"
    $('#visitCategory').value = 'reservatorios';
    $('#visitCategoryOtherWrap').hidden = true;
    $('#visitCategoryOther').value = '';
    // Mantem sincronizado mesmo em browsers que disparam "change" tardiamente
    $('#visitCategory').dispatchEvent(new Event('input'));
  }
}


async function init(){
  $$('.nav a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault(); show(a.getAttribute('href').slice(1));}));
  $('#btnNavMetal').addEventListener('click', ()=>{ setMode('metal'); show('client'); });
  $('#btnNavHidrometer').addEventListener('click', ()=>{ setMode('hidrometer'); show('hidrometer'); });
  $('#btnNavVisitReport')?.addEventListener('click', ()=>{ setMode('visitreport'); show('visitreport'); });

  // Inicializa estado do metal
  renderMetalFields();

  // Inicializa estado da categoria "outro" do relatório de visita
  function updateVisitCategoryOtherVisibility(){
    const sel = $('#visitCategory');
    if(!sel) return;
    const normalizedValue = String(sel.value || '').trim().toLowerCase();
    const isOther = normalizedValue === 'outro';
    $('#visitCategoryOtherWrap').hidden = !isOther;
    if(isOther){
      $('#visitCategoryOther').focus();
    } else {
      $('#visitCategoryOther').value = '';
    }
  }
  $('#visitCategory').value = 'reservatorios';
  updateVisitCategoryOtherVisibility();

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
  const typeSel=$('#metalType');
  const placeholderOption=document.createElement('option');
  placeholderOption.value='';
  placeholderOption.textContent='Selecione um metal';
  placeholderOption.disabled=true;
  placeholderOption.selected=true;
  typeSel.appendChild(placeholderOption);
  METAL_TYPES.forEach(t=>{ const o=document.createElement('option'); o.value=t; o.textContent=t; typeSel.appendChild(o); });
  typeSel.addEventListener('change', renderMetalFields);
  $('#btnStart').addEventListener('click', startTimer);
  $('#btnStop').addEventListener('click', stopTimer);
  $('#btnReset').addEventListener('click', resetTimer);
  $('#volumeSave').addEventListener('click', () => {
    const value = parseFloat($('#volumePopupInput').value);
    if(!isNaN(value) && value >=0){ $('#volumeMl').value = value; hideVolumePopup(); }
    else { alert('Informe um volume válido em mL'); $('#volumePopupInput').focus(); }
  });
  $('#volumeCancel').addEventListener('click', hideVolumePopup);
  updateTimeface();

  $('#metalForm').addEventListener('submit', async (e)=>{
    e.preventDefault(); if(!currentLocationId){ alert('Cadastre um local.'); show('location'); return; }
    const type=$('#metalType').value; const qty=parseInt($('#quantity').value||'1',10);
    const number=$('#number').value.trim(); const brand=$('#brand').value.trim(); const model=$('#model').value.trim(); const notes=$('#notes').value.trim();
    const timeSeconds=parseInt($('#timeSeconds').value||'0',10); const volumeMl=parseFloat($('#volumeMl').value||'0');
    const measuredAt=new Date().toISOString();
    const photoFile=$('#photo').files?.[0]; let photoDataUrl=null;
    try{ photoDataUrl = await fileToJpegDataURL(photoFile);}catch(err){ console.error('Falha na leitura da imagem:', err); photoDataUrl=null; }
    let flowLpm=null; if(volumeMl>0 && timeSeconds>0){ const liters=volumeMl/1000; flowLpm=Math.round(((liters/timeSeconds)*60)*1000)/1000; }
    const payload={
      deviceId: DEVICE_ID,
      locationId: currentLocationId,
      type,
      quantity: isNaN(qty)?1:qty,
      number,
      brand,
      model,
      notes,
      timeSeconds: isNaN(timeSeconds)?0:timeSeconds,
      volumeMl: isNaN(volumeMl)?0:volumeMl,
      flowLpm,
      measuredAt,
      photoDataUrl,
      createdAt: Date.now()
    };
    try {
      const id = await DB.add('metals', payload);
      console.log('Metal salvo ID:', id, payload);
      setMetalDefaults(type, brand, model);
      $('#metalForm').reset(); resetTimer(); $('#metalType').value=''; renderMetalFields();
      const t=$('#toast'); t.textContent='Metal salvo!'; t.style.opacity=1; setTimeout(()=>t.style.opacity=0,1400);
      show('view');
    } catch (err) {
      console.error('Erro salvando metal:', err);
      alert('Não foi possível salvar os dados. Verifique se o navegador permite IndexedDB.');
    }
  });

  $('#hidrometerForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const tag = $('#hidroTag').value.trim();
    if(!tag){ alert('Informe a tag do hidrômetro'); return; }
    const photoFile = $('#hidroPhoto').files?.[0];
    let photoDataUrl = null;
    try { photoDataUrl = await fileToJpegDataURL(photoFile); } catch(err){ console.error('Erro convertendo foto hidrômetro', err); }
    const payload = {
      deviceId: DEVICE_ID,
      tag,
      photoDataUrl,
      location: $('#hidroLocation').value.trim(),
      arrival: $('#hidroArrival').value,
      departure: $('#hidroDeparture').value,
      waterType: $('#hidroWaterType').value,
      notes: $('#hidroNotes').value.trim(),
      createdAt: Date.now()
    };
    try {
      const id = await DB.add('hidrometers', payload);
      console.log('Hidrômetro salvo ID:', id, payload);
      $('#hidrometerForm').reset(); show('home');
      alert('Hidrômetro salvo com sucesso.');
    } catch(err) {
      console.error('Erro salvando hidrômetro:', err);
      alert('Não foi possível salvar hidrômetro.');
    }
  });

  $('#btnHidroCancel').addEventListener('click', ()=>show('home'));
  $('#btnHidroExport')?.addEventListener('click', async ()=>{
    const entries = await DB.getAll('hidrometers','createdAt',null,'next');
    if(!entries.length){ alert('Nenhum registro de hidrômetro para exportar.'); return; }
    
    const jsPDFConstructor = window.jspdf?.jsPDF || window.jsPDF || window.jspdf;
    if(!jsPDFConstructor){ alert('Biblioteca jsPDF não encontrada. Verifique se o script está carregado.'); return; }

    const doc = new jsPDFConstructor({ unit: 'pt', format:'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const maxLineWidth = pageWidth - margin * 2;
    const lineHeight = 16;

    for(let i=0;i<entries.length;i++){
      if(i>0){ doc.addPage(); }
      const entry = entries[i];
      const headerText = `Relatório de Hidrômetro\nTag: ${entry.tag||'-'}\nLocal: ${entry.location||'-'}\nData: ${new Date(entry.createdAt).toLocaleString()}\n\n`;
      const detailsText = `Origem: ${entry.arrival||'-'}\nDestino: ${entry.departure||'-'}\nTipo de água: ${entry.waterType||'-'}\n\nObservações:\n${entry.notes||'-'}`;

      let y = margin;
      const lines = doc.splitTextToSize(headerText + detailsText, maxLineWidth);

      lines.forEach((line)=>{
        if(y + lineHeight > pageHeight - margin){ doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += lineHeight;
      });

      if(entry.photoDataUrl){
        y += lineHeight;
        if(y + 200 > pageHeight - margin){ doc.addPage(); y = margin; }
        try{
          doc.addImage(entry.photoDataUrl, 'JPEG', margin, y, 200, 150);
          y += 160;
        }catch(err){
          console.warn('Imagem não carregada para PDF', err);
        }
      }
    }

    const today = new Date();
    const filename = `relatorio_hidrometros_${today.toISOString().slice(0,19).replace(/[T:]/g,'-')}.pdf`;
    doc.save(filename);
  });

  $('#visitCategory').addEventListener('change', updateVisitCategoryOtherVisibility);
  $('#visitCategory').addEventListener('input', updateVisitCategoryOtherVisibility);

  $('#btnVisitAdd').addEventListener('click', async ()=>{
    let category = $('#visitCategory').value || 'reservatorios';
    if(String(category).trim().toLowerCase() === 'outro'){
      const custom = $('#visitCategoryOther').value.trim();
      if(!custom){ alert('Informe a categoria personalizada.'); return; }
      category = custom;
    }
    const description = $('#visitDescription').value.trim();
    if(!description){ alert('Informe a descrição do relatório.'); return; }
    const files = $('#visitPhotos').files;
    const photos = await convertFilesToJpegDataUrls(files);
    const payload = {
      deviceId: DEVICE_ID,
      category,
      description,
      photos,
      createdAt: Date.now(),
    };
    try {
      const id = await DB.add('visitReports', payload);
      visitReportEntries.unshift({id, ...payload});
      renderVisitEntries();
      $('#visitReportForm').reset();
      $('#visitCategoryOther').value = '';
      $('#visitCategoryOtherWrap').hidden = true;
      $('#visitCategory').value = 'reservatorios'; // reset ao padrão
      alert('Item de relatório adicionado.');
    } catch(err){
      console.error('Erro salvando relatório:', err);
      alert('Não foi possível salvar o relatório.');
    }
  });

  $('#btnVisitExport').addEventListener('click', exportVisitReportPdf);
  $('#btnVisitBack').addEventListener('click', ()=>{ show('home'); setMode('home'); });
  
  // Adiciona listener para o botão de exportar PDF de hidrômetros na página view
  $('#btnExportHidroPdf')?.addEventListener('click', async ()=>{
    // Reusa a mesma função do btnHidroExport
    const entries = await DB.getAll('hidrometers','createdAt',null,'next');
    if(!entries.length){ alert('Nenhum registro de hidrômetro para exportar.'); return; }
    
    const jsPDFConstructor = window.jspdf?.jsPDF || window.jsPDF || window.jspdf;
    if(!jsPDFConstructor){ alert('Biblioteca jsPDF não encontrada. Verifique se o script está carregado.'); return; }

    const doc = new jsPDFConstructor({ unit: 'pt', format:'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const maxLineWidth = pageWidth - margin * 2;
    const lineHeight = 16;

    for(let i=0;i<entries.length;i++){
      if(i>0){ doc.addPage(); }
      const entry = entries[i];
      const headerText = `Relatório de Hidrômetro\nTag: ${entry.tag||'-'}\nLocal: ${entry.location||'-'}\nData: ${new Date(entry.createdAt).toLocaleString()}\n\n`;
      const detailsText = `Origem: ${entry.arrival||'-'}\nDestino: ${entry.departure||'-'}\nTipo de água: ${entry.waterType||'-'}\n\nObservações:\n${entry.notes||'-'}`;

      let y = margin;
      const lines = doc.splitTextToSize(headerText + detailsText, maxLineWidth);

      lines.forEach((line)=>{
        if(y + lineHeight > pageHeight - margin){ doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += lineHeight;
      });

      if(entry.photoDataUrl){
        y += lineHeight;
        if(y + 200 > pageHeight - margin){ doc.addPage(); y = margin; }
        try{
          doc.addImage(entry.photoDataUrl, 'JPEG', margin, y, 200, 150);
          y += 160;
        }catch(err){
          console.warn('Imagem não carregada para PDF', err);
        }
      }
    }

    const today = new Date();
    const filename = `relatorio_hidrometros_${today.toISOString().slice(0,19).replace(/[T:]/g,'-')}.pdf`;
    doc.save(filename);
  });

  visitReportEntries = (await DB.getAll('visitReports','createdAt',null,'prev')).filter(x=>x.deviceId===DEVICE_ID);
  renderVisitEntries();

  // SW
  if('serviceWorker' in navigator){
    try{
      const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      reg.update();
    }catch(e){}
  }
}
function showVolumePopup(){ const popup=$('#volumePopup'); if(popup){ popup.classList.remove('hidden'); popup.setAttribute('aria-hidden','false'); $('#volumePopupInput').focus(); } }
function hideVolumePopup(){ const popup=$('#volumePopup'); if(popup){ popup.classList.add('hidden'); popup.setAttribute('aria-hidden','true'); $('#volumePopupInput').value = ''; } }
function getMetalDefaults(){
  try { return JSON.parse(localStorage.getItem('metal_defaults') || '{}'); }
  catch { return {}; }
}
function setMetalDefaults(type, brand, model){
  if(!type) return;
  const defaults = getMetalDefaults();
  defaults[type] = {brand: brand || '', model: model || ''};
  localStorage.setItem('metal_defaults', JSON.stringify(defaults));
}
function applyMetalDefaults(type){
  const defaults = getMetalDefaults();
  if(defaults[type]){
    $('#brand').value = defaults[type].brand || '';
    $('#model').value = defaults[type].model || '';
  } else {
    $('#brand').value = '';
    $('#model').value = '';
  }
}
function renderMetalFields(){
  const t = $('#metalType').value;
  const hasType = t !== '';
  console.log('renderMetalFields called, t:', t, 'hasType:', hasType);
  $('#quantityWrap').hidden = !hasType;
  $('#numberWrap').hidden = !(hasType && (t === 'torneira' || t === 'outro'));

  const showTimer = hasType && t === 'torneira';
  console.log('showTimer:', showTimer);
  const timerWrap = $('#timerWrap');
  if(timerWrap){
    timerWrap.hidden = !showTimer;
    timerWrap.style.display = showTimer ? 'grid' : 'none';
  }
  const volumeWrap = $('#volumeWrap');
  if(volumeWrap){
    volumeWrap.hidden = true; // não mostra volume inline
    volumeWrap.style.display = 'none';
  }

  const brandWrap = $('#brandWrap');
  if(brandWrap){
    brandWrap.hidden = t === 'ducha higiênica' || !hasType;
    brandWrap.style.display = (t === 'ducha higiênica' || !hasType) ? 'none' : '';
  }
  const modelWrap = $('#modelWrap');
  if(modelWrap){
    modelWrap.hidden = t === 'ducha higiênica' || !hasType;
    modelWrap.style.display = (t === 'ducha higiênica' || !hasType) ? 'none' : '';
  }
  $('#modelWrap').hidden = t === 'ducha higiênica' || !hasType;

  const measuredAtRow = $('#measuredAtView').closest('.row');
  if(measuredAtRow) measuredAtRow.hidden = !hasType;
  $('#notes').hidden = !hasType;
  $('#metal .actions').hidden = !hasType;

  if(hasType){
    applyMetalDefaults(t);
  } else {
    $('#brand').value = '';
    $('#model').value = '';
  }
}
async function renderTable(){ 
  const tbody=$('#tblBody'); tbody.innerHTML=''; 
  let rows=await DB.getAll('metals','createdAt',null,'prev'); rows = rows.filter(r => r.deviceId === DEVICE_ID); 
  const locs=await DB.getAll('locations'); const clients=await DB.getAll('clients');
  for(const m of rows){ const loc=locs.find(l=>l.id===m.locationId); const cli=loc?clients.find(c=>c.id===loc.clientId):null; const place=loc?(loc.place==='outro'?(loc.placeOther||'outro'):loc.place):'-';
    const imgCell = m.photoDataUrl ? `<img class="img-thumb" src="${m.photoDataUrl}"/>` : '-';
    const downloadCell = m.photoDataUrl ? `<a class="btn" href="${m.photoDataUrl}" download="metal_${m.id || 'img'}.jpg">Baixar</a>` : '-';
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
      <td>${imgCell}</td>
      <td>${downloadCell}</td>`;
    tbody.appendChild(tr);
  }

  const tbodyH=$('#tblBodyHidrometer'); tbodyH.innerHTML='';
  const hydros = await DB.getAll('hidrometers','createdAt',null,'prev');
  for(const h of hydros.filter(x=>x.deviceId===DEVICE_ID)){
    const tr=document.createElement('tr');
    const thumb = h.photoDataUrl ? `<img class="img-thumb" src="${h.photoDataUrl}"/>` : '-';
    const downloadBtn = h.photoDataUrl ? `<a class="btn" href="${h.photoDataUrl}" download="${h.tag||'hidrometro'}.jpg">Baixar</a>` : '-';
    tr.innerHTML = `
      <td>${h.tag||'-'}</td>
      <td>${h.location||'-'}</td>
      <td>${h.arrival||'-'}</td>
      <td>${h.departure||'-'}</td>
      <td>${h.waterType||'-'}</td>
      <td>${h.notes||'-'}</td>
      <td>${thumb}</td>
      <td>${downloadBtn}</td>`;
    tbodyH.appendChild(tr);
  }
}

function renderVisitEntries(){
  const container = $('#visitEntries'); if(!container) return;
  if(!visitReportEntries || visitReportEntries.length===0){ container.innerHTML='<p>Nenhum relatório adicionado ainda.</p>'; return; }
  container.innerHTML = visitReportEntries.map(entry=>{
    const photosHtml = (entry.photos||[]).map((img,i)=>`<div style="display:inline-block;margin:3px;text-align:center;"><img class="img-thumb" src="${img}"/><br/><a class="btn" href="${img}" download="visit_${entry.id}_${i}.jpg">Baixar</a></div>`).join('');
    return `<div class="card" style="margin:10px 0; padding:10px; background:#f8f8f8;">
      <strong>${entry.category||'Sem categoria'}</strong> <span style="font-size:0.8em; color:#555;">${new Date(entry.createdAt).toLocaleString()}</span>
      <p>${(entry.description||'-').replace(/\n/g,'<br/>')}</p>
      <div>${photosHtml||'<em>Sem fotos</em>'}</div>
      <div style="margin-top:8px;"><button class="btn danger" data-visitreid="${entry.id}">Remover</button></div>
    </div>`;
  }).join('');
  container.querySelectorAll('button[data-visitreid]').forEach(btn=>{ btn.onclick=async()=>{ const id=parseInt(btn.dataset.visitreid,10); await DB.del('visitReports',id); visitReportEntries=visitReportEntries.filter(e=>e.id!==id); renderVisitEntries(); }; });
}

async function convertFilesToJpegDataUrls(fileList){
  const files = Array.from(fileList||[]);
  const urls = await Promise.all(files.map(async file=>{ const dataUrl = await fileToJpegDataURL(file); return dataUrl; }));
  return urls.filter(Boolean);
}

async function exportVisitReportPdf(){
  if(!visitReportEntries || visitReportEntries.length===0){ alert('Nenhum relatório de visita disponível para exportar.'); return; }
  const jsPDFConstructor = window.jspdf?.jsPDF || window.jsPDF || window.jspdf;
  if(!jsPDFConstructor){ alert('Biblioteca jsPDF não encontrada. Verifique se o script está carregado.'); return; }

  const doc = new jsPDFConstructor({ unit: 'pt', format:'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const maxLineWidth = pageWidth - margin * 2;
  const lineHeight = 16;

  for(let i=0;i<visitReportEntries.length;i++){
    if(i>0){ doc.addPage(); }
    const entry = visitReportEntries[i];
    const headerText = `Relatório de Visita\nCategoria: ${entry.category||'-'}\nData: ${new Date(entry.createdAt).toLocaleString()}\n\n`;
    const descriptionText = `Descrição:\n${entry.description||'-'}`;

    let y = margin;
    const lines = doc.splitTextToSize(headerText + descriptionText, maxLineWidth);

    lines.forEach((line)=>{
      if(y + lineHeight > pageHeight - margin){ doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += lineHeight;
    });

    if((entry.photos||[]).length){
      y += lineHeight; // spacing before imagens
      for(const img of (entry.photos||[])){
        if(y + 160 > pageHeight - margin){ doc.addPage(); y = margin; }
        try{
          doc.addImage(img, 'JPEG', margin, y, 200, 150);
        }catch(err){
          console.warn('Imagem não carregada para PDF', err);
        }
        y += 160 + 10;
      }
    }
  }

  const today = new Date();
  const filename = `relatorio_visita_${today.toISOString().slice(0,19).replace(/[T:]/g,'-')}.pdf`;
  doc.save(filename);
}

function formatDateNoComma(d){ const p=(n)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
function toCSVRow(arr){ return arr.map(v=>{ if(v==null) v=''; v=String(v); if(v.includes('"')||v.includes(',')||v.includes('\n')) v='"'+v.replace(/"/g,'""')+'"'; return v; }).join(','); }
document.getElementById('btnExport')?.addEventListener('click', async ()=>{
  let rows=await DB.getAll('metals','createdAt',null,'next'); rows = rows.filter(r => r.deviceId === DEVICE_ID); const locs=await DB.getAll('locations'); const clients=await DB.getAll('clients');
  const header=['Cliente','Projeto','Torre','Andar','Setor','Local','Metal','Marca','Modelo','Tempo (s)','Volume (mL)','Vazão (L/min)','Data/Hora','Observações'];
  const lines=[toCSVRow(header)];
  for(const m of rows){ const loc=locs.find(l=>l.id===m.locationId); const cli=loc?clients.find(c=>c.id===loc.clientId):null; const place=loc?(loc.place==='outro'?(loc.placeOther||'outro'):loc.place):'';    lines.push(toCSVRow([
      cli?.name||'', cli?.projectNumber||'', loc?.tower||'', loc?.floor||'', loc?.sector||'', place||'',
      (m.type||'') + (m.quantity?` (${m.quantity})`:'') + (m.number?` • Nº ${m.number}`:''),
      m.brand||'', m.model||'', m.timeSeconds||0, m.volumeMl||0, (m.flowLpm!=null? m.flowLpm.toFixed(3):''),
      (m.measuredAt? formatDateNoComma(new Date(m.measuredAt)) : ''),
      m.notes||''
    ]));
  }
  const csvContent = '\uFEFF' + lines.join('\n'); // BOM para Excel PT-BR
  const blob=new Blob([csvContent],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='registros.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500);
});
document.getElementById('btnExportHidro')?.addEventListener('click', async ()=>{
  const entries = await DB.getAll('hidrometers','createdAt',null,'next');
  const rows = entries.filter(r=>r.deviceId===DEVICE_ID);
  if(rows.length===0){ alert('Não há registros de hidrômetros para exportar.'); return; }
  const header=['Tag','Local','Origem','Destino','Tipo Água','Informações','Foto'];
  const lines=[toCSVRow(header)];
  for(const h of rows){ lines.push(toCSVRow([h.tag||'', h.location||'', h.arrival||'', h.departure||'', h.waterType||'', h.notes||'', h.photoDataUrl||''])); }
  const csvContent2 = '\uFEFF' + lines.join('\n'); // BOM para Excel PT-BR
  const blob2 = new Blob([csvContent2], {type:'text/csv;charset=utf-8;'});
  const url2 = URL.createObjectURL(blob2);
  const a2 = document.createElement('a');
  a2.href = url2; a2.download = 'registros_hidrometros.csv'; a2.click(); setTimeout(()=>URL.revokeObjectURL(url2),1500);
});
document.getElementById('btnDeleteAll')?.addEventListener('click', async ()=>{
  if(!confirm('Excluir todos os dados deste dispositivo?')) return;
  // Delete all data for this device
  const metals = await DB.getAll('metals'); for(const m of metals){ if(m.deviceId === DEVICE_ID){ await DB.del('metals', m.id); } }
  const locations = await DB.getAll('locations'); for(const l of locations){ if(l.deviceId === DEVICE_ID){ await DB.del('locations', l.id); } }
  const clients = await DB.getAll('clients'); for(const c of clients){ if(c.deviceId === DEVICE_ID){ await DB.del('clients', c.id); } }
  const hidrometers = await DB.getAll('hidrometers'); for(const h of hidrometers){ if(h.deviceId === DEVICE_ID){ await DB.del('hidrometers', h.id); } }
  const visitReports = await DB.getAll('visitReports'); for(const v of visitReports){ if(v.deviceId === DEVICE_ID){ await DB.del('visitReports', v.id); } }
  localStorage.removeItem('hidro_state');
  alert('Todos os dados foram excluídos com sucesso.');
  location.reload();
});
window.addEventListener('hashchange', ()=>{ const id=location.hash.slice(1)||'home'; show(id); });
document.addEventListener('DOMContentLoaded', ()=>{ setMode('home'); show('home'); init(); });
