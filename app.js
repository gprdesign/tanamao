(() => {
  'use strict';

  const CLOUD = window.NMM_SUPABASE || {};
  const CLOUD_READY = Boolean(CLOUD.url && CLOUD.publishableKey);
  const GOOGLE_CALENDAR_CLIENT_ID = String(window.TNM_GOOGLE_CALENDAR_CLIENT_ID||'').trim();
  const TASKS_KEY = 'tnm.weekly.tasks.v1';
  const NOTES_KEY = 'tnm.weekly.notes.v1';
  const LOGS_KEY = 'tnm.weekly.logs.v1';
  const FINANCE_KEY = 'tnm.weekly.finance.v1';
  const FINANCE_STATE_KEY = 'tnm.weekly.financeState.v1';
  const FINANCE_ENTRY_TAG_ID = 'flow-entry';
  const FINANCE_EXIT_TAG_ID = 'flow-exit';
  const FINANCE_MONTH_KEY = 'tnm.weekly.financeMonth.v1';
  const LOG_RANGE_KEY = 'tnm.weekly.logsRange.v1';
  const ZOOM_KEY = 'tnm.weekly.zoom.v1';
  const VIEW_MODE_KEY = 'tnm.weekly.viewMode.v1';
  const USER_SETTINGS_KEY = 'tnm.weekly.userSettings.v1';
  const PRIVATE_VAULT_KEY = 'tnm.weekly.privateVault.v1';
  const PRIVATE_ROWS_KEY = 'tnm.weekly.privateRows.v1';
  const SESSION_KEY = 'naMinhaMao.supabase.session.v1';
  const RESET_KEY = 'tnm.weekly.reset.v1';
  const TAGS_KEY = 'tnm.weekly.tags.v1';
  const TAG_FILTER_KEY = 'tnm.weekly.filterTag.v1';
  const PAGE_FILTERS_KEY = 'tnm.weekly.filterTagsByPage.v1';
  const FILTER_PAGES = ['home','tasks','notes','finance'];
  const LAST_TAG_KEY = 'tnm.weekly.lastTag.v1';
  const AUTO_BACKUP_KEY = 'tnm.weekly.autobackup.v1';
  const CALENDAR_EVENTS_KEY = 'tnm.weekly.calendarEvents.v1';
  const CALENDAR_SYNC_META_KEY = 'tnm.weekly.calendarSync.v1';
  const AUTO_BACKUP_EVERY = 5*60*1000;
  const WEEK_KEY = 'tnm.weekly.week.v1';
  const PAGE_KEY = 'tnm.weekly.page.v1';
  const RESET_CUTOFF = '2026-10-18T14:27:00.000Z';
  const DEFAULT_TAGS = [
    {id:'vida',name:'VIDA',color:'#73d6a2',createdAt:'2026-10-18T00:00:00.000Z',updatedAt:'2026-10-18T00:00:00.000Z'},
    {id:'trabalho',name:'TRABALHO',color:'#8bafff',createdAt:'2026-10-18T00:00:00.000Z',updatedAt:'2026-10-18T00:00:00.000Z'},
    {id:'outro',name:'OUTRO',color:'#ffc46b',createdAt:'2026-10-18T00:00:00.000Z',updatedAt:'2026-10-18T00:00:00.000Z'},
    {id:'flow-entry',name:'ENTRADA',color:'#73d6a2',createdAt:'2026-10-21T00:00:00.000Z',updatedAt:'2026-10-21T00:00:00.000Z'},
    {id:'flow-exit',name:'SAÍDA',color:'#ff8b8b',createdAt:'2026-10-21T00:00:00.000Z',updatedAt:'2026-10-21T00:00:00.000Z'}
  ];
  const DAY_LABELS = ['SEG','TER','QUA','QUI','SEX','SÁB','DOM'];
  const LEGACY_KEYS = [
    'naMinhaMao.tasks.v1','naMinhaMao.notes.v1','naMinhaMao.notesSearchHistory.v1','naMinhaMao.timer.v1',
    'naMinhaMao.taskOrder.v1','naMinhaMao.taskOrderUpdatedAt.v1','naMinhaMao_task_order','naMinhaMao_task_order_updated_at',
    'naMinhaMao_task_categories','naMinhaMao.taskArea.v1','naMinhaMao.taskCategory.v1','naMinhaMao.plannerWeek.v1',
    'naMinhaMao.planTrayOpen.v1','naMinhaMao.zoom.v1','naMinhaMao.view','naMinhaMao.page','naMinhaMao.supabase.sync.v1'
  ];
  const $ = id => document.getElementById(id);
  const nowISO = () => new Date().toISOString();
  const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let tasks = [];
  let notes = [];
  let logs = readStored(LOGS_KEY,[]);
  let finances = [];
  let financeState = normalizeFinanceState(readStored(FINANCE_STATE_KEY,{}));
  let financeMonth = /^\d{4}-\d{2}$/.test(localStorage.getItem(FINANCE_MONTH_KEY)||'')?localStorage.getItem(FINANCE_MONTH_KEY):todayKey().slice(0,7);
  if(!Array.isArray(logs))logs=[];
  let logRange = ['7d','30d','12w','all'].includes(localStorage.getItem(LOG_RANGE_KEY))?localStorage.getItem(LOG_RANGE_KEY):'7d';
  let userSettings = normalizeUserSettings(readStored(USER_SETTINGS_KEY,{summaryTimes:['08:00'],calendarIds:[],nickname:'Gio'}));
  let privateVault = normalizePrivateVault(readStored(PRIVATE_VAULT_KEY,null));
  let privateCipherRows = readStored(PRIVATE_ROWS_KEY,[]);
  if(!Array.isArray(privateCipherRows))privateCipherRows=[];
  privateCipherRows=privateCipherRows.map(normalizePrivateRow).filter(Boolean);
  let privateCryptoKey = null;
  let privateNotes = [];
  let privateLogs = [];
  const unlockedLogIds = new Set();
  let pendingLogLockId = '';
  let pendingLogUnlockId = '';
  let pendingLogAddTagId = '';
  let privateNotesUnlocked = false;
  let privateNotesMode = false;
  let privateNoteDirty = false;
  let privateHiddenAt = 0;
  let pendingPrivateMoveId = '';
  let tags = [];
  let calendarEvents = readStored(CALENDAR_EVENTS_KEY,[]);
  if(!Array.isArray(calendarEvents))calendarEvents=[];
  let availableGoogleCalendars=[];
  let googleCalendarAccessToken='';
  let googleCalendarAccessTokenExpiresAt=0;
  let calendarSyncInProgress=false;
  let calendarStatusMessage='';
  let calendarStatusFailed=false;
  let calendarLastSyncAt=String(readStored(CALENDAR_SYNC_META_KEY,'')||'');
  let calendarAutoSyncTimer=null;
  let session = readStored(SESSION_KEY,null);
  const storedViewMode=localStorage.getItem(VIEW_MODE_KEY);
  const isAndroidDevice=/Android/i.test(navigator.userAgent||'');
  let viewMode=storedViewMode==='pc'||storedViewMode==='mobile'?storedViewMode:(isAndroidDevice||(window.matchMedia?.('(max-width: 700px)').matches||false)?'mobile':'pc');
  const storedPage = localStorage.getItem(PAGE_KEY);
  let currentPage = storedPage==='log'?'finance':['tasks','finance','notes','settings'].includes(storedPage)?storedPage:'tasks';
  let pageTagFilters = loadPageFilters();
  let filterTagIds = [...(pageTagFilters[filterPageKey(currentPage)]||[])];
  let zoomLevel = Math.min(1.25,Math.max(.8,Number(localStorage.getItem(ZOOM_KEY))||1));
  let weekStart = (()=>{const current=startOfWeek(todayKey()),saved=localStorage.getItem(WEEK_KEY),selected=saved?startOfWeek(saved):current;return selected<current?current:selected;})();
  let observedToday=todayKey();
  let observedCurrentWeek=startOfWeek(observedToday);
  let dragTaskId = '';
  let noteDragId = '';
  let checklistDragId = '';
  let checklistDragGroup = '';
  let expandedSection = '';
  let planningVisibleLimit = 6;
  let completedVisibleLimit = 6;
  let floatingActionMenu = null;
  let pointerDrag = null;
  let activeDayKind = 'day';
  let activeDayDate = '';
  let dayDialogTouchStart = null;
  let authBusy = false;
  let taskDialogDirty = false;
  let lastTasksForegroundSyncAt = 0;
  let noteDialogDirty = false;
  let financeDialogDirty = false;
  let appFullscreenMode = isAndroidDevice;
  let lastTaskCtrlEnterAt = 0;
  let lastNoteCtrlEnterAt = 0;
  let authMessage = '';
  let syncStatus = '';
  let syncTimer = null;
  let syncInFlight = false;
  let syncQueued = false;
  let checklistSyncQueue = Promise.resolve();
  let toastTimer = null;

  function readStored(key,fallback) {
    try { const value=localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch { return fallback; }
  }
  function readFilterTags() {
    const raw=localStorage.getItem(TAG_FILTER_KEY);
    if (!raw) return [];
    try { const parsed=JSON.parse(raw); return Array.isArray(parsed)?parsed.map(String):[String(parsed)]; }
    catch { return [raw]; }
  }
  function filterPageKey(page=currentPage) { return FILTER_PAGES.includes(page)?page:'home'; }
  function loadPageFilters() {
    const saved=readStored(PAGE_FILTERS_KEY,null);
    if(saved&&typeof saved==='object'&&!Array.isArray(saved))return Object.fromEntries(FILTER_PAGES.map(page=>[page,Array.isArray(saved[page])?Array.from(new Set(saved[page].map(String))):[]]));
    const migrated={home:[],tasks:[],notes:readFilterTags(),finance:[]};
    localStorage.setItem(PAGE_FILTERS_KEY,JSON.stringify(migrated));return migrated;
  }
  function persistPageFilters() {
    pageTagFilters[filterPageKey(currentPage)]=[...filterTagIds];
    localStorage.setItem(PAGE_FILTERS_KEY,JSON.stringify(pageTagFilters));
  }
  function selectedPageTags(page=currentPage) { return pageTagFilters[filterPageKey(page)]||[]; }
  function prunePageFilters() {
    const activeIds=new Set(tags.filter(tag=>!tag.deletedAt).map(tag=>tag.id));
    for(const page of FILTER_PAGES)pageTagFilters[page]=(pageTagFilters[page]||[]).filter(id=>activeIds.has(id));
    filterTagIds=[...selectedPageTags(currentPage)];localStorage.setItem(PAGE_FILTERS_KEY,JSON.stringify(pageTagFilters));
  }
  function resetOldBrowserData() {
    if (localStorage.getItem(RESET_KEY) === 'done') return;
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    localStorage.setItem(RESET_KEY,'done');
  }
  function validTagColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || '')); }
  function normalizeLink(value) {
    const text=String(value||'').trim().slice(0,2048);
    if(!text)return '';
    try{const url=new URL(text);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}
  }
  function normalizeLinks(values,legacy='') {
    const source=Array.isArray(values)?values:[];
    return Array.from(new Set([...source,legacy].map(normalizeLink).filter(Boolean)));
  }
  function noteLinks(note) { return normalizeLinks(note?.links,note?.link); }
  function linkInputValues(containerId) { return Array.from($(containerId)?.querySelectorAll('[data-note-link-input]')||[]).map(input=>input.value); }
  function renderLinkInputs(containerId,values=[]) {
    const list=$(containerId);if(!list)return;
    list.innerHTML=values.map((value,index)=>`<div class="note-link-editor-row"><input type="url" data-note-link-input maxlength="2048" value="${escapeHTML(value)}" placeholder="https://…" aria-label="Endereço do link ${index+1}"><button class="btn small note-link-remove" type="button" data-remove-note-link="${index}" aria-label="Remover link ${index+1}" title="Remover link">×</button></div>`).join('');
  }
  function addLinkInput(containerId) {
    const values=linkInputValues(containerId);values.push('');renderLinkInputs(containerId,values);
    const inputs=$(containerId)?.querySelectorAll('[data-note-link-input]');if(inputs?.length)inputs[inputs.length-1].focus();
  }
  function collectNoteLinks(containerId) {
    const raw=linkInputValues(containerId),invalid=raw.some(value=>String(value||'').trim()&&!normalizeLink(value));
    return {links:normalizeLinks(raw),invalid};
  }
  function noteLinkInputsHaveValue(containerId) { return linkInputValues(containerId).some(value=>String(value||'').trim()); }
  function removeLinkInput(containerId,index) {
    const values=linkInputValues(containerId);values.splice(Number(index),1);renderLinkInputs(containerId,values);
  }
  function linksPreview(links) {
    const safe=normalizeLinks(links);
    return safe.map((link,index)=>`<a class="item-link" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">↗ ${safe.length===1?'Abrir link':`Link ${index+1}`}</a>`).join('');
  }
  function normalizeCalendarEvent(value) {
    if(!value||typeof value!=='object')return null;
    const title=String(value.summary||value.title||'').trim().slice(0,180);
    const rawStart=value.start?.dateTime||value.start?.date||value.startAt||value.start;
    if(!title||!rawStart)return null;
    const allDay=/^\d{4}-\d{2}-\d{2}$/.test(String(rawStart));
    const startDate=allDay?null:new Date(rawStart);
    if(!allDay&&(!startDate||!Number.isFinite(startDate.getTime())))return null;
    const startAt=allDay?String(rawStart):startDate.toISOString();
    return {id:String(value.id||`${title}:${startAt}`),title,startAt,allDay,location:String(value.location||'').trim().slice(0,180),url:normalizeLink(value.htmlLink||value.url||'')};
  }
  function calendarEventOrder(a,b){return String(a.startAt).localeCompare(String(b.startAt))||String(a.title).localeCompare(String(b.title),'pt-BR');}
  function getCalendarEventsForDate(date){return calendarEvents.map(normalizeCalendarEvent).filter(Boolean).filter(event=>(event.allDay?String(event.startAt).slice(0,10):dateKey(new Date(event.startAt)))===date).sort(calendarEventOrder);}
  function calendarEventTimeLabel(event){if(event.allDay)return '';const date=new Date(event.startAt);return Number.isFinite(date.getTime())?date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';}
  function getUpcomingCalendarEvents(){const today=todayKey(),now=Date.now();return calendarEvents.map(normalizeCalendarEvent).filter(Boolean).filter(event=>event.allDay?event.startAt>=today:Date.parse(event.startAt)>=now).sort(calendarEventOrder);}
  function setCalendarEvents(values){calendarEvents=(Array.isArray(values)?values:[]).map(normalizeCalendarEvent).filter(Boolean);localStorage.setItem(CALENDAR_EVENTS_KEY,JSON.stringify(calendarEvents));renderHomeEvents();if(currentPage==='tasks')renderTasks();}
  window.TNMCalendarBridge=Object.freeze({replaceEvents:setCalendarEvents});
  function calendarTokenIsValid(){return Boolean(googleCalendarAccessToken&&Date.now()<googleCalendarAccessTokenExpiresAt-60000);}
  function setCalendarStatus(message,failed=false){calendarStatusMessage=String(message||'');calendarStatusFailed=Boolean(failed);const node=$('calendarStatus');if(node){node.textContent=calendarStatusMessage;node.classList.toggle('is-error',calendarStatusFailed);}}
  function renderCalendarFilters(){
    const list=$('calendarFilters');if(!list)return;
    if(!availableGoogleCalendars.length){list.innerHTML=`<p class="muted">${GOOGLE_CALENDAR_CLIENT_ID?'Conecte o Google Calendar para carregar as agendas.':'A configuração do Google Calendar está incompleta.'}</p>`;return;}
    const selected=new Set(userSettings.calendarIds);
    list.innerHTML=availableGoogleCalendars.map(calendar=>{
      const meta=calendar.primary?'Agenda principal':calendar.accessRole==='owner'?'Sua agenda':calendar.accessRole==='reader'?'Compartilhada · leitura':'Compartilhada · edição';
      return `<label class="calendar-filter-row"><input type="checkbox" data-calendar-id="${escapeHTML(calendar.id)}"${selected.has(calendar.id)?' checked':''}><span><span class="calendar-filter-name">${escapeHTML(calendar.summary)}</span><small class="calendar-filter-meta">${escapeHTML(meta)}</small></span></label>`;
    }).join('');
  }
  function renderCalendarSyncUI(){
    const connect=$('calendarConnectBtn'),sync=$('calendarSyncBtn');if(!connect||!sync)return;
    if(!calendarStatusMessage){
      const last=calendarLastSyncAt?new Date(calendarLastSyncAt):null,valid=last&&!Number.isNaN(last.getTime());
      setCalendarStatus(!GOOGLE_CALENDAR_CLIENT_ID?'Falta configurar a conexão OAuth do Google Calendar.':valid?`Última sincronização: ${last.toLocaleString('pt-BR')}. Toque em Sincronizar para atualizar.`:'Conecte sua conta para carregar os calendários.');
    }
    connect.disabled=!GOOGLE_CALENDAR_CLIENT_ID;connect.textContent=calendarTokenIsValid()?'Atualizar agendas':'Conectar Google Calendar';
    sync.disabled=!GOOGLE_CALENDAR_CLIENT_ID||!userSettings.calendarIds.length||calendarSyncInProgress;sync.textContent=calendarSyncInProgress?'Sincronizando…':'Sincronizar agora';
    renderCalendarFilters();
  }
  function requestGoogleCalendarAccessToken(){
    if(!GOOGLE_CALENDAR_CLIENT_ID)return Promise.reject(new Error('Client ID do Google Calendar não configurado.'));
    const oauth=window.google?.accounts?.oauth2;if(!oauth)return Promise.reject(new Error('O serviço de autorização do Google não carregou. Atualize a página e tente novamente.'));
    return new Promise((resolve,reject)=>{
      const client=oauth.initTokenClient({client_id:GOOGLE_CALENDAR_CLIENT_ID,scope:'https://www.googleapis.com/auth/calendar.readonly',callback:response=>{
        if(response?.error||!response?.access_token){googleCalendarAccessToken='';googleCalendarAccessTokenExpiresAt=0;reject(new Error(response?.error_description||response?.error||'Autorização do Google não concluída.'));return;}
        googleCalendarAccessToken=String(response.access_token);googleCalendarAccessTokenExpiresAt=Date.now()+Math.max(60,Number(response.expires_in)||3600)*1000;resolve(googleCalendarAccessToken);
      },error_callback:error=>reject(new Error(error?.message||'A janela de autorização foi fechada.'))});
      try{client.requestAccessToken({prompt:''});}catch(error){reject(error);}
    });
  }
  async function googleCalendarApi(url,token){
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});let data={};try{data=await response.json();}catch{}
    if(!response.ok){if(response.status===401){googleCalendarAccessToken='';googleCalendarAccessTokenExpiresAt=0;}throw new Error(data.error?.message||`Google Calendar respondeu ${response.status}.`);}
    return data;
  }
  async function loadGoogleCalendars(token){
    const data=await googleCalendarApi('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250',token);
    availableGoogleCalendars=(Array.isArray(data.items)?data.items:[]).map(item=>({id:String(item.id||''),summary:String(item.summary||item.id||'Agenda'),primary:Boolean(item.primary),accessRole:String(item.accessRole||'reader')})).filter(item=>item.id).sort((a,b)=>a.primary?-1:b.primary?1:a.summary.localeCompare(b.summary,'pt-BR'));
    const ids=new Set(availableGoogleCalendars.map(item=>item.id));
    if(!userSettings.calendarIdsConfigured){const primary=availableGoogleCalendars.find(item=>item.primary)||availableGoogleCalendars[0];userSettings.calendarIds=primary?[primary.id]:[];userSettings.calendarIdsConfigured=true;saveUserSettings();}
    else {const kept=userSettings.calendarIds.filter(id=>ids.has(id));if(kept.length!==userSettings.calendarIds.length){userSettings.calendarIds=kept;saveUserSettings();}}
    renderCalendarFilters();return availableGoogleCalendars;
  }
  async function fetchGoogleCalendarEvents(token,calendar){
    const base=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`,weekBeginning=new Date(`${startOfWeek(todayKey())}T00:00:00`),params=new URLSearchParams({timeMin:weekBeginning.toISOString(),timeMax:new Date(Date.now()+30*86400000).toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'2500',showDeleted:'false'}),events=[];
    while(true){const data=await googleCalendarApi(`${base}?${params.toString()}`,token);for(const event of Array.isArray(data.items)?data.items:[])events.push({...event,id:`${calendar.id}:${event.id||makeId()}`,calendarId:calendar.id,summary:event.summary||calendar.summary});if(!data.nextPageToken)break;params.set('pageToken',data.nextPageToken);}
    return events;
  }
  async function syncGoogleCalendar(interactive=false){
    if(calendarSyncInProgress)return;
    if(!GOOGLE_CALENDAR_CLIENT_ID){setCalendarStatus('Falta configurar a conexão OAuth do Google Calendar.',true);return;}
    if(!userSettings.calendarIds.length){setCalendarStatus(availableGoogleCalendars.length?'Marque pelo menos uma agenda para sincronizar.':'Conecte o Google Calendar para carregar as agendas.');renderCalendarSyncUI();return;}
    calendarSyncInProgress=true;renderCalendarSyncUI();
    try{
      let token=calendarTokenIsValid()?googleCalendarAccessToken:'';
      if(!token){if(!interactive){setCalendarStatus('Autorização expirada. Toque em “Sincronizar agora” para reconectar.');return;}token=await requestGoogleCalendarAccessToken();}
      if(!availableGoogleCalendars.length)await loadGoogleCalendars(token);
      const selected=userSettings.calendarIds.map(id=>availableGoogleCalendars.find(calendar=>calendar.id===id)).filter(Boolean);
      if(!selected.length){setCalendarStatus('Nenhuma agenda selecionada para sincronizar.');return;}
      const batches=await Promise.all(selected.map(calendar=>fetchGoogleCalendarEvents(token,calendar))),events=batches.flat();
      setCalendarEvents(events);calendarLastSyncAt=nowISO();localStorage.setItem(CALENDAR_SYNC_META_KEY,JSON.stringify(calendarLastSyncAt));
      setCalendarStatus(`Sincronizado às ${new Date(calendarLastSyncAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · ${getUpcomingCalendarEvents().length} eventos nos próximos 30 dias.`);
    }catch(error){setCalendarStatus(`Não consegui sincronizar: ${error?.message||'erro desconhecido'}`,true);}
    finally{calendarSyncInProgress=false;renderCalendarSyncUI();}
  }
  async function connectGoogleCalendar(){
    if(!GOOGLE_CALENDAR_CLIENT_ID){setCalendarStatus('Falta configurar a conexão OAuth do Google Calendar.',true);return;}
    setCalendarStatus('Aguardando autorização do Google Calendar…');
    try{const token=await requestGoogleCalendarAccessToken();await loadGoogleCalendars(token);if(!userSettings.calendarIds.length){setCalendarStatus('Agendas carregadas. Marque quais quer sincronizar.');return;}await syncGoogleCalendar(false);}
    catch(error){setCalendarStatus(`Não consegui conectar: ${error?.message||'erro desconhecido'}`,true);}
    finally{renderCalendarSyncUI();}
  }
  function handleCalendarFilterChange(){
    const list=$('calendarFilters');if(!list)return;
    userSettings.calendarIds=Array.from(list.querySelectorAll('input[data-calendar-id]:checked')).map(input=>input.dataset.calendarId).filter(Boolean);userSettings.calendarIdsConfigured=true;saveUserSettings();renderCalendarFilters();
    if(!userSettings.calendarIds.length){setCalendarEvents([]);setCalendarStatus('Nenhuma agenda selecionada; os eventos foram removidos da Home.');renderCalendarSyncUI();return;}
    void syncGoogleCalendar(true);
  }
  function startCalendarAutoSync(){
    if(calendarAutoSyncTimer)return;
    calendarAutoSyncTimer=window.setInterval(()=>{if(document.visibilityState!=='visible'||!userSettings.calendarIds.length||calendarSyncInProgress)return;if(calendarTokenIsValid())void syncGoogleCalendar(false);else if(googleCalendarAccessToken)setCalendarStatus('A autorização expirou. Toque em Sincronizar para reconectar.');},15*60*1000);
  }
  function normalizeTag(value) {
    if (!value || typeof value !== 'object' || !String(value.id || '').trim() || !String(value.name || '').trim()) return null;
    return {id:String(value.id),name:String(value.name).trim().replace(/\s+/g,' ').slice(0,32),color:validTagColor(value.color)?String(value.color).toLowerCase():'#8bafff',createdAt:String(value.createdAt || nowISO()),updatedAt:String(value.updatedAt || value.createdAt || nowISO()),deletedAt:value.deletedAt?String(value.deletedAt):null};
  }
  function getTag(tagId) { return tags.find(tag=>tag.id===String(tagId) && !tag.deletedAt) || tags.find(tag=>tag.id==='vida') || DEFAULT_TAGS[0]; }
  function ensureDefaultTags(list) {
    const map=new Map((Array.isArray(list)?list:[]).map(item=>[item.id,item]));
    for (const item of DEFAULT_TAGS) {
      const existing=map.get(item.id);
      if(!existing)map.set(item.id,{...item});
      else if(item.id===FINANCE_ENTRY_TAG_ID||item.id===FINANCE_EXIT_TAG_ID)map.set(item.id,{...existing,name:item.name,color:item.color,deletedAt:null});
    }
    return Array.from(map.values()).map(normalizeTag).filter(Boolean);
  }
  function loadLocalTags() {
    const stored=readStored(TAGS_KEY,[]);
    tags=ensureDefaultTags(Array.isArray(stored)?stored.map(normalizeTag).filter(Boolean):[]);
    prunePageFilters();
    localStorage.setItem(TAGS_KEY,JSON.stringify(tags));
  }
  function saveTags(schedule=true) {
    tags=ensureDefaultTags(tags);prunePageFilters();
    localStorage.setItem(TAGS_KEY,JSON.stringify(tags));
    renderTasks(); renderHome(); renderNotes(); renderFilterButton(); renderLogs();
    if (schedule) scheduleSync();
  }
  function loadLocalData() {
    const storedTasks=readStored(TASKS_KEY,[]),storedNotes=readStored(NOTES_KEY,[]),storedLogs=readStored(LOGS_KEY,[]),storedFinance=readStored(FINANCE_KEY,[]);
    financeState=normalizeFinanceState(readStored(FINANCE_STATE_KEY,financeState));
    tasks=Array.isArray(storedTasks)?storedTasks.map(normalizeTask).filter(Boolean):[];
    notes=Array.isArray(storedNotes)?storedNotes.map(normalizeNote).filter(Boolean):[];
    logs=Array.isArray(storedLogs)?storedLogs.map(normalizeLog).filter(Boolean):[];
    finances=Array.isArray(storedFinance)?storedFinance.map(normalizeFinanceEntry).filter(Boolean):[];
  }
  function normalizeRecurrence(value,taskDate='',taskId='') {
    if(!value||typeof value!=='object')return null;
    const frequency=['daily','weekly','monthly','yearly'].includes(String(value.frequency))?String(value.frequency):'';
    const rawInterval=Number(value.interval??1),interval=Number.isInteger(rawInterval)?Math.min(999,Math.max(1,rawInterval)):1;
    const anchorDate=isDateKey(value.anchorDate)?String(value.anchorDate):isDateKey(taskDate)?String(taskDate):'';
    if(!frequency||!anchorDate)return null;
    const weekdays=Array.isArray(value.weekdays)?Array.from(new Set(value.weekdays.map(Number).filter(day=>Number.isInteger(day)&&day>=1&&day<=7))).sort((a,b)=>a-b):[];
    if(frequency==='weekly'&&!weekdays.length)weekdays.push(getIsoWeekday(anchorDate));
    return {frequency,interval,weekdays:frequency==='weekly'?weekdays:[],anchorDate,until:isDateKey(value.until)?String(value.until):null,seriesId:String(value.seriesId||taskId||'')};
  }
  function normalizeTaskSubtasks(value) {
    if(!Array.isArray(value))return [];
    const rows=value.slice(0,50).map((item,index)=>{
      const raw=item&&typeof item==='object'?item:{text:item},text=String(raw.text??raw.title??'').trim().slice(0,180);
      if(!text)return null;
      const rawOrder=raw.order,rawDoneOrder=raw.completedOrder;
      return {id:String(raw.id||makeId()),text,completed:raw.completed===true||raw.done===true||raw.checked===true,order:rawOrder!==null&&rawOrder!==''&&Number.isFinite(Number(rawOrder))?Number(rawOrder):index,completedOrder:rawDoneOrder!==null&&rawDoneOrder!==''&&Number.isFinite(Number(rawDoneOrder))?Number(rawDoneOrder):null};
    }).filter(Boolean).sort((a,b)=>a.order-b.order);
    let doneOrder=0;
    return rows.map((item,index)=>{
      item.order=index;
      if(item.completed){if(item.completedOrder===null)item.completedOrder=doneOrder;doneOrder=Math.max(doneOrder,Number(item.completedOrder)+1);}
      else delete item.completedOrder;
      return item;
    });
  }

  function normalizeTask(value) {
    if (!value || typeof value !== 'object' || !String(value.title || '').trim()) return null;
    const legacyArea=value.area==='outros' ? 'outro' : (['vida','trabalho'].includes(value.area) ? value.area : 'vida');
    const storedTag=value.tagId || value.tag_id,id=String(value.id||makeId()),rawDate=value.executionDate||value.execution_date;
    const executionDate=isDateKey(rawDate)?String(rawDate):null;
    return {
      id, title:String(value.title).trim().slice(0,180),
      content:String(value.content ?? value.details ?? '').slice(0,20000),link:normalizeLink(value.link ?? value.link_url ?? ''),
      tagId:String(storedTag==='outros' ? 'outro' : (storedTag || legacyArea)),executionDate,subtasks:normalizeTaskSubtasks(value.subtasks),
      recurrence:normalizeRecurrence(value.recurrence,executionDate,id),
      sortOrder:Number.isFinite(Number(value.sortOrder ?? value.sort_order)) ? Number(value.sortOrder ?? value.sort_order) : 0,
      createdAt:String(value.createdAt || value.created_at || nowISO()), updatedAt:String(value.updatedAt || value.updated_at || value.createdAt || value.created_at || nowISO()),
      completedAt:value.completedAt || value.completed_at ? String(value.completedAt || value.completed_at) : null,
      deletedAt:value.deletedAt || value.deleted_at ? String(value.deletedAt || value.deleted_at) : null
    };
  }
  function bytesToBase64(value) {
    const bytes=value instanceof Uint8Array?value:new Uint8Array(value);let binary='';
    for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));
    return btoa(binary);
  }
  function base64ToBytes(value) { const binary=atob(String(value));return Uint8Array.from(binary,char=>char.charCodeAt(0)); }
  async function derivePrivateKey(password,salt) {
    if(!globalThis.crypto?.subtle)throw new Error('Este aparelho não oferece criptografia segura.');
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function encryptPrivateValue(key,value) {
    const iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(JSON.stringify(value));
    const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);
    return {iv:bytesToBase64(iv),ciphertext:bytesToBase64(encrypted)};
  }
  async function decryptPrivateValue(key,iv,ciphertext) {
    const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(iv)},key,base64ToBytes(ciphertext));
    return JSON.parse(new TextDecoder().decode(raw));
  }
  function normalizeUserSettings(value) {
    const source=value&&typeof value==='object'?value:{},times=Array.isArray(source.summaryTimes)?Array.from(new Set(source.summaryTimes.map(String).filter(time=>/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))):[],rawCycles=source.householdBillCycles&&typeof source.householdBillCycles==='object'&&!Array.isArray(source.householdBillCycles)?source.householdBillCycles:{},householdBillCycles={};
    for(const [month,states] of Object.entries(rawCycles)){
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!states||typeof states!=='object'||Array.isArray(states))continue;
      const normalized={};
      for(const [billId,state] of Object.entries(states)){
        if(!/^[a-z0-9-]{1,40}$/i.test(billId)||!state||typeof state!=='object')continue;
        const rawAmount=Number(state.deductedAmount),deductedAmount=Number.isFinite(rawAmount)?Math.max(0,Math.round(rawAmount*100)/100):0;
        normalized[billId]={paid:Boolean(state.paid),deductedAmount,paidAt:String(state.paidAt||'')};
      }
      householdBillCycles[month]=normalized;
    }
    const calendarIds=Array.isArray(source.calendarIds)?Array.from(new Set(source.calendarIds.map(String))):[];
    return {summaryTimes:times.sort(),calendarIds,calendarIdsConfigured:Boolean(source.calendarIdsConfigured||calendarIds.length),overdueTaskOrder:Array.isArray(source.overdueTaskOrder)?Array.from(new Set(source.overdueTaskOrder.map(String))):[],householdBillCycles,nickname:String(source.nickname||'Gio').trim().slice(0,32)||'Gio',timezone:'America/Sao_Paulo',updatedAt:String(source.updatedAt||source.updated_at||'1970-01-01T00:00:00.000Z')};
  }
  function normalizePrivateVault(value) {
    if(!value||typeof value!=='object'||!value.salt||!value.verifierIv||!value.verifierCiphertext)return null;
    return {salt:String(value.salt),verifierIv:String(value.verifierIv),verifierCiphertext:String(value.verifierCiphertext),ownerId:String(value.ownerId||value.owner_id||''),updatedAt:String(value.updatedAt||value.updated_at||'1970-01-01T00:00:00.000Z')};
  }
  function normalizePrivateRow(value) {
    if(!value||typeof value!=='object'||!value.id)return null;
    const deletedAt=value.deletedAt||value.deleted_at?String(value.deletedAt||value.deleted_at):null;
    if(!deletedAt&&(!value.iv||!value.ciphertext))return null;
    return {id:String(value.id),iv:String(value.iv||''),ciphertext:String(value.ciphertext||''),createdAt:String(value.createdAt||value.created_at||nowISO()),updatedAt:String(value.updatedAt||value.updated_at||value.createdAt||value.created_at||nowISO()),deletedAt};
  }
  function normalizeLog(value) {
    if(!value||typeof value!=='object')return null;
    const isLocked=Boolean(value.isLocked??value.is_locked),content=String(value.content??value.log_text??value.text??'').trim().slice(0,20000);
    if(!content&&!isLocked)return null;
    return {id:String(value.id||makeId()),content:isLocked?'':content,isLocked,tagId:String(value.tagId??value.tag_id??''),createdAt:String(value.createdAt||value.created_at||nowISO()),updatedAt:String(value.updatedAt||value.updated_at||value.createdAt||value.created_at||nowISO()),deletedAt:value.deletedAt||value.deleted_at?String(value.deletedAt||value.deleted_at):null};
  }
  function normalizeFinanceState(value) {
    const source=value&&typeof value==='object'?value:{};
    const balanceRaw=source.accountBalance??source.account_balance,cashboxRaw=source.cashboxAmount??source.cashbox_amount;
    const balanceNumber=balanceRaw===null||balanceRaw===undefined||balanceRaw===''?null:Number(balanceRaw),cashboxNumber=cashboxRaw===null||cashboxRaw===undefined||cashboxRaw===''?null:Number(cashboxRaw);
    return {accountBalance:Number.isFinite(balanceNumber)?Math.round(balanceNumber*100)/100:null,balanceUpdatedAt:String(source.balanceUpdatedAt||source.balance_updated_at||''),cashboxAmount:Number.isFinite(cashboxNumber)?Math.round(cashboxNumber*100)/100:null,cashboxUpdatedAt:String(source.cashboxUpdatedAt||source.cashbox_updated_at||''),updatedAt:String(source.updatedAt||source.updated_at||'1970-01-01T00:00:00.000Z')};
  }
  function normalizeFinanceEntry(value) {
    if(!value||typeof value!=='object'||!String(value.title||'').trim())return null;
    const rawDate=value.date||value.movementDate||value.movement_date,date=isDateKey(rawDate)?String(rawDate):null;
    const kind=['income','expense'].includes(String(value.kind||value.direction))?String(value.kind||value.direction):'';
    const rawAmount=Number(value.amount),amount=Math.round(rawAmount*100)/100;
    if(!date||!kind||!Number.isFinite(amount)||amount<=0)return null;
    const status=['planned','realized'].includes(String(value.status))?String(value.status):'planned';
    const rawRule=value.recurrence&&typeof value.recurrence==='object'?value.recurrence:null;
    let recurrence=null,seriesId=String(value.seriesId||value.series_id||rawRule?.seriesId||'');
    let occurrenceNumber=Number(value.occurrenceNumber??value.occurrence_number)||null;
    let installmentCount=Number(value.installmentCount??value.installment_count)||null;
    if(rawRule&&rawRule.frequency==='monthly'&&isDateKey(rawRule.anchorDate)){
      installmentCount=Number(rawRule.installmentCount??rawRule.installment_count??installmentCount)||null;
      if(installmentCount)installmentCount=Math.min(240,Math.max(1,Math.floor(installmentCount)));
      recurrence={frequency:'monthly',anchorDate:String(rawRule.anchorDate),installmentCount,seriesStopped:Boolean(rawRule.seriesStopped)};
      if(!seriesId)seriesId=String(rawRule.seriesId||value.id||'');
    }
    if(occurrenceNumber)occurrenceNumber=Math.max(1,Math.floor(occurrenceNumber));
    return {id:String(value.id||makeId()),title:String(value.title).trim().slice(0,180),kind,tagId:kind==='income'?FINANCE_ENTRY_TAG_ID:FINANCE_EXIT_TAG_ID,amount,date,status,recurrence,seriesId,occurrenceNumber,installmentCount,createdAt:String(value.createdAt||value.created_at||nowISO()),updatedAt:String(value.updatedAt||value.updated_at||value.createdAt||value.created_at||nowISO()),deletedAt:value.deletedAt||value.deleted_at?String(value.deletedAt||value.deleted_at):null};
  }
  function normalizeNote(value) {
    if (!value || typeof value !== 'object') return null;
    const title=String(value.title || '').trim().slice(0,140), content=String(value.content || '').slice(0,20000),links=normalizeLinks(value.links,value.link ?? value.link_url ?? ''),link=links[0]||'';
    if (!title && !content.trim()&&!links.length) return null;
    const rawTags=value.tagIds ?? value.tag_ids ?? [];
    return {
      id:String(value.id || makeId()), title, content,link,links,isPinned:Boolean(value.isPinned ?? value.is_pinned ?? false),
      tagIds:Array.isArray(rawTags)?Array.from(new Set(rawTags.map(String))):[],
      sortOrder:Number.isFinite(Number(value.sortOrder ?? value.sort_order)) ? Number(value.sortOrder ?? value.sort_order) : 0,
      createdAt:String(value.createdAt || value.created_at || nowISO()), updatedAt:String(value.updatedAt || value.updated_at || value.createdAt || value.created_at || nowISO()),
      deletedAt:value.deletedAt || value.deleted_at ? String(value.deletedAt || value.deleted_at) : null
    };
  }
  function saveTasks(schedule=true) {
    localStorage.setItem(TASKS_KEY,JSON.stringify(tasks));
    renderAll();
    if (schedule) scheduleSync();
  }
  function saveNotes(schedule=true) {
    localStorage.setItem(NOTES_KEY,JSON.stringify(notes));
    renderNotes();
    if (schedule) scheduleSync();
  }
  function saveLogs(schedule=true) {
    localStorage.setItem(LOGS_KEY,JSON.stringify(logs));
    renderLogs();
    if(schedule)scheduleSync();
  }
  function saveFinanceEntries(schedule=true) {
    finances=finances.map(normalizeFinanceEntry).filter(Boolean);
    localStorage.setItem(FINANCE_KEY,JSON.stringify(finances));createAutomaticBackup(false);renderFinancePage();
    if(schedule)scheduleSync();
  }
  function saveUserSettings(schedule=true) {
    userSettings=normalizeUserSettings({...userSettings,updatedAt:nowISO()});
    localStorage.setItem(USER_SETTINGS_KEY,JSON.stringify(userSettings));renderSummarySettings();
    if(schedule)scheduleSync();
  }
  function persistPrivateVault(schedule=true) {
    if(privateVault)localStorage.setItem(PRIVATE_VAULT_KEY,JSON.stringify(privateVault));
    else localStorage.removeItem(PRIVATE_VAULT_KEY);
    localStorage.setItem(PRIVATE_ROWS_KEY,JSON.stringify(privateCipherRows));
    if(schedule)scheduleSync();
  }
  function renderPrivateNotes() {
    const setup=$('privateSetupPanel'),unlock=$('privateUnlockPanel'),opened=$('privateUnlockedPanel'),list=$('privateNotesList');
    if(!setup||!unlock||!opened||!list)return;
    setup.hidden=Boolean(privateVault);unlock.hidden=!privateVault||privateNotesUnlocked;opened.hidden=!privateNotesUnlocked;
    if(!privateNotesUnlocked){list.innerHTML='';$('privateNoteForm').hidden=true;return;}
    const ordered=privateNotes.filter(note=>!note.deletedAt&&note.kind!=='log'&&hasSelectedTag(note.tagIds||[],'notes')).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
    list.innerHTML=ordered.length?ordered.map(note=>{const linksHtml=linksPreview(noteLinks(note)),tagIds=Array.isArray(note.tagIds)?note.tagIds:[],tagsHtml=tagIds.map(id=>tags.find(tag=>tag.id===id&&!tag.deletedAt)).filter(Boolean).map(tag=>`<span class="note-tag-pill" style="border-color:${escapeHTML(tag.color)}66;color:${escapeHTML(tag.color)}">${escapeHTML(tag.name)}</span>`).join('');return `<article class="private-note-card"><button class="private-note-open" type="button" data-private-edit="${escapeHTML(note.id)}"><h4>${escapeHTML(note.title||'Nota privada')}</h4><p>${formatNoteContent(note.content)}</p></button>${linksHtml?`<div class="note-links-preview">${linksHtml}</div>`:''}${tagsHtml?`<div class="note-tags-preview">${tagsHtml}</div>`:''}<div class="private-note-actions"><button type="button" data-private-duplicate="${escapeHTML(note.id)}">DUPLICAR</button><button type="button" data-private-delete="${escapeHTML(note.id)}">EXCLUIR</button></div></article>`;}).join(''):'<p class="empty">Nenhuma nota privada.</p>';
  }
  function renderNotesMode() {
    $('normalNotesView').hidden=privateNotesMode;$('privateNotesView').hidden=!privateNotesMode;
    $('regularNotesTab').setAttribute('aria-selected',String(!privateNotesMode));$('privateNotesTab').setAttribute('aria-selected',String(privateNotesMode));
    const addButton=$('notesDockAddBtn');if(addButton)addButton.textContent=privateNotesMode?'＋ NOTA PRIVADA':'＋ NOTA';
    renderPrivateNotes();
  }
  function setNotesMode(mode) {
    const wantPrivate=mode==='private';
    if(!wantPrivate&&pendingPrivateMoveId)pendingPrivateMoveId='';
    if(!wantPrivate&&privateNotesUnlocked&&privateNoteDirty){void lockPrivateNotes().then(ok=>{if(ok)setNotesMode('public');});return;}
    if(!wantPrivate&&privateNotesUnlocked)void lockPrivateNotes();
    privateNotesMode=wantPrivate;renderNotesMode();
  }
  function renderSummarySettings() {
    const list=$('summaryTimesList');if(!list)return;
    list.innerHTML=userSettings.summaryTimes.length?userSettings.summaryTimes.map(time=>`<span class="summary-time-chip">${escapeHTML(time)}<button type="button" data-remove-summary-time="${escapeHTML(time)}" aria-label="Remover horário ${escapeHTML(time)}">×</button></span>`).join(''):'<span class="muted">Resumo diário desativado.</span>';
    const nickname=$('summaryNickname');if(nickname&&nickname.value!==userSettings.nickname)nickname.value=userSettings.nickname;
  }
  function addSummaryTime() {
    const input=$('summaryTimeInput'),time=input.value;
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){showToast('Escolha um horário válido.');return;}
    if(userSettings.summaryTimes.includes(time)){showToast('Esse horário já está na lista.');return;}
    userSettings.summaryTimes=[...userSettings.summaryTimes,time].sort();saveUserSettings();showToast('Horário do resumo adicionado.');
  }
  function removeSummaryTime(time) {
    userSettings.summaryTimes=userSettings.summaryTimes.filter(item=>item!==time);saveUserSettings();showToast(userSettings.summaryTimes.length?'Horário removido.':'Resumo diário desativado.');
  }
  function renderSettings() { renderSummarySettings(); renderCalendarSyncUI(); }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function formatNoteContent(value) {
    return escapeHTML(value).replace(/\*\*([\s\S]+?)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/__([\s\S]+?)__/g,'<u>$1</u>');
  }
  function applyNoteFormat(fieldId,format) {
    const field=$(fieldId),markers={bold:['**','**'],italic:['*','*'],underline:['__','__']}[format];if(!field||!markers)return;
    const start=field.selectionStart??field.value.length,end=field.selectionEnd??start,selected=field.value.slice(start,end),content=selected||'texto';
    field.setRangeText(`${markers[0]}${content}${markers[1]}`,start,end,'select');field.setSelectionRange(start+markers[0].length,start+markers[0].length+content.length);field.focus();field.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function noteFormatShortcut(event) {
    if(!(event.ctrlKey||event.metaKey)||event.altKey)return '';
    return ({b:'bold',i:'italic',u:'underline'})[String(event.key||'').toLowerCase()]||'';
  }
  function isDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const [y,m,d]=String(value).split('-').map(Number);
    const date=new Date(y,m-1,d,12);
    return date.getFullYear()===y && date.getMonth()===m-1 && date.getDate()===d;
  }
  function dateAtNoon(key) {
    if (!isDateKey(key)) return null;
    const [y,m,d]=key.split('-').map(Number);
    return new Date(y,m-1,d,12,0,0,0);
  }
  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function todayKey() { return dateKey(new Date()); }
  function addDays(key,amount) {
    const date=dateAtNoon(key);
    if (!date) return todayKey();
    date.setDate(date.getDate()+Number(amount || 0));
    return dateKey(date);
  }
  function getIsoWeekday(key) { const day=(dateAtNoon(key)||new Date()).getDay();return day||7; }
  function dateOrdinal(key) { const [year,month,day]=String(key).split('-').map(Number);return Math.floor(Date.UTC(year,month-1,day)/86400000); }
  function recurrenceDateInMonth(monthIndex,day) {
    const year=Math.floor(monthIndex/12),month=((monthIndex%12)+12)%12,lastDay=new Date(year,month+1,0).getDate();
    return dateKey(new Date(year,month,Math.min(day,lastDay),12));
  }
  function nextRecurrenceDate(currentDate,recurrence) {
    const rule=normalizeRecurrence(recurrence,currentDate,recurrence?.seriesId);if(!rule||!isDateKey(currentDate))return null;
    const baseDate=currentDate>todayKey()?currentDate:todayKey();let next='';
    if(rule.frequency==='daily'){
      const delta=dateOrdinal(baseDate)-dateOrdinal(rule.anchorDate),steps=Math.max(0,Math.floor(delta/rule.interval)+1);
      next=addDays(rule.anchorDate,steps*rule.interval);if(next<=baseDate)next=addDays(next,rule.interval);
    }else if(rule.frequency==='weekly'){
      const anchorWeek=startOfWeek(rule.anchorDate),limit=rule.interval*7+7;
      for(let offset=1;offset<=limit;offset++){
        const candidate=addDays(baseDate,offset),weekDelta=(dateOrdinal(startOfWeek(candidate))-dateOrdinal(anchorWeek))/7;
        if(weekDelta>=0&&weekDelta%rule.interval===0&&rule.weekdays.includes(getIsoWeekday(candidate))){next=candidate;break;}
      }
    }else if(rule.frequency==='monthly'){
      const anchor=dateAtNoon(rule.anchorDate),base=dateAtNoon(baseDate),anchorMonth=anchor.getFullYear()*12+anchor.getMonth(),baseMonth=base.getFullYear()*12+base.getMonth();
      let step=Math.max(0,Math.floor((baseMonth-anchorMonth)/rule.interval)+1);next=recurrenceDateInMonth(anchorMonth+step*rule.interval,anchor.getDate());
      if(next<=baseDate)next=recurrenceDateInMonth(anchorMonth+(step+1)*rule.interval,anchor.getDate());
    }else if(rule.frequency==='yearly'){
      const anchor=dateAtNoon(rule.anchorDate),base=dateAtNoon(baseDate);let step=Math.max(0,Math.floor((base.getFullYear()-anchor.getFullYear())/rule.interval)+1);
      let year=anchor.getFullYear()+step*rule.interval;next=recurrenceDateInMonth(year*12+anchor.getMonth(),anchor.getDate());
      if(next<=baseDate){year+=rule.interval;next=recurrenceDateInMonth(year*12+anchor.getMonth(),anchor.getDate());}
    }
    return next&&(!rule.until||next<=rule.until)?next:null;
  }
  function startOfWeek(key) {
    const date=dateAtNoon(key) || new Date();
    const offset=(date.getDay()+6)%7;
    date.setDate(date.getDate()-offset);
    return dateKey(date);
  }
  function formatDate(key,options={weekday:'short',day:'2-digit',month:'2-digit'}) {
    const date=dateAtNoon(key);
    return date ? date.toLocaleDateString('pt-BR',options) : '';
  }
  function formatWeekRange(start) {
    const end=addDays(start,6);
    const a=dateAtNoon(start), b=dateAtNoon(end);
    if (!a || !b) return '';
    const sameMonth=a.getMonth()===b.getMonth() && a.getFullYear()===b.getFullYear();
    return sameMonth
      ? `${a.getDate()}–${b.getDate()} ${b.toLocaleDateString('pt-BR',{month:'short',year:'numeric'})}`
      : `${a.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} – ${b.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}`;
  }
  function setWeek(key) {
    weekStart=startOfWeek(key);
    localStorage.setItem(WEEK_KEY,weekStart);
    renderTasks();
  }
  function jumpToCurrentWeek() {
    setWeek(todayKey());
    setTimeout(()=>{const day=$('weekGrid').querySelector('.day-column.is-today');if(!day)return;day.classList.remove('today-flash');void day.offsetWidth;day.classList.add('today-flash');},300);
  }
  function checkWeekRollover() {
    const today=todayKey(), current=startOfWeek(today);
    if (today===observedToday&&current===observedCurrentWeek) return;
    observedToday=today; observedCurrentWeek=current;
    if (weekStart<current) {weekStart=current;localStorage.setItem(WEEK_KEY,weekStart);}
    renderAll();
  }
  function applyZoom() {
    const root=document.documentElement,viewportHeight=window.visualViewport?.height||root.clientHeight||window.innerHeight;
    root.style.setProperty('--app-zoom',String(zoomLevel));
    root.style.setProperty('--app-zoom-height',`${Math.ceil(viewportHeight/zoomLevel)}px`);
    document.querySelectorAll('[data-zoom-value]').forEach(node=>node.textContent=`${Math.round(zoomLevel*100)}%`);
  }
  function changeZoom(direction) {
    zoomLevel=Math.min(1.25,Math.max(.8,Math.round((zoomLevel+(direction==='in'?.05:-.05))*100)/100));
    localStorage.setItem(ZOOM_KEY,String(zoomLevel));applyZoom();
  }
  function showToast(message,duration=2600) {
    const node=$('toast');
    node.textContent=String(message || '');
    node.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>node.classList.add('hidden'),duration);
  }
  function updateNavIndicator(page=currentPage) {
    const indicator=$('navIndicator'),buttons=Array.from(document.querySelectorAll('.nav-btn[data-page]'));
    if(!indicator)return;
    const target=buttons.find(button=>button.dataset.page===page);
    if(!target){indicator.hidden=true;return;}
    indicator.hidden=false;indicator.style.left=`${target.offsetLeft}px`;indicator.style.width=`${target.offsetWidth}px`;indicator.style.transform='none';
  }
  function setPage(page) {
    if(page==='home')page='tasks';
    if(!['tasks','finance','notes','settings'].includes(page))return;
    const pageOrder=['tasks','notes','finance','settings'],previous=currentPage,oldIndex=pageOrder.indexOf(previous),newIndex=pageOrder.indexOf(page);
    if(page!=='notes'&&pendingPrivateMoveId)pendingPrivateMoveId='';
    pendingLogLockId='';pendingLogUnlockId='';
    if(page!=='notes'&&privateNotesUnlocked&&privateNoteDirty){void lockPrivateNotes().then(ok=>{if(ok)setPage(page);});return;}
    if(page!=='notes'&&privateNotesUnlocked)void lockPrivateNotes();
    if(page!==currentPage){persistPageFilters();filterTagIds=[...selectedPageTags(page)];}
    currentPage=page;localStorage.setItem(PAGE_KEY,page);document.body.dataset.page=page;
    document.querySelectorAll('.page').forEach(node=>{
      const active=node.id===`${page}Page`;node.classList.toggle('active',active);
      if(active&&previous!==page){node.style.setProperty('--page-shift',newIndex>=oldIndex?'14px':'-14px');node.classList.remove('page-enter');void node.offsetWidth;node.classList.add('page-enter');}
    });
    document.querySelectorAll('.nav-btn[data-page]').forEach(button=>{if(button.dataset.page===page)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
    updateNavIndicator(page);renderFilterButton();
    if(page==='home')renderHome();
    if(page==='tasks')renderTasks();
    if(page==='finance'){renderFinancePage();void refreshFinanceCloudData();}
    if(page==='notes'){renderNotes();renderNotesMode();}
    if(page==='settings'){updateAuthUI();renderSettings();}
  }
  function hasSelectedTag(tagIds,page=filterPageKey(currentPage)) { const selected=selectedPageTags(page);return !selected.length||tagIds.some(id=>selected.includes(id)); }
  function visibleTasks(page='tasks') { return tasks.filter(task=>!task.deletedAt&&hasSelectedTag([task.tagId],page)); }
  function visibleNotes(page='notes') { return notes.filter(note=>!note.deletedAt&&hasSelectedTag(note.tagIds||[],'notes')); }
  function openTasks(page='tasks') { return visibleTasks(page).filter(task=>!task.completedAt); }
  function taskOrder(a,b) {
    const dateDiff=String(a.executionDate || '9999-12-31').localeCompare(String(b.executionDate || '9999-12-31'));
    return dateDiff || Number(a.sortOrder||0)-Number(b.sortOrder||0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.title).localeCompare(String(b.title),'pt-BR');
  }
  function sortOverdueTasks(list) {
    const ranks=new Map(userSettings.overdueTaskOrder.map((id,index)=>[id,index]));
    return list.sort((a,b)=>{const ai=ranks.get(a.id),bi=ranks.get(b.id);if(ai!==undefined&&bi!==undefined)return ai-bi;if(ai!==undefined)return -1;if(bi!==undefined)return 1;return taskOrder(a,b);});
  }
  function noteOrder(a,b) { return Number(Boolean(b.isPinned))-Number(Boolean(a.isPinned)) || Number(a.sortOrder||0)-Number(b.sortOrder||0) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); }
  function addNoteTagToSelection(tagId) {
    const selected=Array.from($('noteTagChoices').querySelectorAll('input:checked')).map(input=>input.value);
    if(!selected.includes(tagId))selected.push(tagId);
    renderNoteTagChoices(selected);
  }
  function createNoteTag() {
    const input=$('noteNewTagName'),raw=input.value.trim().replace(/\s+/g,' ');
    if(!raw){$('noteTagMessage').textContent='Digite o nome da tag.';input.focus();return;}
    const name=raw.normalize('NFKC').toLocaleUpperCase('pt-BR').slice(0,32);
    let tag=tags.find(item=>!item.deletedAt&&item.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));
    const existed=Boolean(tag);
    if(!tag){const now=nowISO();tag={id:makeId(),name,color:randomTagColor(),createdAt:now,updatedAt:now,deletedAt:null};tags.push(tag);saveTags();}
    addNoteTagToSelection(tag.id);input.value='';$('noteTagMessage').textContent=existed?`A tag ${tag.name} já existia e foi selecionada.`:`Tag ${tag.name} criada e selecionada.`;
  }
  function nextTaskOrder(date) { return Math.max(-1,...tasks.filter(item=>!item.deletedAt&&!item.completedAt&&(item.executionDate||'')===(date||'')).map(item=>Number(item.sortOrder)||0))+1; }
  function updateTaskRecurrenceUI(prefillWeekly=false) {
    const frequency=$('taskRecurrence').value,options=$('recurrenceOptions'),weeklyField=$('recurrenceWeekdaysField');
    options.hidden=!frequency;weeklyField.hidden=frequency!=='weekly';
    $('recurrenceUnit').textContent=({daily:'dia(s)',weekly:'semana(s)',monthly:'mês(es)',yearly:'ano(s)'})[frequency]||'';
    if(prefillWeekly&&frequency==='weekly'){
      const boxes=Array.from(document.querySelectorAll('[name="recurrenceWeekday"]'));
      if(!boxes.some(box=>box.checked)){const date=$('executionDate').value||todayKey(),weekday=getIsoWeekday(date),selected=boxes.find(box=>Number(box.value)===weekday);if(selected)selected.checked=true;}
    }
  }
  function recurrenceFromTaskForm(existing,savedId,date) {
    const frequency=$('taskRecurrence').value;if(!frequency)return {value:null,error:''};
    if(!date)return {value:null,error:'Escolha a primeira data de execução para uma tarefa recorrente.'};
    const interval=Number($('recurrenceInterval').value),until=$('recurrenceUntil').value||null;
    if(!Number.isInteger(interval)||interval<1||interval>999)return {value:null,error:'O intervalo precisa ser um número entre 1 e 999.'};
    if(until&&(!isDateKey(until)||until<date))return {value:null,error:'A data final precisa ser igual ou posterior à primeira ocorrência.'};
    const weekdays=Array.from(document.querySelectorAll('[name="recurrenceWeekday"]:checked')).map(box=>Number(box.value));
    if(frequency==='weekly'&&!weekdays.length)return {value:null,error:'Selecione ao menos um dia da semana.'};
    const previous=existing?.recurrence,anchorDate=previous?.frequency===frequency&&isDateKey(previous.anchorDate)?previous.anchorDate:date;
    return {value:normalizeRecurrence({frequency,interval,weekdays,anchorDate,until,seriesId:previous?.seriesId||existing?.id||savedId},date,savedId),error:''};
  }

  function tagDot(tagId) {
    const tag=getTag(tagId);
    return `<span class="tag-dot" style="--tag-color:${tag.color}" aria-hidden="true"></span>`;
  }
  function completionLabel(task) {
    const date=new Date(task.completedAt || '');
    if (!Number.isFinite(date.getTime())) return '';
    const today=new Date(), startToday=new Date(today.getFullYear(),today.getMonth(),today.getDate()), startDone=new Date(date.getFullYear(),date.getMonth(),date.getDate());
    const days=Math.max(0,Math.floor((startToday-startDone)/86400000));
    const time=date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    return `Concluída às ${time} · ${days===0?'hoje · há 0 dias':days===1?'há 1 dia':`há ${days} dias`}`;
  }
  function taskMenu(task,canMove=true) {
    const id=escapeHTML(task.id), move=canMove&&!task.completedAt,completionAction=task.completedAt?'false':'true',completionLabel=task.completedAt?'REABRIR':'CONCLUIR';
    return `<details class="task-menu"><summary aria-label="Mais ações para ${escapeHTML(task.title)}" title="Mais ações">⋮</summary><div class="task-menu-popover"><button class="menu-action menu-edit" type="button" data-edit-task="${id}">EDITAR</button><button class="menu-action" type="button" data-toggle-complete-task="${id}" data-complete="${completionAction}">${completionLabel}</button>${move?`<button class="menu-action menu-move" type="button" data-move-task="${id}" data-direction="up">↑ SUBIR</button><button class="menu-action menu-move" type="button" data-move-task="${id}" data-direction="down">↓ DESCER</button>`:''}<button class="menu-action menu-delete" type="button" data-delete-task="${id}">EXCLUIR</button></div></details>`;
  }
  function taskCard(task,options={}) {
    const complete=Boolean(task.completedAt), late=!complete&&(options.late ?? Boolean(task.executionDate&&task.executionDate<todayKey())), draggable=!complete&&options.draggable!==false;
    const classes=['task-card',complete?'completed':'',late?'is-late':'',options.compact?'task-card--compact':'',options.tile?'task-card--tile':'',options.linked?'is-linked':''].filter(Boolean).join(' ');
    const linked=options.linked?'task-link':'';
    const tag=getTag(task.tagId),taskTag=tagDot(task.tagId),taskHandle=draggable?`<button class="task-touch-handle" type="button" data-touch-drag-task="${escapeHTML(task.id)}" style="--tag-color:${escapeHTML(tag.color)}" aria-label="Arrastar ${escapeHTML(task.title)}"><span class="drag-grip" aria-hidden="true">⠿</span></button>`:'';
    return `<article class="${classes}" draggable="${draggable?'true':'false'}" data-task-id="${escapeHTML(task.id)}" aria-label="${escapeHTML(task.title)}${task.recurrence?' · Tarefa recorrente':''}">
      <div class="task-main"><div class="task-title-row">${taskTag}${task.recurrence?'<span class="task-recurrence-icon" aria-label="Tarefa recorrente" title="Recorrente">↻</span>':''}<button class="task-open task-title ${linked}" type="button" data-edit-task="${escapeHTML(task.id)}">${escapeHTML(task.title)}</button></div>${complete?`<span class="task-completion-meta">${escapeHTML(completionLabel(task))}</span>`:''}</div>
      <div class="task-actions">${taskMenu(task,options.canMove!==false)}${taskHandle}</div>
    </article>`;
  }
  function renderFilterButton() {
    const names=filterTagIds.map(id=>getTag(id).name),summary=names.length?names.join(' + '):'TODAS',active=names.length>0;
    for(const node of document.querySelectorAll('[data-active-filter-summary]'))node.textContent=summary;
    for(const button of document.querySelectorAll('[data-filter-open]'))button.setAttribute('aria-label',active?`Filtro desta página: ${names.join(' e ')}`:'Filtro desta página; todas as tags');
    const button=$('headerFilterBtn'),tagsButton=$('headerTagsBtn'),hideTagActions=currentPage==='settings'||currentPage==='finance';
    if(button){button.textContent=active?`FILTRO · ${names.length}`:'FILTRO';button.setAttribute('aria-pressed',String(active));button.hidden=hideTagActions;}
    if(tagsButton)tagsButton.hidden=hideTagActions;
  }
  function renderTaskTagOptions(selectedId='') {
    const active=tags.filter(tag=>!tag.deletedAt);
    $('taskTag').innerHTML=active.map(tag=>`<option value="${escapeHTML(tag.id)}">${escapeHTML(tag.name)}</option>`).join('');
    const remembered=tags.find(tag=>tag.id===localStorage.getItem(LAST_TAG_KEY) && !tag.deletedAt)?.id;
    const fallback=active.find(tag=>filterTagIds.includes(tag.id))?.id || remembered || active[0]?.id || 'vida';
    $('taskTag').value=active.some(tag=>tag.id===selectedId) ? selectedId : fallback;
  }
  function renderFilterTagList() {
    const options=[{id:'',name:'TODAS',color:null},...tags.filter(tag=>!tag.deletedAt)];
    $('filterTagList').innerHTML=options.map(tag=>`<button class="filter-tag-option" type="button" data-filter-tag="${escapeHTML(tag.id)}" aria-pressed="${String(tag.id ? filterTagIds.includes(tag.id) : !filterTagIds.length)}">${tag.color?tagDot(tag.id):'<span class="tag-dot" aria-hidden="true" style="background:#aab4c8"></span>'}<span>${escapeHTML(tag.name)}</span></button>`).join('');
  }
  function setTagFilter(tagId,toggle=true) {
    if (!tagId) filterTagIds=[];
    else if (tags.some(tag=>tag.id===tagId && !tag.deletedAt)) {
      if (!toggle) filterTagIds=[tagId];
      else filterTagIds=filterTagIds.includes(tagId)?filterTagIds.filter(id=>id!==tagId):[...filterTagIds,tagId];
    }
    persistPageFilters();renderFilterButton();renderAll();renderFilterTagList();
  }
  function pushDialogHistory(dialog) {
    const previousState=history.state&&typeof history.state==='object'?history.state:{};
    const token=makeId();
    history.pushState({...previousState,tnmDialogToken:token},'',location.href);
    dialog.dataset.historyToken=token;
  }
  function showAppDialog(dialog,reuseHistoryToken='') {
    if(!dialog||dialog.open)return;
    if(reuseHistoryToken)dialog.dataset.historyToken=reuseHistoryToken;else pushDialogHistory(dialog);
    dialog.showModal();
  }
  function handleDialogBack(dialog) {
    if(!dialog?.open)return;
    closeFloatingActionMenu();
    if(dialog.id==='taskDialog'){closeTaskDialogSafely();return;}
    if(dialog.id==='noteDialog'){closeNoteDialogSafely();return;}
    if(dialog.id==='financeDialog'){
      if(financeDialogDirty){const saved=saveFinanceFromForm({preventDefault(){}});if(!saved&&dialog.open)return;}
      if(dialog.open)dialog.close();
      return;
    }
    dialog.close();
  }
  function syncViewModeSwitch() {
    document.body.dataset.viewMode=viewMode;document.body.classList.toggle('view-mobile',viewMode==='mobile');
    $('viewModePcBtn')?.setAttribute('aria-pressed',String(viewMode==='pc'));
    $('viewModeMobileBtn')?.setAttribute('aria-pressed',String(viewMode==='mobile'));
  }
  function setViewMode(mode) {
    if(!['pc','mobile'].includes(mode)||mode===viewMode)return;
    viewMode=mode;localStorage.setItem(VIEW_MODE_KEY,viewMode);syncViewModeSwitch();
    if(currentPage==='home'){setPage('tasks');return;}
    updateNavIndicator(currentPage);if(currentPage==='tasks')renderTasks();
  }
  function syncFullscreenButton() {
    const button=$('fullscreenToggleBtn');if(!button)return;
    document.body.classList.toggle('tnm-fullscreen-mode',appFullscreenMode);
    button.setAttribute('aria-pressed',String(appFullscreenMode));
    button.setAttribute('aria-label',appFullscreenMode?'Sair da tela cheia':'Ativar tela cheia');
    button.title=appFullscreenMode?'Sair da tela cheia':'Tela cheia';
    button.textContent=appFullscreenMode?'⤢':'⛶';
  }
  function toggleAppFullscreen() {
    appFullscreenMode=!appFullscreenMode;
    syncFullscreenButton();
  }
  function openFilterDialog() {
    $('tagMessage').textContent=''; $('newTagName').value='';
    renderFilterTagList(); showAppDialog($('filterDialog'));
  }
  function hslToHex(h,s=74,l=62) {
    s/=100; l/=100;
    const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2;
    let r=0,g=0,b=0;
    if (h<60) [r,g,b]=[c,x,0]; else if (h<120) [r,g,b]=[x,c,0]; else if (h<180) [r,g,b]=[0,c,x]; else if (h<240) [r,g,b]=[0,x,c]; else if (h<300) [r,g,b]=[x,0,c]; else [r,g,b]=[c,0,x];
    const hex=value=>Math.round((value+m)*255).toString(16).padStart(2,'0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  function randomTagColor() {
    const used=new Set(tags.map(tag=>String(tag.color).toLowerCase()));
    const start=Math.random()*360;
    for (let i=0;i<360;i++) { const color=hslToHex((start+i*137.508)%360); if (!used.has(color)) return color; }
    return '#a876e8';
  }
  function createTag(event) {
    event.preventDefault();
    const raw=$('newTagName').value.trim().replace(/\s+/g,' ');
    if (!raw) return;
    const name=raw.normalize('NFKC').toLocaleUpperCase('pt-BR').slice(0,32);
    const existing=tags.find(tag=>!tag.deletedAt && tag.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));
    if (existing) {
      setTagFilter(existing.id,false); $('tagMessage').textContent='Essa tag já existe; selecionei a existente.'; return;
    }
    const now=nowISO(), tag={id:makeId(),name,color:randomTagColor(),createdAt:now,updatedAt:now,deletedAt:null};
    tags.push(tag); setTagFilter(tag.id,false); saveTags(); renderFilterTagList(); $('newTagName').value=''; $('tagMessage').textContent=`Tag ${tag.name} criada com cor automática.`;
  }
  function renderTagManager() {
    const list=$('tagManagerList');if(!list)return;
    const active=tags.filter(tag=>!tag.deletedAt).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    list.innerHTML=active.length?active.map(tag=>`<form class="tag-manager-row" data-edit-tag="${escapeHTML(tag.id)}"><input type="color" name="color" value="${escapeHTML(tag.color)}" aria-label="Cor da tag ${escapeHTML(tag.name)}"><input type="text" name="name" maxlength="32" value="${escapeHTML(tag.name)}" aria-label="Nome da tag ${escapeHTML(tag.name)}" ${tag.id===FINANCE_ENTRY_TAG_ID||tag.id===FINANCE_EXIT_TAG_ID?'readonly':''} required><button class="btn small" type="submit">SALVAR</button></form>`).join(''):'<p class="empty">Nenhuma tag cadastrada.</p>';
  }
  function openTagManager(logId='') {
    pendingLogAddTagId=String(logId||'');$('tagManagerStatus').textContent='';$('managedTagName').value='';$('managedTagColor').value=randomTagColor();renderTagManager();showAppDialog($('tagManagerDialog'));
  }
  function addManagedTag(event) {
    event.preventDefault();const raw=$('managedTagName').value.trim().replace(/\s+/g,' ');if(!raw)return;
    const name=raw.normalize('NFKC').toLocaleUpperCase('pt-BR').slice(0,32),existing=tags.find(tag=>!tag.deletedAt&&tag.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));
    if(existing){const pending=logs.find(log=>log.id===pendingLogAddTagId&&!log.deletedAt);if(pending){pending.tagId=existing.id;pending.updatedAt=nowISO();pendingLogAddTagId='';saveLogs();}$('tagManagerStatus').textContent='Essa tag já existe.';return;}
    const now=nowISO(),tag={id:makeId(),name,color:validTagColor($('managedTagColor').value)?$('managedTagColor').value:randomTagColor(),createdAt:now,updatedAt:now,deletedAt:null};tags.push(tag);
    const pending=logs.find(log=>log.id===pendingLogAddTagId&&!log.deletedAt);if(pending){pending.tagId=tag.id;pending.updatedAt=now;pendingLogAddTagId='';}
    saveTags();if(pending)saveLogs(false);$('managedTagName').value='';$('managedTagColor').value=randomTagColor();$('tagManagerStatus').textContent=pending?'Tag criada e vinculada ao log.':`Tag ${tag.name} criada.`;renderTagManager();
  }
  function saveManagedTag(event) {
    event.preventDefault();const form=event.target.closest('form[data-edit-tag]');if(!form)return;const tag=tags.find(item=>item.id===form.dataset.editTag&&!item.deletedAt);if(!tag)return;
    const nameInput=form.querySelector('[name="name"]'),colorInput=form.querySelector('[name="color"]'),raw=nameInput.value.trim().replace(/\s+/g,' '),name=raw.normalize('NFKC').toLocaleUpperCase('pt-BR').slice(0,32),color=colorInput.value;
    if(!name){$('tagManagerStatus').textContent='Digite um nome para a tag.';return;}
    const duplicate=tags.find(item=>item.id!==tag.id&&!item.deletedAt&&item.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));
    if(duplicate){$('tagManagerStatus').textContent='Já existe outra tag com esse nome.';return;}
    tag.name=name;if(validTagColor(color))tag.color=color;tag.updatedAt=nowISO();saveTags();renderTagManager();$('tagManagerStatus').textContent=`Tag ${tag.name} atualizada.`;
  }
  function renderTasks() {
    const all=visibleTasks('tasks'), open=all.filter(task=>!task.completedAt), currentWeek=startOfWeek(todayKey());
    const overdue=weekStart>=currentWeek?sortOverdueTasks(open.filter(task=>task.executionDate&&task.executionDate<currentWeek)):[];
    $('weekLabel').textContent=formatWeekRange(weekStart);$('todayBtn').textContent=viewMode==='mobile'?'ATUAL':'SEMANA ATUAL';
    const cells=[{kind:'overdue',title:'ATRASADO',date:'',tasks:overdue}];
    for (let i=0;i<7;i++) {
      const date=addDays(weekStart,i);
      cells.push({kind:'day',title:DAY_LABELS[i],date,tasks:open.filter(task=>task.executionDate===date).sort(taskOrder),calendarEvents:getCalendarEventsForDate(date)});
    }
    $('weekGrid').innerHTML=cells.map(cell=>{
      const dayKey=cell.kind==='overdue'?'overdue':cell.date;
      const completed=all.filter(task=>task.completedAt&&(cell.kind==='overdue'?weekStart>=currentWeek&&task.executionDate&&task.executionDate<currentWeek:task.executionDate===cell.date));
      const label=cell.kind==='overdue'?'ATRASADO':cell.title, dateText=cell.date?formatDate(cell.date,{day:'2-digit',month:'2-digit'}):'';
      const shownTasks=viewMode==='mobile'?cell.tasks.slice(0,3):cell.tasks;
      const extraTaskCount=Math.max(0,cell.tasks.length-shownTasks.length);
      const cards=shownTasks.map(task=>taskCard(task,{compact:true,late:Boolean(task.executionDate&&task.executionDate<todayKey()),linked:cell.kind==='overdue',draggable:true})).join('');
      const calendarEvents=cell.calendarEvents||[],eventLines=calendarEvents.map(event=>{const time=calendarEventTimeLabel(event);return `<div class="planner-calendar-event">📅${time?` ${escapeHTML(time)} ·`:''} ${escapeHTML(event.title)}</div>`;}).join('');
      const calendarBlock=eventLines?`<div class="planner-calendar-events" aria-label="Eventos do Google Calendar">${eventLines}</div><div class="planner-calendar-task-divider" role="separator" aria-label="Tarefas"></div>`:'';
      const empty=cell.kind==='overdue'?'Nada atrasado':'Sem tarefas';
      const extraParts=[];if(extraTaskCount>0)extraParts.push(`+${extraTaskCount} tarefas`);if(completed.length)extraParts.push(`${completed.length} concluídas`);const extra=extraParts.join(' • ');
      return `<section class="day-column${cell.date===todayKey()?' is-today':''}" data-kind="${cell.kind}"${cell.date?` data-date="${cell.date}"`:''} aria-label="${label}${dateText?` ${dateText}`:''}"><div class="day-head-row"><button class="day-heading-button" type="button" data-open-day="${dayKey}" aria-label="Abrir ${label}${dateText?` ${dateText}`:''}"><strong>${label}</strong>${dateText?`<time>${dateText}</time>`:''}<span class="day-count">${cell.tasks.length}</span></button>${cell.date?`<button class="icon-btn day-add" type="button" data-add-date="${cell.date}" aria-label="Nova tarefa em ${cell.title} ${dateText}">＋</button>`:''}</div><div class="day-task-list" data-day-drop="${cell.date||''}">${calendarBlock}${cards||`<div class="day-empty">${empty}</div>`}</div>${extra?(viewMode==='mobile'?`<button class="day-extra-count" type="button" data-open-day="${escapeHTML(dayKey)}" aria-label="Abrir todas as tarefas de ${escapeHTML(label)}">${escapeHTML(extra)}</button>`:`<div class="day-extra-count">${escapeHTML(extra)}</div>`):''}</section>`;
    }).join('');
    const unplanned=open.filter(task=>!task.executionDate).sort(taskOrder), completed=all.filter(task=>Boolean(task.completedAt)).sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt)));
    $('unplannedCount').textContent=String(unplanned.length); $('completedCount').textContent=String(completed.length);
    renderPlannerPanels(); renderPlannerUpcomingIncome(); renderFilterButton(); renderDialogLists();
  }
  function renderPlannerPanels() {
    const planning=visibleTasks('tasks').filter(task=>!task.completedAt&&!task.executionDate).sort(taskOrder);
    const completed=visibleTasks('tasks').filter(task=>task.completedAt).sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt)));
    $('planningPanel').hidden=expandedSection!=='planning'; $('completedPanel').hidden=expandedSection!=='completed';
    $('planningBtn').setAttribute('aria-expanded',String(expandedSection==='planning'));
    $('completedBtn').setAttribute('aria-expanded',String(expandedSection==='completed'));
    $('planningList').innerHTML=planning.slice(0,planningVisibleLimit).map(task=>taskCard(task,{tile:true})).join('')||'<div class="empty">Sem tarefas para planejar.</div>';
    $('completedList').innerHTML=completed.slice(0,completedVisibleLimit).map(task=>taskCard(task,{tile:true,canMove:false})).join('')||'<div class="empty">Nenhuma tarefa concluída.</div>';
    $('planningMoreBtn').hidden=planning.length<=planningVisibleLimit; $('completedMoreBtn').hidden=completed.length<=completedVisibleLimit;
    document.body.classList.toggle('planner-expanded',Boolean(expandedSection));
  }
  function renderPlannerUpcomingIncome() {
    const list=$('plannerUpcomingIncomeList');if(!list)return;
    const {items}=collectUpcomingFinanceIncome();
    list.innerHTML=items.length?items.map(entry=>{
      const id=escapeHTML(entry.id),date=dateAtNoon(entry.date),dateLabel=date?date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):entry.date;
      return `<button class="planner-income-row" type="button" data-finance-open="${id}" aria-label="Ver detalhes de ${escapeHTML(entry.title)}"><time>${escapeHTML(dateLabel)}</time><span class="planner-income-name">${escapeHTML(entry.title)}</span><strong>+ ${escapeHTML(financeMoney(entry.amount))}</strong></button>`;
    }).join(''):'<p class="planner-income-empty">Nenhum recebimento previsto nos próximos 30 dias.</p>';
  }
  function togglePlannerSection(section,forceOpen=false) {
    if (forceOpen) expandedSection=section;
    else expandedSection=expandedSection===section?'':section;
    if (expandedSection==='planning') planningVisibleLimit=6;
    if (expandedSection==='completed') completedVisibleLimit=6;
    renderTasks();
  }
  function renderAll() { renderTasks(); renderHome(); renderNotes(); renderLogs(); renderFinancePage(); renderNotesMode(); }
  function homeDateLabel(date) {
    const text=formatDate(date).replace(/\./g,'');
    const title=text.charAt(0).toLocaleUpperCase('pt-BR')+text.slice(1);
    if(date===todayKey())return `HOJE - ${title}`;
    if(date===addDays(todayKey(),1))return `AMANHÃ - ${title}`;
    return title;
  }
  function renderHomeTaskList(id,list) {
    const node=$(id);
    node.innerHTML=list.length?list.map(task=>{const tag=getTag(task.tagId),late=task.executionDate<todayKey();return `<article class="home-task-row${late?' is-late':''}"><div class="home-task-main"><span class="home-item-date">${escapeHTML(homeDateLabel(task.executionDate))}</span><button class="home-item-open" type="button" data-edit-task="${escapeHTML(task.id)}">${task.recurrence?'<span class="task-recurrence-icon" aria-label="Tarefa recorrente" title="Recorrente">↻</span> ':''}${escapeHTML(task.title)}</button><span class="home-tag-pill" style="--tag-color:${escapeHTML(tag.color)}">${escapeHTML(tag.name)}</span></div></article>`;}).join(''):'<div class="empty">Sem tarefas.</div>';
  }
  function renderHomeEvents() {
    const node=$('homeUpcomingEventsList');if(!node)return;
    const events=getUpcomingCalendarEvents();
    node.innerHTML=events.length?events.map(event=>{
      const date=event.allDay?dateAtNoon(event.startAt):new Date(event.startAt);
      const day=date?.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'}).replace(/\./g,'')||'';
      const when=event.allDay?'Dia todo':date?.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})||'';
      return `<article class="home-event-row"><div class="home-event-main"><span class="home-item-date">${escapeHTML(day)}${when?` · ${escapeHTML(when)}`:''}</span><div class="home-event-title">${escapeHTML(event.title)}</div>${event.location?`<span class="home-event-location">${escapeHTML(event.location)}</span>`:''}</div>${event.url?`<a class="home-event-link" href="${escapeHTML(event.url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir evento">↗</a>`:''}</article>`;
    }).join(''):'<div class="empty">Nenhum evento próximo.</div>';
  }
  function renderHome() {
    const open=visibleTasks('home').filter(task=>!task.completedAt),today=todayKey(),tomorrow=addDays(today,1);
    const overdue=open.filter(task=>task.executionDate&&task.executionDate<today).sort(taskOrder);
    const todayTasks=open.filter(task=>task.executionDate===today).sort(taskOrder);
    const tomorrowTasks=open.filter(task=>task.executionDate===tomorrow).sort(taskOrder);
    const unplanned=open.filter(task=>!task.executionDate);
    $('homeOverdueCount').textContent=String(overdue.length); $('homeTodayCount').textContent=String(todayTasks.length); $('homeUnplannedCount').textContent=String(unplanned.length);
    renderHomeEvents();renderHomeTaskList('homeOverdueList',overdue);renderHomeTaskList('homeTodayList',todayTasks);renderHomeTaskList('homeTomorrowList',tomorrowTasks);
  }
  function logTimestampLabel(createdAt,content='') {
    const date=new Date(createdAt);if(!Number.isFinite(date.getTime()))return '';
    const minutes=Math.max(0,Math.floor((Date.now()-date.getTime())/60000)),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),mins=minutes%60;
    const duration=`${days}d.${hours}h.${mins}m`,today=todayKey(),yesterday=addDays(today,-1),key=dateKey(date);
    const relative=key===today?'Hoje/':key===yesterday?'Ontem/':'';
    const weekday=date.toLocaleDateString('pt-BR',{weekday:'short'}).replace(/\./g,'');
    const weekdayTitle=weekday.charAt(0).toLocaleUpperCase('pt-BR')+weekday.slice(1);
    const time=date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const shortDate=date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'});
    return `🕑[${duration}] ${content} ➡️ ${time} - ${relative}${weekdayTitle}, ${shortDate}`;
  }
  function renderLogTagOptions(selected='') {
    const options=`<option value="">SEM TAG</option>${tags.filter(tag=>!tag.deletedAt).map(tag=>`<option value="${escapeHTML(tag.id)}" ${tag.id===selected?'selected':''}>${escapeHTML(tag.name)}</option>`).join('')}`;
    const input=$('logTagSelect');if(input)input.innerHTML=options;
    return options;
  }
  function renderLogs() {
    const list=$('logsList');if(!list)return;
    renderLogTagOptions($('logTagSelect')?.value||'');
    const cutoff=logRange==='all'?0:Date.now()-({ '7d':7,'30d':30,'12w':84 }[logRange]||7)*86400000;
    const selected=selectedPageTags('log'),visible=logs.filter(log=>!log.deletedAt&&Date.parse(log.createdAt)>=cutoff&&(!selected.length||selected.includes(log.tagId))).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
    document.querySelectorAll('[data-log-range]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.logRange===logRange)));
    list.innerHTML=visible.length?visible.map(log=>{
      const logId=String(log.id),id=escapeHTML(logId),tag=tags.find(item=>item.id===log.tagId&&!item.deletedAt),opened=Boolean(log.isLocked&&unlockedLogIds.has(logId)),privateLog=opened?getDecryptedPrivateLog(logId):null;
      const content=log.isLocked?(privateLog?String(privateLog.content??''):'🔒 Registro trancado'):log.content,date=new Date(log.createdAt),validDate=Number.isFinite(date.getTime());
      const day=validDate?date.toLocaleDateString('pt-BR',{day:'2-digit'}):'--',month=validDate?date.toLocaleDateString('pt-BR',{month:'short'}).replace(/\./g,''):'',year=validDate?date.toLocaleDateString('pt-BR',{year:'2-digit'}):'';
      const meta=logTimestampLabel(log.createdAt,'').replace(/\s+➡️\s+/,' · '),tagBadge=tag?`<span class="log-tag-pill" style="--tag-color:${escapeHTML(tag.color)}">${escapeHTML(tag.name)}</span>`:'<span class="log-tag-pill log-no-tag">SEM TAG</span>';
      const lockAction=!log.isLocked?'lock':opened?'hide':'unlock',lockLabel=lockAction==='unlock'?'DESTRANCAR 🔒':'TRANCAR 🔒';
      const tagOptions=`<option value="">SEM TAG</option>${tags.filter(item=>!item.deletedAt).map(item=>`<option value="${escapeHTML(item.id)}" ${item.id===log.tagId?'selected':''}>${escapeHTML(item.name)}</option>`).join('')}`;
      return `<article class="log-entry" data-log-id="${id}"><time class="log-date" datetime="${escapeHTML(log.createdAt)}"><strong>${day}</strong><span>${escapeHTML(month)}</span><small>${year}</small></time><div class="log-axis" style="--log-dot:${escapeHTML(tag?.color||'#73d6a2')}" aria-hidden="true"><span class="log-dot"></span></div><div class="log-card"><div class="log-card-header">${tagBadge}<span class="log-time-meta">${escapeHTML(meta)}</span></div><p class="log-content">${escapeHTML(content)}</p><div class="log-entry-footer"><div class="log-entry-actions"><button class="log-action" type="button" data-log-action="tag" aria-label="Adicionar ou alterar tag do log">＋TAG</button><select class="log-tag-select" data-log-tag-select="${id}" aria-label="Tag deste log" hidden>${tagOptions}</select><button class="log-action log-add-tag" type="button" data-log-action="add-tag" data-log-id="${id}" hidden>＋ ADC</button><button class="log-action" type="button" data-log-action="${lockAction}" data-log-id="${id}">${lockLabel}</button><button class="log-action log-action-delete" type="button" data-log-action="delete" data-log-id="${id}">EXCLUIR</button></div></div></div></article>`;
    }).join(''):'<p class="empty">Nenhum registro neste período.</p>';
  }
  function saveLogFromForm(event) {
    event.preventDefault();const content=$('logText').value.trim();if(!content)return;
    const tagId=$('logTagSelect').value,now=nowISO();logs.unshift({id:makeId(),content,tagId,isLocked:false,createdAt:now,updatedAt:now,deletedAt:null});
    $('logText').value='';$('logTagSelect').value='';saveLogs();showToast('Registro salvo.');
  }
  function setLogRange(range) {
    if(!['7d','30d','12w','all'].includes(range))return;
    logRange=range;localStorage.setItem(LOG_RANGE_KEY,range);renderLogs();
  }
  function financeMoney(amount) { return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(amount)||0); }
  function getDailyAllowanceEndDate() {
    const today=dateAtNoon(todayKey());if(!today)return '';
    const target=new Date(today.getFullYear(),today.getMonth(),5,12);if(today.getDate()>5)target.setMonth(target.getMonth()+1);
    return dateKey(target);
  }
  const HOUSEHOLD_BILLS=[{id:'fut-terca',title:'Fut terça',day:7,amount:110},{id:'aluguel',title:'Aluguel',day:9,amount:583},{id:'s24',title:'Parcela S24 — pai',day:10,amount:207,knownUntil:'2027-07-10'},{id:'internet',title:'Internet',day:15,amount:50},{id:'energia',title:'Energia',day:18,amount:250},{id:'mei',title:'MEI',day:20,amount:87},{id:'condominio',title:'Condomínio',day:27,amount:180}];
  function householdBillCycleKey() { return todayKey().slice(0,7); }
  function currentHouseholdBillStates() { return userSettings.householdBillCycles?.[householdBillCycleKey()]||{}; }
  function saveHouseholdBillState(billId,state) {
    const month=householdBillCycleKey(),cycles=userSettings.householdBillCycles||{},current=cycles[month]||{};
    userSettings.householdBillCycles={...cycles,[month]:{...current,[billId]:{paid:Boolean(state.paid),deductedAmount:Math.max(0,Math.round((Number(state.deductedAmount)||0)*100)/100),paidAt:String(state.paidAt||'')}}};saveUserSettings();
  }
  function setHouseholdCashboxAmount(amount) {
    const now=nowISO(),value=Math.max(0,Math.round((Number(amount)||0)*100)/100);
    financeState=normalizeFinanceState({...financeState,cashboxAmount:value,cashboxUpdatedAt:now,updatedAt:now});localStorage.setItem(FINANCE_STATE_KEY,JSON.stringify(financeState));
  }
  function renderHouseholdBuckets() {
    const grid=$('householdBucketsGrid'),summary=$('householdBucketsSummary'),monthNode=$('householdBucketsMonth'),overallFill=$('householdBucketsOverallFill'),overallTrack=$('householdBucketsOverallTrack'),freeLabel=$('householdBucketsFree');if(!grid||!summary||!monthNode||!overallFill||!overallTrack||!freeLabel)return;
    const today=todayKey(),month=householdBillCycleKey(),monthDate=dateAtNoon(`${month}-01`),states=currentHouseholdBillStates(),s24Task=tasks.find(task=>!task.deletedAt&&String(task.title||'').toLocaleLowerCase('pt-BR').includes('s24')&&task.recurrence?.frequency==='monthly'),fallback=HOUSEHOLD_BILLS.find(bill=>bill.id==='s24').knownUntil,s24Until=isDateKey(s24Task?.recurrence?.until)?s24Task.recurrence.until:fallback;
    monthNode.textContent=(monthDate?monthDate.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}):month).toLocaleUpperCase('pt-BR');
    const bills=HOUSEHOLD_BILLS.filter(bill=>bill.id!=='s24'||today<=s24Until).map(bill=>({...bill,until:bill.id==='s24'?s24Until:null})).sort((a,b)=>a.day-b.day),unpaid=bills.filter(bill=>!states[bill.id]?.paid),total=unpaid.reduce((sum,bill)=>sum+bill.amount,0),cashbox=Math.max(0,Number(financeState.cashboxAmount)||0),covered=Math.min(total,cashbox),overallPercent=total?Math.min(100,covered/total*100):100;
    summary.textContent=total?`${financeMoney(covered)} de ${financeMoney(total)} reservados`:'Tudo pago';summary.classList.toggle('positive',cashbox>0);summary.classList.toggle('zero',cashbox===0);
    overallFill.style.width=`${overallPercent.toFixed(2)}%`;overallTrack.setAttribute('aria-valuenow',String(Math.round(overallPercent)));
    freeLabel.classList.toggle('covered',cashbox>=total);freeLabel.textContent=!unpaid.length?'Todas as contas de casa estão pagas. Você conseguiu!':`Faltam ${financeMoney(Math.max(0,total-cashbox))} para completar as contas de casa. Você consegue!`;
    let available=cashbox;
    grid.innerHTML=bills.map(bill=>{
      const state=states[bill.id]||{},paid=Boolean(state.paid),deducted=Math.max(0,Number(state.deductedAmount)||0),funded=paid?bill.amount:Math.min(bill.amount,available);
      if(!paid)available=Math.max(0,available-funded);
      const missing=Math.max(0,bill.amount-funded),percent=paid?100:bill.amount?Math.min(100,funded/bill.amount*100):0,complete=paid||missing===0;
      const dueLabel=`Vence dia ${String(bill.day).padStart(2,'0')}`,untilLabel=bill.until?`Última parcela: ${dateAtNoon(bill.until)?.toLocaleDateString('pt-BR')||bill.until}`:'',detailLeft=paid?'Paga':`${financeMoney(funded)} reservados`,detailRight=paid?(deducted?`${financeMoney(deducted)} descontados`:'Saldo preservado'):missing?`Faltam ${financeMoney(missing)}`:'Completo';
      return `<article class="household-bucket${complete?' complete':''}${paid?' is-paid':''}"><div class="household-bucket-head"><div><h4>${escapeHTML(bill.title)}</h4><span>${dueLabel}</span></div><strong>${escapeHTML(financeMoney(bill.amount))}</strong></div>${untilLabel?`<small class="household-bucket-until">${escapeHTML(untilLabel)}</small>`:''}<div class="household-bucket-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}" aria-label="${escapeHTML(bill.title)}: ${Math.round(percent)}% ${paid?'pago':'reservado'}"><span style="width:${percent.toFixed(2)}%"></span></div><div class="household-bucket-details"><span>${escapeHTML(detailLeft)}</span><b>${escapeHTML(detailRight)}</b></div><button class="household-bucket-toggle${paid?' is-paid':''}" type="button" data-household-bill-toggle="${escapeHTML(bill.id)}" aria-pressed="${paid}">${paid?'Marcar não paga':'Marcar paga'}</button></article>`;
    }).join('');
  }
  function openHouseholdPaymentDialog(billId) {
    const bill=HOUSEHOLD_BILLS.find(item=>item.id===String(billId)),dialog=$('householdPaymentDialog');if(!bill||!dialog)return;
    const cashbox=Math.max(0,Number(financeState.cashboxAmount)||0),deduct=Math.min(cashbox,bill.amount),button=$('householdPaymentDeductBtn');
    dialog.dataset.billId=bill.id;$('householdPaymentPrompt').textContent=`Posso tirar ${financeMoney(bill.amount)} da Caixinha? Há ${financeMoney(cashbox)} guardados; se o saldo for menor, desconto apenas o valor disponível. Se esta conta foi paga com outro dinheiro, escolha “Paga sem descontar”.`;
    button.disabled=deduct<=0;button.textContent=deduct<=0?'Sem saldo para descontar':deduct<bill.amount?`Descontar ${financeMoney(deduct)} disponível`:`Sim, descontar ${financeMoney(deduct)}`;
    showAppDialog(dialog);
  }
  async function completeHouseholdBillPayment(deductCashbox) {
    const dialog=$('householdPaymentDialog'),bill=HOUSEHOLD_BILLS.find(item=>item.id===dialog.dataset.billId);if(!bill){if(dialog.open)dialog.close();return;}
    const prior=currentHouseholdBillStates()[bill.id];if(prior?.paid){dialog.close();return;}
    const cashbox=Math.max(0,Number(financeState.cashboxAmount)||0),deductedAmount=deductCashbox?Math.min(cashbox,bill.amount):0,now=nowISO();
    if(deductedAmount)setHouseholdCashboxAmount(cashbox-deductedAmount);
    saveHouseholdBillState(bill.id,{paid:true,deductedAmount,paidAt:now});dialog.close();delete dialog.dataset.billId;renderFinancePage();
    if(deductedAmount&&session?.user?.id&&CLOUD_READY){try{await syncFinanceCashboxState();showToast(`${bill.title} paga; ${financeMoney(deductedAmount)} descontados da Caixinha.`);}catch{showToast('Pagamento salvo; sincronização da Caixinha pendente.');}}
    else showToast(deductedAmount?`${bill.title} paga; ${financeMoney(deductedAmount)} descontados da Caixinha.`:`${bill.title} marcada como paga; saldo da Caixinha mantido.`);
  }
  async function toggleHouseholdBillPaid(billId) {
    const bill=HOUSEHOLD_BILLS.find(item=>item.id===String(billId));if(!bill)return;
    const prior=currentHouseholdBillStates()[bill.id];
    if(!prior?.paid){openHouseholdPaymentDialog(bill.id);return;}
    const restore=Math.max(0,Number(prior.deductedAmount)||0),question=restore?`Marcar “${bill.title}” como não paga e devolver ${financeMoney(restore)} à Caixinha?`:`Marcar “${bill.title}” como não paga?`;
    if(!window.confirm(question))return;
    if(restore){const current=Math.max(0,Number(financeState.cashboxAmount)||0);setHouseholdCashboxAmount(current+restore);}
    saveHouseholdBillState(bill.id,{paid:false,deductedAmount:0,paidAt:''});renderFinancePage();
    if(restore&&session?.user?.id&&CLOUD_READY){try{await syncFinanceCashboxState();showToast(`${bill.title} reaberta; ${financeMoney(restore)} devolvidos à Caixinha.`);}catch{showToast('Conta reaberta; sincronização da Caixinha pendente.');}}
    else showToast(`${bill.title} marcada como não paga.`);
  }
  function renderFinanceBudget() {
    const balance=$('financeAccountBalance'),balanceUpdated=$('financeBalanceUpdated'),cashboxInput=$('financeCashboxInput'),cashboxValue=$('financeCashboxValue'),daily=$('financeDailyAllowance'),nextLabel=$('financeNextIncomeLabel');
    if(!balance||!balanceUpdated||!cashboxInput||!cashboxValue||!daily||!nextLabel)return;
    balance.textContent=financeState.accountBalance===null?'Aguardando saldo':financeMoney(financeState.accountBalance);
    const updated=financeState.balanceUpdatedAt?new Date(financeState.balanceUpdatedAt):null,updatedValid=updated&&!Number.isNaN(updated.getTime()),stale=updatedValid&&Date.now()-updated.getTime()>2*60*60*1000;
    balanceUpdated.textContent=updatedValid?`${stale?'Último saldo conhecido':'Consulta'} · ${updated.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`:'O Radar ainda não recebeu saldo.';
    if(document.activeElement!==cashboxInput)cashboxInput.value='';
    cashboxValue.textContent=financeState.cashboxAmount===null?'Total guardado: ainda não informado':`Total guardado: ${financeMoney(financeState.cashboxAmount)}`;
    const endDate=dateAtNoon(getDailyAllowanceEndDate()),todayDate=dateAtNoon(todayKey());
    if(!endDate||!todayDate){daily.textContent='—';nextLabel.textContent='Data-base do cálculo indisponível.';return;}
    const rawDays=Math.max(0,Math.round((endDate-todayDate)/86400000)),days=Math.max(1,rawDays),endLabel=endDate.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
    nextLabel.textContent=`Dividido até ${endLabel} · ${days} ${days===1?'dia':'dias'}${rawDays===0?' (hoje; considera 1 dia)':''}`;
    daily.textContent=financeState.accountBalance===null?'—':financeMoney(financeState.accountBalance/days);
  }
  async function saveFinanceCashbox() {
    const input=$('financeCashboxInput'),raw=input.value.trim();if(raw===''){showToast('Digite quanto quer adicionar à Caixinha.');return;}
    const deposit=Number(raw);if(!Number.isFinite(deposit)||deposit<=0){showToast('Informe um valor maior que zero para adicionar.');return;}
    const current=Math.max(0,Number(financeState.cashboxAmount)||0),total=Math.round((current+deposit)*100)/100,now=nowISO();
    financeState=normalizeFinanceState({...financeState,cashboxAmount:total,cashboxUpdatedAt:now,updatedAt:now});localStorage.setItem(FINANCE_STATE_KEY,JSON.stringify(financeState));input.value='';renderFinanceBudget();renderHouseholdBuckets();
    if(session?.user?.id&&CLOUD_READY){try{await syncFinanceCashboxState();showToast(`${financeMoney(deposit)} adicionados. Total da Caixinha: ${financeMoney(total)}.`);}catch{showToast(`Depósito salvo neste aparelho; sincronização pendente. Total: ${financeMoney(total)}.`);}}
    else showToast(`${financeMoney(deposit)} adicionados. Total da Caixinha: ${financeMoney(total)}.`);
  }
  function financeDateForOccurrence(anchorDate,occurrenceNumber) {
    const anchor=dateAtNoon(anchorDate);if(!anchor)return anchorDate;
    return recurrenceDateInMonth(anchor.getFullYear()*12+anchor.getMonth()+Math.max(0,Number(occurrenceNumber||1)-1),anchor.getDate());
  }
  function financeHorizonEnd(month=financeMonth) {
    const baseMonth=month>todayKey().slice(0,7)?month:todayKey().slice(0,7),[year,monthNumber]=baseMonth.split('-').map(Number);
    return recurrenceDateInMonth(year*12+monthNumber-1+11,31);
  }
  function ensureFinanceHorizon() {
    const groups=new Map(),horizonEnd=financeHorizonEnd();let changed=false;
    for(const entry of finances){if(!entry.seriesId||entry.recurrence?.frequency!=='monthly')continue;if(!groups.has(entry.seriesId))groups.set(entry.seriesId,[]);groups.get(entry.seriesId).push(entry);}
    for(const [seriesId,entries] of groups){
      const rule=entries.find(entry=>entry.recurrence)?.recurrence;if(!rule||entries.some(entry=>entry.recurrence?.seriesStopped))continue;
      const source=entries.find(entry=>entry.occurrenceNumber===1)||entries.slice().sort((a,b)=>(a.occurrenceNumber||0)-(b.occurrenceNumber||0))[0];
      const installmentCount=Number(source.installmentCount||rule.installmentCount)||null,lastNumber=Math.max(0,...entries.map(entry=>Number(entry.occurrenceNumber)||0));
      for(let number=lastNumber+1;number<=240;number++){
        if(installmentCount&&number>installmentCount)break;
        const date=financeDateForOccurrence(rule.anchorDate,number);if(!installmentCount&&date>horizonEnd)break;
        const now=nowISO(),recurrence={frequency:'monthly',anchorDate:rule.anchorDate,installmentCount,seriesStopped:false,seriesId};
        finances.push({id:`${seriesId}:${number}`,title:source.title,kind:source.kind,tagId:source.kind==='income'?FINANCE_ENTRY_TAG_ID:FINANCE_EXIT_TAG_ID,amount:source.amount,date,status:'planned',recurrence,seriesId,occurrenceNumber:number,installmentCount,createdAt:now,updatedAt:now,deletedAt:null});changed=true;
      }
    }
    if(changed){localStorage.setItem(FINANCE_KEY,JSON.stringify(finances));createAutomaticBackup(false);scheduleSync();}
    return changed;
  }
  function collectUpcomingFinanceIncome() {
    const today=todayKey(),lastDay=addDays(today,30),candidates=finances.filter(entry=>!entry.deletedAt&&entry.kind==='income'&&entry.status==='planned'&&entry.date>=today&&entry.date<=lastDay).sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title,'pt-BR'));
    const ids=new Set(),seen=new Set(),items=[];
    for(const entry of candidates){
      ids.add(String(entry.id));
      const title=String(entry.title||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR'),key=`${entry.date}|${title}|${Math.round(Number(entry.amount||0)*100)}`;
      if(seen.has(key))continue;
      seen.add(key);items.push(entry);
    }
    return {items,ids};
  }
  function renderFinancePage() {
    const monthLabel=$('financeMonthLabel'),summary=$('financeSummary'),list=$('financeEntriesList'),upcomingList=$('financeUpcomingList');if(!monthLabel||!summary||!list||!upcomingList)return;
    ensureFinanceHorizon();renderFinanceBudget();renderHouseholdBuckets();renderPlannerUpcomingIncome();
    const monthDate=dateAtNoon(`${financeMonth}-01`)||new Date(),rawMonth=monthDate.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    monthLabel.textContent=rawMonth.charAt(0).toLocaleUpperCase('pt-BR')+rawMonth.slice(1);
    const entries=finances.filter(entry=>!entry.deletedAt&&entry.date.slice(0,7)===financeMonth).sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title,'pt-BR'));
    const upcoming=collectUpcomingFinanceIncome(),monthUpcoming=upcoming.items.filter(entry=>entry.date.slice(0,7)===financeMonth),monthListEntries=entries.filter(entry=>!upcoming.ids.has(String(entry.id))),totalsEntries=entries.filter(entry=>!upcoming.ids.has(String(entry.id))).concat(monthUpcoming);
    upcomingList.innerHTML=upcoming.items.length?upcoming.items.map(entry=>{
      const date=dateAtNoon(entry.date),dateLabel=date?date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):entry.date;
      const id=escapeHTML(entry.id);return `<button class="finance-upcoming-row" type="button" data-finance-open="${id}" aria-label="Ver detalhes de ${escapeHTML(entry.title)}"><time class="finance-upcoming-date" datetime="${escapeHTML(entry.date)}">${escapeHTML(dateLabel)}</time><strong class="finance-upcoming-title">${escapeHTML(entry.title)}</strong><span class="finance-upcoming-amount">+ ${escapeHTML(financeMoney(entry.amount))}</span></button>`;
    }).join(''):'<p class="finance-upcoming-empty">Nenhum recebimento previsto nos próximos 30 dias.</p>';
    const income=totalsEntries.filter(entry=>entry.kind==='income'),expense=totalsEntries.filter(entry=>entry.kind==='expense');
    const totalIncome=income.reduce((sum,entry)=>sum+entry.amount,0),realizedIncome=income.filter(entry=>entry.status==='realized').reduce((sum,entry)=>sum+entry.amount,0);
    const totalExpense=expense.reduce((sum,entry)=>sum+entry.amount,0),realizedExpense=expense.filter(entry=>entry.status==='realized').reduce((sum,entry)=>sum+entry.amount,0);
    const plannedBalance=totalIncome-totalExpense,realizedBalance=realizedIncome-realizedExpense;
    summary.innerHTML=`<article class="finance-summary-card income"><span>ENTRADAS</span><strong>${financeMoney(totalIncome)}</strong><small>Recebido: ${financeMoney(realizedIncome)}</small></article><article class="finance-summary-card expense"><span>SAÍDAS</span><strong>${financeMoney(totalExpense)}</strong><small>Pago: ${financeMoney(realizedExpense)}</small></article><article class="finance-summary-card balance"><span>SALDO PREVISTO</span><strong>${financeMoney(plannedBalance)}</strong><small>Realizado: ${financeMoney(realizedBalance)}</small></article>`;
    const emptyMessage=entries.length&&monthListEntries.length===0?'Os recebimentos próximos deste mês estão listados acima.':'Nenhuma movimentação neste mês. Adicione entradas e saídas quando quiser.';
    list.innerHTML=monthListEntries.length?monthListEntries.map(entry=>{
      const id=escapeHTML(entry.id),date=dateAtNoon(entry.date),dateLabel=date?date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):'',amountLabel=`${entry.kind==='income'?'+':'−'} ${financeMoney(entry.amount)}`;
      const occurrenceLabel=entry.installmentCount?`Parcela ${entry.occurrenceNumber}/${entry.installmentCount}`:entry.recurrence?'Mensal':'';
      const flowTag=tags.find(tag=>tag.id===entry.tagId&&!tag.deletedAt),flowLabel=flowTag?.name||(entry.kind==='income'?'ENTRADA':'SAÍDA');
      return `<article class="finance-entry ${entry.kind} ${entry.status}" data-finance-id="${id}"><div class="finance-entry-date">${escapeHTML(dateLabel)}</div><div class="finance-entry-main"><button class="finance-entry-open" type="button" data-finance-open="${id}" aria-label="Ver detalhes de ${escapeHTML(entry.title)}">${escapeHTML(entry.title)} <span aria-hidden="true">›</span></button><span><b class="finance-flow-tag ${entry.kind}">${escapeHTML(flowLabel)}</b>${occurrenceLabel?` · ${escapeHTML(occurrenceLabel)}`:''}</span></div><div class="finance-entry-actions"><strong class="finance-amount ${entry.kind}">${escapeHTML(amountLabel)}</strong><button class="finance-status-pill ${entry.status}" type="button" data-finance-toggle-status="${id}" aria-label="${entry.status==='planned'?'Marcar como realizado':'Voltar para previsto'}">${entry.status==='planned'?'PREVISTO':'REALIZADO'}</button><button class="finance-icon-button" type="button" data-finance-edit="${id}" aria-label="Editar ${escapeHTML(entry.title)}" title="Editar">✎</button><button class="finance-icon-button danger" type="button" data-finance-delete="${id}" aria-label="Excluir ${escapeHTML(entry.title)}" title="Excluir">×</button></div></article>`;
    }).join(''):`<p class="empty finance-empty">${escapeHTML(emptyMessage)}</p>`;
  }
  function shiftFinanceMonth(amount) {
    const date=dateAtNoon(`${financeMonth}-01`)||dateAtNoon(todayKey());date.setMonth(date.getMonth()+Number(amount||0));financeMonth=dateKey(date).slice(0,7);localStorage.setItem(FINANCE_MONTH_KEY,financeMonth);renderFinancePage();
  }
  function updateFinanceRecurrenceUI() { $('financeInstallmentWrap').hidden=$('financeRecurrence').value!=='monthly'; }
  function openFinanceDialog(entryId='') {
    const entry=entryId?finances.find(item=>item.id===String(entryId)&&!item.deletedAt):null,series=Boolean(entry?.seriesId&&entry?.recurrence?.frequency==='monthly');
    financeDialogDirty=false;$('financeForm').reset();$('financeId').value=entry?.id||'';$('financeDialogTitle').textContent=entry?'Detalhes do lançamento':'Novo lançamento';$('financeSaveBtn').textContent=entry?'Salvar alterações':'Criar lançamento';
    $('financeTitle').value=entry?.title||'';$('financeDirection').value=entry?.kind||'expense';$('financeAmount').value=entry?String(entry.amount):'';$('financeDate').value=entry?.date||todayKey();$('financeStatus').value=entry?.status||'planned';
    $('financeRecurrence').value=entry?.recurrence?'monthly':'once';$('financeInstallmentCount').value=entry?.installmentCount?String(entry.installmentCount):'';
    $('financeRecurrence').disabled=series;$('financeInstallmentCount').disabled=series;updateFinanceRecurrenceUI();
    $('financeSeriesInfo').hidden=!series;$('financeSeriesInfo').textContent=series?(entry.installmentCount?`Parcela ${entry.occurrenceNumber}/${entry.installmentCount}.`:'Movimentação mensal contínua.') : '';
    $('financeApplyFutureWrap').hidden=!series;$('financeApplyFuture').checked=true;$('financeStopSeriesBtn').hidden=!series||Boolean(entry.recurrence?.seriesStopped);$('financeDeleteBtn').hidden=!entry;
    showAppDialog($('financeDialog'));
  }
  function makeFinanceOccurrence({title,kind,amount,date,status,seriesId,occurrenceNumber,installmentCount,anchorDate}) {
    const now=nowISO(),recurrence={frequency:'monthly',anchorDate,installmentCount:installmentCount||null,seriesStopped:false,seriesId};
    return {id:occurrenceNumber===1?seriesId:`${seriesId}:${occurrenceNumber}`,title,kind,tagId:kind==='income'?FINANCE_ENTRY_TAG_ID:FINANCE_EXIT_TAG_ID,amount,date,status,recurrence,seriesId,occurrenceNumber,installmentCount:installmentCount||null,createdAt:now,updatedAt:now,deletedAt:null};
  }
  function saveFinanceFromForm(event) {
    event?.preventDefault?.();
    const id=$('financeId').value,existing=id?finances.find(item=>item.id===id&&!item.deletedAt):null,title=$('financeTitle').value.trim(),kind=$('financeDirection').value,amount=Math.round(Number($('financeAmount').value)*100)/100,date=$('financeDate').value,status=$('financeStatus').value,repeat=$('financeRecurrence').value;
    const rawCount=$('financeInstallmentCount').value.trim(),installmentCount=rawCount?Number(rawCount):null;
    if(!title||!['income','expense'].includes(kind)||!Number.isFinite(amount)||amount<=0||!isDateKey(date)){showToast('Confira a descrição, o valor e a data.');return false;}
    const editingSeries=Boolean(existing?.seriesId&&existing?.recurrence?.frequency==='monthly');
    if(repeat==='monthly'&&!editingSeries&&rawCount&&(!Number.isInteger(installmentCount)||installmentCount<2||installmentCount>240)){showToast('Informe de 2 a 240 parcelas ou deixe vazio para repetir mensalmente.');return false;}
    const now=nowISO();
    if(existing){
      const recurring=Boolean(existing.seriesId&&existing.recurrence?.frequency==='monthly');
      existing.title=title;existing.kind=kind;existing.amount=amount;existing.date=date;existing.status=status;existing.updatedAt=now;
      if(recurring){
        if($('financeApplyFuture').checked)for(const future of finances.filter(item=>item.seriesId===existing.seriesId&&item.occurrenceNumber>existing.occurrenceNumber&&!item.deletedAt&&item.status==='planned')){future.title=title;future.kind=kind;future.amount=amount;future.updatedAt=now;}
      }else if(repeat==='monthly'){
        const seriesId=makeId();existing.seriesId=seriesId;existing.occurrenceNumber=1;existing.installmentCount=installmentCount||null;existing.recurrence={frequency:'monthly',anchorDate:date,installmentCount:installmentCount||null,seriesStopped:false,seriesId};
      }else{existing.seriesId='';existing.occurrenceNumber=null;existing.installmentCount=null;existing.recurrence=null;}
    }else if(repeat==='monthly'){
      const seriesId=makeId();finances.push(makeFinanceOccurrence({title,kind,amount,date,status,seriesId,occurrenceNumber:1,installmentCount,anchorDate:date}));
    }else finances.push({id:makeId(),title,kind,amount,date,status,recurrence:null,seriesId:'',occurrenceNumber:null,installmentCount:null,createdAt:now,updatedAt:now,deletedAt:null});
    financeDialogDirty=false;$('financeDialog').close();saveFinanceEntries();showToast(existing?'Movimentação atualizada.':'Movimentação adicionada.');return true;
  }
  function toggleFinanceStatus(entryId) {
    const entry=finances.find(item=>item.id===String(entryId)&&!item.deletedAt);if(!entry)return;
    entry.status=entry.status==='planned'?'realized':'planned';entry.updatedAt=nowISO();saveFinanceEntries();showToast(entry.status==='realized'?(entry.kind==='income'?'Entrada marcada como recebida.':'Saída marcada como paga.'):'Movimentação voltou para prevista.');
  }
  function deleteFinanceEntry(entryId) {
    const entry=finances.find(item=>item.id===String(entryId)&&!item.deletedAt);if(!entry)return;const question=entry.seriesId?`Excluir somente esta ocorrência de “${entry.title}”? As próximas permanecem; use “Encerrar recorrência” para interrompê-las.`:`Excluir “${entry.title}” do fluxo financeiro?`;if(!window.confirm(question))return;
    entry.deletedAt=nowISO();entry.updatedAt=entry.deletedAt;saveFinanceEntries();if($('financeDialog').open)$('financeDialog').close();showToast('Movimentação excluída.');
  }
  function stopFinanceSeries(entryId) {
    const entry=finances.find(item=>item.id===String(entryId)&&!item.deletedAt);if(!entry?.seriesId||!window.confirm('Encerrar esta recorrência e remover as próximas movimentações previstas? As já realizadas ficam no histórico.'))return;
    const now=nowISO();for(const item of finances.filter(row=>row.seriesId===entry.seriesId)){
      item.recurrence={...(item.recurrence||{}),seriesStopped:true};if(item.occurrenceNumber>=entry.occurrenceNumber&&item.status==='planned')item.deletedAt=now;item.updatedAt=now;
    }
    $('financeDialog').close();saveFinanceEntries();showToast('Recorrência encerrada; o histórico foi mantido.');
  }
  function handleFinanceClick(event) {
    const status=event.target.closest('[data-finance-toggle-status]');if(status){toggleFinanceStatus(status.dataset.financeToggleStatus);return;}
    const edit=event.target.closest('[data-finance-edit]');if(edit){openFinanceDialog(edit.dataset.financeEdit);return;}
    const remove=event.target.closest('[data-finance-delete]');if(remove){deleteFinanceEntry(remove.dataset.financeDelete);return;}
    const open=event.target.closest('[data-finance-open]');if(open){openFinanceDialog(open.dataset.financeOpen);return;}
  }
  function requestLogVaultAccess(logId,action) {
    if(action==='lock'){pendingLogLockId=String(logId);pendingLogUnlockId='';}else{pendingLogUnlockId=String(logId);pendingLogLockId='';}
    pendingPrivateMoveId='';setNotesMode('private');setPage('notes');
    showToast(privateVault?'Desbloqueie o cofre em Notas privadas; depois volto ao Log.':'Configure o cofre em Notas privadas para proteger os logs.');
  }
  function privateLogCipherId(logId) { return `tnm-log:${String(logId)}`; }
  function getDecryptedPrivateLog(logId) {
    const id=String(logId||''),cipherId=privateLogCipherId(id);
    return privateLogs.find(item=>String(item.cipherId||'')===cipherId)||privateLogs.find(item=>String(item.id||'')===id||String(item.id||'')===cipherId)||null;
  }
  async function completePendingLogLock() {
    const id=pendingLogLockId,log=logs.find(item=>item.id===id&&!item.deletedAt),key=privateCryptoKey;
    if(!id||!log||!key||!privateNotesUnlocked)return false;
    const now=nowISO(),cipherId=privateLogCipherId(id);
    try {
      const encrypted=await encryptPrivateValue(key,{kind:'log',logId:id,content:log.content,createdAt:log.createdAt});
      if(!privateNotesUnlocked||privateCryptoKey!==key)return false;
      const previous=privateCipherRows.find(item=>item.id===cipherId);
      const row={id:cipherId,iv:encrypted.iv,ciphertext:encrypted.ciphertext,createdAt:log.createdAt||previous?.createdAt||now,updatedAt:now,deletedAt:null};
      privateCipherRows=privateCipherRows.filter(item=>item.id!==cipherId).concat(row);
      privateLogs=privateLogs.filter(item=>item.id!==id).concat({id,content:log.content,createdAt:log.createdAt});
      log.content='';log.isLocked=true;log.updatedAt=now;unlockedLogIds.delete(id);pendingLogLockId='';
      persistPrivateVault(false);saveLogs(false);createAutomaticBackup(false);scheduleSync();renderLogs();setPage('log');showToast('Log trancado no cofre privado.');return true;
    } catch { pendingLogLockId='';setPrivateStatus('Não consegui criptografar o log; o registro original foi mantido.',true);showToast('Não consegui trancar o log. O texto foi mantido.');return false; }
  }
  async function unlockLog(logId) {
    const id=String(logId),log=logs.find(item=>item.id===id&&!item.deletedAt);
    if(!log?.isLocked)return;
    if(!privateNotesUnlocked||!privateCryptoKey){requestLogVaultAccess(id,'unlock');return;}
    try {
      let entry=getDecryptedPrivateLog(id);
      if(!entry){const cipherId=privateLogCipherId(id),row=privateCipherRows.find(item=>item.id===cipherId&&!item.deletedAt);if(!row)throw new Error('missing cipher');const data=await decryptPrivateValue(privateCryptoKey,row.iv,row.ciphertext),rowLogId=String(row.id).startsWith('tnm-log:')?String(row.id).slice(8):String(data?.logId||'');if(!data||data.kind&&data.kind!=='log'||rowLogId!==id)throw new Error('invalid log');entry={id,content:String(typeof data==='string'?data:data.content??data.text??''),createdAt:String(data.createdAt||row.createdAt),cipherId:String(row.id)};privateLogs=privateLogs.filter(item=>String(item.id)!==id&&String(item.cipherId)!==cipherId).concat(entry);}
      unlockedLogIds.add(id);renderLogs();
    } catch { showToast('Não consegui abrir este log. Confira a senha e a sincronização do cofre.'); }
  }
  function deleteLog(logId) {
    const id=String(logId),log=logs.find(item=>item.id===id&&!item.deletedAt);if(!log||!window.confirm('Excluir este registro do Log?'))return;
    const now=nowISO();log.deletedAt=now;log.updatedAt=now;unlockedLogIds.delete(id);privateLogs=privateLogs.filter(item=>item.id!==id);
    if(log.isLocked){const row=privateCipherRows.find(item=>item.id===privateLogCipherId(id));if(row){row.iv='';row.ciphertext='';row.deletedAt=now;row.updatedAt=now;}persistPrivateVault(false);}
    saveLogs();showToast('Registro excluído.');
  }
  function handleLogsClick(event) {
    const toggle=event.target.closest('[data-log-action="tag"]');
    if(toggle){const select=toggle.parentElement.querySelector('[data-log-tag-select]'),add=toggle.parentElement.querySelector('[data-log-action="add-tag"]');if(select){const open=select.hidden;select.hidden=!open;if(add)add.hidden=!open;if(open)select.focus();}return;}
    const button=event.target.closest('[data-log-action]');if(!button)return;
    const id=button.dataset.logId,action=button.dataset.logAction;
    if(action==='add-tag'){openTagManager(id);return;}
    if(action==='delete'){deleteLog(id);return;}
    if(action==='lock'){
      if(privateNotesUnlocked&&privateCryptoKey){pendingLogLockId=id;void completePendingLogLock();}
      else requestLogVaultAccess(id,'lock');
      return;
    }
    if(action==='unlock'){void unlockLog(id);return;}
    if(action==='hide'){unlockedLogIds.delete(id);renderLogs();}
  }
  function handleLogTagChange(event) {
    const select=event.target.closest('[data-log-tag-select]');if(!select)return;
    const log=logs.find(item=>item.id===select.dataset.logTagSelect&&!item.deletedAt);if(!log)return;
    const tagId=select.value;if(tagId&&!tags.some(item=>item.id===tagId&&!item.deletedAt)){showToast('Essa tag não está disponível.');renderLogs();return;}
    log.tagId=tagId;log.updatedAt=nowISO();saveLogs();showToast(tagId?'Tag vinculada ao log.':'Tag removida do log.');
  }
  function setPrivateStatus(message,isError=false) {
    const node=$('privateStatus');if(!node)return;
    node.textContent=String(message||'');node.classList.toggle('error',isError);
  }
  async function createPrivateVault(event) {
    event.preventDefault();const password=$('privateSetupPassword').value;
    if(password.length<8){setPrivateStatus('Use uma senha com pelo menos 8 caracteres.',true);return;}
    try {
      const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derivePrivateKey(password,salt),check=await encryptPrivateValue(key,'TNM private vault v1');
      privateVault={salt:bytesToBase64(salt),verifierIv:check.iv,verifierCiphertext:check.ciphertext,ownerId:'',updatedAt:nowISO()};
      privateCryptoKey=currentPage==='notes'&&privateNotesMode?key:null;privateNotesUnlocked=Boolean(privateCryptoKey);privateNotes=[];privateLogs=[];unlockedLogIds.clear();$('privateSetupPassword').value='';persistPrivateVault();setPrivateStatus(privateNotesUnlocked?'Cofre criado e desbloqueado neste aparelho.':'Cofre criado. Desbloqueie para acessar.');renderPrivateNotes();if(privateNotesUnlocked&&pendingPrivateMoveId)await completePendingPrivateMove();if(privateNotesUnlocked&&pendingLogLockId)await completePendingLogLock();
    } catch { setPrivateStatus('Não consegui criar o cofre com a criptografia deste aparelho.',true); }
  }
  async function loadDecryptedPrivateNotes(key=privateCryptoKey) {
    const result=[];
    for(const row of privateCipherRows.filter(item=>!item.deletedAt)){
      const data=await decryptPrivateValue(key,row.iv,row.ciphertext),value=data&&typeof data==='object'?data:typeof data==='string'?{content:data}:{};
      result.push({...value,id:row.id,createdAt:row.createdAt,updatedAt:row.updatedAt,deletedAt:null});
    }
    return result.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  function setDecryptedVaultItems(items) {
    const isLog=item=>item.kind==='log'||Boolean(item.logId)||String(item.id||'').startsWith('tnm-log:');
    privateNotes=items.filter(item=>!isLog(item)).map(item=>{const links=noteLinks(item);return {...item,links,link:links[0]||''};});
    privateLogs=items.filter(isLog).map(item=>{const cipherId=String(item.id||''),rowLogId=cipherId.startsWith('tnm-log:')?cipherId.slice(8):'',id=rowLogId||String(item.logId||'');return id?{id,content:String(typeof item.content==='string'?item.content:item.text||''),createdAt:String(item.createdAt||''),cipherId}:null;}).filter(Boolean);
    unlockedLogIds.clear();
  }
  async function unlockPrivateVault(event) {
    event.preventDefault();if(!privateVault)return;
    if(session?.user?.id&&privateVault.ownerId&&privateVault.ownerId!==session.user.id){setPrivateStatus('Este cofre está vinculado a outra conta. Entre na conta original.',true);return;}
    const password=$('privateUnlockPassword').value;$('privateUnlockPassword').value='';
    try {
      const key=await derivePrivateKey(password,base64ToBytes(privateVault.salt));
      const check=await decryptPrivateValue(key,privateVault.verifierIv,privateVault.verifierCiphertext);
      if(check!=='TNM private vault v1')throw new Error('wrong password');
      if(currentPage!=='notes'||!privateNotesMode){setPrivateStatus('Volte para Notas privadas para desbloquear.');return;}
      const decrypted=await loadDecryptedPrivateNotes(key);setDecryptedVaultItems(decrypted);privateCryptoKey=key;privateNotesUnlocked=true;setPrivateStatus('Cofre desbloqueado.');renderPrivateNotes();if(pendingPrivateMoveId)await completePendingPrivateMove();if(pendingLogLockId){const locked=await completePendingLogLock();if(!locked)pendingLogLockId='';}if(pendingLogUnlockId){const id=String(pendingLogUnlockId);pendingLogUnlockId='';if(getDecryptedPrivateLog(id))unlockedLogIds.add(id);else showToast('Não encontrei a cópia criptografada deste log.');setPage('log');renderLogs();}
    } catch { privateCryptoKey=null;privateNotes=[];privateLogs=[];unlockedLogIds.clear();privateNotesUnlocked=false;setPrivateStatus('Senha incorreta. Não há recuperação se ela for esquecida.',true);renderPrivateNotes(); }
  }
  async function lockPrivateNotes() {
    if(privateNoteDirty){const saved=await savePrivateNote({preventDefault(){}},false,true);if(!saved)return false;}
    privateCryptoKey=null;privateNotes=[];privateLogs=[];unlockedLogIds.clear();privateNotesUnlocked=false;privateNoteDirty=false;privateHiddenAt=0;setPrivateStatus('Cofre bloqueado.');
    const form=$('privateNoteForm');if(form){form.reset();form.hidden=true;}
    if($('privateNoteId'))$('privateNoteId').value='';renderPrivateNotes();renderLogs();return true;
  }
  function requestPrivateMove(noteId) {
    const source=notes.find(item=>item.id===String(noteId)&&!item.deletedAt);if(!source)return;
    const dialog=$('noteDialog');
    if(dialog.open&&$('noteId').value===source.id){
      if(noteDialogDirty){if(!saveNote({preventDefault(){}},true))return;}
      else dialog.close();
    }
    pendingPrivateMoveId=source.id;setNotesMode('private');
    if(privateNotesUnlocked)void completePendingPrivateMove();
    else showToast(privateVault?'Desbloqueie o cofre para trancar esta nota.':'Configure o cofre para trancar esta nota.');
  }
  async function completePendingPrivateMove() {
    const source=notes.find(item=>item.id===pendingPrivateMoveId&&!item.deletedAt),key=privateCryptoKey;
    if(!source||!privateNotesUnlocked||!key)return false;
    const oldRows=privateCipherRows,oldPrivateNotes=privateNotes,oldDeletedAt=source.deletedAt,oldUpdatedAt=source.updatedAt,now=nowISO();
    const links=noteLinks(source),data={title:source.title||'',content:source.content||'',link:links[0]||'',links,tagIds:Array.isArray(source.tagIds)?[...source.tagIds]:[],isPinned:Boolean(source.isPinned),sortOrder:Number(source.sortOrder)||0};
    try {
      const encrypted=await encryptPrivateValue(key,data);
      if(!privateNotesUnlocked||privateCryptoKey!==key)return false;
      const id=makeId(),row={id,iv:encrypted.iv,ciphertext:encrypted.ciphertext,createdAt:source.createdAt||now,updatedAt:now,deletedAt:null};
      privateCipherRows=oldRows.concat(row);privateNotes=oldPrivateNotes.concat({...data,id,createdAt:row.createdAt,updatedAt:now,deletedAt:null});
      persistPrivateVault(false);source.deletedAt=now;source.updatedAt=now;saveNotes(false);
      pendingPrivateMoveId='';scheduleSync();renderPrivateNotes();showToast('Nota trancada no cofre privado.');return true;
    } catch {
      privateCipherRows=oldRows;privateNotes=oldPrivateNotes;source.deletedAt=oldDeletedAt;source.updatedAt=oldUpdatedAt;
      try{persistPrivateVault(false);localStorage.setItem(NOTES_KEY,JSON.stringify(notes));}catch{}
      setPrivateStatus('Não consegui trancar a nota. Ela continua em Notas abertas.',true);renderNotes();renderPrivateNotes();return false;
    }
  }
  function openPrivateNoteEditor(noteId='') {
    if(!privateNotesUnlocked){showToast('Desbloqueie as Notas privadas primeiro.');return;}
    if(privateNoteDirty){void savePrivateNote({preventDefault(){}},false).then(saved=>{if(saved)openPrivateNoteEditor(noteId);});return;}
    const note=noteId?privateNotes.find(item=>item.id===String(noteId)&&!item.deletedAt):null;
    privateNoteDirty=false;$('privateNoteForm').reset();$('privateNoteId').value=note?.id||'';$('privateNoteTitle').value=note?.title||'';$('privateNoteContent').value=note?.content||'';renderLinkInputs('privateNoteLinksList',noteLinks(note));$('privateNoteForm').hidden=false;
  }
  async function savePrivateNote(event,close=true,allowEmpty=false) {
    event?.preventDefault?.();if(!privateNotesUnlocked||!privateCryptoKey)return false;
    const title=$('privateNoteTitle').value.trim(),content=$('privateNoteContent').value.trim(),linkResult=collectNoteLinks('privateNoteLinksList'),links=linkResult.links;
    if(linkResult.invalid){setPrivateStatus('Confira o endereço de cada link.',true);return false;}
    if(!title&&!content&&!links.length){if(allowEmpty&&!$('privateNoteId').value){privateNoteDirty=false;return true;}setPrivateStatus('Preencha o título, o conteúdo ou adicione um link.',true);return false;}
    try {
      const id=$('privateNoteId').value||makeId(),old=privateCipherRows.find(item=>item.id===id&&!item.deletedAt),oldNote=privateNotes.find(item=>item.id===id&&!item.deletedAt),now=nowISO();
      const data={title,content,link:links[0]||'',links,tagIds:Array.isArray(oldNote?.tagIds)?oldNote.tagIds:[],isPinned:Boolean(oldNote?.isPinned),sortOrder:Number(oldNote?.sortOrder)||0},key=privateCryptoKey,encrypted=await encryptPrivateValue(key,data);
      if(!privateNotesUnlocked||privateCryptoKey!==key)return false;
      const row={id,iv:encrypted.iv,ciphertext:encrypted.ciphertext,createdAt:old?.createdAt||oldNote?.createdAt||now,updatedAt:now,deletedAt:null};
      privateCipherRows=privateCipherRows.filter(item=>item.id!==id).concat(row);privateNotes=privateNotes.filter(item=>item.id!==id).concat({...data,id,createdAt:row.createdAt,updatedAt:now,deletedAt:null});
      privateNoteDirty=false;$('privateNoteId').value=id;persistPrivateVault();
      if(close){$('privateNoteForm').reset();$('privateNoteForm').hidden=true;$('privateNoteId').value='';}
      setPrivateStatus('Nota privada criptografada e salva.');renderPrivateNotes();return true;
    } catch { setPrivateStatus('Falha ao criptografar. A nota não foi salva.',true);return false; }
  }
  async function duplicatePrivateNote(noteId) {
    const source=privateNotes.find(item=>item.id===String(noteId)&&!item.deletedAt);if(!source||!privateCryptoKey)return;
    try {
      const now=nowISO(),links=noteLinks(source),data={title:source.title?`${source.title.slice(0,132)} (cópia)`: '',content:source.content,link:links[0]||'',links,tagIds:Array.isArray(source.tagIds)?source.tagIds:[],isPinned:Boolean(source.isPinned),sortOrder:Number(source.sortOrder)||0},id=makeId(),key=privateCryptoKey,encrypted=await encryptPrivateValue(key,data);
      if(!privateNotesUnlocked||privateCryptoKey!==key)return;
      const row={id,iv:encrypted.iv,ciphertext:encrypted.ciphertext,createdAt:now,updatedAt:now,deletedAt:null};privateCipherRows.push(row);privateNotes.unshift({...data,id,createdAt:now,updatedAt:now,deletedAt:null});persistPrivateVault();renderPrivateNotes();showToast('Nota privada duplicada.');
    } catch { setPrivateStatus('Não consegui duplicar a nota privada.',true); }
  }
  function deletePrivateNote(noteId) {
    const note=privateNotes.find(item=>item.id===String(noteId)&&!item.deletedAt);if(!note||!window.confirm(`Excluir a nota privada “${note.title||'Nota sem título'}”?`))return;
    const row=privateCipherRows.find(item=>item.id===note.id);if(row){row.iv='';row.ciphertext='';row.deletedAt=nowISO();row.updatedAt=row.deletedAt;}
    privateNotes=privateNotes.filter(item=>item.id!==note.id);persistPrivateVault();renderPrivateNotes();showToast('Nota privada excluída.');
  }
  function handlePrivateNotesClick(event) {
    const edit=event.target.closest('[data-private-edit]');if(edit){openPrivateNoteEditor(edit.dataset.privateEdit);return;}
    const duplicate=event.target.closest('[data-private-duplicate]');if(duplicate){void duplicatePrivateNote(duplicate.dataset.privateDuplicate);return;}
    const remove=event.target.closest('[data-private-delete]');if(remove)deletePrivateNote(remove.dataset.privateDelete);
  }
  function renderNotes() {
    const active=visibleNotes('notes').sort(noteOrder);
    $('notesList').innerHTML=active.length ? active.map(note=>{
      const id=escapeHTML(note.id),tagsHtml=(note.tagIds||[]).map(tagId=>tags.find(tag=>tag.id===tagId&&!tag.deletedAt)).filter(Boolean).map(tag=>`<span class="note-tag-pill" style="border-color:${escapeHTML(tag.color)}66;color:${escapeHTML(tag.color)}">${escapeHTML(tag.name)}</span>`).join('');
      const title=note.title?`<h3 class="note-card-title">${escapeHTML(note.title)}</h3>`:'<span class="note-card-title-placeholder" aria-hidden="true"></span>';
      const body=note.title?(note.content?`<p>${formatNoteContent(note.content)}</p>`:''):`<p class="note-card-content--titleless">${formatNoteContent(note.content)}</p>`;
      const pinLabel=note.isPinned?'Desafixar nota':'Fixar nota',linkHtml=linksPreview(noteLinks(note)),footer=linkHtml||tagsHtml?`<footer class="note-card-footer">${linkHtml?`<div class="note-links-preview">${linkHtml}</div>`:''}${tagsHtml?`<div class="note-tags-preview">${tagsHtml}</div>`:''}</footer>`:'';
      return `<article class="note-card${note.isPinned?' is-pinned':''}" data-note-card="${id}" data-note-id="${id}" draggable="true" tabindex="0"><header class="note-card-header">${title}<div class="note-card-controls"><button class="note-touch-handle" type="button" data-touch-drag-note="${id}" aria-label="Arrastar nota" title="Arrastar nota">⠿</button><details class="note-menu"><summary aria-label="Mais ações para a nota" title="Mais ações">⋮</summary><div class="note-menu-popover"><button class="menu-action" type="button" data-pin-note="${id}" aria-pressed="${String(Boolean(note.isPinned))}">${pinLabel}</button><button class="menu-action menu-edit" type="button" data-duplicate-note="${id}">DUPLICAR NOTA</button><button class="menu-action" type="button" data-lock-note="${id}">TRANCAR 🔒</button><button class="menu-action menu-move" type="button" data-move-note="${id}" data-direction="up">↑ MOVER ACIMA</button><button class="menu-action menu-move" type="button" data-move-note="${id}" data-direction="down">↓ MOVER ABAIXO</button><button class="menu-action menu-delete" type="button" data-delete-note="${id}">EXCLUIR</button></div></details></div></header><div class="note-card-body">${body}</div>${footer}</article>`;
    }).join('') : '<div class="empty">Nenhuma nota para as tags selecionadas.</div>';
    renderFilterButton(); renderDialogLists();
  }
  function toggleNotePin(noteId) {
    const note=notes.find(item=>item.id===String(noteId)&&!item.deletedAt);if(!note)return;
    note.isPinned=!note.isPinned;
    const peers=notes.filter(item=>!item.deletedAt&&item.id!==note.id&&Boolean(item.isPinned)===Boolean(note.isPinned)).sort(noteOrder);
    note.sortOrder=Math.min(-1,...peers.map(item=>Number(item.sortOrder)||0))-1;
    note.updatedAt=nowISO();saveNotes();showToast(note.isPinned?'Nota fixada no topo.':'Nota desafixada.');
  }
  function renderDayDialog() {
    const hint=$('dayDialogHint');hint.hidden=activeDayKind==='day';hint.textContent=activeDayKind==='overdue'?'Só aparecem aqui tarefas atrasadas de semanas anteriores à semana em exibição; as desta semana ficam nos dias correspondentes.':'Aqui aparecem todas as tarefas com data anterior a hoje.';
    const all=visibleTasks('tasks'),currentWeek=startOfWeek(todayKey()),today=todayKey();
    const inDay=all.filter(task=>activeDayKind==='overdue'?weekStart>=currentWeek&&task.executionDate&&task.executionDate<currentWeek:activeDayKind==='all-overdue'?task.executionDate&&task.executionDate<today:task.executionDate===activeDayDate);
    const open=inDay.filter(task=>!task.completedAt),completed=inDay.filter(task=>task.completedAt).sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt)));
    if(activeDayKind==='all-overdue')sortOverdueTasks(open);else open.sort(taskOrder);
    const lateMode=activeDayKind==='overdue'||activeDayKind==='all-overdue';
    const groups=[open.length?open.map(task=>taskCard(task,{canMove:true,late:lateMode||Boolean(task.executionDate&&task.executionDate<today),linked:lateMode,draggable:activeDayKind==='all-overdue'||!lateMode})).join(''):'<div class="empty">Sem tarefas em aberto.</div>'];
    if(completed.length)groups.push(`<div class="task-divider">CONCLUÍDAS</div>${completed.map(task=>taskCard(task,{canMove:false})).join('')}`);
    $('dayDialogList').innerHTML=groups.join('');
  }
  function renderDialogLists() { if ($('dayDialog')?.open) renderDayDialog(); }
  function openDayDialog(dayKey) {
    activeDayKind=dayKey==='all-overdue'?'all-overdue':dayKey==='overdue'?'overdue':'day';
    activeDayDate=activeDayKind==='day'&&isDateKey(dayKey)?dayKey:'';
    if(activeDayKind==='day'&&!activeDayDate)return;
    $('dayDialogTitle').textContent=activeDayKind==='day'?formatDate(activeDayDate,{weekday:'long',day:'2-digit',month:'2-digit'}):'ATRASADO';
    $('dayDialogAddBtn').hidden=activeDayKind!=='day';$('dayDialogPrevBtn').hidden=activeDayKind!=='day';$('dayDialogNextBtn').hidden=activeDayKind!=='day';dayDialogTouchStart=null;
    renderDayDialog(); showAppDialog($('dayDialog'));
  }
  function navigateDayDialog(offset) {
    if(activeDayKind!=='day'||!isDateKey(activeDayDate))return;
    activeDayDate=addDays(activeDayDate,offset);$('dayDialogTitle').textContent=formatDate(activeDayDate,{weekday:'long',day:'2-digit',month:'2-digit'});
    if(startOfWeek(activeDayDate)!==weekStart){setWeek(activeDayDate);renderTasks();}else renderDayDialog();
  }
  function handleDayDialogTouchStart(event) {
    if(activeDayKind!=='day'||!$('dayDialog').open||event.touches.length!==1||event.target.closest('button,a,input,select,textarea,details,[data-touch-drag-task]')){dayDialogTouchStart=null;return;}
    const touch=event.touches[0];dayDialogTouchStart={x:touch.clientX,y:touch.clientY};
  }
  function handleDayDialogTouchEnd(event) {
    const start=dayDialogTouchStart;dayDialogTouchStart=null;if(!start||activeDayKind!=='day'||!$('dayDialog').open)return;
    const touch=event.changedTouches[0];if(!touch)return;const dx=touch.clientX-start.x,dy=touch.clientY-start.y;
    if(Math.abs(dx)<55||Math.abs(dx)<Math.abs(dy)*1.25)return;
    navigateDayDialog(dx<0?1:-1);
  }
  function setLinkAttachment(kind,value='') {
    const input=$(`${kind}Link`),wrap=$(`${kind}LinkWrap`),toggle=$(`${kind}LinkToggle`),url=normalizeLink(value);
    input.value=url;wrap.hidden=!url;toggle.hidden=Boolean(url);
  }
  function toggleLinkAttachment(kind) { $(`${kind}LinkWrap`).hidden=false;$(`${kind}LinkToggle`).hidden=true;$(`${kind}Link`).focus(); }
  function clearLinkAttachment(kind) { $(`${kind}Link`).value='';$(`${kind}LinkWrap`).hidden=true;$(`${kind}LinkToggle`).hidden=false; }
  function readTaskChecklistDraft(includeEmpty=false) {
    return Array.from($('taskChecklistList').querySelectorAll('[data-task-checklist-row]')).map((row,index)=>{
      const completed=Boolean(row.querySelector('[data-task-checklist-done]')?.checked),order=Number(row.dataset.checklistOrder),completedOrder=Number(row.dataset.checklistCompletedOrder);
      return {id:String(row.dataset.checklistId||makeId()),text:String(row.querySelector('[data-task-checklist-text]')?.value||'').trim().slice(0,180),completed,order:Number.isFinite(order)?order:index,completedOrder:completed&&Number.isFinite(completedOrder)?completedOrder:null};
    }).filter(item=>includeEmpty||item.text).slice(0,50).sort((a,b)=>a.order-b.order);
  }

  function resizeTaskChecklistTextarea(textarea) {
    if(!textarea)return;
    textarea.style.height='auto';
    textarea.style.height=`${Math.max(40,textarea.scrollHeight)}px`;
  }
  function taskChecklistRowHTML(item,index,completed) {
    const id=String(item.id||makeId()),order=Number.isFinite(Number(item.order))?Number(item.order):index,completedOrder=Number.isFinite(Number(item.completedOrder))?Number(item.completedOrder):index;
    return `<div class="task-checklist-row${completed?' is-complete':''}" data-task-checklist-row data-checklist-id="${escapeHTML(id)}" data-checklist-order="${order}" data-checklist-completed="${completed?'true':'false'}" data-checklist-completed-order="${completedOrder}" draggable="false"><button class="btn ghost small task-checklist-drag" type="button" draggable="true" data-task-checklist-drag aria-label="Arrastar etapa ${index+1}" title="Arrastar etapa">⠿</button><input type="checkbox" data-task-checklist-done aria-label="Marcar etapa ${index+1} como concluída" ${completed?'checked':''}><textarea data-task-checklist-text maxlength="180" rows="1" placeholder="Etapa ${index+1}" aria-label="Texto da etapa ${index+1}">${escapeHTML(item.text||'')}</textarea><button class="btn ghost small task-checklist-remove" type="button" data-remove-task-checklist-item aria-label="Remover etapa ${index+1}" title="Remover etapa">×</button></div>`;
  }

  function renderTaskChecklist(items=[],options={}) {
    const list=$('taskChecklistList'),rows=normalizeTaskSubtasks(Array.isArray(items)?items.slice(0,50):[]),open=rows.filter(item=>!item.completed).sort((a,b)=>a.order-b.order),completed=rows.filter(item=>item.completed).sort((a,b)=>a.completedOrder-b.completedOrder);
    const openRows=open.map((item,index)=>taskChecklistRowHTML(item,index,false)).join(''),completedRows=completed.map((item,index)=>taskChecklistRowHTML(item,index,true)).join('');
    const empty=open.length?'':completed.length?'<p class="task-checklist-empty">Nenhuma etapa em aberto.</p>':'<p class="task-checklist-empty">Nenhuma etapa adicionada.</p>';
    list.innerHTML=`<section class="task-checklist-section task-checklist-open-section"><h4 class="task-checklist-section-title">EM ABERTO (${open.length})</h4><div class="task-checklist-group" data-task-checklist-group="open">${openRows||empty}</div></section>${completed.length?`<details class="task-checklist-section task-checklist-completed" data-task-checklist-group="completed"${options.completedOpen?' open':''}><summary class="task-checklist-section-title">CONCLUÍDAS (${completed.length})</summary><div class="task-checklist-completed-list">${completedRows}</div></details>`:''}`;
    list.querySelectorAll('[data-task-checklist-text]').forEach(resizeTaskChecklistTextarea);
  }
  function moveChecklistItemToCompletion(items,id,complete) {
    const rows=items.slice().sort((a,b)=>a.order-b.order),item=rows.find(row=>row.id===String(id));if(!item)return rows;
    if(Boolean(item.completed)===Boolean(complete))return rows;
    item.completed=Boolean(complete);
    if(complete){const done=rows.filter(row=>row.completed&&row.id!==item.id);item.completedOrder=done.length?Math.max(...done.map(row=>Number(row.completedOrder)||0))+1:0;}
    else delete item.completedOrder;
    return rows;
  }

  function saveTaskChecklistProgress(items) {
    let taskId=$('taskId').value,task=taskId?tasks.find(item=>item.id===taskId&&!item.deletedAt):null;
    if(!task){
      if(!$('taskTitle').value.trim()){showToast('Preencha o título para salvar e sincronizar a checklist.');return false;}
      if(!saveTaskFromForm({preventDefault(){}},false))return false;
      taskId=$('taskId').value;task=tasks.find(item=>item.id===taskId&&!item.deletedAt);
    }
    if(!task)return false;
    taskDialogDirty=true;task.subtasks=normalizeTaskSubtasks(items);task.updatedAt=nowISO();saveTasks(false);createAutomaticBackup(false);
    if(session?.user?.id){void syncTaskChecklistImmediately(task.id).then(ok=>{if(!ok){scheduleSync();showToast('Checklist salva aqui; sincronização pendente.',3200);}});}
    else showToast('Checklist salva neste aparelho; entre na conta para sincronizar.',3500);
    return true;
  }
  function syncTaskChecklistImmediately(taskId) {
    const run=async()=>{
      if(!session?.user?.id||!CLOUD_READY)return false;
      while(syncInFlight)await new Promise(resolve=>setTimeout(resolve,40));
      const task=tasks.find(item=>item.id===String(taskId)&&!item.deletedAt);if(!task)return false;
      const hadScheduledSync=Boolean(syncTimer);if(syncTimer){clearTimeout(syncTimer);syncTimer=null;}
      syncInFlight=true;updateAuthUI();let ok=false;
      try{
        const path=`nmm_tasks?id=eq.${encodeURIComponent(task.id)}&owner_id=eq.${encodeURIComponent(session.user.id)}`;
        const checklistSnapshot=normalizeTaskSubtasks(task.subtasks),updatedAtSnapshot=task.updatedAt;
        let rows=await cloudRequest(path,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({subtasks:checklistSnapshot,updated_at:updatedAtSnapshot,planner_version:1})});
        if(!Array.isArray(rows)||!rows.length){
          const exists=await cloudRequest(`nmm_tasks?select=id&id=eq.${encodeURIComponent(task.id)}&owner_id=eq.${encodeURIComponent(session.user.id)}`);
          if(Array.isArray(exists)&&exists.length)rows=await cloudRequest(path,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({subtasks:checklistSnapshot,updated_at:updatedAtSnapshot,planner_version:1})});
          else rows=await cloudRequest('nmm_tasks?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(taskToRow(task))});
        }
        if(Array.isArray(rows)&&rows.length){ok=true;syncStatus=`Sincronizado · ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;}
        else syncStatus='Sincronização pendente';
      }catch{syncStatus='Sincronização pendente';}
      finally{
        syncInFlight=false;const queued=syncQueued;syncQueued=false;updateAuthUI();
        if(hadScheduledSync||queued||syncTimer)scheduleSync();
      }
      return ok;
    };
    const request=checklistSyncQueue.then(run,run);checklistSyncQueue=request.catch(()=>false);return request;
  }
  function handleTaskChecklistToggle(checkbox) {
    const row=checkbox.closest('[data-task-checklist-row]');if(!row)return;
    const items=readTaskChecklistDraft(true),id=row.dataset.checklistId,oldCompleted=row.dataset.checklistCompleted==='true',item=items.find(entry=>entry.id===id);
    if(!item)return;item.completed=oldCompleted;
    const completedOpen=Boolean($('taskChecklistList').querySelector('.task-checklist-completed')?.open),updated=moveChecklistItemToCompletion(items,id,checkbox.checked);
    renderTaskChecklist(updated,{completedOpen});saveTaskChecklistProgress(updated);
  }
  function reorderTaskChecklist(sourceId,target,clientY=0) {
    const list=$('taskChecklistList'),source=Array.from(list.querySelectorAll('[data-task-checklist-row]')).find(row=>row.dataset.checklistId===String(sourceId)),targetGroup=target?.closest('[data-task-checklist-group]');
    if(!source||!targetGroup)return false;
    const completed=source.dataset.checklistCompleted==='true';if(targetGroup.dataset.taskChecklistGroup!==(completed?'completed':'open'))return false;
    const items=readTaskChecklistDraft(true).sort((a,b)=>a.order-b.order),group=items.filter(item=>Boolean(item.completed)===completed).sort((a,b)=>completed?a.completedOrder-b.completedOrder:a.order-b.order),from=group.findIndex(item=>item.id===String(sourceId));if(from<0)return false;
    const originalIds=group.map(item=>item.id),[moving]=group.splice(from,1),targetRow=target.closest('[data-task-checklist-row]');let to=group.length;
    if(targetRow&&targetRow!==source&&targetRow.dataset.checklistCompleted===(completed?'true':'false')){
      const targetIndex=group.findIndex(item=>item.id===targetRow.dataset.checklistId);
      if(targetIndex>=0){const rect=targetRow.getBoundingClientRect();to=targetIndex+(clientY>rect.top+rect.height/2?1:0);}
    }else if(targetRow===source)return false;
    to=Math.max(0,Math.min(to,group.length));group.splice(to,0,moving);if(group.every((item,index)=>item.id===originalIds[index]))return false;
    if(completed)group.forEach((item,index)=>{item.completedOrder=index;});
    else{
      const slots=items.filter(item=>!item.completed).sort((a,b)=>a.order-b.order).map(item=>item.order);
      group.forEach((item,index)=>{item.order=slots[index];});
    }
    const updated=items.sort((a,b)=>a.order-b.order),completedOpen=Boolean(list.querySelector('.task-checklist-completed')?.open);renderTaskChecklist(updated,{completedOpen});saveTaskChecklistProgress(updated);return true;
  }

  function handleTaskChecklistDragStart(event) {
    const row=event.target.closest('[data-task-checklist-row]');
    if(!row||!event.target.closest('[data-task-checklist-drag]')){event.preventDefault();return;}
    checklistDragId=row.dataset.checklistId;checklistDragGroup=row.dataset.checklistCompleted==='true'?'completed':'open';row.classList.add('is-dragging');
    if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',checklistDragId);}
  }
  function handleTaskChecklistDragOver(event) {
    if(!checklistDragId)return;
    const targetGroup=event.target.closest('[data-task-checklist-group]');if(!targetGroup||targetGroup.dataset.taskChecklistGroup!==checklistDragGroup)return;
    event.preventDefault();(event.target.closest('[data-task-checklist-row]')||targetGroup).classList.add('drop-active');
  }
  function handleTaskChecklistDrop(event) {
    if(!checklistDragId)return;
    const id=checklistDragId,group=checklistDragGroup;checklistDragId='';checklistDragGroup='';
    const targetGroup=event.target.closest('[data-task-checklist-group]');if(!targetGroup||targetGroup.dataset.taskChecklistGroup!==group)return;
    event.preventDefault();reorderTaskChecklist(id,event.target,event.clientY);
  }
  function addTaskChecklistItem() {
    const items=readTaskChecklistDraft(true);
    if(items.length>=50){showToast('O checklist aceita até 50 etapas.');return;}
    const order=items.length?Math.max(...items.map(item=>Number(item.order)||0))+1:0;
    items.push({id:makeId(),text:'',completed:false,order});renderTaskChecklist(items);$('taskChecklistList').querySelector('[data-task-checklist-group="open"] [data-task-checklist-row]:last-child [data-task-checklist-text]')?.focus();taskDialogDirty=true;
  }

  function openTaskDialog(taskId='',suggestedDate='',reuseHistoryToken='') {
    taskDialogDirty=false;lastTaskCtrlEnterAt=0;
    const task=taskId ? tasks.find(item=>item.id===String(taskId) && !item.deletedAt) : null;
    $('taskForm').reset();
    $('taskId').value=task ? task.id : '';
    $('taskDialogTitle').textContent=task ? 'Editar tarefa' : 'Nova tarefa';
    $('taskTitle').value=task?.title || '';$('taskContent').value=task?.content || '';renderTaskChecklist(task?.subtasks||[]);
    renderTaskTagOptions(task?.tagId || filterTagIds[0] || localStorage.getItem(LAST_TAG_KEY) || 'vida');
    $('executionDate').value=task?.executionDate || suggestedDate || '';setLinkAttachment('task',task?.link||'');
    const recurrence=task?.recurrence||null;$('taskRecurrence').value=recurrence?.frequency||'';$('recurrenceInterval').value=String(recurrence?.interval||1);$('recurrenceUntil').value=recurrence?.until||'';
    document.querySelectorAll('[name="recurrenceWeekday"]').forEach(box=>{box.checked=Boolean(recurrence?.weekdays?.includes(Number(box.value)));});updateTaskRecurrenceUI(false);
    $('deleteTaskBtn').classList.toggle('hidden',!task);
    showAppDialog($('taskDialog'),reuseHistoryToken);
    requestAnimationFrame(()=>{ $('taskChecklistList').querySelectorAll('[data-task-checklist-text]').forEach(resizeTaskChecklistTextarea); });
  }
  function closeTaskDialog() { taskDialogDirty=false;if ($('taskDialog').open) $('taskDialog').close(); }
  function savePopupBeforeClose(dialog) {
    if(dialog.id==='taskDialog'&&taskDialogDirty){
      const hasText=$('taskTitle').value.trim()||$('taskContent').value.trim()||$('taskLink').value.trim()||readTaskChecklistDraft().length;
      if(!hasText){taskDialogDirty=false;return true;}
      saveTaskFromForm({preventDefault(){}});
      if(dialog.open){showToast('Preencha o título da tarefa. Mantive o popup aberto para não perder o texto.');return false;}
      return true;
    }
    if(dialog.id==='noteDialog'&&noteDialogDirty){
      const hasText=$('noteId').value||$('noteTitle').value.trim()||$('noteContent').value.trim()||noteLinkInputsHaveValue('noteLinksList');
      if(!hasText){noteDialogDirty=false;return true;}
      saveNote({preventDefault(){}});
      if(dialog.open){showToast('Confira o título, o conteúdo e os links. Mantive o popup aberto para não perder o texto.');return false;}
      return true;
    }
    return true;
  }
  function closeTaskDialogSafely() {
    const dialog=$('taskDialog'),hasItem=Boolean($('taskId').value||$('taskTitle').value.trim()||$('taskContent').value.trim()||$('taskLink').value.trim()||readTaskChecklistDraft().length);
    if(!savePopupBeforeClose(dialog))return;
    if(dialog.open){closeTaskDialog();if(hasItem)showToast('Tarefa salva.',3000);}
  }
  function closeNoteDialogSafely() {
    const dialog=$('noteDialog'),hasItem=Boolean($('noteId').value||$('noteTitle').value.trim()||$('noteContent').value.trim()||noteLinkInputsHaveValue('noteLinksList'));
    if(!savePopupBeforeClose(dialog))return;
    if(dialog.open){dialog.close();if(hasItem)showToast('Nota salva.',3000);}
  }
  function saveTaskFromForm(event,close=true) {
    event?.preventDefault?.();
    const title=$('taskTitle').value.trim(),content=$('taskContent').value.trim(),link=normalizeLink($('taskLink').value),tagId=$('taskTag').value,date=$('executionDate').value||null,subtasks=readTaskChecklistDraft();
    const id=$('taskId').value,existing=id?tasks.find(task=>task.id===id&&!task.deletedAt):null,now=nowISO(),savedId=existing?.id||makeId();
    const recurrenceResult=recurrenceFromTaskForm(existing,savedId,date);
    if(recurrenceResult.error){showToast(recurrenceResult.error);return false;}
    if(!title||!tags.some(tag=>tag.id===tagId&&!tag.deletedAt)||(date&&!isDateKey(date))){showToast('Confira o título, a tag e a data da tarefa.');return false;}
    const recurrence=recurrenceResult.value;
    if(existing){
      if((existing.executionDate||'')!==(date||''))existing.sortOrder=nextTaskOrder(date);
      existing.title=title;existing.content=content;existing.link=link;existing.tagId=tagId;existing.executionDate=date;existing.recurrence=recurrence;existing.subtasks=subtasks;existing.updatedAt=now;
    }else tasks.push({id:savedId,title,content,link,tagId,executionDate:date,recurrence,subtasks,sortOrder:nextTaskOrder(date),createdAt:now,updatedAt:now,completedAt:null,deletedAt:null});
    $('taskId').value=savedId;
    if(!close){$('taskDialogTitle').textContent='Editar tarefa';$('deleteTaskBtn').classList.remove('hidden');}
    localStorage.setItem(LAST_TAG_KEY,tagId);
    if(date&&date>=todayKey())setWeek(date);
    taskDialogDirty=false;if(close)closeTaskDialog();saveTasks();
    if(!date)togglePlannerSection('planning',true);
    showToast(close?'Tarefa salva.':existing?'Tarefa atualizada.':'Tarefa adicionada.',close?3000:2600);return true;
  }
  function softDeleteTask() { softDeleteTaskById($('taskId').value); }
  function softDeleteTaskById(id) {
    const task=tasks.find(item=>item.id===String(id) && !item.deletedAt);
    if (!task || !window.confirm(`Excluir “${task.title}”?`)) return;
    task.deletedAt=nowISO(); task.updatedAt=task.deletedAt;
    closeTaskDialog(); saveTasks(); showToast('Tarefa excluída.');
  }
  function createNextTaskOccurrence(task) {
    if(!task.recurrence)return null;
    const rule=normalizeRecurrence(task.recurrence,task.executionDate,task.id),currentDate=task.executionDate||rule?.anchorDate,nextDate=rule&&currentDate?nextRecurrenceDate(currentDate,rule):null;
    if(!nextDate)return null;
    const seriesId=rule.seriesId||task.id;
    if(tasks.some(item=>item.recurrence?.seriesId===seriesId&&item.executionDate===nextDate))return null;
    const now=nowISO(),id=makeId(),recurrence={...rule,seriesId};
    const subtasks=normalizeTaskSubtasks(task.subtasks).map(item=>({id:makeId(),text:item.text,completed:false}));
    tasks.push({id,title:task.title,content:task.content,link:task.link,tagId:task.tagId,executionDate:nextDate,recurrence,subtasks,sortOrder:nextTaskOrder(nextDate),createdAt:now,updatedAt:now,completedAt:null,deletedAt:null});
    return nextDate;
  }
  function toggleComplete(taskId,complete) {
    const task=tasks.find(item=>item.id===String(taskId)&&!item.deletedAt);if(!task)return null;
    const wasCompleted=Boolean(task.completedAt);task.completedAt=complete?nowISO():null;task.updatedAt=nowISO();
    const nextDate=complete&&!wasCompleted?createNextTaskOccurrence(task):null;saveTasks();return nextDate;
  }
  function showTaskCompletionToast(nextDate) {
    showToast(nextDate?`Tarefa concluída. Próxima ocorrência: ${formatDate(nextDate,{weekday:'short',day:'2-digit',month:'2-digit'})}.`:'Tarefa concluída.');
  }
  function setTaskDate(taskId,date) {
    const task=tasks.find(item=>item.id===String(taskId) && !item.deletedAt && !item.completedAt);
    if (!task || (date && !isDateKey(date))) return;
    if ((task.executionDate||'')!==(date||'')) task.sortOrder=nextTaskOrder(date);
    task.executionDate=date || null; task.updatedAt=nowISO();
    if (date && date>=todayKey()) setWeek(date);
    saveTasks();
    showToast(date && date<startOfWeek(todayKey())?'Foi para ATRASADO.':date?'Data de execução atualizada.':'Voltou para Planejar.');
  }
  function moveTask(taskId,direction) {
    const task=tasks.find(item=>item.id===String(taskId)&&!item.deletedAt&&!item.completedAt);
    if (!task) return;
    const peers=tasks.filter(item=>!item.deletedAt&&!item.completedAt&&(item.executionDate||'')===(task.executionDate||'')).sort(taskOrder);
    const index=peers.findIndex(item=>item.id===task.id), target=index+(direction==='up'?-1:1);
    if (target<0||target>=peers.length) return;
    [peers[index],peers[target]]=[peers[target],peers[index]];
    peers.forEach((item,i)=>{item.sortOrder=i;item.updatedAt=nowISO();});
    saveTasks();
  }
  function reorderTaskBefore(sourceId,targetId) {
    if (sourceId===targetId) return;
    const source=tasks.find(item=>item.id===sourceId&&!item.deletedAt&&!item.completedAt), target=tasks.find(item=>item.id===targetId&&!item.deletedAt&&!item.completedAt);
    if (!source||!target) return;
    if ((source.executionDate||'')!==(target.executionDate||'')) source.executionDate=target.executionDate||null;
    const peers=tasks.filter(item=>!item.deletedAt&&!item.completedAt&&(item.executionDate||'')===(target.executionDate||'')).sort(taskOrder);
    const from=peers.findIndex(item=>item.id===sourceId), to=peers.findIndex(item=>item.id===targetId);
    if (from<0||to<0) return;
    peers.splice(from,1); peers.splice(to,0,source);
    peers.forEach((item,i)=>{item.sortOrder=i;item.updatedAt=nowISO();});
    source.updatedAt=nowISO(); saveTasks();
  }
  function reorderOverdueTaskBefore(sourceId,targetId='') {
    const today=todayKey(),ordered=sortOverdueTasks(tasks.filter(task=>!task.deletedAt&&!task.completedAt&&task.executionDate&&task.executionDate<today));
    const from=ordered.findIndex(task=>task.id===String(sourceId));if(from<0)return;
    const [source]=ordered.splice(from,1),to=targetId?ordered.findIndex(task=>task.id===String(targetId)):ordered.length;
    if(to<0)return;
    ordered.splice(to,0,source);userSettings.overdueTaskOrder=ordered.map(task=>task.id);saveUserSettings();renderDayDialog();showToast('Ordem do ATRASADO atualizada; as datas foram mantidas.');
  }
  function appendTaskToBucket(taskId,date) {
    const task=tasks.find(item=>item.id===taskId&&!item.deletedAt&&!item.completedAt);
    if(!task||(date&&!isDateKey(date)))return;
    task.executionDate=date||null;
    const peers=tasks.filter(item=>!item.deletedAt&&!item.completedAt&&item.id!==taskId&&(item.executionDate||'')===(date||'')).sort(taskOrder);
    peers.push(task);peers.forEach((item,i)=>{item.sortOrder=i;item.updatedAt=nowISO();});saveTasks();
  }
  function handleDayAreaDoubleClick(event) {
    const column=event.target.closest('.day-column');
    if(!column||!event.currentTarget.contains(column)||event.target.closest('.day-head-row,.task-card,button,a,input,select,textarea,details,[data-touch-drag-task]'))return;
    const header=column.querySelector('[data-open-day]');if(header)openDayDialog(header.dataset.openDay);
  }
  function handleTaskClick(event) {
    if(event.target.closest('[data-touch-drag-task]')){event.preventDefault();return;}
    const completion=event.target.closest('[data-toggle-complete-task]');
    if(completion){const complete=completion.dataset.complete==='true',nextDate=toggleComplete(completion.dataset.toggleCompleteTask,complete);if(complete)showTaskCompletionToast(nextDate);else showToast('Tarefa reaberta.');return;}
    const move=event.target.closest('[data-move-task]');
    if (move) { moveTask(move.dataset.moveTask,move.dataset.direction); return; }
    const remove=event.target.closest('[data-delete-task]');
    if (remove) { softDeleteTaskById(remove.dataset.deleteTask); return; }
    const edit=event.target.closest('[data-edit-task]');
    if (edit) { openTaskDialog(edit.dataset.editTask); return; }
    const add=event.target.closest('[data-add-date]');
    if (add) { openTaskDialog('',add.dataset.addDate); return; }
    const openDay=event.target.closest('[data-open-day]');
    if (openDay) { openDayDialog(openDay.dataset.openDay); return; }
  }
  function openHomeAction(action) {
    if(action==='overdue'){setPage('tasks');openDayDialog('all-overdue');return;}
    if(action==='today'){setWeek(todayKey());setPage('tasks');openDayDialog(todayKey());return;}
    if(action==='planning'){setPage('tasks');togglePlannerSection('planning',true);}
  }
  function closeFloatingActionMenu() {
    if(!floatingActionMenu)return;
    floatingActionMenu.remove();floatingActionMenu=null;
  }
  function openFloatingActionMenu(details) {
    closeFloatingActionMenu();
    const source=details.querySelector('.task-menu-popover,.note-menu-popover'),summary=details.querySelector('summary');
    if(!source||!summary)return;
    const rect=summary.getBoundingClientRect(),host=details.closest('dialog[open]'),menu=document.createElement('div');
    menu.className=`floating-action-menu${host?' in-dialog':''}`;menu.innerHTML=source.innerHTML;menu.setAttribute('role','menu');
    (host||document.body).append(menu);
    menu.addEventListener('click',event=>{
      const action=event.target.closest('button'); if(!action)return;
      event.preventDefault();event.stopPropagation();
      if(action.matches('[data-edit-task],[data-toggle-complete-task],[data-move-task],[data-delete-task]'))handleTaskClick(event);
      else handleNotesClick(event);
      closeFloatingActionMenu();
    });
    const width=menu.offsetWidth,height=menu.offsetHeight;
    if(host){
      const box=host.getBoundingClientRect(),maxLeft=Math.max(8,host.clientWidth-width-8),maxTop=Math.max(8,host.clientHeight-height-8);
      let left=rect.right-box.left-host.clientLeft-width;
      if(left<8)left=rect.left-box.left-host.clientLeft;
      let top=rect.bottom-box.top-host.clientTop+host.scrollTop+5;
      if(top>maxTop)top=rect.top-box.top-host.clientTop+host.scrollTop-height-5;
      menu.style.left=`${Math.max(8,Math.min(left,maxLeft))+host.scrollLeft}px`;
      menu.style.top=`${Math.max(8,Math.min(top,maxTop))+host.scrollTop}px`;
    }else{
      const left=Math.max(8,Math.min(rect.right-width,window.innerWidth-width-8));
      let top=rect.bottom+5;if(top+height>window.innerHeight-8)top=rect.top-height-5;
      menu.style.left=`${left}px`;menu.style.top=`${Math.max(8,Math.min(top,window.innerHeight-height-8))}px`;
    }
    floatingActionMenu=menu;requestAnimationFrame(()=>menu.querySelector('button')?.focus());
  }
  function captureActionMenuClick(event) {
    const summary=event.target.closest('.task-menu>summary,.note-menu>summary');
    if(summary){event.preventDefault();event.stopPropagation();openFloatingActionMenu(summary.parentElement);return;}
    if(floatingActionMenu&&!event.target.closest('.floating-action-menu'))closeFloatingActionMenu();
  }
  function handleDragStart(event) {
    const card=event.target.closest('.task-card[data-task-id]');
    if (!card || event.target.closest('.task-menu')) { event.preventDefault(); return; }
    const task=tasks.find(item=>item.id===card.dataset.taskId && !item.completedAt && !item.deletedAt);
    if (!task) { event.preventDefault(); return; }
    dragTaskId=task.id; card.classList.add('is-dragging');
    if (event.dataTransfer) { event.dataTransfer.effectAllowed='move'; event.dataTransfer.setData('text/plain',dragTaskId); }
  }
  function clearDropStyles() { document.querySelectorAll('.drop-active,.is-dragging').forEach(node=>node.classList.remove('drop-active','is-dragging')); }
  function handleDragOver(event) {
    if (!dragTaskId) return;
    const targetCard=event.target.closest('.task-card[data-task-id]');
    const destination=event.target.closest('.day-column[data-date],.day-column[data-kind="overdue"],#planningPanel,#planningBtn,#completedPanel,#completedBtn,#dayDialogList');
    if(!targetCard&&!destination)return;
    event.preventDefault();(targetCard||destination)?.classList.add('drop-active');
  }
  function performTaskDrop(id,target) {
    if(!target)return;
    const targetCard=target.closest('.task-card[data-task-id]'),completed=target.closest('#completedPanel,#completedList,#completedBtn'),day=target.closest('.day-column[data-date]'),overdueColumn=target.closest('.day-column[data-kind="overdue"]'),planning=target.closest('#planningPanel,#planningList,#planningBtn'),dayList=target.closest('#dayDialogList');
    if(completed){const task=tasks.find(item=>item.id===String(id)&&!item.deletedAt&&!item.completedAt);if(task){const nextDate=toggleComplete(id,true);showTaskCompletionToast(nextDate);}return;}
    if(overdueColumn||dayList&&activeDayKind==='all-overdue')reorderOverdueTaskBefore(id,targetCard?.dataset.taskId||'');
    else if(targetCard)reorderTaskBefore(id,targetCard.dataset.taskId);
    else if(day)appendTaskToBucket(id,day.dataset.date);
    else if(planning)appendTaskToBucket(id,'');
    else if(dayList&&activeDayKind==='day')appendTaskToBucket(id,activeDayDate);
  }
  function handleDrop(event) {
    if(!dragTaskId)return;
    const id=dragTaskId;dragTaskId='';clearDropStyles();
    if(!event.target.closest('.task-card[data-task-id],.day-column[data-date],.day-column[data-kind="overdue"],#planningPanel,#planningBtn,#completedPanel,#completedBtn,#dayDialogList'))return;
    event.preventDefault();performTaskDrop(id,event.target);
  }
  function handleDragEnd() { dragTaskId=''; clearDropStyles(); }
  function handleNotesClick(event) {
    if(event.target.closest('[data-touch-drag-note]')){event.preventDefault();return;}
    if(event.target.closest('a'))return;
    const lock=event.target.closest('[data-lock-note]');if(lock){requestPrivateMove(lock.dataset.lockNote);return;}
    const pin=event.target.closest('[data-pin-note]');if(pin){toggleNotePin(pin.dataset.pinNote);return;}
    const duplicate=event.target.closest('[data-duplicate-note]');if(duplicate){duplicateNote(duplicate.dataset.duplicateNote);return;}
    const move=event.target.closest('[data-move-note]');
    if (move) { moveNote(move.dataset.moveNote,move.dataset.direction); return; }
    const remove=event.target.closest('[data-delete-note]');
    if (remove) { deleteNote(remove.dataset.deleteNote); return; }
    const edit=event.target.closest('[data-edit-note]');
    if (edit) { openNoteDialog(edit.dataset.editNote); return; }
    if (event.target.closest('.note-menu')) return;
    const card=event.target.closest('[data-note-card]');
    if (card) openNoteDialog(card.dataset.noteCard);
  }
  function handleNoteKey(event) {
    if ((event.key==='Enter'||event.key===' ')&&!event.target.closest('button,summary')) { const card=event.target.closest('[data-note-card]'); if(card){event.preventDefault();openNoteDialog(card.dataset.noteCard);} }
  }
  function handleNoteDragStart(event) {
    const card=event.target.closest('.note-card[data-note-id]');
    if (!card||event.target.closest('button,summary')) { event.preventDefault(); return; }
    noteDragId=card.dataset.noteId; card.classList.add('is-dragging');
    if (event.dataTransfer) {event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',noteDragId);}
  }
  function moveNote(noteId,direction) {
    const source=notes.find(note=>note.id===String(noteId)&&!note.deletedAt);if(!source)return;
    const list=notes.filter(note=>!note.deletedAt&&Boolean(note.isPinned)===Boolean(source.isPinned)).sort(noteOrder),index=list.findIndex(note=>note.id===source.id),target=index+(direction==='up'?-1:1);
    if(index<0||target<0||target>=list.length)return;
    [list[index],list[target]]=[list[target],list[index]];
    list.forEach((note,i)=>{note.sortOrder=i;note.updatedAt=nowISO();});saveNotes();
  }
  function reorderNoteBefore(sourceId,targetId) {
    if(sourceId===targetId)return;
    const source=notes.find(note=>note.id===sourceId&&!note.deletedAt),target=notes.find(note=>note.id===targetId&&!note.deletedAt);
    if(!source||!target||Boolean(source.isPinned)!==Boolean(target.isPinned))return;
    const list=notes.filter(note=>!note.deletedAt&&Boolean(note.isPinned)===Boolean(source.isPinned)).sort(noteOrder),from=list.findIndex(note=>note.id===sourceId),to=list.findIndex(note=>note.id===targetId);
    if(from<0||to<0)return;
    list.splice(to,0,list.splice(from,1)[0]);list.forEach((note,i)=>{note.sortOrder=i;note.updatedAt=nowISO();});saveNotes();
  }
  function handleNoteDragOver(event) {
    if(!noteDragId)return;
    const target=event.target.closest('.note-card[data-note-id]'); if(target){event.preventDefault();target.classList.add('drop-active');}
  }
  function handleNoteDrop(event) {
    if(!noteDragId)return;
    const target=event.target.closest('.note-card[data-note-id]'), source=noteDragId; noteDragId=''; clearDropStyles();
    if(target){event.preventDefault();reorderNoteBefore(source,target.dataset.noteId);}
  }
  function updateDragHighlight(drag,target) {
    document.querySelectorAll('.drop-active').forEach(node=>node.classList.remove('drop-active'));
    if(!target)return;
    let destination;
    if(drag.kind==='task')destination=target.closest('.task-card[data-task-id],.day-column[data-date],.day-column[data-kind="overdue"],#planningPanel,#planningBtn,#completedPanel,#completedBtn,#dayDialogList');
    else if(drag.kind==='checklist'){
      const sourceGroup=drag.card.closest('[data-task-checklist-group]'),targetGroup=target.closest('[data-task-checklist-group]');
      if(sourceGroup&&targetGroup&&sourceGroup.dataset.taskChecklistGroup===targetGroup.dataset.taskChecklistGroup)destination=target.closest('[data-task-checklist-row]')||targetGroup;
    }else destination=target.closest('.note-card[data-note-id]');
    if(destination&&destination!==drag.card)destination.classList.add('drop-active');
  }
  function finishDragAt(drag,target,cancel=false,clientY=0) {
    if(pointerDrag!==drag)return;
    pointerDrag=null;drag.card.classList.remove('is-dragging');
    if(drag.wasDraggable!==null)drag.card.setAttribute('draggable',drag.wasDraggable);
    document.querySelectorAll('.drop-active').forEach(node=>node.classList.remove('drop-active'));
    if(cancel||!target)return;
    if(drag.kind==='task')performTaskDrop(drag.id,target);
    else if(drag.kind==='checklist')reorderTaskChecklist(drag.id,target,clientY);
    else {const note=target.closest('.note-card[data-note-id]');if(note)reorderNoteBefore(drag.id,note.dataset.noteId);}
  }
  function startPointerDrag(event) {
    if(event.pointerType==='mouse'||event.pointerType==='touch'||event.button!==0||pointerDrag)return;
    const taskHandle=event.target.closest('[data-touch-drag-task]'),noteHandle=event.target.closest('[data-touch-drag-note]'),checklistHandle=event.target.closest('[data-task-checklist-drag]');
    if(!taskHandle&&!noteHandle&&!checklistHandle)return;
    const kind=taskHandle?'task':noteHandle?'note':'checklist',card=taskHandle?taskHandle.closest('.task-card[data-task-id]'):noteHandle?noteHandle.closest('.note-card[data-note-id]'):checklistHandle.closest('[data-task-checklist-row]');
    if(!card)return;
    event.preventDefault();pointerDrag={kind,id:taskHandle?taskHandle.dataset.touchDragTask:noteHandle?noteHandle.dataset.touchDragNote:card.dataset.checklistId,pointerId:event.pointerId,source:'pointer',card,wasDraggable:card.getAttribute('draggable')};
    card.setAttribute('draggable','false');card.classList.add('is-dragging');try{event.target.setPointerCapture(event.pointerId);}catch{}
  }
  function movePointerDrag(event) {
    if(!pointerDrag||pointerDrag.source!=='pointer'||event.pointerId!==pointerDrag.pointerId)return;
    event.preventDefault();updateDragHighlight(pointerDrag,document.elementFromPoint(event.clientX,event.clientY));
  }
  function finishPointerDrag(event,cancel=false) {
    if(!pointerDrag||pointerDrag.source!=='pointer'||event.pointerId!==pointerDrag.pointerId)return;
    finishDragAt(pointerDrag,document.elementFromPoint(event.clientX,event.clientY),cancel,event.clientY);
  }
  function startTouchDrag(event) {
    if(pointerDrag)return;
    const taskHandle=event.target.closest('[data-touch-drag-task]'),noteHandle=event.target.closest('[data-touch-drag-note]'),checklistHandle=event.target.closest('[data-task-checklist-drag]'),touch=event.changedTouches?.[0];
    if((!taskHandle&&!noteHandle&&!checklistHandle)||!touch)return;
    const kind=taskHandle?'task':noteHandle?'note':'checklist',card=taskHandle?taskHandle.closest('.task-card[data-task-id]'):noteHandle?noteHandle.closest('.note-card[data-note-id]'):checklistHandle.closest('[data-task-checklist-row]');
    if(!card)return;
    event.preventDefault();pointerDrag={kind,id:taskHandle?taskHandle.dataset.touchDragTask:noteHandle?noteHandle.dataset.touchDragNote:card.dataset.checklistId,touchId:touch.identifier,source:'touch',card,wasDraggable:card.getAttribute('draggable')};
    card.setAttribute('draggable','false');card.classList.add('is-dragging');
  }
  function moveTouchDrag(event) {
    if(!pointerDrag||pointerDrag.source!=='touch')return;
    const touch=Array.from(event.changedTouches||[]).find(item=>item.identifier===pointerDrag.touchId)||Array.from(event.touches||[]).find(item=>item.identifier===pointerDrag.touchId);
    if(!touch)return;event.preventDefault();updateDragHighlight(pointerDrag,document.elementFromPoint(touch.clientX,touch.clientY));
  }
  function finishTouchDrag(event,cancel=false) {
    if(!pointerDrag||pointerDrag.source!=='touch')return;
    const drag=pointerDrag,touch=Array.from(event.changedTouches||[]).find(item=>item.identifier===drag.touchId);
    finishDragAt(drag,touch?document.elementFromPoint(touch.clientX,touch.clientY):null,cancel,touch?.clientY||0);
  }
  function renderNoteTagChoices(selected=[]) {
    $('noteTagChoices').innerHTML=tags.filter(tag=>!tag.deletedAt).map(tag=>`<label class="note-tag-choice"><input type="checkbox" value="${escapeHTML(tag.id)}" ${selected.includes(tag.id)?'checked':''}><span class="tag-dot" style="--tag-color:${tag.color}" aria-hidden="true"></span><span>${escapeHTML(tag.name)}</span></label>`).join('');
  }
  function openNoteDialog(noteId='') {
    noteDialogDirty=false;lastNoteCtrlEnterAt=0;
    const note=noteId ? notes.find(item=>item.id===String(noteId) && !item.deletedAt) : null;
    $('noteForm').reset();$('noteId').value=note?.id || '';
    $('noteDialogTitle').textContent=note?'Editar nota':'Nova nota';
    $('deleteNoteBtn').classList.toggle('hidden',!note);
    $('lockNoteBtn').classList.toggle('hidden',!note);
    $('noteTitle').value=note?.title || ''; $('noteContent').value=note?.content || '';
    renderNoteTagChoices(note?.tagIds||[]);$('noteNewTagRow').hidden=true;$('noteNewTagToggle').hidden=false;$('noteNewTagToggle').setAttribute('aria-expanded','false');$('noteTagMessage').textContent='';renderLinkInputs('noteLinksList',noteLinks(note));
    showAppDialog($('noteDialog'));
  }
  function saveNote(event,close=true) {
    event?.preventDefault?.();
    const content=$('noteContent').value.trim(),title=$('noteTitle').value.trim(),linkResult=collectNoteLinks('noteLinksList'),links=linkResult.links,link=links[0]||'';
    if(linkResult.invalid){showToast('Confira o endereço de cada link.');return false;}
    if (!title&&!content&&!links.length) { showToast('Preencha o título, o conteúdo ou adicione pelo menos um link.');return false; }
    const tagIds=Array.from($('noteTagChoices').querySelectorAll('input:checked')).map(input=>input.value);
    const id=$('noteId').value, now=nowISO(), note=id?notes.find(item=>item.id===id&&!item.deletedAt):null,savedId=note?.id||makeId();
    if (note) { note.title=title;note.content=content;note.link=link;note.links=links;note.tagIds=tagIds;note.updatedAt=now; }
    else notes.unshift({id:savedId,title,content,link,links,isPinned:false,tagIds,sortOrder:Math.min(-1,...notes.map(item=>Number(item.sortOrder)||0)),createdAt:now,updatedAt:now,deletedAt:null});
    $('noteId').value=savedId;
    if(!close)$('noteDialogTitle').textContent='Editar nota';
    noteDialogDirty=false;if(close)$('noteDialog').close();saveNotes();showToast(close?'Nota salva.':note?'Nota atualizada.':'Nota adicionada.',close?3000:2600);return true;
  }
  function handlePopupKeyboard(event,kind) {
    if(kind==='note'&&event.target.id==='noteContent'){
      const format=noteFormatShortcut(event);if(format){event.preventDefault();applyNoteFormat('noteContent',format);return;}
    }
    if(event.key!=='Enter')return;
    const titleId=kind==='task'?'taskTitle':'noteTitle',contentId=kind==='task'?'taskContent':'noteContent';
    if(!(event.ctrlKey||event.metaKey)){
      if(event.target.id===titleId){event.preventDefault();$(contentId).focus();}
      return;
    }
    event.preventDefault();
    const now=Date.now(),last=kind==='task'?lastTaskCtrlEnterAt:lastNoteCtrlEnterAt,close=last>0&&now-last<=500;
    const saved=kind==='task'?saveTaskFromForm({preventDefault(){}},close):saveNote({preventDefault(){}},close);
    if(kind==='task')lastTaskCtrlEnterAt=saved?(close?0:now):0;
    else lastNoteCtrlEnterAt=saved?(close?0:now):0;
    if(saved)showToast(close?(kind==='task'?'Tarefa salva.':'Nota salva.'):'Salvo. Ctrl+Enter novamente em até 500 ms para fechar.',close?3000:2600);
  }
  function duplicateNote(noteId) {
    const source=notes.find(item=>item.id===String(noteId)&&!item.deletedAt);if(!source)return;
    const now=nowISO(),title=source.title?`${source.title.slice(0,132)} (cópia)`:'';
    const links=noteLinks(source);notes.unshift({id:makeId(),title,content:source.content,link:links[0]||'',links,isPinned:false,tagIds:[...(source.tagIds||[])],sortOrder:Math.min(-1,...notes.filter(item=>!item.deletedAt&&!item.isPinned).map(item=>Number(item.sortOrder)||0))-1,createdAt:now,updatedAt:now,deletedAt:null});
    saveNotes();showToast('Nota duplicada.');
  }
  function deleteNote(noteId) {
    const note=notes.find(item=>item.id===String(noteId) && !item.deletedAt);
    if (!note || !window.confirm(`Excluir a nota “${note.title || 'Nota sem título'}”?`)) return;
    note.deletedAt=nowISO(); note.updatedAt=note.deletedAt; saveNotes(); showToast('Nota excluída.');
  }
  function softDeleteNoteFromDialog() {
    const id=$('noteId').value;
    const note=notes.find(item=>item.id===id && !item.deletedAt);
    if (!note || !window.confirm(`Excluir a nota “${note.title || 'Nota sem título'}”?`)) return;
    note.deletedAt=nowISO(); note.updatedAt=note.deletedAt; $('noteDialog').close(); saveNotes(); showToast('Nota excluída.');
  }
  function setAuthMessage(message,isError=false) {
    authMessage=String(message || '');
    $('authMessage').textContent=authMessage;
    $('authMessage').classList.toggle('error',isError);
  }
  function updateAuthUI() {
    const connected=Boolean(session?.access_token && session?.user?.id);
    $('authStatus').textContent=connected ? (syncStatus || `Conectado como ${session.user.email || 'sua conta'}`) : 'Modo local';
    $('authFields').classList.toggle('hidden',connected);
    $('loginBtn').classList.toggle('hidden',connected);
    $('signupBtn').classList.toggle('hidden',connected);
    $('logoutBtn').classList.toggle('hidden',!connected);
    $('syncNowBtn').classList.toggle('hidden',!connected);
    $('loginBtn').disabled=authBusy || !CLOUD_READY;
    $('signupBtn').disabled=authBusy || !CLOUD_READY;
    $('syncNowBtn').disabled=authBusy || !connected;
    $('logoutBtn').disabled=authBusy || !connected;
    document.querySelectorAll('.refresh-sync-action').forEach(button=>{button.disabled=authBusy;});
    if (!CLOUD_READY) setAuthMessage('Login indisponível: falta a configuração pública do Supabase.',true);
    else if (!authMessage && !connected) setAuthMessage('Entre para sincronizar entre dispositivos. Sem login, os dados ficam neste aparelho.');
  }
  async function parseResponse(response) {
    const text=await response.text();
    let data=null;
    try { data=text ? JSON.parse(text) : null; } catch { data=text; }
    if (!response.ok) {
      const message=data?.msg || data?.message || data?.error_description || data?.error || `Erro ${response.status}`;
      const error=new Error(String(message)); error.status=response.status; throw error;
    }
    return data;
  }
  function authHeaders(extra={}) { return { apikey:CLOUD.publishableKey,'Content-Type':'application/json',...extra }; }
  async function authRequest(path,payload,method='POST') {
    const response=await fetch(`${CLOUD.url}/auth/v1/${path}`,{method,headers:authHeaders(),body:payload ? JSON.stringify(payload) : undefined});
    return parseResponse(response);
  }
  function storeSession(data) {
    if (!data?.access_token || !data?.refresh_token) throw new Error('O login não retornou uma sessão. Tente novamente.');
    session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Date.now()+(Number(data.expires_in)||3600)*1000,user:data.user || session?.user || null};
    localStorage.setItem(SESSION_KEY,JSON.stringify(session));
  }
  async function refreshSession() {
    if (!session?.refresh_token) throw new Error('Sessão expirada. Entre novamente.');
    const data=await authRequest('token?grant_type=refresh_token',{refresh_token:session.refresh_token});
    storeSession(data);
  }
  async function ensureSession() {
    if (!session?.access_token) throw new Error('Entre na sua conta para sincronizar.');
    if (!session.expires_at || Date.now()>session.expires_at-60000) await refreshSession();
  }
  async function getCurrentUser() {
    await ensureSession();
    let response=await fetch(`${CLOUD.url}/auth/v1/user`,{headers:authHeaders({Authorization:`Bearer ${session.access_token}`})});
    if (response.status===401) { await refreshSession(); response=await fetch(`${CLOUD.url}/auth/v1/user`,{headers:authHeaders({Authorization:`Bearer ${session.access_token}`})}); }
    return parseResponse(response);
  }
  async function cloudRequest(path,options={}) {
    await ensureSession();
    let response=await fetch(`${CLOUD.url}/rest/v1/${path}`,{...options,headers:authHeaders({Authorization:`Bearer ${session.access_token}`,...(options.headers||{})})});
    if (response.status===401) { await refreshSession(); response=await fetch(`${CLOUD.url}/rest/v1/${path}`,{...options,headers:authHeaders({Authorization:`Bearer ${session.access_token}`,...(options.headers||{})})}); }
    return parseResponse(response);
  }
  async function fetchAll(path) {
    const all=[]; let offset=0;
    while (true) {
      const page=await cloudRequest(`${path}&limit=1000&offset=${offset}`);
      if (!Array.isArray(page)) throw new Error('Resposta de sincronização inválida.');
      all.push(...page);
      if (page.length<1000) return all;
      offset+=1000;
    }
  }
  async function syncFinanceCashboxState() {
    if(!session?.user?.id||!CLOUD_READY||!financeState.cashboxUpdatedAt)return false;
    const payload={cashbox_amount:financeState.cashboxAmount,cashbox_updated_at:financeState.cashboxUpdatedAt,updated_at:nowISO(),planner_version:1};
    const path=`nmm_finance_state?owner_id=eq.${encodeURIComponent(session.user.id)}`;
    const updated=await cloudRequest(path,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
    if(Array.isArray(updated)&&updated.length)return true;
    await cloudRequest('nmm_finance_state?on_conflict=owner_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({owner_id:session.user.id,...payload})});
    return true;
  }
  function taskToRow(task) {
    return {id:task.id,owner_id:session.user.id,title:task.title,details:task.content||'',link_url:task.link||'',subtasks:normalizeTaskSubtasks(task.subtasks),status:'active',release_date:null,due_date:null,execution_date:task.executionDate,recurrence:task.recurrence||null,tag_id:task.tagId,sort_order:Number(task.sortOrder)||0,planner_version:1,estimate_minutes:60,reward:'',blocker:'',time_spent_seconds:0,created_at:task.createdAt,updated_at:task.updatedAt,completed_at:task.completedAt,completed_date:task.completedAt?dateKey(new Date(task.completedAt)):null,deleted_at:task.deletedAt};
  }
  function rowToTask(row) {
    return normalizeTask({id:row.id,title:row.title,content:row.details,link_url:row.link_url,subtasks:row.subtasks,tagId:row.tag_id,area:row.area,executionDate:row.execution_date,recurrence:row.recurrence,sortOrder:row.sort_order,createdAt:row.created_at,updatedAt:row.updated_at || row.created_at,completedAt:row.completed_at,deletedAt:row.deleted_at});
  }
  function tagToRow(tag) { return {owner_id:session.user.id,id:tag.id,name:tag.name,color:tag.color,created_at:tag.createdAt,updated_at:tag.updatedAt,deleted_at:tag.deletedAt,planner_version:1}; }
  function rowToTag(row) { return normalizeTag({id:row.id,name:row.name,color:row.color,createdAt:row.created_at,updatedAt:row.updated_at || row.created_at,deletedAt:row.deleted_at}); }
  function settingsToRow() { return {owner_id:session.user.id,data:userSettings,updated_at:userSettings.updatedAt,planner_version:1}; }
  function rowToSettings(row) { return normalizeUserSettings({...row.data,updatedAt:row.updated_at||row.data?.updatedAt}); }
  function privateVaultToRow() {
    if(!privateVault||privateVault.ownerId&&privateVault.ownerId!==session.user.id)return null;
    if(!privateVault.ownerId){privateVault.ownerId=session.user.id;localStorage.setItem(PRIVATE_VAULT_KEY,JSON.stringify(privateVault));}
    return {owner_id:session.user.id,salt:privateVault.salt,verifier_iv:privateVault.verifierIv,verifier_ciphertext:privateVault.verifierCiphertext,updated_at:privateVault.updatedAt,planner_version:1};
  }
  function rowToPrivateVault(row) { return normalizePrivateVault({salt:row.salt,verifierIv:row.verifier_iv,verifierCiphertext:row.verifier_ciphertext,ownerId:row.owner_id,updatedAt:row.updated_at}); }
  function privateRowToRow(row) { return {id:row.id,owner_id:session.user.id,iv:row.iv,ciphertext:row.ciphertext,created_at:row.createdAt,updated_at:row.updatedAt,deleted_at:row.deletedAt,planner_version:1}; }
  function rowToPrivateNote(row) { return normalizePrivateRow({id:row.id,iv:row.iv,ciphertext:row.ciphertext,created_at:row.created_at,updated_at:row.updated_at,deleted_at:row.deleted_at}); }
  function noteToRow(note) { const links=noteLinks(note);return {id:note.id,owner_id:session.user.id,title:note.title,content:note.content,link_url:links[0]||'',links,is_pinned:Boolean(note.isPinned),tag_ids:note.tagIds||[],sort_order:Number(note.sortOrder)||0,planner_version:1,created_at:note.createdAt,updated_at:note.updatedAt,deleted_at:note.deletedAt}; }
  function rowToNote(row) { return normalizeNote({id:row.id,title:row.title,content:row.content,link_url:row.link_url,links:row.links,is_pinned:row.is_pinned,tag_ids:row.tag_ids,sort_order:row.sort_order,createdAt:row.created_at,updatedAt:row.updated_at || row.created_at,deletedAt:row.deleted_at}); }
  function logToRow(log) { return {id:log.id,owner_id:session.user.id,content:log.isLocked?'🔒 Registro trancado':log.content,tag_id:log.tagId||null,is_locked:Boolean(log.isLocked),planner_version:1,created_at:log.createdAt,updated_at:log.updatedAt,deleted_at:log.deletedAt}; }
  function rowToLog(row) { return normalizeLog({id:row.id,content:row.content,tag_id:row.tag_id,is_locked:row.is_locked,created_at:row.created_at,updated_at:row.updated_at||row.created_at,deleted_at:row.deleted_at}); }
  function financeToRow(entry) { return {id:entry.id,owner_id:session.user.id,title:entry.title,direction:entry.kind,tag_id:entry.tagId||(entry.kind==='income'?FINANCE_ENTRY_TAG_ID:FINANCE_EXIT_TAG_ID),amount:entry.amount,movement_date:entry.date,status:entry.status,series_id:entry.seriesId||null,occurrence_number:entry.occurrenceNumber||null,installment_count:entry.installmentCount||null,recurrence:entry.recurrence||null,planner_version:1,created_at:entry.createdAt,updated_at:entry.updatedAt,deleted_at:entry.deletedAt}; }
  function rowToFinance(row) { return normalizeFinanceEntry({id:row.id,title:row.title,kind:row.direction,tag_id:row.tag_id,amount:row.amount,date:row.movement_date,status:row.status,series_id:row.series_id,occurrence_number:row.occurrence_number,installment_count:row.installment_count,recurrence:row.recurrence,created_at:row.created_at,updated_at:row.updated_at||row.created_at,deleted_at:row.deleted_at}); }
  function rowToFinanceState(row) { return normalizeFinanceState({account_balance:row.account_balance,balance_updated_at:row.balance_updated_at,cashbox_amount:row.cashbox_amount,cashbox_updated_at:row.cashbox_updated_at,updated_at:row.updated_at}); }
  function mergeById(local,remote) {
    const map=new Map();
    for (const item of [...remote,...local]) {
      const old=map.get(item.id);
      if (!old || Date.parse(item.updatedAt || item.createdAt || '')>=Date.parse(old.updatedAt || old.createdAt || '')) map.set(item.id,item);
    }
    return Array.from(map.values());
  }
  async function refreshFinanceCloudData() {
    if(!session?.user?.id||!CLOUD_READY)return false;
    try{
      const [financeRows,stateRows]=await Promise.all([fetchAll('nmm_finance_entries?select=*&planner_version=eq.1'),fetchAll('nmm_finance_state?select=*&planner_version=eq.1')]);
      const remoteEntries=financeRows.map(rowToFinance).filter(Boolean),remoteRow=stateRows.find(row=>row.owner_id===session.user.id)||stateRows[0]||null,remoteState=remoteRow?rowToFinanceState(remoteRow):null,localState=normalizeFinanceState(financeState);
      const localCashboxAt=Date.parse(localState.cashboxUpdatedAt)||0,remoteCashboxAt=Date.parse(remoteState?.cashboxUpdatedAt||'')||0,localCashboxIsNewer=localCashboxAt>remoteCashboxAt;
      finances=mergeById(finances,remoteEntries).map(normalizeFinanceEntry).filter(Boolean);
      financeState=normalizeFinanceState({accountBalance:remoteState?.accountBalance??localState.accountBalance,balanceUpdatedAt:remoteState?.balanceUpdatedAt||localState.balanceUpdatedAt,cashboxAmount:localCashboxIsNewer?localState.cashboxAmount:(remoteState?remoteState.cashboxAmount:localState.cashboxAmount),cashboxUpdatedAt:localCashboxIsNewer?localState.cashboxUpdatedAt:(remoteState?remoteState.cashboxUpdatedAt:localState.cashboxUpdatedAt),updatedAt:remoteState?.updatedAt||localState.updatedAt});
      localStorage.setItem(FINANCE_KEY,JSON.stringify(finances));localStorage.setItem(FINANCE_STATE_KEY,JSON.stringify(financeState));
      if(localCashboxIsNewer)await syncFinanceCashboxState();
      renderFinancePage();return true;
    }catch{return false;}
  }
  async function loadCloudData() {
    const localTasks=tasks.map(task=>({...task})),localNotes=notes.map(note=>({...note})),localLogs=logs.map(log=>({...log})),localFinances=finances.map(entry=>({...entry})),localFinanceState=normalizeFinanceState({...financeState}),localTags=tags.map(tag=>({...tag})),localSettings={...userSettings},localVault=privateVault?{...privateVault}:null,localPrivateRows=privateCipherRows.map(row=>({...row}));
    const [remoteTaskRows,remoteNoteRows,remoteLogRows,remoteFinanceRows,remoteFinanceStateRows,remoteTagRows,remoteSettingRows,remoteVaultRows,remotePrivateRows]=await Promise.all([
      fetchAll(`nmm_tasks?select=*&planner_version=eq.1&created_at=gte.${encodeURIComponent(RESET_CUTOFF)}`),
      fetchAll(`nmm_notes?select=*&planner_version=eq.1&created_at=gte.${encodeURIComponent(RESET_CUTOFF)}`),
      fetchAll('nmm_logs?select=*&planner_version=eq.1'),
      fetchAll('nmm_finance_entries?select=*&planner_version=eq.1'),
      fetchAll('nmm_finance_state?select=*&planner_version=eq.1'),
      fetchAll('nmm_tags?select=*&planner_version=eq.1'),
      fetchAll('nmm_user_settings?select=*&planner_version=eq.1'),
      fetchAll('nmm_private_vaults?select=*&planner_version=eq.1'),
      fetchAll('nmm_private_notes?select=*&planner_version=eq.1')
    ]);
    const remoteTasks=remoteTaskRows.map(rowToTask).filter(Boolean),remoteNotes=remoteNoteRows.map(rowToNote).filter(Boolean),remoteLogs=remoteLogRows.map(rowToLog).filter(Boolean),remoteFinances=remoteFinanceRows.map(rowToFinance).filter(Boolean),remoteFinanceStateRow=remoteFinanceStateRows.find(row=>row.owner_id===session.user.id)||remoteFinanceStateRows[0]||null,remoteFinanceState=remoteFinanceStateRow?rowToFinanceState(remoteFinanceStateRow):null,remoteTags=remoteTagRows.map(rowToTag).filter(Boolean),remoteSettings=remoteSettingRows.length?rowToSettings(remoteSettingRows[0]):null,remoteVault=remoteVaultRows.length?rowToPrivateVault(remoteVaultRows[0]):null,remotePrivateNotes=remotePrivateRows.map(rowToPrivateNote).filter(Boolean);
    const localCashboxIsNewer=(Date.parse(localFinanceState.cashboxUpdatedAt)||0)>(Date.parse(remoteFinanceState?.cashboxUpdatedAt||'')||0);
    tags=ensureDefaultTags(mergeById(localTags,remoteTags).map(normalizeTag).filter(Boolean));
    prunePageFilters();
    localStorage.setItem(TAGS_KEY,JSON.stringify(tags));
    const localActiveTasks=localTasks.filter(item=>!item.deletedAt),localActiveNotes=localNotes.filter(item=>!item.deletedAt),localActiveLogs=localLogs.filter(item=>!item.deletedAt),localActiveFinances=localFinances.filter(item=>!item.deletedAt);
    if(!remoteTasks.length&&!remoteNotes.length&&!remoteLogs.length&&!remoteFinances.length&&!remoteFinanceStateRows.length&&(localActiveTasks.length||localActiveNotes.length||localActiveLogs.length||localActiveFinances.length)&&!window.confirm('A conta está vazia. Enviar as tarefas, notas, logs e finanças deste aparelho para ela?')){
      setAuthMessage('Nada foi enviado. Seus dados continuam neste aparelho.'); return false;
    }
    tasks=mergeById(localTasks,remoteTasks).map(normalizeTask).filter(Boolean);
    notes=mergeById(localNotes,remoteNotes).map(normalizeNote).filter(Boolean);
    logs=mergeById(localLogs,remoteLogs).map(normalizeLog).filter(Boolean);
    finances=mergeById(localFinances,remoteFinances).map(normalizeFinanceEntry).filter(Boolean);
    financeState=normalizeFinanceState({accountBalance:remoteFinanceState?.accountBalance??localFinanceState.accountBalance,balanceUpdatedAt:remoteFinanceState?.balanceUpdatedAt||localFinanceState.balanceUpdatedAt,cashboxAmount:localCashboxIsNewer?localFinanceState.cashboxAmount:(remoteFinanceState?remoteFinanceState.cashboxAmount:localFinanceState.cashboxAmount),cashboxUpdatedAt:localCashboxIsNewer?localFinanceState.cashboxUpdatedAt:(remoteFinanceState?remoteFinanceState.cashboxUpdatedAt:localFinanceState.cashboxUpdatedAt),updatedAt:remoteFinanceState?.updatedAt||localFinanceState.updatedAt});
    localStorage.setItem(TASKS_KEY,JSON.stringify(tasks));localStorage.setItem(NOTES_KEY,JSON.stringify(notes));localStorage.setItem(LOGS_KEY,JSON.stringify(logs));localStorage.setItem(FINANCE_KEY,JSON.stringify(finances));localStorage.setItem(FINANCE_STATE_KEY,JSON.stringify(financeState));
    userSettings=remoteSettings&&Date.parse(remoteSettings.updatedAt)>=Date.parse(localSettings.updatedAt)?remoteSettings:normalizeUserSettings(localSettings);
    localStorage.setItem(USER_SETTINGS_KEY,JSON.stringify(userSettings));
    const foreignLocalVault=localVault?.ownerId&&localVault.ownerId!==session.user.id;
    privateVault=foreignLocalVault?localVault:(remoteVault&&(!localVault||Date.parse(remoteVault.updatedAt)>=Date.parse(localVault.updatedAt))?remoteVault:localVault);
    if(privateVault&&!privateVault.ownerId&&!foreignLocalVault)privateVault.ownerId=session.user.id;
    privateCipherRows=foreignLocalVault?localPrivateRows:mergeById(localPrivateRows,remotePrivateNotes).map(normalizePrivateRow).filter(Boolean);
    if(privateVault)localStorage.setItem(PRIVATE_VAULT_KEY,JSON.stringify(privateVault));else localStorage.removeItem(PRIVATE_VAULT_KEY);
    localStorage.setItem(PRIVATE_ROWS_KEY,JSON.stringify(privateCipherRows));
    if(foreignLocalVault&&privateNotesUnlocked)await lockPrivateNotes();
    else if(privateNotesUnlocked&&privateCryptoKey)setDecryptedVaultItems(await loadDecryptedPrivateNotes());
    const synced=await syncCloudAndWait();
    if(localCashboxIsNewer)try{await syncFinanceCashboxState();}catch{}
    renderAll(); createAutomaticBackup(false); updateAuthUI();
    return synced;
  }
  function scheduleSync() {
    if (!session?.user?.id) return;
    clearTimeout(syncTimer); syncTimer=setTimeout(()=>{ void syncCloud(); },500);
  }
  async function syncCloud() {
    if (!session?.user?.id) return false;
    if (syncInFlight) { syncQueued=true; return true; }
    syncInFlight=true;
    try {
      do {
        syncQueued=false;
        const tagRows=tags.map(tagToRow);
        const taskRows=tasks.map(taskToRow);
        const noteRows=notes.map(noteToRow);
        const logRows=logs.map(logToRow);
        const financeRows=finances.map(financeToRow);
        const settingsRow=settingsToRow(),vaultRow=privateVaultToRow(),canSyncPrivate=Boolean(privateVault)&&(!privateVault.ownerId||privateVault.ownerId===session.user.id),privateRows=canSyncPrivate?privateCipherRows.map(privateRowToRow):[];
        if (tagRows.length) await cloudRequest('nmm_tags?on_conflict=owner_id,id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(tagRows)});
        if (taskRows.length) await cloudRequest('nmm_tasks?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(taskRows)});
        if (noteRows.length) await cloudRequest('nmm_notes?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(noteRows)});
        if (logRows.length) await cloudRequest('nmm_logs?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(logRows)});
        if (financeRows.length) await cloudRequest('nmm_finance_entries?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(financeRows)});
        await cloudRequest('nmm_user_settings?on_conflict=owner_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(settingsRow)});
        if(vaultRow)await cloudRequest('nmm_private_vaults?on_conflict=owner_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(vaultRow)});
        if(privateRows.length)await cloudRequest('nmm_private_notes?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(privateRows)});
        syncStatus=`Sincronizado · ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
        updateAuthUI();
      } while (syncQueued);
      return true;
    } catch {
      syncStatus='Sincronização pendente'; updateAuthUI();
      setAuthMessage('Não consegui sincronizar agora. Os dados continuam salvos neste aparelho.',true);
      return false;
    } finally { syncInFlight=false; updateAuthUI(); }
  }
  async function syncCloudAndWait() {
    if (!session?.user?.id) return false;
    const ok=await syncCloud();
    if (!ok) return false;
    while (syncInFlight) await new Promise(resolve=>setTimeout(resolve,50));
    return syncStatus.startsWith('Sincronizado ·');
  }
  async function finishLogin(data) {
    storeSession(data);
    session.user=data.user || await getCurrentUser();
    localStorage.setItem(SESSION_KEY,JSON.stringify(session));
    const ok=await loadCloudData();
    updateAuthUI();
    return ok;
  }
  async function signIn() {
    const email=$('authEmail').value.trim(), password=$('authPassword').value;
    if (!CLOUD_READY || !email || !password) { setAuthMessage('Informe e-mail e senha.',true); return; }
    authBusy=true; setAuthMessage('Entrando…'); updateAuthUI();
    try { await finishLogin(await authRequest('token?grant_type=password',{email,password})); setAuthMessage('Login concluído.'); }
    catch(error) { setAuthMessage(`Não consegui entrar: ${error.message}`,true); }
    finally { authBusy=false; updateAuthUI(); }
  }
  async function signUp() {
    const email=$('authEmail').value.trim(), password=$('authPassword').value;
    if (!CLOUD_READY || !email || password.length<8) { setAuthMessage('Informe e-mail e senha com pelo menos 8 caracteres.',true); return; }
    authBusy=true; setAuthMessage('Criando conta…'); updateAuthUI();
    try {
      const data=await authRequest('signup',{email,password});
      if (data.access_token) { await finishLogin(data); setAuthMessage('Conta criada e conectada.'); }
      else setAuthMessage('Cadastro iniciado. Confirme o e-mail enviado pelo Supabase e depois entre.');
    } catch(error) { setAuthMessage(`Não consegui criar a conta: ${error.message}`,true); }
    finally { authBusy=false; updateAuthUI(); }
  }
  async function signOut() {
    if (!session?.access_token) return;
    if(privateNotesUnlocked&&!await lockPrivateNotes()){showToast('Não consegui salvar a edição privada; você continua conectado.');return;}
    authBusy=true; updateAuthUI();
    try { await fetch(`${CLOUD.url}/auth/v1/logout`,{method:'POST',headers:authHeaders({Authorization:`Bearer ${session.access_token}`})}); } catch {}
    session=null; localStorage.removeItem(SESSION_KEY); syncStatus=''; authBusy=false;
    setAuthMessage('Você saiu. Os dados continuam neste aparelho e na conta.'); updateAuthUI();
  }
  function syncTasksOnForeground() {
    if(document.visibilityState!=='visible'||!session?.user?.id||authBusy||syncInFlight||taskDialogDirty||$('taskDialog')?.open||Date.now()-lastTasksForegroundSyncAt<15000)return;
    lastTasksForegroundSyncAt=Date.now();void syncNow();
  }
  async function syncNow() {
    if (!session?.user?.id) return false;
    authBusy=true; setAuthMessage('Sincronizando…'); updateAuthUI();
    try { const ok=await loadCloudData(); if(ok)setAuthMessage('Sincronização concluída.'); return ok; }
    catch { setAuthMessage('Não consegui atualizar agora; seus dados locais foram mantidos.',true); return false; }
    finally { authBusy=false; updateAuthUI(); }
  }
  async function refreshAndSync(event) {
    const button=event?.currentTarget||$('refreshSyncBtn');
    if(button.disabled)return;
    button.disabled=true;button.setAttribute('aria-busy','true');
    if(!session?.user?.id){showToast('Entre na conta para sincronizar. Atualizando…');setTimeout(()=>window.location.reload(),1200);return;}
    const ok=await syncNow();
    if(ok){window.location.reload();return;}
    button.disabled=false;button.removeAttribute('aria-busy');
  }
  async function initializeAuth() {
    updateAuthUI();
    if (!CLOUD_READY || !session?.access_token) return;
    authBusy=true; setAuthMessage('Verificando login…'); updateAuthUI();
    try {
      await ensureSession(); session.user=await getCurrentUser(); localStorage.setItem(SESSION_KEY,JSON.stringify(session));
      await loadCloudData();
    } catch { setAuthMessage('Não consegui verificar a conta agora. Tente sincronizar ou entrar novamente.',true); }
    finally { authBusy=false; updateAuthUI(); }
  }
  function automaticBackupSnapshot() {
    return {format:'tnm-weekly-autobackup-v6',createdAt:nowISO(),tasks:tasks.filter(task=>!task.deletedAt),notes:notes.filter(note=>!note.deletedAt),logs:logs.filter(log=>!log.deletedAt),financeEntries:finances.filter(entry=>!entry.deletedAt),financeState,privateVault,privateNotesEncrypted:privateCipherRows,tags:tags.filter(tag=>!tag.deletedAt)};
  }
  function updateAutoBackupStatus(timestamp='') {
    const node=$('autoBackupStatus');
    if (!node) return;
    const date=timestamp?new Date(timestamp):null;
    node.textContent=date&&Number.isFinite(date.getTime())?`Último backup automático: ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}.`:'O backup automático será salvo neste aparelho a cada 5 minutos.';
  }
  function createAutomaticBackup(notify=true) {
    const backup=automaticBackupSnapshot();
    try {
      localStorage.setItem(AUTO_BACKUP_KEY,JSON.stringify(backup));
      updateAutoBackupStatus(backup.createdAt);
      if (notify&&document.visibilityState==='visible') showToast(`Backup automático salvo às ${new Date(backup.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}.`);
      return true;
    } catch {
      const node=$('autoBackupStatus'); if(node) node.textContent='Não consegui criar o snapshot local. Exporte um backup JSON.';
      if(notify&&document.visibilityState==='visible') showToast('Não consegui salvar o backup automático.');
      return false;
    }
  }
  function startAutomaticBackup() {
    const last=readStored(AUTO_BACKUP_KEY,null), date=last?.createdAt?Date.parse(last.createdAt):0;
    if (!date||Date.now()-date>=AUTO_BACKUP_EVERY) createAutomaticBackup(false); else updateAutoBackupStatus(last.createdAt);
    setInterval(()=>createAutomaticBackup(true),AUTO_BACKUP_EVERY);
    setInterval(checkWeekRollover,60*1000);
    setInterval(()=>{void refreshFinanceCloudData();},5*60*1000);
    document.addEventListener('visibilitychange',()=>{
      checkWeekRollover();
      if(document.visibilityState==='visible'){void refreshFinanceCloudData();syncTasksOnForeground();}
      const latest=readStored(AUTO_BACKUP_KEY,null), lastAt=latest?.createdAt?Date.parse(latest.createdAt):0;
      if(document.visibilityState==='visible'&&Date.now()-lastAt>=AUTO_BACKUP_EVERY)createAutomaticBackup(true);
    });
  }
  function exportBackup() {
    const data={format:'tnm-weekly-backup-v7',exportedAt:nowISO(),tasks:tasks.filter(task=>!task.deletedAt),notes:notes.filter(note=>!note.deletedAt),logs:logs.filter(log=>!log.deletedAt),financeEntries:finances.filter(entry=>!entry.deletedAt),financeState,privateVault,privateNotesEncrypted:privateCipherRows,tags:tags.filter(tag=>!tag.deletedAt)};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a'); link.href=url; link.download=`tnm-backup-${todayKey()}.json`; link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000); $('backupMessage').textContent='Backup exportado.';
  }
  resetOldBrowserData();
  loadLocalTags();
  loadLocalData();
  document.querySelectorAll('[data-filter-open]').forEach(button=>button.addEventListener('click',openFilterDialog));
  $('closeFilterDialog').addEventListener('click',()=>$('filterDialog').close());
  $('clearFiltersBtn').addEventListener('click',()=>setTagFilter('',false));
  $('filterTagList').addEventListener('click',event=>{
    const button=event.target.closest('button[data-filter-tag]'); if(button)setTagFilter(button.dataset.filterTag,true);
  });
  $('tagForm').addEventListener('submit',createTag);
  $('headerTagsBtn').addEventListener('click',()=>openTagManager());
  $('closeTagManager').addEventListener('click',()=>$('tagManagerDialog').close());
  $('tagManagerDialog').addEventListener('close',()=>{pendingLogAddTagId='';});
  $('tagManagerAddForm').addEventListener('submit',addManagedTag);
  $('tagManagerList').addEventListener('submit',saveManagedTag);
  document.querySelectorAll('[data-note-format]').forEach(button=>button.addEventListener('click',()=>applyNoteFormat(button.dataset.formatTarget,button.dataset.noteFormat)));
  document.querySelector('.main-nav').addEventListener('click',event=>{
    const button=event.target.closest('button[data-page]'); if (button) setPage(button.dataset.page);
  });
  document.addEventListener('click',event=>{const action=event.target.closest('[data-home-action]');if(action){openHomeAction(action.dataset.homeAction);return;}if(event.target.closest('[data-open-tasks]'))setPage('tasks');});
  $('taskForm').addEventListener('submit',saveTaskFromForm);
  $('taskForm').addEventListener('keydown',event=>handlePopupKeyboard(event,'task'));
  $('taskForm').addEventListener('input',event=>{taskDialogDirty=true;if(event.target.matches('[data-task-checklist-text]'))resizeTaskChecklistTextarea(event.target);});
  $('taskForm').addEventListener('change',()=>{taskDialogDirty=true;});
  $('taskChecklistAddBtn').addEventListener('click',addTaskChecklistItem);
  $('taskChecklistList').addEventListener('click',event=>{const button=event.target.closest('[data-remove-task-checklist-item]');if(!button)return;button.closest('[data-task-checklist-row]')?.remove();renderTaskChecklist(readTaskChecklistDraft(true),{completedOpen:Boolean($('taskChecklistList').querySelector('.task-checklist-completed')?.open)});taskDialogDirty=true;});
  $('taskChecklistList').addEventListener('change',event=>{const checkbox=event.target.closest('[data-task-checklist-done]');if(checkbox)handleTaskChecklistToggle(checkbox);});
  $('taskChecklistList').addEventListener('dragstart',handleTaskChecklistDragStart);
  $('taskChecklistList').addEventListener('dragover',handleTaskChecklistDragOver);
  $('taskChecklistList').addEventListener('drop',handleTaskChecklistDrop);
  $('taskChecklistList').addEventListener('keydown',event=>{if(event.target.matches('[data-task-checklist-text]')&&event.key==='Enter'&&!(event.ctrlKey||event.metaKey)&&!event.shiftKey){event.preventDefault();event.stopPropagation();addTaskChecklistItem();}});
  $('taskRecurrence').addEventListener('change',()=>updateTaskRecurrenceUI(true));
  $('taskLinkToggle').addEventListener('click',()=>toggleLinkAttachment('task'));
  $('taskLinkRemove').addEventListener('click',()=>clearLinkAttachment('task'));
  $('closeTaskDialog').addEventListener('click',closeTaskDialogSafely);
  $('deleteTaskBtn').addEventListener('click',softDeleteTask);
  $('weekGrid').addEventListener('click',handleTaskClick);
  $('weekGrid').addEventListener('dblclick',handleDayAreaDoubleClick);
  $('homePage').addEventListener('click',handleTaskClick);
  $('dayDialogList').addEventListener('click',handleTaskClick);
  $('planningList').addEventListener('click',handleTaskClick);
  $('completedList').addEventListener('click',handleTaskClick);
  for (const node of [$('weekGrid'),$('dayDialogList'),$('planningPanel'),$('planningBtn'),$('completedPanel'),$('completedBtn')]) {
    node.addEventListener('dragstart',handleDragStart);
    node.addEventListener('dragover',handleDragOver);
    node.addEventListener('drop',handleDrop);
  }
  $('prevWeekBtn').addEventListener('click',()=>setWeek(addDays(weekStart,-7)));
  $('nextWeekBtn').addEventListener('click',()=>setWeek(addDays(weekStart,7)));
  $('todayBtn').addEventListener('click',jumpToCurrentWeek);
  $('planningBtn').addEventListener('click',()=>togglePlannerSection('planning'));
  $('completedBtn').addEventListener('click',()=>togglePlannerSection('completed'));
  $('planningMoreBtn').addEventListener('click',()=>{planningVisibleLimit+=6;renderTasks();});
  $('completedMoreBtn').addEventListener('click',()=>{completedVisibleLimit+=6;renderTasks();});
  $('dayDialogAddBtn').addEventListener('click',()=>{const date=activeDayKind==='day'?activeDayDate:'',dialog=$('dayDialog'),token=dialog.dataset.historyToken||'';dialog.close();delete dialog.dataset.historyToken;openTaskDialog('',date,token);});
  $('dayDialogPrevBtn').addEventListener('click',()=>navigateDayDialog(-1));
  $('dayDialogNextBtn').addEventListener('click',()=>navigateDayDialog(1));
  $('dayDialog').addEventListener('touchstart',handleDayDialogTouchStart,{passive:true});
  $('dayDialog').addEventListener('touchend',handleDayDialogTouchEnd,{passive:true});
  $('dayDialog').addEventListener('touchcancel',()=>{dayDialogTouchStart=null;},{passive:true});
  $('closeDayDialog').addEventListener('click',()=>$('dayDialog').close());
  $('notesList').addEventListener('click',handleNotesClick);
  $('notesList').addEventListener('keydown',handleNoteKey);
  $('notesList').addEventListener('dragstart',handleNoteDragStart);
  $('notesList').addEventListener('dragover',handleNoteDragOver);
  $('notesList').addEventListener('drop',handleNoteDrop);
  $('noteForm').addEventListener('submit',saveNote);
  $('noteForm').addEventListener('keydown',event=>handlePopupKeyboard(event,'note'));
  $('noteForm').addEventListener('input',()=>{noteDialogDirty=true;});
  $('noteForm').addEventListener('change',()=>{noteDialogDirty=true;});
  $('noteNewTagToggle').addEventListener('click',()=>{const open=$('noteNewTagRow').hidden;$('noteNewTagRow').hidden=!open;$('noteNewTagToggle').setAttribute('aria-expanded',String(open));if(open)$('noteNewTagName').focus();});
  $('noteNewTagAdd').addEventListener('click',createNoteTag);
  $('noteNewTagName').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();createNoteTag();}});
  $('noteLinkAddBtn').addEventListener('click',()=>{addLinkInput('noteLinksList');noteDialogDirty=true;});
  $('noteLinksList').addEventListener('click',event=>{const button=event.target.closest('[data-remove-note-link]');if(button){removeLinkInput('noteLinksList',button.dataset.removeNoteLink);noteDialogDirty=true;}});
  $('closeNoteDialog').addEventListener('click',closeNoteDialogSafely);
  $('deleteNoteBtn').addEventListener('click',softDeleteNoteFromDialog);
  $('lockNoteBtn').addEventListener('click',()=>requestPrivateMove($('noteId').value));
  $('loginBtn').addEventListener('click',signIn);
  $('signupBtn').addEventListener('click',signUp);
  $('logoutBtn').addEventListener('click',signOut);
  $('syncNowBtn').addEventListener('click',syncNow);
  document.querySelectorAll('.refresh-sync-action').forEach(button=>button.addEventListener('click',refreshAndSync));
  $('headerSettingsBtn').addEventListener('click',()=>setPage('settings'));
  document.querySelectorAll('[data-zoom-action]').forEach(button=>button.addEventListener('click',()=>changeZoom(button.dataset.zoomAction)));
  window.addEventListener('resize',applyZoom,{passive:true});
  window.visualViewport?.addEventListener('resize',applyZoom,{passive:true});
  $('logForm').addEventListener('submit',saveLogFromForm);
  $('logsList').addEventListener('click',handleLogsClick);
  $('logsList').addEventListener('change',handleLogTagChange);
  document.querySelectorAll('[data-log-range]').forEach(button=>button.addEventListener('click',()=>setLogRange(button.dataset.logRange)));
  $('financeForm').addEventListener('submit',saveFinanceFromForm);
  $('financeForm').addEventListener('input',()=>{financeDialogDirty=true;});
  $('financeForm').addEventListener('change',()=>{financeDialogDirty=true;});
  $('financeCashboxSaveBtn').addEventListener('click',()=>{void saveFinanceCashbox();});
  $('calendarConnectBtn').addEventListener('click',()=>{void connectGoogleCalendar();});
  $('calendarSyncBtn').addEventListener('click',()=>{void syncGoogleCalendar(true);});
  $('calendarFilters').addEventListener('change',handleCalendarFilterChange);
  $('financeAddBtn').addEventListener('click',()=>openFinanceDialog());
  $('financePrevMonth').addEventListener('click',()=>shiftFinanceMonth(-1));
  $('financeNextMonth').addEventListener('click',()=>shiftFinanceMonth(1));
  $('financeEntriesList').addEventListener('click',handleFinanceClick);
  $('financeUpcomingList').addEventListener('click',handleFinanceClick);
  $('plannerUpcomingIncomeList').addEventListener('click',handleFinanceClick);
  $('householdBucketsGrid').addEventListener('click',event=>{const button=event.target.closest('[data-household-bill-toggle]');if(button)void toggleHouseholdBillPaid(button.dataset.householdBillToggle);});
  $('householdPaymentDeductBtn').addEventListener('click',()=>{void completeHouseholdBillPayment(true);});
  $('householdPaymentKeepBtn').addEventListener('click',()=>{void completeHouseholdBillPayment(false);});
  $('closeHouseholdPaymentDialog').addEventListener('click',()=>$('householdPaymentDialog').close());
  $('financeRecurrence').addEventListener('change',updateFinanceRecurrenceUI);
  $('closeFinanceDialog').addEventListener('click',()=>$('financeDialog').close());
  $('fullscreenToggleBtn').addEventListener('click',toggleAppFullscreen);
  $('viewModePcBtn').addEventListener('click',()=>setViewMode('pc'));
  $('viewModeMobileBtn').addEventListener('click',()=>setViewMode('mobile'));
  $('financeDeleteBtn').addEventListener('click',()=>deleteFinanceEntry($('financeId').value));
  $('financeStopSeriesBtn').addEventListener('click',()=>stopFinanceSeries($('financeId').value));
  $('addSummaryTimeBtn').addEventListener('click',addSummaryTime);
  $('summaryTimesList').addEventListener('click',event=>{const button=event.target.closest('[data-remove-summary-time]');if(button)removeSummaryTime(button.dataset.removeSummaryTime);});
  $('summaryNickname').addEventListener('change',()=>{userSettings.nickname=$('summaryNickname').value.trim()||'Gio';saveUserSettings();});
  $('notesDockAddBtn').addEventListener('click',()=>{if(privateNotesMode){if(privateNotesUnlocked)openPrivateNoteEditor();else showToast('Desbloqueie as Notas privadas primeiro.');}else openNoteDialog();});
  $('regularNotesTab').addEventListener('click',()=>setNotesMode('public'));
  $('privateNotesTab').addEventListener('click',()=>setNotesMode('private'));
  $('privateSetupForm').addEventListener('submit',event=>{void createPrivateVault(event);});
  $('privateUnlockForm').addEventListener('submit',event=>{void unlockPrivateVault(event);});
  $('privateNoteForm').addEventListener('submit',event=>{void savePrivateNote(event);});
  $('privateNoteForm').addEventListener('input',()=>{privateNoteDirty=true;});
  $('privateNoteForm').addEventListener('change',()=>{privateNoteDirty=true;});
  $('privateNoteForm').addEventListener('keydown',event=>{if(event.target.id!=='privateNoteContent')return;const format=noteFormatShortcut(event);if(format){event.preventDefault();applyNoteFormat('privateNoteContent',format);}});
  $('privateNoteLinkAddBtn').addEventListener('click',()=>{addLinkInput('privateNoteLinksList');privateNoteDirty=true;});
  $('privateNoteLinksList').addEventListener('click',event=>{const button=event.target.closest('[data-remove-note-link]');if(button){removeLinkInput('privateNoteLinksList',button.dataset.removeNoteLink);privateNoteDirty=true;}});
  $('privateNewNoteBtn').addEventListener('click',()=>openPrivateNoteEditor());
  $('privateLockBtn').addEventListener('click',()=>{void lockPrivateNotes();});
  $('privateCancelEditBtn').addEventListener('click',()=>{privateNoteDirty=false;$('privateNoteForm').reset();$('privateNoteForm').hidden=true;$('privateNoteId').value='';});
  $('privateNotesList').addEventListener('click',handlePrivateNotesClick);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&privateNotesUnlocked)privateHiddenAt=Date.now();else if(privateHiddenAt&&Date.now()-privateHiddenAt>=5*60*1000)lockPrivateNotes();if(document.visibilityState==='visible'&&calendarTokenIsValid()&&userSettings.calendarIds.length&&!calendarSyncInProgress)void syncGoogleCalendar(false);});

  $('exportBtn').addEventListener('click',exportBackup);
  window.addEventListener('focus',syncTasksOnForeground);
  document.addEventListener('dragend',()=>{handleDragEnd();noteDragId='';checklistDragId='';checklistDragGroup='';clearDropStyles();});
  document.addEventListener('pointerdown',startPointerDrag,true);
  document.addEventListener('pointermove',movePointerDrag,{passive:false});
  document.addEventListener('pointerup',event=>finishPointerDrag(event),true);
  document.addEventListener('pointercancel',event=>finishPointerDrag(event,true),true);
  document.addEventListener('touchstart',startTouchDrag,{capture:true,passive:false});
  document.addEventListener('touchmove',moveTouchDrag,{capture:true,passive:false});
  document.addEventListener('touchend',event=>finishTouchDrag(event),true);
  document.addEventListener('touchcancel',event=>finishTouchDrag(event,true),true);
  for(const dialog of document.querySelectorAll('dialog')){
    dialog.addEventListener('cancel',event=>{event.preventDefault();handleDialogBack(dialog);});
    dialog.addEventListener('close',()=>{
      const token=dialog.dataset.historyToken;if(!token)return;
      delete dialog.dataset.historyToken;
      if(history.state?.tnmDialogToken===token)history.back();
    });
    dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;
      const rect=dialog.getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom){
        closeFloatingActionMenu();
        if(dialog.id==='taskDialog')closeTaskDialogSafely();else if(dialog.id==='noteDialog')closeNoteDialogSafely();else if(dialog.open)dialog.close();
      }
    });
  }
  window.addEventListener('popstate',event=>{
    const openDialogs=Array.from(document.querySelectorAll('dialog[open]'));
    const dialog=openDialogs[openDialogs.length-1];if(!dialog)return;
    if(dialog.dataset.historyToken&&event.state?.tnmDialogToken===dialog.dataset.historyToken)return;
    handleDialogBack(dialog);
    if(dialog.open)pushDialogHistory(dialog);
  });
  document.addEventListener('click',captureActionMenuClick,true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&floatingActionMenu){event.preventDefault();event.stopPropagation();closeFloatingActionMenu();}},true);
  document.addEventListener('scroll',()=>{if(floatingActionMenu)closeFloatingActionMenu();},true);
  window.addEventListener('resize',()=>updateNavIndicator());
  window.addEventListener('online',()=>{ if (session?.user?.id) void syncCloud();if(calendarTokenIsValid()&&userSettings.calendarIds.length&&!calendarSyncInProgress)void syncGoogleCalendar(false); });

  syncViewModeSwitch();syncFullscreenButton();applyZoom();renderAll(); setPage(currentPage); startAutomaticBackup(); startCalendarAutoSync(); void initializeAuth();
})();
