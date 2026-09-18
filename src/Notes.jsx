
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, Bold, Code2, Copy, FileText, Folder, FolderPlus, Heading2, Italic, List, ListChecks, Pin, PinOff, Plus, Quote, RefreshCw, Search, Star, Trash2, Undo2, X } from 'lucide-react'
import { supabase } from './lib/supabase'

const DEFAULT_FOLDERS=['General','Personal','Work','Ideas','Finance']
const emptyNote=()=>({title:'',content:'',folder:'General',tags:[],favorite:false,is_pinned:false,archived:false,trashed:false,reminder_at:''})
const toLocal=value=>{
  if(!value)return ''
  const d=new Date(value),pad=n=>String(n).padStart(2,'0')
  if(Number.isNaN(d.getTime()))return ''
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())
}
const dateLabel=value=>value?new Date(value).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):''
const words=text=>{const t=String(text||'').trim();return t?t.split(/\s+/).length:0}

export default function Notes({user}){
  const [notes,setNotes]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const [query,setQuery]=useState(''),[view,setView]=useState('all'),[folder,setFolder]=useState('all'),[tag,setTag]=useState('all'),[sort,setSort]=useState('updated')
  const [selectedId,setSelectedId]=useState(null),[showEditor,setShowEditor]=useState(false),[editing,setEditing]=useState(null),[form,setForm]=useState(emptyNote),[tagsInput,setTagsInput]=useState('')
  const [busy,setBusy]=useState(false),[historyNote,setHistoryNote]=useState(null),[saveHint,setSaveHint]=useState(''),editorRef=useRef(null)

  async function load(){
    setLoading(true);setError('')
    const {data,error:e}=await supabase.from('notes').select('*').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(1000)
    if(e)setError(e.message)
    const next=data||[];setNotes(next);setSelectedId(current=>current&&next.some(n=>n.id===current)?current:next[0]?.id||null);setLoading(false)
  }
  useEffect(()=>{void load()},[user.id])
  useEffect(()=>{function open(){openNew()}window.addEventListener('onevault:open-note',open);return()=>window.removeEventListener('onevault:open-note',open)},[])
  useEffect(()=>{
    function shortcut(e){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'&&showEditor){e.preventDefault();void saveNote({preventDefault(){}})}}
    window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut)
  },[showEditor,form,editing,tagsInput])

  const folders=useMemo(()=>Array.from(new Set(DEFAULT_FOLDERS.concat(notes.map(n=>n.folder).filter(Boolean)))),[notes])
  const tags=useMemo(()=>Array.from(new Set(notes.flatMap(n=>Array.isArray(n.tags)?n.tags:[]))).sort(),[notes])
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase()
    return notes.filter(note=>{
      if(view==='trash'?!note.trashed:note.trashed)return false
      if(view==='archive'&&!note.archived)return false
      if(view==='favorites'&&!note.favorite)return false
      if(view==='pinned'&&!note.is_pinned)return false
      if(view==='reminders'&&!note.reminder_at)return false
      if(folder!=='all'&&note.folder!==folder)return false
      if(tag!=='all'&&!(Array.isArray(note.tags)&&note.tags.includes(tag)))return false
      return !q||[note.title,note.content,note.folder,...(note.tags||[])].join(' ').toLowerCase().includes(q)
    }).sort((a,b)=>{
      if(Boolean(b.is_pinned)!==Boolean(a.is_pinned))return b.is_pinned?1:-1
      if(sort==='title')return String(a.title||'').localeCompare(String(b.title||''))
      if(sort==='created')return new Date(b.created_at||0)-new Date(a.created_at||0)
      return new Date(b.updated_at||0)-new Date(a.updated_at||0)
    })
  },[notes,query,view,folder,tag,sort])
  const selected=notes.find(n=>n.id===selectedId)||filtered[0]||null

  function openNew(){setEditing(null);setForm(emptyNote());setTagsInput('');setSaveHint('');setShowEditor(true);setError('')}
  function openEdit(note){setEditing(note);setForm({title:note.title||'',content:note.content||'',folder:note.folder||'General',tags:note.tags||[],favorite:Boolean(note.favorite),is_pinned:Boolean(note.is_pinned),archived:Boolean(note.archived),trashed:Boolean(note.trashed),reminder_at:toLocal(note.reminder_at)});setTagsInput((note.tags||[]).join(', '));setShowEditor(true);setError('')}
  function closeEditor(){setShowEditor(false);setEditing(null);setForm(emptyNote());setTagsInput('')}

  async function saveNote(e){
    e?.preventDefault?.();setError('')
    if(!form.title.trim()&&!form.content.trim())return setError('Add a title or some note content.')
    setBusy(true);setSaveHint('Saving…')
    try{
      const now=new Date().toISOString(),id=editing?.id||crypto.randomUUID(),parsedTags=Array.from(new Set(tagsInput.split(',').map(x=>x.trim()).filter(Boolean)))
      const prev=Array.isArray(editing?.history)?editing.history:[],changed=editing&&(
        editing.title!==form.title.trim()||editing.content!==form.content||editing.folder!==form.folder||JSON.stringify(editing.tags||[])!==JSON.stringify(parsedTags)
      )
      const history=changed?[{title:editing.title||'',content:editing.content||'',folder:editing.folder||'General',tags:editing.tags||[],saved_at:editing.updated_at||editing.created_at||now},...prev].slice(0,20):prev
      const payload={id,user_id:user.id,title:form.title.trim(),content:form.content,folder:form.folder||'General',tags:parsedTags,favorite:Boolean(form.favorite),is_pinned:Boolean(form.is_pinned),archived:Boolean(form.archived),trashed:Boolean(form.trashed),trashed_at:form.trashed?(editing?.trashed_at||now):null,reminder_at:form.reminder_at?new Date(form.reminder_at).toISOString():null,history,created_at:editing?.created_at||now,updated_at:now}
      const {error:e}=await supabase.from('notes').upsert(payload);if(e)throw e
      setNotes(items=>{const next=items.some(n=>n.id===id)?items.map(n=>n.id===id?payload:n):[payload,...items];return next.sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at))})
      setSelectedId(id);closeEditor()
    }catch(err){setError(err.message||'Could not save note.');setSaveHint('')}finally{setBusy(false)}
  }
  async function patch(id,changes){
    const payload={...changes,user_id:user.id,updated_at:new Date().toISOString()}
    const {error:e}=await supabase.from('notes').update(payload).eq('id',id).eq('user_id',user.id)
    if(e){setError(e.message);return}
    setNotes(items=>items.map(n=>n.id===id?{...n,...payload}:n))
  }
  async function trash(note){await patch(note.id,{trashed:true,trashed_at:new Date().toISOString()})}
  async function restore(note){await patch(note.id,{trashed:false,trashed_at:null})}
  async function archive(note){await patch(note.id,{archived:!note.archived})}
  async function favorite(note){await patch(note.id,{favorite:!note.favorite})}
  async function pin(note){await patch(note.id,{is_pinned:!note.is_pinned})}
  async function removeForever(note){
    if(!window.confirm('Permanently delete “'+(note.title||'Untitled note')+'”?'))return
    const {error:e}=await supabase.from('notes').delete().eq('id',note.id).eq('user_id',user.id)
    if(e){setError(e.message);return}
    setNotes(items=>items.filter(n=>n.id!==note.id));setSelectedId(null)
  }
  async function duplicate(note){
    const now=new Date().toISOString(),copy={...note,id:crypto.randomUUID(),title:(note.title||'Untitled note')+' Copy',created_at:now,updated_at:now,trashed:false,trashed_at:null,history:[]}
    const {error:e}=await supabase.from('notes').insert(copy);if(e){setError(e.message);return}
    setNotes(items=>[copy,...items]);setSelectedId(copy.id)
  }
  async function createReminder(note){
    if(!note.reminder_at)return
    const {error:e}=await supabase.from('reminders').insert({id:crypto.randomUUID(),user_id:user.id,title:note.title||'Note reminder',description:note.content?.slice(0,250)||null,due_at:note.reminder_at,repeat_rule:null,priority:'medium',completed:false,notify_telegram:false})
    if(e)setError(e.message);else setSaveHint('Reminder created')
  }
  function addFolder(){
    const name=window.prompt('New folder name')
    if(name?.trim()){setForm(v=>({...v,folder:name.trim()}));setFolder(name.trim())}
  }
  function format(type){
    const area=editorRef.current,start=area?.selectionStart??form.content.length,end=area?.selectionEnd??form.content.length,selectedText=form.content.slice(start,end)
    let before='',after=''
    if(type==='bold'){before='**';after='**'}else if(type==='italic'){before='*';after='*'}else if(type==='heading')before='## ';else if(type==='bullet')before='- ';else if(type==='checklist')before='- [ ] ';else if(type==='quote')before='> ';else if(type==='code'){before=String.fromCharCode(96);after=String.fromCharCode(96)}
    const content=form.content.slice(0,start)+before+selectedText+after+form.content.slice(end);setForm(v=>({...v,content}))
    requestAnimationFrame(()=>{if(area){const cursor=start+before.length+selectedText.length+after.length;area.focus();area.setSelectionRange(cursor,cursor)}})
  }
  function exportNote(note){
    const blob=new Blob([note.content||''],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a')
    a.href=url;a.download=(note.title||'note').replace(/[^a-z0-9_-]+/gi,'-').toLowerCase()+'.txt';a.click();URL.revokeObjectURL(url)
  }

  if(loading)return <div className="workspace-loading">Loading notes…</div>
  return <div className="notes-page">
    <div className="module-toolbar"><div><div className="panel-kicker">PERSONAL NOTES</div><h2>Notes that stay organized.</h2><p>{notes.filter(n=>!n.trashed).length} active notes · folders, tags, history and trash.</p></div><div className="module-toolbar-actions"><button className="secondary-btn" onClick={()=>void load()}><RefreshCw size={14}/> Refresh</button><button className="primary-btn" onClick={openNew}><Plus size={15}/> New note</button></div></div>
    {error&&<div className="form-error">{error}</div>}
    <div className="notes-command panel"><div className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search notes, tags and content"/></div><div className="notes-view-tabs">{[['all','All'],['favorites','Favorites'],['pinned','Pinned'],['archive','Archive'],['reminders','Reminders'],['trash','Trash']].map(([key,label])=><button key={key} className={view===key?'active':''} onClick={()=>setView(key)}>{label}</button>)}</div><div className="notes-filter-row"><select value={folder} onChange={e=>setFolder(e.target.value)}><option value="all">All folders</option>{folders.map(f=><option key={f}>{f}</option>)}</select><button className="secondary-btn compact" onClick={addFolder}><FolderPlus size={13}/> New folder</button><select value={tag} onChange={e=>setTag(e.target.value)}><option value="all">All tags</option>{tags.map(t=><option key={t}>{t}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">Recently updated</option><option value="created">Recently created</option><option value="title">Title</option></select></div></div>
    <div className="notes-layout">
      <section className="panel notes-list-panel"><div className="panel-header"><div><div className="panel-kicker">LIBRARY</div><h3>{filtered.length} notes</h3></div><span className="results-count">{folders.length} folders</span></div><div className="note-list">
        {filtered.length===0?<div className="side-empty"><FileText size={22}/><strong>No notes here</strong><span>Create a note or adjust your filters.</span><button className="primary-btn" onClick={openNew}><Plus size={14}/> New note</button></div>:filtered.map(note=><button type="button" key={note.id} className={'note-list-row '+(selected?.id===note.id?'selected':'')} onClick={()=>setSelectedId(note.id)}><div className="note-row-top"><strong>{note.title||'Untitled note'}</strong><span>{dateLabel(note.updated_at)}</span></div><small>{String(note.content||'').replace(/[#*_>-]/g,'').slice(0,120)||'Empty note'}</small><div className="note-row-meta"><span><Folder size={10}/> {note.folder||'General'}</span>{note.favorite&&<Star size={10} fill="currentColor"/>}{note.is_pinned&&<Pin size={10}/>} {(note.tags||[]).slice(0,2).map(t=><em key={t}>{t}</em>)}</div></button>)}
      </div></section>
      <section className="panel note-editor-panel">{selected?<div className="note-detail"><div className="panel-header"><div><div className="panel-kicker">NOTE</div><h3>{selected.title||'Untitled note'}</h3><span className="detail-subtitle">{selected.folder||'General'} · {words(selected.content)} words</span></div><div className="detail-actions"><button className="mini-btn" onClick={()=>pin(selected)} title={selected.is_pinned?'Unpin':'Pin'}>{selected.is_pinned?<PinOff size={13}/>:<Pin size={13}/>}</button><button className="mini-btn" onClick={()=>favorite(selected)} title="Favorite"><Star size={13} fill={selected.favorite?'currentColor':'none'}/></button>{!selected.trashed&&<button className="mini-btn" onClick={()=>archive(selected)} title={selected.archived?'Unarchive':'Archive'}><Archive size={13}/></button>}<button className="mini-btn" onClick={()=>duplicate(selected)} title="Duplicate"><Copy size={13}/></button><button className="mini-btn" onClick={()=>openEdit(selected)} title="Edit"><FileText size={13}/></button>{selected.trashed?<button className="mini-btn" onClick={()=>restore(selected)} title="Restore"><Undo2 size={13}/></button>:<button className="mini-btn danger" onClick={()=>trash(selected)} title="Move to trash"><Trash2 size={13}/></button>}{selected.trashed&&<button className="mini-btn danger" onClick={()=>void removeForever(selected)} title="Delete permanently"><X size={13}/></button>}</div></div><div className="note-preview"><pre>{selected.content||'This note is empty.'}</pre></div><div className="note-detail-footer"><div><span>{words(selected.content)} words</span><span>{String(selected.content||'').length} characters</span><span>Updated {dateLabel(selected.updated_at)}</span></div><div><button className="text-btn" onClick={()=>exportNote(selected)}>Export</button>{selected.reminder_at&&<button className="text-btn" onClick={()=>void createReminder(selected)}>Create reminder</button>}{selected.history?.length>0&&<button className="text-btn" onClick={()=>setHistoryNote(selected)}>History ({selected.history.length})</button>}</div></div></div>:<div className="empty-state"><div className="empty-icon"><FileText size={24}/></div><h4>Select a note</h4><p>Your note details and actions will appear here.</p></div>}</section>
    </div>
    {showEditor&&<div className="modal-layer"><div className="modal note-editor-modal"><div className="modal-header"><div><div className="panel-kicker">NOTE EDITOR</div><h3>{editing?'Edit note':'New note'}</h3><p className="modal-subtle">Ctrl/Cmd + S to save.</p></div><button className="icon-btn" onClick={closeEditor}><X size={18}/></button></div><form onSubmit={saveNote} className="expense-form"><label><span>Title</span><input autoFocus value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Note title"/></label><div className="notes-editor-meta"><div><span>Folder</span><div className="inline-control"><select value={form.folder} onChange={e=>setForm({...form,folder:e.target.value})}>{folders.map(f=><option key={f}>{f}</option>)}</select><button type="button" className="icon-btn small" onClick={addFolder}><FolderPlus size={13}/></button></div></div><div><span>Reminder</span><input type="datetime-local" value={form.reminder_at} onChange={e=>setForm({...form,reminder_at:e.target.value})}/></div></div><label><span>Tags</span><input value={tagsInput} onChange={e=>setTagsInput(e.target.value)} placeholder="project, ideas, important"/></label><div className="markdown-toolbar"><button type="button" onClick={()=>format('bold')}><Bold size={14}/></button><button type="button" onClick={()=>format('italic')}><Italic size={14}/></button><button type="button" onClick={()=>format('heading')}><Heading2 size={14}/></button><button type="button" onClick={()=>format('bullet')}><List size={14}/></button><button type="button" onClick={()=>format('checklist')}><ListChecks size={14}/></button><button type="button" onClick={()=>format('quote')}><Quote size={14}/></button><button type="button" onClick={()=>format('code')}><Code2 size={14}/></button><button type="button" onClick={()=>setForm(v=>({...v,content:''}))}><Trash2 size={14}/></button></div><textarea ref={editorRef} className="note-editor-textarea" rows="18" value={form.content} onChange={e=>setForm({...form,content:e.target.value})} placeholder="Start writing…"/><div className="note-editor-footer"><label className="toggle-option"><input type="checkbox" checked={form.favorite} onChange={e=>setForm({...form,favorite:e.target.checked})}/><span><strong>Favorite</strong></span></label><label className="toggle-option"><input type="checkbox" checked={form.is_pinned} onChange={e=>setForm({...form,is_pinned:e.target.checked})}/><span><strong>Pin</strong></span></label><span>{words(form.content)} words · {form.content.length} chars</span></div>{saveHint&&<div className="telegram-notice">{saveHint}</div>}{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={closeEditor}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':editing?'Save changes':'Create note'}</button></div></form></div></div>}
    {historyNote&&<div className="modal-layer"><div className="modal note-history-modal"><div className="modal-header"><div><div className="panel-kicker">VERSION HISTORY</div><h3>{historyNote.title||'Untitled note'}</h3><p className="modal-subtle">Up to 20 previous saved versions.</p></div><button className="icon-btn" onClick={()=>setHistoryNote(null)}><X size={18}/></button></div><div className="history-list">{(historyNote.history||[]).map((v,i)=><div className="history-row" key={String(v.saved_at||'')+i}><div><strong>Version {(historyNote.history||[]).length-i}</strong><small>{dateLabel(v.saved_at)}</small><p>{v.content?.slice(0,180)||'Empty note'}</p></div><button className="secondary-btn compact" onClick={()=>{setEditing(historyNote);setForm({...emptyNote(),...v,reminder_at:toLocal(historyNote.reminder_at)});setTagsInput((v.tags||[]).join(', '));setHistoryNote(null);setShowEditor(true)}}>Restore</button></div>)}</div></div></div>}
  </div>
}
