(() => {
  'use strict';

  const CLOUD = window.NMM_SUPABASE || {};
  const CLOUD_READY = Boolean(CLOUD.url && CLOUD.publishableKey);
  const TASKS_KEY = 'tnm.weekly.tasks.v1';
  const NOTES_KEY = 'tnm.weekly.notes.v1';
  const SESSION_KEY = 'naMinhaMao.supabase.session.v1';
  const RESET_KEY = 'tnm.weekly.reset.v1';
  const TAGS_KEY = 'tnm.weekly.tags.v1';
  const TAG_FILTER_KEY = 'tnm.weekly.filterTag.v1';
  const LAST_TAG_KEY = 'tnm.weekly.lastTag.v1';
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
  let tags = [];
  let session = readStored(SESSION_KEY,null);
  let filterTagId = localStorage.getItem(TAG_FILTER_KEY) || '';
  let currentPage = ['home','tasks','notes','settings'].includes(localStorage.getItem(PAGE_KEY)) ? localStorage.getItem(PAGE_KEY) : 'home';
  let weekStart = startOfWeek(localStorage.getItem(WEEK_KEY) || todayKey());
  let dragTaskId = '';
  let authBusy = false;
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
  function resetOldBrowserData() {
    if (localStorage.getItem(RESET_KEY) === 'done') return;
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    localStorage.setItem(RESET_KEY,'done');
  }
  function validTagColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || '')); }
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
    if (filterTagId && !tags.some(tag=>tag.id===filterTagId && !tag.deletedAt)) filterTagId='';
    localStorage.setItem(TAGS_KEY,JSON.stringify(tags));
  }
  function saveTags(schedule=true) {
    tags=ensureDefaultTags(tags);
    localStorage.setItem(TAGS_KEY,JSON.stringify(tags));
    renderTasks(); renderHome(); renderFilterButton();
    if (schedule) scheduleSync();
  }
  function loadLocalData() {
    const storedTasks=readStored(TASKS_KEY,[]), storedNotes=readStored(NOTES_KEY,[]);
    tasks=Array.isArray(storedTasks) ? storedTasks.map(normalizeTask).filter(Boolean) : [];
    notes=Array.isArray(storedNotes) ? storedNotes.map(normalizeNote).filter(Boolean) : [];
  }
  function normalizeTask(value) {
    if (!value || typeof value !== 'object' || !String(value.title || '').trim()) return null;
    const legacyArea=value.area==='outros' ? 'outro' : (['vida','trabalho'].includes(value.area) ? value.area : 'vida');
    const storedTag=value.tagId || value.tag_id;
    return {
      id:String(value.id || makeId()), title:String(value.title).trim().slice(0,180),
      tagId:String(storedTag==='outros' ? 'outro' : (storedTag || legacyArea)),
      executionDate:isDateKey(value.executionDate || value.execution_date) ? String(value.executionDate || value.execution_date) : null,
      createdAt:String(value.createdAt || value.created_at || nowISO()), updatedAt:String(value.updatedAt || value.updated_at || value.createdAt || value.created_at || nowISO()),
      completedAt:value.completedAt || value.completed_at ? String(value.completedAt || value.completed_at) : null,
      deletedAt:value.deletedAt || value.deleted_at ? String(value.deletedAt || value.deleted_at) : null
    };
  }
  function normalizeNote(value) {
    if (!value || typeof value !== 'object' || !String(value.content || '').trim()) return null;
    return {
      id:String(value.id || makeId()), title:String(value.title || '').trim().slice(0,140), content:String(value.content).slice(0,20000),
      createdAt:String(value.createdAt || nowISO()), updatedAt:String(value.updatedAt || value.createdAt || nowISO()),
      deletedAt:value.deletedAt ? String(value.deletedAt) : null
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
  function showToast(message) {
    const node=$('toast');
    node.textContent=String(message || '');
    node.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>node.classList.add('hidden'),2600);
  }
  function setPage(page) {
    if (!['home','tasks','notes','settings'].includes(page)) return;
    currentPage=page;
    localStorage.setItem(PAGE_KEY,page);
    document.querySelectorAll('.page').forEach(node=>node.classList.toggle('active',node.id===`${page}Page`));
    document.querySelectorAll('.nav-btn[data-page]').forEach(button=>{
      if (button.dataset.page===page) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    if (page==='home') renderHome();
    if (page==='tasks') renderTasks();
    if (page==='notes') renderNotes();
    if (page==='settings') updateAuthUI();
  }
  function visibleTasks() { return tasks.filter(task=>!task.deletedAt && (!filterTagId || task.tagId===filterTagId)); }
  function openTasks() { return visibleTasks().filter(task=>!task.completedAt); }
  function taskOrder(a,b) {
    const dateDiff=String(a.executionDate || '9999-12-31').localeCompare(String(b.executionDate || '9999-12-31'));
    return dateDiff || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.title).localeCompare(String(b.title),'pt-BR');
  }
  function tagDot(tagId) {
    const tag=getTag(tagId);
    return `<span class="tag-dot" style="--tag-color:${tag.color}" aria-hidden="true"></span>`;
  }
  function taskCard(task,options={}) {
    const complete=Boolean(task.completedAt);
    const scheduled=Boolean(task.executionDate);
    const subline=options.overdue ? `Execução: ${formatDate(task.executionDate,{day:'2-digit',month:'2-digit',year:'numeric'})}` : (scheduled ? formatDate(task.executionDate) : '');
    return `<article class="task-card${complete?' completed':''}" draggable="${complete?'false':'true'}" data-task-id="${escapeHTML(task.id)}" aria-label="${escapeHTML(task.title)}">
      <input class="task-check" type="checkbox" data-complete-task="${escapeHTML(task.id)}" ${complete?'checked':''} aria-label="${complete?'Reabrir':'Concluir'}: ${escapeHTML(task.title)}">
      <div class="task-main"><div class="task-title-row">${tagDot(task.tagId)}<button class="task-open" type="button" data-edit-task="${escapeHTML(task.id)}">${escapeHTML(task.title)}</button></div>${subline?`<span class="task-date">${escapeHTML(subline)}</span>`:''}</div>
      <div class="task-actions"><button class="icon-btn" type="button" data-edit-task="${escapeHTML(task.id)}" aria-label="Editar tarefa" title="Editar">✎</button></div>
    </article>`;
  }
  function renderFilterButton() {
    const active=filterTagId ? getTag(filterTagId) : null;
    $('activeFilterSummary').textContent=active ? active.name : 'TODAS';
    $('filterBtn').setAttribute('aria-label',active ? `Filtrar por ${active.name}` : 'Filtrar por tag; todas as tags');
  }
  function renderTaskTagOptions(selectedId='') {
    const active=tags.filter(tag=>!tag.deletedAt);
    $('taskTag').innerHTML=active.map(tag=>`<option value="${escapeHTML(tag.id)}">${escapeHTML(tag.name)}</option>`).join('');
    const remembered=tags.find(tag=>tag.id===localStorage.getItem(LAST_TAG_KEY) && !tag.deletedAt)?.id;
    const fallback=active.find(tag=>tag.id===filterTagId)?.id || remembered || active[0]?.id || 'vida';
    $('taskTag').value=active.some(tag=>tag.id===selectedId) ? selectedId : fallback;
  }
  function renderFilterTagList() {
    const options=[{id:'',name:'TODAS',color:null},...tags.filter(tag=>!tag.deletedAt)];
    $('filterTagList').innerHTML=options.map(tag=>`<button class="filter-tag-option" type="button" data-filter-tag="${escapeHTML(tag.id)}" aria-pressed="${String(tag.id===filterTagId)}">${tag.color?tagDot(tag.id):'<span class="tag-dot" aria-hidden="true" style="background:#aab4c8"></span>'}<span>${escapeHTML(tag.name)}</span></button>`).join('');
  }
  function setTagFilter(tagId) {
    filterTagId=tags.some(tag=>tag.id===tagId && !tag.deletedAt) ? tagId : '';
    localStorage.setItem(TAG_FILTER_KEY,filterTagId);
    renderFilterButton(); renderAll();
  }
  function openFilterDialog() {
    $('tagMessage').textContent=''; $('newTagName').value='';
    renderFilterTagList(); $('filterDialog').showModal(); $('newTagName').focus();
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
      setTagFilter(existing.id); renderFilterTagList(); $('tagMessage').textContent='Essa tag já existe; selecionei a existente.'; return;
    }
    const now=nowISO(), tag={id:makeId(),name,color:randomTagColor(),createdAt:now,updatedAt:now,deletedAt:null};
    tags.push(tag); setTagFilter(tag.id); saveTags(); renderFilterTagList(); $('newTagName').value=''; $('tagMessage').textContent=`Tag ${tag.name} criada com cor automática.`;
  }
  function renderTasks() {
    const all=visibleTasks();
    const open=all.filter(task=>!task.completedAt);
    const overdue=open.filter(task=>task.executionDate && task.executionDate<todayKey()).sort(taskOrder);
    const unscheduled=open.filter(task=>!task.executionDate).sort(taskOrder);
    $('unplannedCount').textContent=String(unscheduled.length);
    $('unplannedList').innerHTML=unscheduled.length ? unscheduled.map(task=>taskCard(task)).join('') : '<div class="empty">Sem tarefas sem data.</div>';
    const cells=[{kind:'overdue',title:'ATRASADO',date:'',tasks:overdue}];
    for (let i=0;i<7;i++) {
      const date=addDays(weekStart,i);
      cells.push({kind:'day',title:DAY_LABELS[i],date,tasks:open.filter(task=>task.executionDate===date && task.executionDate>=todayKey()).sort(taskOrder)});
    }
    $('weekLabel').textContent=formatWeekRange(weekStart);
    $('weekGrid').innerHTML=cells.map(cell=>{
      const today=cell.date===todayKey();
      const heading=cell.kind==='overdue'
        ? `<div class="day-heading"><strong>${cell.title}</strong><time>${cell.tasks.length}</time></div>`
        : `<div class="day-heading"><strong>${cell.title}</strong><time>${formatDate(cell.date,{day:'2-digit',month:'2-digit'})}</time><button class="icon-btn day-add" type="button" data-add-date="${cell.date}" aria-label="Nova tarefa em ${cell.title} ${formatDate(cell.date)}">＋</button></div>`;
      const body=cell.tasks.length ? cell.tasks.map(task=>taskCard(task,{overdue:cell.kind==='overdue'})).join('') : `<div class="day-empty">${cell.kind==='overdue'?'Nada atrasado':'—'}</div>`;
      return `<section class="day-column${today?' is-today':''}" data-kind="${cell.kind}"${cell.date?` data-date="${cell.date}"`:''} aria-label="${cell.title}${cell.date?` ${formatDate(cell.date)}`:''}">${heading}<div class="day-task-list">${body}</div></section>`;
    }).join('');
    const completed=all.filter(task=>Boolean(task.completedAt)).sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt)));
    $('completedCount').textContent=String(completed.length);
    $('completedList').innerHTML=completed.length ? completed.map(task=>taskCard(task)).join('') : '<div class="empty">Nenhuma concluída.</div>';
    renderFilterButton();
  }
  function renderAll() {
    renderTasks();
    renderHome();
    renderNotes();
  }
  function renderHome() {
    const open=tasks.filter(task=>!task.deletedAt && !task.completedAt);
    const overdue=open.filter(task=>task.executionDate && task.executionDate<todayKey());
    const today=open.filter(task=>task.executionDate===todayKey());
    const unplanned=open.filter(task=>!task.executionDate);
    $('homeOverdueCount').textContent=String(overdue.length);
    $('homeTodayCount').textContent=String(today.length);
    $('homeUnplannedCount').textContent=String(unplanned.length);
    const next=open.filter(task=>task.executionDate && task.executionDate>=todayKey()).sort(taskOrder).slice(0,5);
    const items=next.map(task=>`<article class="home-item"><span class="home-item-date">${escapeHTML(formatDate(task.executionDate))} · ${escapeHTML(getTag(task.tagId).name)}</span><button class="home-item-open" type="button" data-edit-task="${escapeHTML(task.id)}">${tagDot(task.tagId)}${escapeHTML(task.title)}</button></article>`).join('');
    $('homePreview').innerHTML=items || '<div class="empty">Ainda não há tarefas agendadas para hoje ou depois.</div>';
  }
  function renderNotes() {
    const active=notes.filter(note=>!note.deletedAt).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
    $('notesList').innerHTML=active.length ? active.map(note=>`<article class="note-card"><h3>${escapeHTML(note.title || 'Nota sem título')}</h3><p>${escapeHTML(note.content)}</p><div class="note-actions"><button class="btn small" type="button" data-edit-note="${escapeHTML(note.id)}">Editar</button><button class="btn small" type="button" data-delete-note="${escapeHTML(note.id)}">Excluir</button></div></article>`).join('') : '<div class="empty">Ainda não há notas.</div>';
  }
  function openTaskDialog(taskId='',suggestedDate='') {
    const task=taskId ? tasks.find(item=>item.id===String(taskId) && !item.deletedAt) : null;
    $('taskForm').reset();
    $('taskId').value=task ? task.id : '';
    $('taskDialogTitle').textContent=task ? 'Editar tarefa' : 'Nova tarefa';
    $('taskTitle').value=task?.title || '';
    renderTaskTagOptions(task?.tagId || filterTagId || localStorage.getItem(LAST_TAG_KEY) || 'vida');
    $('executionDate').value=task?.executionDate || suggestedDate || '';
    $('deleteTaskBtn').classList.toggle('hidden',!task);
    $('taskDialog').showModal();
    $('taskTitle').focus();
  }
  function closeTaskDialog() { if ($('taskDialog').open) $('taskDialog').close(); }
  function saveTaskFromForm(event) {
    event.preventDefault();
    const title=$('taskTitle').value.trim();
    const tagId=$('taskTag').value;
    const date=$('executionDate').value || null;
    if (!title || !tags.some(tag=>tag.id===tagId && !tag.deletedAt) || (date && !isDateKey(date))) return;
    const id=$('taskId').value;
    const existing=id ? tasks.find(task=>task.id===id && !task.deletedAt) : null;
    const now=nowISO();
    if (existing) {
      existing.title=title; existing.tagId=tagId; existing.executionDate=date; existing.updatedAt=now;
    } else {
      tasks.push({id:makeId(),title,tagId,executionDate:date,createdAt:now,updatedAt:now,completedAt:null,deletedAt:null});
    }
    localStorage.setItem(LAST_TAG_KEY,tagId);
    if (date && date>=todayKey()) setWeek(date);
    else if (!date) $('planningBox').open=true;
    closeTaskDialog(); saveTasks();
    showToast(existing?'Tarefa atualizada.':'Tarefa adicionada.');
  }
  function softDeleteTask() {
    const id=$('taskId').value;
    const task=tasks.find(item=>item.id===id && !item.deletedAt);
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
    task.executionDate=date || null; task.updatedAt=nowISO();
    if (date && date>=todayKey()) setWeek(date);
    else if (!date) $('planningBox').open=true;
    saveTasks();
    showToast(date && date<todayKey()?'Foi para ATRASADO.':date?'Data de execução atualizada.':'Voltou para Planejar.');
  }
  function handleTaskClick(event) {
    const edit=event.target.closest('[data-edit-task]');
    if (edit) { openTaskDialog(edit.dataset.editTask); return; }
    const add=event.target.closest('[data-add-date]');
    if (add) { openTaskDialog('',add.dataset.addDate); return; }
    const remove=event.target.closest('[data-delete-note]');
    if (remove) { deleteNote(remove.dataset.deleteNote); return; }
    const editNote=event.target.closest('[data-edit-note]');
    if (editNote) { openNoteDialog(editNote.dataset.editNote); return; }
  }
  function handleTaskChange(event) {
    const check=event.target.closest('input[data-complete-task]');
    if (check) toggleComplete(check.dataset.completeTask,check.checked);
  }
  function handleDragStart(event) {
    const card=event.target.closest('.task-card[data-task-id]');
    if (!card || event.target.closest('input[data-complete-task]')) { event.preventDefault(); return; }
    const task=tasks.find(item=>item.id===card.dataset.taskId && !item.completedAt && !item.deletedAt);
    if (!task) { event.preventDefault(); return; }
    dragTaskId=task.id; card.classList.add('is-dragging');
    if (event.dataTransfer) { event.dataTransfer.effectAllowed='move'; event.dataTransfer.setData('text/plain',dragTaskId); }
  }
  function clearDropStyles() { document.querySelectorAll('.drop-active,.is-dragging').forEach(node=>node.classList.remove('drop-active','is-dragging')); }
  function handleDragOver(event) {
    if (!dragTaskId) return;
    const day=event.target.closest('.day-column[data-date]');
    const planner=event.target.closest('#planningBox');
    if (!day && !planner) return;
    event.preventDefault();
    day?.classList.add('drop-active');
    planner?.classList.add('drop-active');
  }
  function handleDrop(event) {
    if (!dragTaskId) return;
    const day=event.target.closest('.day-column[data-date]');
    const planner=event.target.closest('#planningBox');
    if (!day && !planner) return;
    event.preventDefault();
    const id=dragTaskId; dragTaskId=''; clearDropStyles();
    if (day) setTaskDate(id,day.dataset.date);
    else setTaskDate(id,'');
  }
  function handleDragEnd() { dragTaskId=''; clearDropStyles(); }
  function openNoteDialog(noteId='') {
    const note=noteId ? notes.find(item=>item.id===String(noteId) && !item.deletedAt) : null;
    $('noteForm').reset(); $('noteId').value=note?.id || '';
    $('noteDialogTitle').textContent=note?'Editar nota':'Nova nota';
    $('noteTitle').value=note?.title || ''; $('noteContent').value=note?.content || '';
    $('deleteNoteBtn').classList.toggle('hidden',!note);
    $('noteDialog').showModal(); $('noteContent').focus();
  }
  function saveNote(event) {
    event.preventDefault();
    const content=$('noteContent').value.trim();
    if (!content) return;
    const id=$('noteId').value, title=$('noteTitle').value.trim(), now=nowISO();
    const note=id ? notes.find(item=>item.id===id && !item.deletedAt) : null;
    if (note) { note.title=title; note.content=content; note.updatedAt=now; }
    else notes.unshift({id:makeId(),title,content,createdAt:now,updatedAt:now,deletedAt:null});
    $('noteDialog').close(); saveNotes(); showToast(note?'Nota atualizada.':'Nota salva.');
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
    return {id:task.id,owner_id:session.user.id,title:task.title,details:'',subtasks:[],status:'active',release_date:null,due_date:null,execution_date:task.executionDate,tag_id:task.tagId,planner_version:1,estimate_minutes:60,reward:'',blocker:'',time_spent_seconds:0,created_at:task.createdAt,updated_at:task.updatedAt,completed_at:task.completedAt,completed_date:task.completedAt?dateKey(new Date(task.completedAt)):null,deleted_at:task.deletedAt};
  }
  function rowToTask(row) {
    return normalizeTask({id:row.id,title:row.title,tagId:row.tag_id,area:row.area,executionDate:row.execution_date,createdAt:row.created_at,updatedAt:row.updated_at || row.created_at,completedAt:row.completed_at,deletedAt:row.deleted_at});
  }
  function tagToRow(tag) { return {owner_id:session.user.id,id:tag.id,name:tag.name,color:tag.color,created_at:tag.createdAt,updated_at:tag.updatedAt,deleted_at:tag.deletedAt,planner_version:1}; }
  function rowToTag(row) { return normalizeTag({id:row.id,name:row.name,color:row.color,createdAt:row.created_at,updatedAt:row.updated_at || row.created_at,deletedAt:row.deleted_at}); }
  function noteToRow(note) { return {id:note.id,owner_id:session.user.id,title:note.title,content:note.content,planner_version:1,created_at:note.createdAt,updated_at:note.updatedAt,deleted_at:note.deletedAt}; }
  function rowToNote(row) { return normalizeNote({id:row.id,title:row.title,content:row.content,createdAt:row.created_at,updatedAt:row.updated_at || row.created_at,deletedAt:row.deleted_at}); }
  function mergeById(local,remote) {
    const map=new Map();
    for (const item of [...remote,...local]) {
      const old=map.get(item.id);
      if (!old || Date.parse(item.updatedAt || item.createdAt || '')>=Date.parse(old.updatedAt || old.createdAt || '')) map.set(item.id,item);
    }
    return Array.from(map.values());
  }
  async function loadCloudData() {
    const localTasks=tasks.map(task=>({...task})), localNotes=notes.map(note=>({...note})), localTags=tags.map(tag=>({...tag}));
    const [remoteTaskRows,remoteNoteRows,remoteTagRows]=await Promise.all([
      fetchAll(`nmm_tasks?select=*&planner_version=eq.1&created_at=gte.${encodeURIComponent(RESET_CUTOFF)}`),
      fetchAll(`nmm_notes?select=*&planner_version=eq.1&created_at=gte.${encodeURIComponent(RESET_CUTOFF)}`),
      fetchAll('nmm_tags?select=*&planner_version=eq.1')
    ]);
    const remoteTasks=remoteTaskRows.map(rowToTask).filter(Boolean), remoteNotes=remoteNoteRows.map(rowToNote).filter(Boolean), remoteTags=remoteTagRows.map(rowToTag).filter(Boolean);
    tags=ensureDefaultTags(mergeById(localTags,remoteTags).map(normalizeTag).filter(Boolean));
    if (filterTagId && !tags.some(tag=>tag.id===filterTagId && !tag.deletedAt)) { filterTagId=''; localStorage.setItem(TAG_FILTER_KEY,''); }
    localStorage.setItem(TAGS_KEY,JSON.stringify(tags));
    const localActiveTasks=localTasks.filter(item=>!item.deletedAt), localActiveNotes=localNotes.filter(item=>!item.deletedAt);
    if (!remoteTasks.length && !remoteNotes.length && (localActiveTasks.length || localActiveNotes.length) && !window.confirm('A conta está vazia. Enviar as tarefas e notas deste aparelho para ela?')) {
      setAuthMessage('Nada foi enviado. Seus dados continuam neste aparelho.'); return false;
    }
    tasks=mergeById(localTasks,remoteTasks).map(normalizeTask).filter(Boolean);
    notes=mergeById(localNotes,remoteNotes).map(normalizeNote).filter(Boolean);
    localStorage.setItem(TASKS_KEY,JSON.stringify(tasks));
    localStorage.setItem(NOTES_KEY,JSON.stringify(notes));
    await syncCloud();
    renderAll(); renderNotes(); updateAuthUI();
    return true;
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
        if (tagRows.length) await cloudRequest('nmm_tags?on_conflict=owner_id,id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(tagRows)});
        if (taskRows.length) await cloudRequest('nmm_tasks?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(taskRows)});
        if (noteRows.length) await cloudRequest('nmm_notes?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(noteRows)});
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
    authBusy=true; updateAuthUI();
    try { await fetch(`${CLOUD.url}/auth/v1/logout`,{method:'POST',headers:authHeaders({Authorization:`Bearer ${session.access_token}`})}); } catch {}
    session=null; localStorage.removeItem(SESSION_KEY); syncStatus=''; authBusy=false;
    setAuthMessage('Você saiu. Os dados continuam neste aparelho e na conta.'); updateAuthUI();
  }
  async function syncNow() {
    if (!session?.user?.id) return;
    authBusy=true; setAuthMessage('Sincronizando…'); updateAuthUI();
    try { await loadCloudData(); setAuthMessage('Sincronização concluída.'); }
    catch { setAuthMessage('Não consegui atualizar agora; seus dados locais foram mantidos.',true); }
    finally { authBusy=false; updateAuthUI(); }
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
  function exportBackup() {
    const data={format:'tnm-weekly-backup-v1',exportedAt:nowISO(),tasks:tasks.filter(task=>!task.deletedAt),notes:notes.filter(note=>!note.deletedAt)};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a'); link.href=url; link.download=`tnm-backup-${todayKey()}.json`; link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000); $('backupMessage').textContent='Backup exportado.';
  }
  resetOldBrowserData();
  loadLocalTags();
  loadLocalData();
  $('filterBtn').addEventListener('click',openFilterDialog);
  $('closeFilterDialog').addEventListener('click',()=>$('filterDialog').close());
  $('filterTagList').addEventListener('click',event=>{
    const button=event.target.closest('button[data-filter-tag]');
    if (!button) return;
    setTagFilter(button.dataset.filterTag);
    $('filterDialog').close();
  });
  $('tagForm').addEventListener('submit',createTag);
  document.querySelector('.main-nav').addEventListener('click',event=>{
    const button=event.target.closest('button[data-page]'); if (button) setPage(button.dataset.page);
  });
  document.addEventListener('click',event=>{ if (event.target.closest('[data-open-tasks]')) setPage('tasks'); });
  $('quickAddBtn').addEventListener('click',()=>{setPage('tasks');openTaskDialog();});
  $('taskForm').addEventListener('submit',saveTaskFromForm);
  $('closeTaskDialog').addEventListener('click',closeTaskDialog);
  $('deleteTaskBtn').addEventListener('click',softDeleteTask);
  $('weekGrid').addEventListener('click',handleTaskClick);
  $('unplannedList').addEventListener('click',handleTaskClick);
  $('completedList').addEventListener('click',handleTaskClick);
  $('homePreview').addEventListener('click',handleTaskClick);
  $('weekGrid').addEventListener('change',handleTaskChange);
  $('unplannedList').addEventListener('change',handleTaskChange);
  $('completedList').addEventListener('change',handleTaskChange);
  for (const node of [$('weekGrid'),$('unplannedList')]) {
    node.addEventListener('dragstart',handleDragStart);
    node.addEventListener('dragover',handleDragOver);
    node.addEventListener('drop',handleDrop);
  }
  $('planningBox').addEventListener('dragover',handleDragOver);
  $('planningBox').addEventListener('drop',handleDrop);
  document.addEventListener('dragend',handleDragEnd);
  $('prevWeekBtn').addEventListener('click',()=>setWeek(addDays(weekStart,-7)));
  $('nextWeekBtn').addEventListener('click',()=>setWeek(addDays(weekStart,7)));
  $('todayBtn').addEventListener('click',()=>setWeek(todayKey()));
  $('newNoteBtn').addEventListener('click',()=>openNoteDialog());
  $('notesList').addEventListener('click',handleTaskClick);
  $('noteForm').addEventListener('submit',saveNote);
  $('closeNoteDialog').addEventListener('click',()=>$('noteDialog').close());
  $('deleteNoteBtn').addEventListener('click',softDeleteNoteFromDialog);
  $('loginBtn').addEventListener('click',signIn);
  $('signupBtn').addEventListener('click',signUp);
  $('logoutBtn').addEventListener('click',signOut);
  $('syncNowBtn').addEventListener('click',syncNow);
  $('exportBtn').addEventListener('click',exportBackup);
  window.addEventListener('online',()=>{ if (session?.user?.id) void syncCloud(); });

  renderAll(); renderNotes(); setPage(currentPage); void initializeAuth();
})();
