(() => {
  'use strict';

  const CLOUD = window.NMM_SUPABASE || {};
  const CLOUD_READY = Boolean(CLOUD.url && CLOUD.publishableKey);
  const TASKS_KEY = 'tnm.weekly.tasks.v1';
  const NOTES_KEY = 'tnm.weekly.notes.v1';
  const LOGS_KEY = 'tnm.weekly.logs.v1';
  const LOG_RANGE_KEY = 'tnm.weekly.logsRange.v1';
  const ZOOM_KEY = 'tnm.weekly.zoom.v1';
  const USER_SETTINGS_KEY = 'tnm.weekly.userSettings.v1';
  const PRIVATE_VAULT_KEY = 'tnm.weekly.privateVault.v1';
  const PRIVATE_ROWS_KEY = 'tnm.weekly.privateRows.v1';
  const SESSION_KEY = 'naMinhaMao.supabase.session.v1';
  const RESET_KEY = 'tnm.weekly.reset.v1';
  const TAGS_KEY = 'tnm.weekly.tags.v1';
  const TAG_FILTER_KEY = 'tnm.weekly.filterTag.v1';
  const LAST_TAG_KEY = 'tnm.weekly.lastTag.v1';
  const AUTO_BACKUP_KEY = 'tnm.weekly.autobackup.v1';
  const CALENDAR_EVENTS_KEY = 'tnm.weekly.calendarEvents.v1';
  const AUTO_BACKUP_EVERY = 5*60*1000;
  const WEEK_KEY = 'tnm.weekly.week.v1';
  const PAGE_KEY = 'tnm.weekly.page.v1';
  const RESET_CUTOFF = '2026-10-18T14:27:00.000Z';
  const DEFAULT_TAGS = [
    {id:'vida',name:'VIDA',color:'#73d6a2',createdAt:'2026-10-18T00:00:00.000Z',updatedAt:'2026-10-18T00:00:00.000Z'},
    {id:'trabalho',name:'TRABALHO',color:'#8bafff',createdAt:'2026-10-18T00:00:00.000Z',updatedAt:'2026-10-18T00:00:00.000Z'},
    {id:'outro',name:'OUTRO',color:'#ffc46b',createdAt:'2026-10-18T00:00:00.000Z',updatedAt:'2026-10-18T00:00:00.000Z'}
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
  let privateNotesUnlocked = false;
  let privateNotesMode = false;
  let privateNoteDirty = false;
  let privateHiddenAt = 0;
  let pendingPrivateMoveId = '';
  let tags = [];
  let calendarEvents = readStored(CALENDAR_EVENTS_KEY,[]);
  if(!Array.isArray(calendarEvents))calendarEvents=[];
  let session = readStored(SESSION_KEY,null);
  let filterTagIds = readFilterTags();
  let currentPage = ['home','tasks','log','notes','settings'].includes(localStorage.getItem(PAGE_KEY)) ? localStorage.getItem(PAGE_KEY) : 'home';
  let zoomLevel = Math.min(1.25,Math.max(.8,Number(localStorage.getItem(ZOOM_KEY))||1));
  let weekStart = (()=>{const current=startOfWeek(todayKey()),saved=localStorage.getItem(WEEK_KEY),selected=saved?startOfWeek(saved):current;return selected<current?current:selected;})();
  let observedToday=todayKey();
  let observedCurrentWeek=startOfWeek(observedToday);
  let dragTaskId = '';
  let noteDragId = '';
  let expandedSection = '';
  let planningVisibleLimit = 6;
  let completedVisibleLimit = 6;
  let floatingActionMenu = null;
  let pointerDrag = null;
  let activeDayKind = 'day';
  let activeDayDate = '';
  let authBusy = false;
  let taskDialogDirty = false;
  let noteDialogDirty = false;
  let lastTaskCtrlEnterAt = 0;
  let lastNoteCtrlEnterAt = 0;
  let authMessage = '';
  let syncStatus = '';
  let syncTimer = null;
  let syncInFlight = false;
  let syncQueued = false;
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
  function getUpcomingCalendarEvents(){const today=todayKey(),now=Date.now();return calendarEvents.map(normalizeCalendarEvent).filter(Boolean).filter(event=>event.allDay?event.startAt>=today:Date.parse(event.startAt)>=now).sort(calendarEventOrder);}
  function setCalendarEvents(values){calendarEvents=(Array.isArray(values)?values:[]).map(normalizeCalendarEvent).filter(Boolean);localStorage.setItem(CALENDAR_EVENTS_KEY,JSON.stringify(calendarEvents));renderHomeEvents();}
  window.TNMCalendarBridge=Object.freeze({replaceEvents:setCalendarEvents});
  function normalizeTag(value) {
    if (!value || typeof value !== 'object' || !String(value.id || '').trim() || !String(value.name || '').trim()) return null;
    return {id:String(value.id),name:String(value.name).trim().replace(/\s+/g,' ').slice(0,32),color:validTagColor(value.color)?String(value.color).toLowerCase():'#8bafff',createdAt:String(value.createdAt || nowISO()),updatedAt:String(value.updatedAt || value.createdAt || nowISO()),deletedAt:value.deletedAt?String(value.deletedAt):null};
  }
  function getTag(tagId) { return tags.find(tag=>tag.id===String(tagId) && !tag.deletedAt) || tags.find(tag=>tag.id==='vida') || DEFAULT_TAGS[0]; }
  function ensureDefaultTags(list) {
    const map=new Map((Array.isArray(list)?list:[]).map(item=>[item.id,item]));
    for (const item of DEFAULT_TAGS) if (!map.has(item.id)) map.set(item.id,{...item});
    return Array.from(map.values()).map(normalizeTag).filter(Boolean);
  }
  function loadLocalTags() {
    const stored=readStored(TAGS_KEY,[]);
    tags=ensureDefaultTags(Array.isArray(stored)?stored.map(normalizeTag).filter(Boolean):[]);
    filterTagIds=filterTagIds.filter(id=>tags.some(tag=>tag.id===id && !tag.deletedAt));
    localStorage.setItem(TAG_FILTER_KEY,JSON.stringify(filterTagIds));
    localStorage.setItem(TAGS_KEY,JSON.stringify(tags));
  }
  function saveTags(schedule=true) {
    tags=ensureDefaultTags(tags);
    localStorage.setItem(TAGS_KEY,JSON.stringify(tags));
    renderTasks(); renderHome(); renderFilterButton(); renderLogs();
    if (schedule) scheduleSync();
  }
  function loadLocalData() {
    const storedTasks=readStored(TASKS_KEY,[]), storedNotes=readStored(NOTES_KEY,[]), storedLogs=readStored(LOGS_KEY,[]);
    tasks=Array.isArray(storedTasks) ? storedTasks.map(normalizeTask).filter(Boolean) : [];
    notes=Array.isArray(storedNotes) ? storedNotes.map(normalizeNote).filter(Boolean) : [];
    logs=Array.isArray(storedLogs) ? storedLogs.map(normalizeLog).filter(Boolean) : [];
  }
  function normalizeTask(value) {
    if (!value || typeof value !== 'object' || !String(value.title || '').trim()) return null;
    const legacyArea=value.area==='outros' ? 'outro' : (['vida','trabalho'].includes(value.area) ? value.area : 'vida');
    const storedTag=value.tagId || value.tag_id;
    return {
      id:String(value.id || makeId()), title:String(value.title).trim().slice(0,180),
      content:String(value.content ?? value.details ?? '').slice(0,20000),link:normalizeLink(value.link ?? value.link_url ?? ''),
      tagId:String(storedTag==='outros' ? 'outro' : (storedTag || legacyArea)),
      executionDate:isDateKey(value.executionDate || value.execution_date) ? String(value.executionDate || value.execution_date) : null,
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
    const source=value&&typeof value==='object'?value:{};
    const times=Array.isArray(source.summaryTimes)?Array.from(new Set(source.summaryTimes.map(String).filter(time=>/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))):[];
    return {summaryTimes:times.sort(),calendarIds:Array.isArray(source.calendarIds)?Array.from(new Set(source.calendarIds.map(String))):[],overdueTaskOrder:Array.isArray(source.overdueTaskOrder)?Array.from(new Set(source.overdueTaskOrder.map(String))):[],nickname:String(source.nickname||'Gio').trim().slice(0,32)||'Gio',timezone:'America/Sao_Paulo',updatedAt:String(source.updatedAt||source.updated_at||'1970-01-01T00:00:00.000Z')};
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
  function normalizeNote(value) {
    if (!value || typeof value !== 'object') return null;
    const title=String(value.title || '').trim().slice(0,140), content=String(value.content || '').slice(0,20000);
    if (!title && !content.trim()) return null;
    const rawTags=value.tagIds ?? value.tag_ids ?? [];
    return {
      id:String(value.id || makeId()), title, content,link:normalizeLink(value.link ?? value.link_url ?? ''),isPinned:Boolean(value.isPinned ?? value.is_pinned ?? false),
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
    const ordered=privateNotes.filter(note=>!note.deletedAt&&note.kind!=='log').sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
    list.innerHTML=ordered.length?ordered.map(note=>{const link=note.link?`<a class="item-link" href="${escapeHTML(note.link)}" target="_blank" rel="noopener noreferrer">↗ Abrir link</a>`:'',tagIds=Array.isArray(note.tagIds)?note.tagIds:[],tagsHtml=tagIds.map(id=>tags.find(tag=>tag.id===id&&!tag.deletedAt)).filter(Boolean).map(tag=>`<span class="note-tag-pill" style="border-color:${escapeHTML(tag.color)}66;color:${escapeHTML(tag.color)}">${escapeHTML(tag.name)}</span>`).join('');return `<article class="private-note-card"><button class="private-note-open" type="button" data-private-edit="${escapeHTML(note.id)}"><h4>${escapeHTML(note.title||'Nota privada')}</h4><p>${escapeHTML(note.content)}</p></button>${link}${tagsHtml?`<div class="note-tags-preview">${tagsHtml}</div>`:''}<div class="private-note-actions"><button type="button" data-private-duplicate="${escapeHTML(note.id)}">DUPLICAR</button><button type="button" data-private-delete="${escapeHTML(note.id)}">EXCLUIR</button></div></article>`;}).join(''):'<p class="empty">Nenhuma nota privada.</p>';
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
  function renderSettings() { renderSummarySettings(); }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
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
  function showToast(message) {
    const node=$('toast');
    node.textContent=String(message || '');
    node.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>node.classList.add('hidden'),2600);
  }
  function updateNavIndicator(page=currentPage) {
    const nav=document.querySelector('.main-nav'), indicator=$('navIndicator'), buttons=Array.from(document.querySelectorAll('.nav-btn[data-page]'));
    const index=buttons.findIndex(button=>button.dataset.page===page);
    if (!nav||!indicator||index<0||!buttons[0]) return;
    const step=buttons[0].getBoundingClientRect().width+4;
    indicator.style.transform=`translateX(${index*step}px)`;
  }
  function setPage(page) {
    if (!['home','tasks','log','notes','settings'].includes(page)) return;
    const previous=currentPage, oldIndex=['home','tasks','log','notes','settings'].indexOf(previous), newIndex=['home','tasks','log','notes','settings'].indexOf(page);
    if(page!=='notes'&&pendingPrivateMoveId)pendingPrivateMoveId='';
    if(!['notes','log'].includes(page)){pendingLogLockId='';pendingLogUnlockId='';}
    if(page==='log'&&privateNotesUnlocked&&privateNoteDirty){void savePrivateNote({preventDefault(){}},false).then(saved=>{if(saved)setPage(page);});return;}
    if(!['notes','log'].includes(page)&&privateNotesUnlocked&&privateNoteDirty){void lockPrivateNotes().then(ok=>{if(ok)setPage(page);});return;}
    if(!['notes','log'].includes(page)&&privateNotesUnlocked)void lockPrivateNotes();
    currentPage=page;
    localStorage.setItem(PAGE_KEY,page);
    document.body.dataset.page=page;
    document.querySelectorAll('.page').forEach(node=>{
      const active=node.id===`${page}Page`;
      node.classList.toggle('active',active);
      if (active&&previous!==page) {
        node.style.setProperty('--page-shift',newIndex>=oldIndex?'14px':'-14px');
        node.classList.remove('page-enter'); void node.offsetWidth; node.classList.add('page-enter');
      }
    });
    document.querySelectorAll('.nav-btn[data-page]').forEach(button=>{
      if (button.dataset.page===page) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    updateNavIndicator(page);
    if (page==='home') renderHome();
    if (page==='tasks') renderTasks();
    if (page==='notes') { renderNotes();renderNotesMode(); }
    if (page==='log') renderLogs();
    if (page==='settings') { updateAuthUI();renderSettings(); }
  }
  function hasSelectedTag(tagIds) { return !filterTagIds.length || tagIds.some(id=>filterTagIds.includes(id)); }
  function visibleTasks() { return tasks.filter(task=>!task.deletedAt && hasSelectedTag([task.tagId])); }
  function visibleNotes() { return notes.filter(note=>!note.deletedAt && hasSelectedTag(note.tagIds || [])); }
  function openTasks() { return visibleTasks().filter(task=>!task.completedAt); }
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
    const id=escapeHTML(task.id), move=canMove&&!task.completedAt;
    return `<details class="task-menu"><summary aria-label="Mais ações para ${escapeHTML(task.title)}" title="Mais ações">⋮</summary><div class="task-menu-popover"><button class="menu-action menu-edit" type="button" data-edit-task="${id}">EDITAR</button>${move?`<button class="menu-action menu-move" type="button" data-move-task="${id}" data-direction="up">↑ SUBIR</button><button class="menu-action menu-move" type="button" data-move-task="${id}" data-direction="down">↓ DESCER</button>`:''}<button class="menu-action menu-delete" type="button" data-delete-task="${id}">EXCLUIR</button></div></details>`;
  }
  function taskCard(task,options={}) {
    const complete=Boolean(task.completedAt), late=!complete&&(options.late ?? Boolean(task.executionDate&&task.executionDate<todayKey())), draggable=!complete&&options.draggable!==false;
    const classes=['task-card',complete?'completed':'',late?'is-late':'',options.compact?'task-card--compact':'',options.tile?'task-card--tile':'',options.linked?'is-linked':''].filter(Boolean).join(' ');
    const linked=options.linked?'task-link':'';
    const tag=getTag(task.tagId),taskTag=tagDot(task.tagId),taskHandle=draggable?`<button class="task-touch-handle" type="button" data-touch-drag-task="${escapeHTML(task.id)}" style="--tag-color:${escapeHTML(tag.color)}" aria-label="Arrastar ${escapeHTML(task.title)}"><span class="drag-grip" aria-hidden="true">⠿</span></button>`:'';
    return `<article class="${classes}" draggable="${draggable?'true':'false'}" data-task-id="${escapeHTML(task.id)}" aria-label="${escapeHTML(task.title)}">
      <input class="task-check" type="checkbox" data-complete-task="${escapeHTML(task.id)}" ${complete?'checked':''} aria-label="${complete?'Reabrir':'Concluir'}: ${escapeHTML(task.title)}">
      <div class="task-main"><div class="task-title-row">${taskTag}<button class="task-open task-title ${linked}" type="button" data-edit-task="${escapeHTML(task.id)}">${escapeHTML(task.title)}</button></div>${complete?`<span class="task-completion-meta">${escapeHTML(completionLabel(task))}</span>`:''}</div>
      <div class="task-actions">${taskMenu(task,options.canMove!==false)}${taskHandle}</div>
    </article>`;
  }
  function renderFilterButton() {
    const names=filterTagIds.map(id=>getTag(id).name);
    const summary=names.length ? names.join(' + ') : 'TODAS';
    for (const node of document.querySelectorAll('[data-active-filter-summary]')) node.textContent=summary;
    for (const button of document.querySelectorAll('[data-filter-open]')) button.setAttribute('aria-label',names.length ? `Filtrar por ${names.join(' e ')}` : 'Filtrar por tag; todas as tags');
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
    localStorage.setItem(TAG_FILTER_KEY,JSON.stringify(filterTagIds));
    renderFilterButton(); renderAll(); renderFilterTagList();
  }
  function openFilterDialog() {
    $('tagMessage').textContent=''; $('newTagName').value='';
    renderFilterTagList(); $('filterDialog').showModal();
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
  function renderTasks() {
    const all=visibleTasks(), open=all.filter(task=>!task.completedAt), currentWeek=startOfWeek(todayKey());
    const overdue=weekStart>=currentWeek?sortOverdueTasks(open.filter(task=>task.executionDate&&task.executionDate<currentWeek)):[];
    $('weekLabel').textContent=formatWeekRange(weekStart);
    const cells=[{kind:'overdue',title:'ATRASADO',date:'',tasks:overdue}];
    for (let i=0;i<7;i++) {
      const date=addDays(weekStart,i);
      cells.push({kind:'day',title:DAY_LABELS[i],date,tasks:open.filter(task=>task.executionDate===date).sort(taskOrder)});
    }
    $('weekGrid').innerHTML=cells.map(cell=>{
      const dayKey=cell.kind==='overdue'?'overdue':cell.date;
      const completed=all.filter(task=>task.completedAt&&(cell.kind==='overdue'?weekStart>=currentWeek&&task.executionDate&&task.executionDate<currentWeek:task.executionDate===cell.date));
      const label=cell.kind==='overdue'?'ATRASADO':cell.title, dateText=cell.date?formatDate(cell.date,{day:'2-digit',month:'2-digit'}):'';
      const cards=cell.tasks.map(task=>taskCard(task,{compact:true,late:Boolean(task.executionDate&&task.executionDate<todayKey()),linked:cell.kind==='overdue',draggable:true})).join('');
      const empty=cell.kind==='overdue'?'Nada atrasado':'Sem tarefas';
      const extra=completed.length?`${completed.length} concluídas`:'';
      return `<section class="day-column${cell.date===todayKey()?' is-today':''}" data-kind="${cell.kind}"${cell.date?` data-date="${cell.date}"`:''} aria-label="${label}${dateText?` ${dateText}`:''}"><div class="day-head-row"><button class="day-heading-button" type="button" data-open-day="${dayKey}" aria-label="Abrir ${label}${dateText?` ${dateText}`:''}"><strong>${label}</strong>${dateText?`<time>${dateText}</time>`:''}<span class="day-count">${cell.tasks.length}</span></button>${cell.date?`<button class="icon-btn day-add" type="button" data-add-date="${cell.date}" aria-label="Nova tarefa em ${cell.title} ${dateText}">＋</button>`:''}</div><div class="day-task-list" data-day-drop="${cell.date||''}">${cards||`<div class="day-empty">${empty}</div>`}</div>${extra?`<div class="day-extra-count">${escapeHTML(extra)}</div>`:''}</section>`;
    }).join('');
    const unplanned=open.filter(task=>!task.executionDate).sort(taskOrder), completed=all.filter(task=>Boolean(task.completedAt)).sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt)));
    $('unplannedCount').textContent=String(unplanned.length); $('completedCount').textContent=String(completed.length);
    renderPlannerPanels(); renderFilterButton(); renderDialogLists();
  }
  function renderPlannerPanels() {
    const planning=visibleTasks().filter(task=>!task.completedAt&&!task.executionDate).sort(taskOrder);
    const completed=visibleTasks().filter(task=>task.completedAt).sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt)));
    $('planningPanel').hidden=expandedSection!=='planning'; $('completedPanel').hidden=expandedSection!=='completed';
    $('planningBtn').setAttribute('aria-expanded',String(expandedSection==='planning'));
    $('completedBtn').setAttribute('aria-expanded',String(expandedSection==='completed'));
    $('planningList').innerHTML=planning.slice(0,planningVisibleLimit).map(task=>taskCard(task,{tile:true})).join('')||'<div class="empty">Sem tarefas para planejar.</div>';
    $('completedList').innerHTML=completed.slice(0,completedVisibleLimit).map(task=>taskCard(task,{tile:true,canMove:false})).join('')||'<div class="empty">Nenhuma tarefa concluída.</div>';
    $('planningMoreBtn').hidden=planning.length<=planningVisibleLimit; $('completedMoreBtn').hidden=completed.length<=completedVisibleLimit;
    document.body.classList.toggle('planner-expanded',Boolean(expandedSection));
  }
  function togglePlannerSection(section,forceOpen=false) {
    if (forceOpen) expandedSection=section;
    else expandedSection=expandedSection===section?'':section;
    if (expandedSection==='planning') planningVisibleLimit=6;
    if (expandedSection==='completed') completedVisibleLimit=6;
    renderTasks();
  }
  function renderAll() { renderTasks(); renderHome(); renderNotes(); renderLogs(); renderNotesMode(); }
  function homeDateLabel(date) {
    const text=formatDate(date).replace(/\./g,'');
    const title=text.charAt(0).toLocaleUpperCase('pt-BR')+text.slice(1);
    if(date===todayKey())return `HOJE - ${title}`;
    if(date===addDays(todayKey(),1))return `AMANHÃ - ${title}`;
    return title;
  }
  function renderHomeTaskList(id,list) {
    const node=$(id);
    node.innerHTML=list.length?list.map(task=>{const tag=getTag(task.tagId),late=task.executionDate<todayKey();return `<article class="home-task-row${late?' is-late':''}"><div class="home-task-main"><span class="home-item-date">${escapeHTML(homeDateLabel(task.executionDate))}</span><button class="home-item-open" type="button" data-edit-task="${escapeHTML(task.id)}">${escapeHTML(task.title)}</button><span class="home-tag-pill" style="--tag-color:${escapeHTML(tag.color)}">${escapeHTML(tag.name)}</span></div></article>`;}).join(''):'<div class="empty">Sem tarefas.</div>';
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
    const open=visibleTasks().filter(task=>!task.completedAt),today=todayKey(),tomorrow=addDays(today,1);
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
    const visible=logs.filter(log=>!log.deletedAt&&Date.parse(log.createdAt)>=cutoff).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
    document.querySelectorAll('[data-log-range]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.logRange===logRange)));
    list.innerHTML=visible.length?visible.map(log=>{
      const id=escapeHTML(log.id),tag=tags.find(item=>item.id===log.tagId&&!item.deletedAt),opened=Boolean(log.isLocked&&unlockedLogIds.has(log.id)),privateLog=opened?privateLogs.find(item=>item.id===log.id):null;
      const content=log.isLocked?(privateLog?.content||'🔒 Registro trancado'):log.content;
      const tagBadge=tag?`<span class="log-tag-pill" style="--tag-color:${escapeHTML(tag.color)}">${escapeHTML(tag.name)}</span>`:'';
      const lockAction=!log.isLocked?'lock':opened?'hide':'unlock',lockLabel=lockAction==='unlock'?'DESTRANCAR 🔒':'TRANCAR 🔒';
      const tagOptions=`<option value="">SEM TAG</option>${tags.filter(item=>!item.deletedAt).map(item=>`<option value="${escapeHTML(item.id)}" ${item.id===log.tagId?'selected':''}>${escapeHTML(item.name)}</option>`).join('')}`;
      return `<article class="log-entry" data-log-id="${id}"><p>${escapeHTML(logTimestampLabel(log.createdAt,content))}</p><div class="log-entry-footer">${tagBadge}<div class="log-entry-actions"><button class="log-action" type="button" data-log-action="tag" aria-label="Adicionar ou alterar tag do log">＋TAG</button><select class="log-tag-select" data-log-tag-select="${id}" aria-label="Tag deste log" hidden>${tagOptions}</select><button class="log-action" type="button" data-log-action="${lockAction}" data-log-id="${id}">${lockLabel}</button><button class="log-action log-action-delete" type="button" data-log-action="delete" data-log-id="${id}">EXCLUIR</button></div></div></article>`;
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
  function requestLogVaultAccess(logId,action) {
    if(action==='lock')pendingLogLockId=String(logId);else pendingLogUnlockId=String(logId);
    pendingPrivateMoveId='';setNotesMode('private');setPage('notes');
    showToast(privateVault?'Desbloqueie o cofre em Notas privadas; depois volto ao Log.':'Configure o cofre em Notas privadas para proteger os logs.');
  }
  function privateLogCipherId(logId) { return `tnm-log:${String(logId)}`; }
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
      let entry=privateLogs.find(item=>item.id===id);
      if(!entry){const row=privateCipherRows.find(item=>item.id===privateLogCipherId(id)&&!item.deletedAt);if(!row)throw new Error('missing cipher');const data=await decryptPrivateValue(privateCryptoKey,row.iv,row.ciphertext);if(data?.kind!=='log'||data.logId!==id)throw new Error('invalid log');entry={id,content:String(data.content||''),createdAt:String(data.createdAt||row.createdAt)};privateLogs.push(entry);}
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
    if(toggle){const select=toggle.parentElement.querySelector('[data-log-tag-select]');if(select){select.hidden=!select.hidden;if(!select.hidden)select.focus();}return;}
    const button=event.target.closest('[data-log-action]');if(!button)return;
    const id=button.dataset.logId,action=button.dataset.logAction;
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
      const data=await decryptPrivateValue(key,row.iv,row.ciphertext);
      result.push({...data,id:row.id,createdAt:row.createdAt,updatedAt:row.updatedAt,deletedAt:null});
    }
    return result.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  function setDecryptedVaultItems(items) {
    privateNotes=items.filter(item=>item.kind!=='log');
    privateLogs=items.filter(item=>item.kind==='log').map(item=>({id:String(item.logId||''),content:String(item.content||''),createdAt:String(item.createdAt||''),cipherId:String(item.id||'')})).filter(item=>item.id);
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
      const decrypted=await loadDecryptedPrivateNotes(key);setDecryptedVaultItems(decrypted);privateCryptoKey=key;privateNotesUnlocked=true;setPrivateStatus('Cofre desbloqueado.');renderPrivateNotes();if(pendingPrivateMoveId)await completePendingPrivateMove();if(pendingLogLockId)await completePendingLogLock();else if(pendingLogUnlockId){const id=pendingLogUnlockId;pendingLogUnlockId='';if(privateLogs.some(item=>item.id===id))unlockedLogIds.add(id);else showToast('Não encontrei a cópia criptografada deste log.');setPage('log');renderLogs();}
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
    const data={title:source.title||'',content:source.content||'',link:source.link||'',tagIds:Array.isArray(source.tagIds)?[...source.tagIds]:[],isPinned:Boolean(source.isPinned),sortOrder:Number(source.sortOrder)||0};
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
    privateNoteDirty=false;$('privateNoteForm').reset();$('privateNoteId').value=note?.id||'';$('privateNoteTitle').value=note?.title||'';$('privateNoteContent').value=note?.content||'';$('privateNoteForm').hidden=false;
  }
  async function savePrivateNote(event,close=true,allowEmpty=false) {
    event?.preventDefault?.();if(!privateNotesUnlocked||!privateCryptoKey)return false;
    const title=$('privateNoteTitle').value.trim(),content=$('privateNoteContent').value.trim();
    if(!title&&!content){if(allowEmpty){privateNoteDirty=false;return true;}setPrivateStatus('Preencha o título ou conteúdo.',true);return false;}
    try {
      const id=$('privateNoteId').value||makeId(),old=privateCipherRows.find(item=>item.id===id&&!item.deletedAt),oldNote=privateNotes.find(item=>item.id===id&&!item.deletedAt),now=nowISO();
      const data={title,content,link:oldNote?.link||'',tagIds:Array.isArray(oldNote?.tagIds)?oldNote.tagIds:[],isPinned:Boolean(oldNote?.isPinned),sortOrder:Number(oldNote?.sortOrder)||0},key=privateCryptoKey,encrypted=await encryptPrivateValue(key,data);
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
      const now=nowISO(),data={title:source.title?`${source.title.slice(0,132)} (cópia)`: '',content:source.content,link:source.link||'',tagIds:Array.isArray(source.tagIds)?source.tagIds:[],isPinned:Boolean(source.isPinned),sortOrder:Number(source.sortOrder)||0},id=makeId(),key=privateCryptoKey,encrypted=await encryptPrivateValue(key,data);
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
    const active=visibleNotes().sort(noteOrder);
    $('notesList').innerHTML=active.length ? active.map(note=>{
      const id=escapeHTML(note.id),tagsHtml=(note.tagIds||[]).map(tagId=>tags.find(tag=>tag.id===tagId&&!tag.deletedAt)).filter(Boolean).map(tag=>`<span class="note-tag-pill" style="border-color:${escapeHTML(tag.color)}66;color:${escapeHTML(tag.color)}">${escapeHTML(tag.name)}</span>`).join('');
      const title=note.title?`<h3 class="note-card-title">${escapeHTML(note.title)}</h3>`:'<span class="note-card-title-placeholder" aria-hidden="true"></span>';
      const body=note.title?(note.content?`<p>${escapeHTML(note.content)}</p>`:''):`<p class="note-card-content--titleless">${escapeHTML(note.content)}</p>`;
      const pinLabel=note.isPinned?'Desafixar nota':'Fixar nota';
      const link=note.link?`<a class="item-link" href="${escapeHTML(note.link)}" target="_blank" rel="noopener noreferrer">↗ Abrir link</a>`:'';
      return `<article class="note-card${note.isPinned?' is-pinned':''}" data-note-card="${id}" data-note-id="${id}" draggable="true" tabindex="0"><header class="note-card-header">${title}<div class="note-card-controls"><button class="note-touch-handle" type="button" data-touch-drag-note="${id}" aria-label="Arrastar nota" title="Arrastar nota">⠿</button><details class="note-menu"><summary aria-label="Mais ações para a nota" title="Mais ações">⋮</summary><div class="note-menu-popover"><button class="menu-action" type="button" data-pin-note="${id}" aria-pressed="${String(Boolean(note.isPinned))}">${pinLabel}</button><button class="menu-action menu-edit" type="button" data-duplicate-note="${id}">DUPLICAR NOTA</button><button class="menu-action" type="button" data-lock-note="${id}">TRANCAR 🔒</button><button class="menu-action menu-move" type="button" data-move-note="${id}" data-direction="up">↑ MOVER ACIMA</button><button class="menu-action menu-move" type="button" data-move-note="${id}" data-direction="down">↓ MOVER ABAIXO</button><button class="menu-action menu-delete" type="button" data-delete-note="${id}">EXCLUIR</button></div></details></div></header><div class="note-card-body">${body}</div>${link}${tagsHtml?`<div class="note-tags-preview">${tagsHtml}</div>`:''}</article>`;
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
    const all=visibleTasks(),currentWeek=startOfWeek(todayKey()),today=todayKey();
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
    $('dayDialogAddBtn').hidden=activeDayKind!=='day';
    renderDayDialog(); $('dayDialog').showModal();
  }
  function setLinkAttachment(kind,value='') {
    const input=$(`${kind}Link`),wrap=$(`${kind}LinkWrap`),toggle=$(`${kind}LinkToggle`),url=normalizeLink(value);
    input.value=url;wrap.hidden=!url;toggle.hidden=Boolean(url);
  }
  function toggleLinkAttachment(kind) { $(`${kind}LinkWrap`).hidden=false;$(`${kind}LinkToggle`).hidden=true;$(`${kind}Link`).focus(); }
  function clearLinkAttachment(kind) { $(`${kind}Link`).value='';$(`${kind}LinkWrap`).hidden=true;$(`${kind}LinkToggle`).hidden=false; }
  function openTaskDialog(taskId='',suggestedDate='') {
    taskDialogDirty=false;lastTaskCtrlEnterAt=0;
    const task=taskId ? tasks.find(item=>item.id===String(taskId) && !item.deletedAt) : null;
    $('taskForm').reset();
    $('taskId').value=task ? task.id : '';
    $('taskDialogTitle').textContent=task ? 'Editar tarefa' : 'Nova tarefa';
    $('taskTitle').value=task?.title || '';$('taskContent').value=task?.content || '';
    renderTaskTagOptions(task?.tagId || filterTagIds[0] || localStorage.getItem(LAST_TAG_KEY) || 'vida');
    $('executionDate').value=task?.executionDate || suggestedDate || '';setLinkAttachment('task',task?.link||'');
    $('deleteTaskBtn').classList.toggle('hidden',!task);
    $('taskDialog').showModal();
  }
  function closeTaskDialog() { taskDialogDirty=false;if ($('taskDialog').open) $('taskDialog').close(); }
  function savePopupBeforeClose(dialog) {
    if(dialog.id==='taskDialog'&&taskDialogDirty){
      const hasText=$('taskTitle').value.trim()||$('taskContent').value.trim()||$('taskLink').value.trim();
      if(!hasText){taskDialogDirty=false;return true;}
      saveTaskFromForm({preventDefault(){}});
      if(dialog.open){showToast('Preencha o título da tarefa. Mantive o popup aberto para não perder o texto.');return false;}
      return true;
    }
    if(dialog.id==='noteDialog'&&noteDialogDirty){
      const hasText=$('noteTitle').value.trim()||$('noteContent').value.trim()||$('noteLink').value.trim();
      if(!hasText){noteDialogDirty=false;return true;}
      saveNote({preventDefault(){}});
      if(dialog.open){showToast('Preencha o título ou conteúdo da nota. Mantive o popup aberto para não perder o texto.');return false;}
      return true;
    }
    return true;
  }
  function closeTaskDialogSafely() { const dialog=$('taskDialog');if(savePopupBeforeClose(dialog)&&dialog.open)closeTaskDialog(); }
  function closeNoteDialogSafely() { const dialog=$('noteDialog');if(savePopupBeforeClose(dialog)&&dialog.open)dialog.close(); }
  function saveTaskFromForm(event,close=true) {
    event?.preventDefault?.();
    const title=$('taskTitle').value.trim(),content=$('taskContent').value.trim(),link=normalizeLink($('taskLink').value);
    const tagId=$('taskTag').value;
    const date=$('executionDate').value || null;
    if (!title || !tags.some(tag=>tag.id===tagId && !tag.deletedAt) || (date && !isDateKey(date))) { showToast('Confira o título, a tag e a data da tarefa.');return false; }
    const id=$('taskId').value;
    const existing=id ? tasks.find(task=>task.id===id && !task.deletedAt) : null;
    const now=nowISO(),savedId=existing?.id||makeId();
    if (existing) {
      if ((existing.executionDate||'')!==(date||'')) existing.sortOrder=nextTaskOrder(date);
      existing.title=title;existing.content=content;existing.link=link;existing.tagId=tagId;existing.executionDate=date;existing.updatedAt=now;
    } else {
      tasks.push({id:savedId,title,content,link,tagId,executionDate:date,sortOrder:nextTaskOrder(date),createdAt:now,updatedAt:now,completedAt:null,deletedAt:null});
    }
    $('taskId').value=savedId;
    if(!close){$('taskDialogTitle').textContent='Editar tarefa';$('deleteTaskBtn').classList.remove('hidden');}
    localStorage.setItem(LAST_TAG_KEY,tagId);
    if (date && date>=todayKey()) setWeek(date);
    taskDialogDirty=false;if(close)closeTaskDialog();saveTasks();
    if (!date) togglePlannerSection('planning',true);
    showToast(existing?'Tarefa atualizada.':'Tarefa adicionada.');return true;
  }
  function softDeleteTask() { softDeleteTaskById($('taskId').value); }
  function softDeleteTaskById(id) {
    const task=tasks.find(item=>item.id===String(id) && !item.deletedAt);
    if (!task || !window.confirm(`Excluir “${task.title}”?`)) return;
    task.deletedAt=nowISO(); task.updatedAt=task.deletedAt;
    closeTaskDialog(); saveTasks(); showToast('Tarefa excluída.');
  }
  function toggleComplete(taskId,complete) {
    const task=tasks.find(item=>item.id===String(taskId) && !item.deletedAt);
    if (!task) return;
    task.completedAt=complete ? nowISO() : null;
    task.updatedAt=nowISO();
    saveTasks();
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
  function handleTaskClick(event) {
    if(event.target.closest('[data-touch-drag-task]')){event.preventDefault();return;}
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
      if(action.matches('[data-edit-task],[data-move-task],[data-delete-task]'))handleTaskClick(event);
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
  function handleTaskChange(event) {
    const check=event.target.closest('input[data-complete-task]');
    if (check) toggleComplete(check.dataset.completeTask,check.checked);
  }
  function handleDragStart(event) {
    const card=event.target.closest('.task-card[data-task-id]');
    if (!card || event.target.closest('input[data-complete-task],.task-menu')) { event.preventDefault(); return; }
    const task=tasks.find(item=>item.id===card.dataset.taskId && !item.completedAt && !item.deletedAt);
    if (!task) { event.preventDefault(); return; }
    dragTaskId=task.id; card.classList.add('is-dragging');
    if (event.dataTransfer) { event.dataTransfer.effectAllowed='move'; event.dataTransfer.setData('text/plain',dragTaskId); }
  }
  function clearDropStyles() { document.querySelectorAll('.drop-active,.is-dragging').forEach(node=>node.classList.remove('drop-active','is-dragging')); }
  function handleDragOver(event) {
    if (!dragTaskId) return;
    const targetCard=event.target.closest('.task-card[data-task-id]');
    const destination=event.target.closest('.day-column[data-date],.day-column[data-kind="overdue"],#planningPanel,#dayDialogList');
    if(!targetCard&&!destination)return;
    event.preventDefault();(targetCard||destination)?.classList.add('drop-active');
  }
  function performTaskDrop(id,target) {
    if(!target)return;
    const targetCard=target.closest('.task-card[data-task-id]'),day=target.closest('.day-column[data-date]'),overdueColumn=target.closest('.day-column[data-kind="overdue"]'),planning=target.closest('#planningPanel'),dayList=target.closest('#dayDialogList');
    if(overdueColumn||dayList&&activeDayKind==='all-overdue')reorderOverdueTaskBefore(id,targetCard?.dataset.taskId||'');
    else if(targetCard)reorderTaskBefore(id,targetCard.dataset.taskId);
    else if(day)appendTaskToBucket(id,day.dataset.date);
    else if(planning)appendTaskToBucket(id,'');
    else if(dayList&&activeDayKind==='day')appendTaskToBucket(id,activeDayDate);
  }
  function handleDrop(event) {
    if(!dragTaskId)return;
    const id=dragTaskId;dragTaskId='';clearDropStyles();
    if(!event.target.closest('.task-card[data-task-id],.day-column[data-date],.day-column[data-kind="overdue"],#planningPanel,#dayDialogList'))return;
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
    const destination=drag.kind==='task'?target.closest('.task-card[data-task-id],.day-column[data-date],.day-column[data-kind="overdue"],#planningPanel,#dayDialogList'):target.closest('.note-card[data-note-id]');
    if(destination&&destination!==drag.card)destination.classList.add('drop-active');
  }
  function finishDragAt(drag,target,cancel=false) {
    if(pointerDrag!==drag)return;
    pointerDrag=null;drag.card.classList.remove('is-dragging');
    if(drag.wasDraggable!==null)drag.card.setAttribute('draggable',drag.wasDraggable);
    document.querySelectorAll('.drop-active').forEach(node=>node.classList.remove('drop-active'));
    if(cancel||!target)return;
    if(drag.kind==='task')performTaskDrop(drag.id,target);
    else {const note=target.closest('.note-card[data-note-id]');if(note)reorderNoteBefore(drag.id,note.dataset.noteId);}
  }
  function startPointerDrag(event) {
    if(event.pointerType==='mouse'||event.pointerType==='touch'||event.button!==0||pointerDrag)return;
    const taskHandle=event.target.closest('[data-touch-drag-task]'),noteHandle=event.target.closest('[data-touch-drag-note]');
    if(!taskHandle&&!noteHandle)return;
    const kind=taskHandle?'task':'note',card=taskHandle?taskHandle.closest('.task-card[data-task-id]'):noteHandle.closest('.note-card[data-note-id]');
    if(!card)return;
    event.preventDefault();pointerDrag={kind,id:taskHandle?taskHandle.dataset.touchDragTask:noteHandle.dataset.touchDragNote,pointerId:event.pointerId,source:'pointer',card,wasDraggable:card.getAttribute('draggable')};
    card.setAttribute('draggable','false');card.classList.add('is-dragging');try{event.target.setPointerCapture(event.pointerId);}catch{}
  }
  function movePointerDrag(event) {
    if(!pointerDrag||pointerDrag.source!=='pointer'||event.pointerId!==pointerDrag.pointerId)return;
    event.preventDefault();updateDragHighlight(pointerDrag,document.elementFromPoint(event.clientX,event.clientY));
  }
  function finishPointerDrag(event,cancel=false) {
    if(!pointerDrag||pointerDrag.source!=='pointer'||event.pointerId!==pointerDrag.pointerId)return;
    finishDragAt(pointerDrag,document.elementFromPoint(event.clientX,event.clientY),cancel);
  }
  function startTouchDrag(event) {
    if(pointerDrag)return;
    const taskHandle=event.target.closest('[data-touch-drag-task]'),noteHandle=event.target.closest('[data-touch-drag-note]'),touch=event.changedTouches?.[0];
    if((!taskHandle&&!noteHandle)||!touch)return;
    const kind=taskHandle?'task':'note',card=taskHandle?taskHandle.closest('.task-card[data-task-id]'):noteHandle.closest('.note-card[data-note-id]');
    if(!card)return;
    event.preventDefault();pointerDrag={kind,id:taskHandle?taskHandle.dataset.touchDragTask:noteHandle.dataset.touchDragNote,touchId:touch.identifier,source:'touch',card,wasDraggable:card.getAttribute('draggable')};
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
    finishDragAt(drag,touch?document.elementFromPoint(touch.clientX,touch.clientY):null,cancel);
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
    renderNoteTagChoices(note?.tagIds||[]);$('noteNewTagRow').hidden=true;$('noteNewTagToggle').hidden=false;$('noteNewTagToggle').setAttribute('aria-expanded','false');$('noteTagMessage').textContent='';setLinkAttachment('note',note?.link||'');
    $('noteDialog').showModal();
  }
  function saveNote(event,close=true) {
    event?.preventDefault?.();
    const content=$('noteContent').value.trim(),title=$('noteTitle').value.trim(),link=normalizeLink($('noteLink').value);
    if (!title&&!content) { showToast('Preencha o título ou conteúdo da nota.');return false; }
    const tagIds=Array.from($('noteTagChoices').querySelectorAll('input:checked')).map(input=>input.value);
    const id=$('noteId').value, now=nowISO(), note=id?notes.find(item=>item.id===id&&!item.deletedAt):null,savedId=note?.id||makeId();
    if (note) { note.title=title;note.content=content;note.link=link;note.tagIds=tagIds;note.updatedAt=now; }
    else notes.unshift({id:savedId,title,content,link,isPinned:false,tagIds,sortOrder:Math.min(-1,...notes.map(item=>Number(item.sortOrder)||0)),createdAt:now,updatedAt:now,deletedAt:null});
    $('noteId').value=savedId;
    if(!close)$('noteDialogTitle').textContent='Editar nota';
    noteDialogDirty=false;if(close)$('noteDialog').close();saveNotes();showToast(note?'Nota atualizada.':'Nota salva.');return true;
  }
  function handlePopupKeyboard(event,kind) {
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
    if(saved)showToast(close?'Salvo e fechado.':'Salvo. Ctrl+Enter novamente em até 500 ms para fechar.');
  }
  function duplicateNote(noteId) {
    const source=notes.find(item=>item.id===String(noteId)&&!item.deletedAt);if(!source)return;
    const now=nowISO(),title=source.title?`${source.title.slice(0,132)} (cópia)`:'';
    notes.unshift({id:makeId(),title,content:source.content,link:source.link,isPinned:false,tagIds:[...(source.tagIds||[])],sortOrder:Math.min(-1,...notes.filter(item=>!item.deletedAt&&!item.isPinned).map(item=>Number(item.sortOrder)||0))-1,createdAt:now,updatedAt:now,deletedAt:null});
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
  function taskToRow(task) {
    return {id:task.id,owner_id:session.user.id,title:task.title,details:task.content||'',link_url:task.link||'',subtasks:[],status:'active',release_date:null,due_date:null,execution_date:task.executionDate,tag_id:task.tagId,sort_order:Number(task.sortOrder)||0,planner_version:1,estimate_minutes:60,reward:'',blocker:'',time_spent_seconds:0,created_at:task.createdAt,updated_at:task.updatedAt,completed_at:task.completedAt,completed_date:task.completedAt?dateKey(new Date(task.completedAt)):null,deleted_at:task.deletedAt};
  }
  function rowToTask(row) {
    return normalizeTask({id:row.id,title:row.title,content:row.details,link_url:row.link_url,tagId:row.tag_id,area:row.area,executionDate:row.execution_date,sortOrder:row.sort_order,createdAt:row.created_at,updatedAt:row.updated_at || row.created_at,completedAt:row.completed_at,deletedAt:row.deleted_at});
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
  function noteToRow(note) { return {id:note.id,owner_id:session.user.id,title:note.title,content:note.content,link_url:note.link||'',is_pinned:Boolean(note.isPinned),tag_ids:note.tagIds||[],sort_order:Number(note.sortOrder)||0,planner_version:1,created_at:note.createdAt,updated_at:note.updatedAt,deleted_at:note.deletedAt}; }
  function rowToNote(row) { return normalizeNote({id:row.id,title:row.title,content:row.content,link_url:row.link_url,is_pinned:row.is_pinned,tag_ids:row.tag_ids,sort_order:row.sort_order,createdAt:row.created_at,updatedAt:row.updated_at || row.created_at,deletedAt:row.deleted_at}); }
  function logToRow(log) { return {id:log.id,owner_id:session.user.id,content:log.isLocked?'🔒 Registro trancado':log.content,tag_id:log.tagId||null,is_locked:Boolean(log.isLocked),planner_version:1,created_at:log.createdAt,updated_at:log.updatedAt,deleted_at:log.deletedAt}; }
  function rowToLog(row) { return normalizeLog({id:row.id,content:row.content,tag_id:row.tag_id,is_locked:row.is_locked,created_at:row.created_at,updated_at:row.updated_at||row.created_at,deleted_at:row.deleted_at}); }
  function mergeById(local,remote) {
    const map=new Map();
    for (const item of [...remote,...local]) {
      const old=map.get(item.id);
      if (!old || Date.parse(item.updatedAt || item.createdAt || '')>=Date.parse(old.updatedAt || old.createdAt || '')) map.set(item.id,item);
    }
    return Array.from(map.values());
  }
  async function loadCloudData() {
    const localTasks=tasks.map(task=>({...task})), localNotes=notes.map(note=>({...note})), localLogs=logs.map(log=>({...log})), localTags=tags.map(tag=>({...tag})), localSettings={...userSettings},localVault=privateVault?{...privateVault}:null,localPrivateRows=privateCipherRows.map(row=>({...row}));
    const [remoteTaskRows,remoteNoteRows,remoteLogRows,remoteTagRows,remoteSettingRows,remoteVaultRows,remotePrivateRows]=await Promise.all([
      fetchAll(`nmm_tasks?select=*&planner_version=eq.1&created_at=gte.${encodeURIComponent(RESET_CUTOFF)}`),
      fetchAll(`nmm_notes?select=*&planner_version=eq.1&created_at=gte.${encodeURIComponent(RESET_CUTOFF)}`),
      fetchAll('nmm_logs?select=*&planner_version=eq.1'),
      fetchAll('nmm_tags?select=*&planner_version=eq.1'),
      fetchAll('nmm_user_settings?select=*&planner_version=eq.1'),
      fetchAll('nmm_private_vaults?select=*&planner_version=eq.1'),
      fetchAll('nmm_private_notes?select=*&planner_version=eq.1')
    ]);
    const remoteTasks=remoteTaskRows.map(rowToTask).filter(Boolean), remoteNotes=remoteNoteRows.map(rowToNote).filter(Boolean), remoteLogs=remoteLogRows.map(rowToLog).filter(Boolean), remoteTags=remoteTagRows.map(rowToTag).filter(Boolean), remoteSettings=remoteSettingRows.length?rowToSettings(remoteSettingRows[0]):null,remoteVault=remoteVaultRows.length?rowToPrivateVault(remoteVaultRows[0]):null,remotePrivateNotes=remotePrivateRows.map(rowToPrivateNote).filter(Boolean);
    tags=ensureDefaultTags(mergeById(localTags,remoteTags).map(normalizeTag).filter(Boolean));
    filterTagIds=filterTagIds.filter(id=>tags.some(tag=>tag.id===id&&!tag.deletedAt));
    localStorage.setItem(TAG_FILTER_KEY,JSON.stringify(filterTagIds));
    localStorage.setItem(TAGS_KEY,JSON.stringify(tags));
    const localActiveTasks=localTasks.filter(item=>!item.deletedAt), localActiveNotes=localNotes.filter(item=>!item.deletedAt);
    const localActiveLogs=localLogs.filter(item=>!item.deletedAt);
    if (!remoteTasks.length && !remoteNotes.length && !remoteLogs.length && (localActiveTasks.length || localActiveNotes.length || localActiveLogs.length) && !window.confirm('A conta está vazia. Enviar as tarefas, notas e logs deste aparelho para ela?')) {
      setAuthMessage('Nada foi enviado. Seus dados continuam neste aparelho.'); return false;
    }
    tasks=mergeById(localTasks,remoteTasks).map(normalizeTask).filter(Boolean);
    notes=mergeById(localNotes,remoteNotes).map(normalizeNote).filter(Boolean);
    logs=mergeById(localLogs,remoteLogs).map(normalizeLog).filter(Boolean);
    localStorage.setItem(TASKS_KEY,JSON.stringify(tasks));
    localStorage.setItem(NOTES_KEY,JSON.stringify(notes));
    localStorage.setItem(LOGS_KEY,JSON.stringify(logs));
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
        const settingsRow=settingsToRow(),vaultRow=privateVaultToRow(),canSyncPrivate=Boolean(privateVault)&&(!privateVault.ownerId||privateVault.ownerId===session.user.id),privateRows=canSyncPrivate?privateCipherRows.map(privateRowToRow):[];
        if (tagRows.length) await cloudRequest('nmm_tags?on_conflict=owner_id,id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(tagRows)});
        if (taskRows.length) await cloudRequest('nmm_tasks?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(taskRows)});
        if (noteRows.length) await cloudRequest('nmm_notes?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(noteRows)});
        if (logRows.length) await cloudRequest('nmm_logs?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(logRows)});
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
    return {format:'tnm-weekly-autobackup-v4',createdAt:nowISO(),tasks:tasks.filter(task=>!task.deletedAt),notes:notes.filter(note=>!note.deletedAt),logs:logs.filter(log=>!log.deletedAt),privateVault,privateNotesEncrypted:privateCipherRows,tags:tags.filter(tag=>!tag.deletedAt)};
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
    document.addEventListener('visibilitychange',()=>{
      checkWeekRollover();
      const latest=readStored(AUTO_BACKUP_KEY,null), lastAt=latest?.createdAt?Date.parse(latest.createdAt):0;
      if(document.visibilityState==='visible'&&Date.now()-lastAt>=AUTO_BACKUP_EVERY)createAutomaticBackup(true);
    });
  }
  function exportBackup() {
    const data={format:'tnm-weekly-backup-v5',exportedAt:nowISO(),tasks:tasks.filter(task=>!task.deletedAt),notes:notes.filter(note=>!note.deletedAt),logs:logs.filter(log=>!log.deletedAt),privateVault,privateNotesEncrypted:privateCipherRows,tags:tags.filter(tag=>!tag.deletedAt)};
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
  document.querySelector('.main-nav').addEventListener('click',event=>{
    const button=event.target.closest('button[data-page]'); if (button) setPage(button.dataset.page);
  });
  document.addEventListener('click',event=>{const action=event.target.closest('[data-home-action]');if(action){openHomeAction(action.dataset.homeAction);return;}if(event.target.closest('[data-open-tasks]'))setPage('tasks');});
  $('taskForm').addEventListener('submit',saveTaskFromForm);
  $('taskForm').addEventListener('keydown',event=>handlePopupKeyboard(event,'task'));
  $('taskForm').addEventListener('input',()=>{taskDialogDirty=true;});
  $('taskForm').addEventListener('change',()=>{taskDialogDirty=true;});
  $('taskLinkToggle').addEventListener('click',()=>toggleLinkAttachment('task'));
  $('taskLinkRemove').addEventListener('click',()=>clearLinkAttachment('task'));
  $('closeTaskDialog').addEventListener('click',closeTaskDialogSafely);
  $('deleteTaskBtn').addEventListener('click',softDeleteTask);
  $('weekGrid').addEventListener('click',handleTaskClick);
  $('weekGrid').addEventListener('change',handleTaskChange);
  $('homePage').addEventListener('click',handleTaskClick);
  $('dayDialogList').addEventListener('click',handleTaskClick);
  $('planningList').addEventListener('click',handleTaskClick);
  $('completedList').addEventListener('click',handleTaskClick);
  $('dayDialogList').addEventListener('change',handleTaskChange);
  $('planningList').addEventListener('change',handleTaskChange);
  $('completedList').addEventListener('change',handleTaskChange);
  for (const node of [$('weekGrid'),$('dayDialogList'),$('planningPanel')]) {
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
  $('dayDialogAddBtn').addEventListener('click',()=>{const date=activeDayKind==='day'?activeDayDate:'';$('dayDialog').close();openTaskDialog('',date);});
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
  $('noteLinkToggle').addEventListener('click',()=>toggleLinkAttachment('note'));
  $('noteLinkRemove').addEventListener('click',()=>clearLinkAttachment('note'));
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
  $('privateNewNoteBtn').addEventListener('click',()=>openPrivateNoteEditor());
  $('privateLockBtn').addEventListener('click',()=>{void lockPrivateNotes();});
  $('privateCancelEditBtn').addEventListener('click',()=>{privateNoteDirty=false;$('privateNoteForm').reset();$('privateNoteForm').hidden=true;$('privateNoteId').value='';});
  $('privateNotesList').addEventListener('click',handlePrivateNotesClick);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&privateNotesUnlocked)privateHiddenAt=Date.now();else if(privateHiddenAt&&Date.now()-privateHiddenAt>=5*60*1000)lockPrivateNotes();});

  $('exportBtn').addEventListener('click',exportBackup);
  document.addEventListener('dragend',()=>{handleDragEnd();noteDragId='';clearDropStyles();});
  document.addEventListener('pointerdown',startPointerDrag,true);
  document.addEventListener('pointermove',movePointerDrag,{passive:false});
  document.addEventListener('pointerup',event=>finishPointerDrag(event),true);
  document.addEventListener('pointercancel',event=>finishPointerDrag(event,true),true);
  document.addEventListener('touchstart',startTouchDrag,{capture:true,passive:false});
  document.addEventListener('touchmove',moveTouchDrag,{capture:true,passive:false});
  document.addEventListener('touchend',event=>finishTouchDrag(event),true);
  document.addEventListener('touchcancel',event=>finishTouchDrag(event,true),true);
  for(const dialog of document.querySelectorAll('dialog')){
    dialog.addEventListener('cancel',event=>{
      if(!['taskDialog','noteDialog'].includes(dialog.id))return;
      event.preventDefault();if(!savePopupBeforeClose(dialog))return;
      if(dialog.id==='taskDialog')closeTaskDialog();else if(dialog.open)dialog.close();
    });
    dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;
      const rect=dialog.getBoundingClientRect();
      if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom){
        if(!savePopupBeforeClose(dialog))return;
        closeFloatingActionMenu();if(dialog.open)dialog.close();
      }
    });
  }
  document.addEventListener('click',captureActionMenuClick,true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&floatingActionMenu){event.preventDefault();event.stopPropagation();closeFloatingActionMenu();}},true);
  document.addEventListener('scroll',()=>{if(floatingActionMenu)closeFloatingActionMenu();},true);
  window.addEventListener('resize',()=>updateNavIndicator());
  window.addEventListener('online',()=>{ if (session?.user?.id) void syncCloud(); });

  applyZoom();renderAll(); setPage(currentPage); startAutomaticBackup(); void initializeAuth();
})();
