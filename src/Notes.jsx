import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive, Bold, Code2, Copy, FileText, Fingerprint, Folder, FolderPlus,
  Heading2, Italic, List, ListChecks, Pin, PinOff, Plus, Quote, RefreshCw,
  Search, ShieldCheck, Star, Trash2, Undo2, X, Lock, Eye, EyeOff,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import {
  decryptVaultJson,
  deriveVaultKey,
  encryptVaultJson,
  isDeviceUnlockAvailable,
  registerDeviceUnlock,
  unlockWithDevice,
} from './vaultDeviceUnlock'

const DEFAULT_FOLDERS = ['General', 'Personal', 'Work', 'Ideas', 'Finance']
const emptyNote = () => ({
  id: '',
  title: '',
  content: '',
  folder: 'General',
  tags: [],
  favorite: false,
  is_pinned: false,
  archived: false,
  trashed: false,
  trashed_at: null,
  reminder_at: '',
  history: [],
  created_at: '',
  updated_at: '',
})

function bytesToBase64(value) {
  let binary = ''
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function fromBase64(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function nowIso() {
  return new Date().toISOString()
}

function toLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function dateLabel(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function wordCount(value) {
  const text = String(value || '').trim()
  return text ? text.split(/\s+/).length : 0
}

function normalizeNote(note) {
  return {
    id: note.id || crypto.randomUUID(),
    title: note.title || '',
    content: note.content || '',
    folder: note.folder || 'General',
    tags: Array.isArray(note.tags) ? note.tags : [],
    favorite: Boolean(note.favorite),
    is_pinned: Boolean(note.is_pinned),
    archived: Boolean(note.archived),
    trashed: Boolean(note.trashed),
    trashed_at: note.trashed_at || null,
    reminder_at: note.reminder_at || '',
    history: Array.isArray(note.history) ? note.history : [],
    created_at: note.created_at || nowIso(),
    updated_at: note.updated_at || nowIso(),
  }
}

export default function Notes({ user }) {
  const [phase, setPhase] = useState('loading')
  const [meta, setMeta] = useState(null)
  const [notes, setNotes] = useState([])
  const [master, setMaster] = useState('')
  const [confirm, setConfirm] = useState('')
  const masterRef = useRef('')
  const keyRef = useRef(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricBusy, setBiometricBusy] = useState(false)

  const [query, setQuery] = useState('')
  const [view, setView] = useState('all')
  const [folder, setFolder] = useState('all')
  const [tag, setTag] = useState('all')
  const [sort, setSort] = useState('updated')
  const [selectedId, setSelectedId] = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyNote)
  const [tagsInput, setTagsInput] = useState('')
  const [historyNote, setHistoryNote] = useState(null)
  const [saveHint, setSaveHint] = useState('')
  const editorRef = useRef(null)

  async function loadVault() {
    setPhase('loading')
    setError('')
    const { data, error: readError } = await supabase
      .from('notes_vaults')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (readError) {
      setError(readError.message)
      setPhase('setup')
      return
    }

    setMeta(data || null)
    setNotes([])
    keyRef.current = null
    masterRef.current = ''
    setSelectedId(null)
    setPhase(data ? 'locked' : 'setup')
  }

  useEffect(() => {
    void loadVault()
    void isDeviceUnlockAvailable().then(setBiometricAvailable)
  }, [user.id])

  useEffect(() => {
    function openNewNote() {
      if (phase === 'unlocked') openNew()
    }
    window.addEventListener('onevault:open-note', openNewNote)
    return () => window.removeEventListener('onevault:open-note', openNewNote)
  }, [phase])

  useEffect(() => {
    function saveShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && showEditor) {
        event.preventDefault()
        void saveNote({ preventDefault() {} })
      }
    }
    window.addEventListener('keydown', saveShortcut)
    return () => window.removeEventListener('keydown', saveShortcut)
  }, [showEditor, form, editing, tagsInput])

  const folders = useMemo(() => {
    return Array.from(new Set([...DEFAULT_FOLDERS, ...notes.map(note => note.folder).filter(Boolean)]))
  }, [notes])

  const tags = useMemo(() => {
    return Array.from(new Set(notes.flatMap(note => Array.isArray(note.tags) ? note.tags : []))).sort()
  }, [notes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return notes
      .filter(note => {
        if (view === 'trash' ? !note.trashed : note.trashed) return false
        if (view === 'archive' && !note.archived) return false
        if (view === 'favorites' && !note.favorite) return false
        if (view === 'pinned' && !note.is_pinned) return false
        if (view === 'reminders' && !note.reminder_at) return false
        if (folder !== 'all' && note.folder !== folder) return false
        if (tag !== 'all' && !note.tags.includes(tag)) return false
        return !q || [note.title, note.content, note.folder, ...note.tags]
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
      .sort((a, b) => {
        if (Boolean(b.is_pinned) !== Boolean(a.is_pinned)) return b.is_pinned ? 1 : -1
        if (sort === 'title') return String(a.title).localeCompare(String(b.title))
        if (sort === 'created') return new Date(b.created_at) - new Date(a.created_at)
        return new Date(b.updated_at) - new Date(a.updated_at)
      })
  }, [notes, query, view, folder, tag, sort])

  const selected = notes.find(note => note.id === selectedId) || filtered[0] || null

  async function unlockFromMaster(password) {
    const key = await deriveVaultKey(password, meta.salt)
    const value = await decryptVaultJson(meta.iv, meta.ciphertext, key)
    const next = Array.isArray(value) ? value.map(normalizeNote) : []
    keyRef.current = key
    masterRef.current = password
    setNotes(next)
    setSelectedId(next[0]?.id || null)
    setMaster('')
    setConfirm('')
    setPhase('unlocked')
  }

  async function createVault(event) {
    event.preventDefault()
    setError('')
    if (master.length < 12) return setError('Use a notes password with at least 12 characters.')
    if (master !== confirm) return setError('The notes passwords do not match.')

    setBusy(true)
    try {
      let migrated = []

      const { data: legacyNotes, error: legacyError } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .limit(1000)

      if (legacyError) throw legacyError
      if (Array.isArray(legacyNotes)) migrated = legacyNotes.map(normalizeNote)

      const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)))
      const key = await deriveVaultKey(master, salt)
      const encrypted = await encryptVaultJson(migrated, key)

      const row = {
        user_id: user.id,
        vault_version: 2,
        salt,
        iv: encrypted.iv,
        ciphertext: encrypted.ciphertext,
        biometric_credential_id: null,
        biometric_prf_salt: null,
        biometric_iv: null,
        biometric_ciphertext: null,
        updated_at: nowIso(),
      }

      const { error: saveError } = await supabase.from('notes_vaults').upsert(row)
      if (saveError) throw saveError

      if (migrated.length) {
        await Promise.all(
          migrated.map(note =>
            supabase
              .from('notes')
              .delete()
              .eq('id', note.id)
              .eq('user_id', user.id),
          ),
        )
      }

      keyRef.current = key
      masterRef.current = master
      setMeta(row)
      setNotes(migrated)
      setSelectedId(migrated[0]?.id || null)
      setMaster('')
      setConfirm('')
      setPhase('unlocked')
    } catch (err) {
      setError(err.message || 'Could not create the notes vault.')
    } finally {
      setBusy(false)
    }
  }

  async function unlock(event) {
    event.preventDefault()
    setError('')
    if (!master) return setError('Enter your notes password.')
    setBusy(true)
    try {
      await unlockFromMaster(master)
    } catch {
      keyRef.current = null
      masterRef.current = ''
      setError('Incorrect notes password or corrupted vault.')
    } finally {
      setBusy(false)
    }
  }

  async function unlockBiometric() {
    if (!meta?.biometric_credential_id) return
    setError('')
    setBiometricBusy(true)
    try {
      const password = await unlockWithDevice({
        credential_id: meta.biometric_credential_id,
        prf_salt: meta.biometric_prf_salt,
        iv: meta.biometric_iv,
        ciphertext: meta.biometric_ciphertext,
      })
      await unlockFromMaster(password)
    } catch (err) {
      setError(err.message || 'Device unlock failed.')
    } finally {
      setBiometricBusy(false)
    }
  }

  async function enableBiometric() {
    if (!masterRef.current) return setError('Unlock the notes vault with your password first.')
    setError('')
    setBiometricBusy(true)
    try {
      const wrapped = await registerDeviceUnlock(masterRef.current, user.email || 'oneVault notes')
      const row = {
        ...meta,
        biometric_credential_id: wrapped.credential_id,
        biometric_prf_salt: wrapped.prf_salt,
        biometric_iv: wrapped.iv,
        biometric_ciphertext: wrapped.ciphertext,
        updated_at: nowIso(),
      }
      const { error: saveError } = await supabase.from('notes_vaults').upsert(row)
      if (saveError) throw saveError
      setMeta(row)
    } catch (err) {
      setError(err.message || 'Could not enable device unlock.')
    } finally {
      setBiometricBusy(false)
    }
  }

  async function disableBiometric() {
    setError('')
    setBiometricBusy(true)
    try {
      const row = {
        ...meta,
        biometric_credential_id: null,
        biometric_prf_salt: null,
        biometric_iv: null,
        biometric_ciphertext: null,
        updated_at: nowIso(),
      }
      const { error: saveError } = await supabase.from('notes_vaults').upsert(row)
      if (saveError) throw saveError
      setMeta(row)
    } catch (err) {
      setError(err.message || 'Could not disable device unlock.')
    } finally {
      setBiometricBusy(false)
    }
  }

  function lockVault() {
    keyRef.current = null
    masterRef.current = ''
    setNotes([])
    setSelectedId(null)
    setShowEditor(false)
    setEditing(null)
    setHistoryNote(null)
    setPhase('locked')
  }

  async function persist(nextNotes) {
    if (!keyRef.current || !meta) throw new Error('Unlock the notes vault first.')
    const encrypted = await encryptVaultJson(nextNotes, keyRef.current)
    const row = { ...meta, iv: encrypted.iv, ciphertext: encrypted.ciphertext, updated_at: nowIso() }
    const { error: saveError } = await supabase.from('notes_vaults').upsert(row)
    if (saveError) throw saveError
    setMeta(row)
    setNotes(nextNotes)
  }

  function openNew() {
    setEditing(null)
    setForm(emptyNote())
    setTagsInput('')
    setSaveHint('')
    setShowEditor(true)
    setError('')
  }

  function openEdit(note) {
    setEditing(note)
    setForm({
      ...note,
      reminder_at: toLocal(note.reminder_at),
    })
    setTagsInput((note.tags || []).join(', '))
    setSaveHint('')
    setShowEditor(true)
    setError('')
  }

  function closeEditor() {
    setShowEditor(false)
    setEditing(null)
    setForm(emptyNote())
    setTagsInput('')
  }

  async function saveNote(event) {
    event?.preventDefault?.()
    setError('')
    if (!form.title.trim() && !form.content.trim()) return setError('Add a title or some note content.')

    setBusy(true)
    setSaveHint('Saving…')

    try {
      const now = nowIso()
      const id = editing?.id || crypto.randomUUID()
      const parsedTags = Array.from(new Set(tagsInput.split(',').map(item => item.trim()).filter(Boolean)))
      const previousHistory = Array.isArray(editing?.history) ? editing.history : []
      const changed = editing && (
        editing.title !== form.title.trim() ||
        editing.content !== form.content ||
        editing.folder !== form.folder ||
        JSON.stringify(editing.tags || []) !== JSON.stringify(parsedTags)
      )
      const history = changed
        ? [{
            title: editing.title || '',
            content: editing.content || '',
            folder: editing.folder || 'General',
            tags: editing.tags || [],
            favorite: Boolean(editing.favorite),
            is_pinned: Boolean(editing.is_pinned),
            archived: Boolean(editing.archived),
            saved_at: editing.updated_at || editing.created_at || now,
          }, ...previousHistory].slice(0, 20)
        : previousHistory

      const payload = normalizeNote({
        ...form,
        id,
        user_id: user.id,
        title: form.title.trim(),
        folder: form.folder || 'General',
        tags: parsedTags,
        reminder_at: form.reminder_at ? new Date(form.reminder_at).toISOString() : '',
        history,
        created_at: editing?.created_at || now,
        updated_at: now,
      })

      const next = editing ? notes.map(note => note.id === id ? payload : note) : [payload, ...notes]
      await persist(next)
      setSelectedId(id)
      closeEditor()
    } catch (err) {
      setError(err.message || 'Could not save note.')
      setSaveHint('')
    } finally {
      setBusy(false)
    }
  }

  async function patchNote(note, changes) {
    try {
      const next = notes.map(item => item.id === note.id ? { ...item, ...changes, updated_at: nowIso() } : item)
      await persist(next)
    } catch (err) {
      setError(err.message || 'Could not update note.')
    }
  }

  async function moveToTrash(note) {
    await patchNote(note, { trashed: true, trashed_at: nowIso() })
  }

  async function restoreNote(note) {
    await patchNote(note, { trashed: false, trashed_at: null })
  }

  async function toggleArchive(note) {
    await patchNote(note, { archived: !note.archived })
  }

  async function toggleFavorite(note) {
    await patchNote(note, { favorite: !note.favorite })
  }

  async function togglePin(note) {
    await patchNote(note, { is_pinned: !note.is_pinned })
  }

  async function duplicateNote(note) {
    const now = nowIso()
    const duplicate = normalizeNote({
      ...note,
      id: crypto.randomUUID(),
      title: (note.title || 'Untitled note') + ' Copy',
      created_at: now,
      updated_at: now,
      trashed: false,
      trashed_at: null,
      history: [],
    })
    try {
      await persist([duplicate, ...notes])
      setSelectedId(duplicate.id)
    } catch (err) {
      setError(err.message || 'Could not duplicate note.')
    }
  }

  async function deleteForever(note) {
    if (!window.confirm('Permanently delete “' + (note.title || 'Untitled note') + '”?')) return
    try {
      const next = notes.filter(item => item.id !== note.id)
      await persist(next)
      setSelectedId(next[0]?.id || null)
    } catch (err) {
      setError(err.message || 'Could not delete note.')
    }
  }

  async function createReminder(note) {
    if (!note.reminder_at) return
    const { error: reminderError } = await supabase.from('reminders').insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      title: note.title || 'Note reminder',
      description: note.content?.slice(0, 250) || null,
      due_at: note.reminder_at,
      repeat_rule: null,
      priority: 'medium',
      completed: false,
      notify_telegram: false,
    })
    if (reminderError) setError(reminderError.message)
    else setSaveHint('Reminder created')
  }

  function addFolder() {
    const name = window.prompt('New folder name')
    if (name?.trim()) setForm(value => ({ ...value, folder: name.trim() }))
  }

  function applyFormat(type) {
    const textarea = editorRef.current
    const start = textarea?.selectionStart ?? form.content.length
    const end = textarea?.selectionEnd ?? form.content.length
    const selectedText = form.content.slice(start, end)
    let before = ''
    let after = ''
    if (type === 'bold') { before = '**'; after = '**' }
    if (type === 'italic') { before = '*'; after = '*' }
    if (type === 'heading') before = '## '
    if (type === 'bullet') before = '- '
    if (type === 'checklist') before = '- [ ] '
    if (type === 'quote') before = '> '
    if (type === 'code') { before = String.fromCharCode(96); after = String.fromCharCode(96) }

    const content = form.content.slice(0, start) + before + selectedText + after + form.content.slice(end)
    setForm(value => ({ ...value, content }))
    requestAnimationFrame(() => {
      if (!textarea) return
      const cursor = start + before.length + selectedText.length + after.length
      textarea.focus()
      textarea.setSelectionRange(cursor, cursor)
    })
  }

  function exportNote(note) {
    const blob = new Blob([note.content || ''], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = (note.title || 'note').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() + '.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function changeVaultPassword(event) {
    event.preventDefault()
    if (masterRef.current === '') return setError('Unlock the notes vault first.')
    const nextPassword = window.prompt('Enter your new notes password (at least 12 characters).')
    if (!nextPassword || nextPassword.length < 12) return
    setBusy(true)
    try {
      const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)))
      const key = await deriveVaultKey(nextPassword, salt)
      const encrypted = await encryptVaultJson(notes, key)
      const row = {
        ...meta,
        salt,
        iv: encrypted.iv,
        ciphertext: encrypted.ciphertext,
        biometric_credential_id: null,
        biometric_prf_salt: null,
        biometric_iv: null,
        biometric_ciphertext: null,
        updated_at: nowIso(),
      }
      const { error: saveError } = await supabase.from('notes_vaults').upsert(row)
      if (saveError) throw saveError
      keyRef.current = key
      masterRef.current = nextPassword
      setMeta(row)
      setSaveHint('Password changed. Device unlock was reset; enable it again.')
    } catch (err) {
      setError(err.message || 'Could not change the notes password.')
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'loading') return <div className="workspace-loading">Loading notes vault…</div>

  if (phase === 'setup' || phase === 'locked') {
    const setup = phase === 'setup'
    return <div className="vault-gate">
      <div className="vault-gate-icon"><FileText size={24}/></div>
      <div className="panel-kicker">PRIVATE NOTES</div>
      <h2>{setup ? 'Create your notes vault' : 'Unlock your notes'}</h2>
      <p>{setup ? 'Notes are encrypted in your browser before they are synced to Supabase.' : 'Use your notes password or this device’s secure unlock.'}</p>
      {!setup && meta?.biometric_credential_id && biometricAvailable && <button className="device-unlock-btn" onClick={()=>void unlockBiometric()} disabled={biometricBusy}><Fingerprint size={16}/>{biometricBusy ? 'Waiting for device…' : 'Unlock with Face ID / fingerprint / Windows Hello'}</button>}
      {!setup && meta?.biometric_credential_id && biometricAvailable && <div className="vault-divider"><span>or use password</span></div>}
      <form onSubmit={setup ? createVault : unlock} className="vault-gate-form">
        <label><span>Notes password</span><input type="password" value={master} onChange={e=>setMaster(e.target.value)} placeholder="At least 12 characters" autoFocus/></label>
        {setup && <label><span>Confirm password</span><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repeat the notes password"/></label>}
        {error && <div className="form-error">{error}</div>}
        <button className="primary-btn" disabled={busy}>{busy ? 'Working…' : setup ? 'Create secure notes vault' : 'Unlock notes'}</button>
      </form>
      <div className="vault-gate-note"><Lock size={13}/> Notes are encrypted locally; the browser only syncs the encrypted vault.</div>
    </div>
  }

  const activeCount = notes.filter(note => !note.trashed).length

  return <div className="notes-page">
    <div className="module-toolbar">
      <div><div className="panel-kicker">PRIVATE NOTES</div><h2>Notes that stay organized.</h2><p>{activeCount} active notes · encrypted vault · folders, tags, history and trash.</p></div>
      <div className="module-toolbar-actions">
        <button className="secondary-btn" onClick={()=>void loadVault()}><RefreshCw size={14}/> Refresh</button>
        {meta?.biometric_credential_id ? <button className="secondary-btn" onClick={()=>void disableBiometric()} disabled={biometricBusy}><Fingerprint size={14}/> {biometricBusy ? 'Updating…' : 'Device unlock on'}</button> : biometricAvailable ? <button className="secondary-btn" onClick={()=>void enableBiometric()} disabled={biometricBusy}><Fingerprint size={14}/> {biometricBusy ? 'Enabling…' : 'Enable device unlock'}</button> : null}
        <button className="secondary-btn" onClick={()=>void changeVaultPassword({ preventDefault() {} })}><KeyRound size={14}/> Change password</button>
        <button className="secondary-btn" onClick={lockVault}><Lock size={14}/> Lock</button>
        <button className="primary-btn" onClick={openNew}><Plus size={15}/> New note</button>
      </div>
    </div>

    {error && <div className="form-error">{error}</div>}

    <div className="notes-command panel">
      <div className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search notes, tags and content"/></div>
      <div className="notes-view-tabs">
        {[['all','All'],['favorites','Favorites'],['pinned','Pinned'],['archive','Archive'],['reminders','Reminders'],['trash','Trash']].map(([key,label])=>
          <button key={key} className={view===key?'active':''} onClick={()=>setView(key)}>{label}</button>
        )}
      </div>
      <div className="notes-filter-row">
        <select value={folder} onChange={e=>setFolder(e.target.value)}><option value="all">All folders</option>{folders.map(item=><option key={item}>{item}</option>)}</select>
        <button className="secondary-btn compact" onClick={addFolder}><FolderPlus size={13}/> New folder</button>
        <select value={tag} onChange={e=>setTag(e.target.value)}><option value="all">All tags</option>{tags.map(item=><option key={item}>{item}</option>)}</select>
        <select value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">Recently updated</option><option value="created">Recently created</option><option value="title">Title</option></select>
      </div>
    </div>

    <div className="notes-layout">
      <section className="panel notes-list-panel">
        <div className="panel-header"><div><div className="panel-kicker">LIBRARY</div><h3>{filtered.length} notes</h3></div><span className="results-count">{folders.length} folders</span></div>
        <div className="note-list">
          {filtered.length===0
            ? <div className="side-empty"><FileText size={22}/><strong>No notes here</strong><span>Create a note or adjust your filters.</span><button className="primary-btn" onClick={openNew}><Plus size={14}/> New note</button></div>
            : filtered.map(note=>
              <button type="button" key={note.id} className={'note-list-row '+(selected?.id===note.id?'selected':'')} onClick={()=>setSelectedId(note.id)}>
                <div className="note-row-top"><strong>{note.title||'Untitled note'}</strong><span>{dateLabel(note.updated_at)}</span></div>
                <small>{String(note.content||'').replace(/[#*_>-]/g,'').slice(0,120)||'Empty note'}</small>
                <div className="note-row-meta"><span><Folder size={10}/> {note.folder||'General'}</span>{note.favorite&&<Star size={10} fill="currentColor"/>}{note.is_pinned&&<Pin size={10}/>} {(note.tags||[]).slice(0,2).map(item=><em key={item}>{item}</em>)}</div>
              </button>
            )}
        </div>
      </section>

      <section className="panel note-editor-panel">
        {selected ? <div className="note-detail">
          <div className="panel-header"><div><div className="panel-kicker">NOTE</div><h3>{selected.title||'Untitled note'}</h3><span className="detail-subtitle">{selected.folder||'General'} · {wordCount(selected.content)} words</span></div><div className="detail-actions">
            <button className="mini-btn" onClick={()=>togglePin(selected)} title={selected.is_pinned?'Unpin':'Pin'}>{selected.is_pinned?<PinOff size={13}/>:<Pin size={13}/>}</button>
            <button className="mini-btn" onClick={()=>toggleFavorite(selected)} title="Favorite"><Star size={13} fill={selected.favorite?'currentColor':'none'}/></button>
            {!selected.trashed && <button className="mini-btn" onClick={()=>toggleArchive(selected)} title={selected.archived?'Unarchive':'Archive'}><Archive size={13}/></button>}
            <button className="mini-btn" onClick={()=>duplicateNote(selected)} title="Duplicate"><Copy size={13}/></button>
            <button className="mini-btn" onClick={()=>openEdit(selected)} title="Edit"><FileText size={13}/></button>
            {selected.trashed ? <button className="mini-btn" onClick={()=>restoreNote(selected)} title="Restore"><Undo2 size={13}/></button> : <button className="mini-btn danger" onClick={()=>moveToTrash(selected)} title="Move to trash"><Trash2 size={13}/></button>}
            {selected.trashed && <button className="mini-btn danger" onClick={()=>void deleteForever(selected)} title="Delete permanently"><X size={13}/></button>}
          </div></div>
          <div className="note-preview"><pre>{selected.content||'This note is empty.'}</pre></div>
          <div className="note-detail-footer"><div><span>{wordCount(selected.content)} words</span><span>{String(selected.content||'').length} characters</span><span>Updated {dateLabel(selected.updated_at)}</span></div><div><button className="text-btn" onClick={()=>exportNote(selected)}>Export</button>{selected.reminder_at&&<button className="text-btn" onClick={()=>void createReminder(selected)}>Create reminder</button>}{selected.history?.length>0&&<button className="text-btn" onClick={()=>setHistoryNote(selected)}>History ({selected.history.length})</button>}</div></div>
        </div> : <div className="empty-state"><div className="empty-icon"><FileText size={24}/></div><h4>Select a note</h4><p>Your note details and actions will appear here.</p></div>}
      </section>
    </div>

    {showEditor && <div className="modal-layer"><div className="modal note-editor-modal">
      <div className="modal-header"><div><div className="panel-kicker">NOTE EDITOR</div><h3>{editing?'Edit note':'New note'}</h3><p className="modal-subtle">Ctrl/Cmd + S to save.</p></div><button className="icon-btn" onClick={closeEditor}><X size={18}/></button></div>
      <form onSubmit={saveNote} className="expense-form">
        <label><span>Title</span><input autoFocus value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Note title"/></label>
        <div className="notes-editor-meta">
          <div><span>Folder</span><div className="inline-control"><select value={form.folder} onChange={e=>setForm({...form,folder:e.target.value})}>{folders.map(item=><option key={item}>{item}</option>)}</select><button type="button" className="icon-btn small" onClick={addFolder}><FolderPlus size={13}/></button></div></div>
          <div><span>Reminder</span><input type="datetime-local" value={form.reminder_at} onChange={e=>setForm({...form,reminder_at:e.target.value})}/></div>
        </div>
        <label><span>Tags</span><input value={tagsInput} onChange={e=>setTagsInput(e.target.value)} placeholder="project, ideas, important"/></label>
        <div className="markdown-toolbar">
          <button type="button" onClick={()=>applyFormat('bold')}><Bold size={14}/></button>
          <button type="button" onClick={()=>applyFormat('italic')}><Italic size={14}/></button>
          <button type="button" onClick={()=>applyFormat('heading')}><Heading2 size={14}/></button>
          <button type="button" onClick={()=>applyFormat('bullet')}><List size={14}/></button>
          <button type="button" onClick={()=>applyFormat('checklist')}><ListChecks size={14}/></button>
          <button type="button" onClick={()=>applyFormat('quote')}><Quote size={14}/></button>
          <button type="button" onClick={()=>applyFormat('code')}><Code2 size={14}/></button>
          <button type="button" onClick={()=>setForm(value=>({...value,content:''}))}><Trash2 size={14}/></button>
        </div>
        <textarea ref={editorRef} className="note-editor-textarea" rows="18" value={form.content} onChange={e=>setForm({...form,content:e.target.value})} placeholder="Start writing…"/>
        <div className="note-editor-footer"><label className="toggle-option"><input type="checkbox" checked={form.favorite} onChange={e=>setForm({...form,favorite:e.target.checked})}/><span><strong>Favorite</strong></span></label><label className="toggle-option"><input type="checkbox" checked={form.is_pinned} onChange={e=>setForm({...form,is_pinned:e.target.checked})}/><span><strong>Pin</strong></span></label><span>{wordCount(form.content)} words · {form.content.length} chars</span></div>
        {saveHint&&<div className="telegram-notice">{saveHint}</div>}
        {error&&<div className="form-error">{error}</div>}
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={closeEditor}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':editing?'Save changes':'Create note'}</button></div>
      </form>
    </div></div>}

    {historyNote && <div className="modal-layer"><div className="modal note-history-modal">
      <div className="modal-header"><div><div className="panel-kicker">VERSION HISTORY</div><h3>{historyNote.title||'Untitled note'}</h3><p className="modal-subtle">Up to 20 previous saved versions.</p></div><button className="icon-btn" onClick={()=>setHistoryNote(null)}><X size={18}/></button></div>
      <div className="history-list">{(historyNote.history||[]).map((version,index)=><div className="history-row" key={String(version.saved_at||'')+index}><div><strong>Version {(historyNote.history||[]).length-index}</strong><small>{dateLabel(version.saved_at)}</small><p>{version.content?.slice(0,180)||'Empty note'}</p></div><button className="secondary-btn compact" onClick={()=>{setEditing(historyNote);setForm({...emptyNote(),...version,reminder_at:toLocal(historyNote.reminder_at)});setTagsInput((version.tags||[]).join(', '));setHistoryNote(null);setShowEditor(true)}}>Restore</button></div>)}</div>
    </div></div>}
  </div>
}
