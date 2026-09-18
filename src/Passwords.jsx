
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Edit3, Eye, EyeOff, KeyRound, Lock, Plus, Search, ShieldCheck, Star, Trash2, Wand2, X, Fingerprint } from 'lucide-react'
import { supabase } from './lib/supabase'
import { isDeviceUnlockAvailable, registerDeviceUnlock, unlockWithDevice } from './vaultDeviceUnlock'

const PBKDF2_ITERATIONS = 600000
const CATEGORIES = ['Personal','Work','Finance','Social','Shopping','Other']
const b64 = bytes => { let b=''; for (let i=0;i<bytes.length;i++) b+=String.fromCharCode(bytes[i]); return btoa(b) }
const fromB64 = value => { const b=atob(value); const x=new Uint8Array(b.length); for(let i=0;i<b.length;i++)x[i]=b.charCodeAt(i); return x }
async function deriveKey(password,salt){
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey'])
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:fromB64(salt),iterations:PBKDF2_ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])
}
async function encryptEntries(entries,key){
  const iv=crypto.getRandomValues(new Uint8Array(12))
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(entries)))
  return {iv:b64(iv),ciphertext:b64(new Uint8Array(encrypted))}
}
async function decryptEntries(iv,ciphertext,key){
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(iv)},key,fromB64(ciphertext))
  const value=JSON.parse(new TextDecoder().decode(plain)); return Array.isArray(value)?value:[]
}
function generatePassword(length=20){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+'
  const values=new Uint32Array(length); crypto.getRandomValues(values)
  return Array.from(values,v=>alphabet[v%alphabet.length]).join('')
}
const passwordStrength=value=>{
  let score=0
  if(value.length>=12)score++
  if(value.length>=18)score++
  if(/[A-Z]/.test(value))score++
  if(/[a-z]/.test(value))score++
  if(/[0-9]/.test(value))score++
  if(/[^A-Za-z0-9]/.test(value))score++
  return {score,label:score<=2?'Weak':score<=4?'Good':'Strong'}
}
const blankForm=()=>({title:'',username:'',password:generatePassword(),url:'',notes:'',category:'Personal',favorite:false})

export default function Passwords({user}){
  const [phase,setPhase]=useState('loading'),[meta,setMeta]=useState(null),[entries,setEntries]=useState([])
  const [master,setMaster]=useState(''),[confirm,setConfirm]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const keyRef=useRef(null),[query,setQuery]=useState(''),[category,setCategory]=useState('all'),[selectedId,setSelectedId]=useState(null)
  const [form,setForm]=useState(blankForm),[editing,setEditing]=useState(null),[showForm,setShowForm]=useState(false),[showSecret,setShowSecret]=useState(false)
  const [showChange,setShowChange]=useState(false),[newMaster,setNewMaster]=useState(''),[newMasterConfirm,setNewMasterConfirm]=useState(''),[copied,setCopied]=useState('')
  const [biometricAvailable,setBiometricAvailable]=useState(false),[biometricBusy,setBiometricBusy]=useState(false)
  const masterRef=useRef('')

  async function load(){
    setPhase('loading')
    const {data,error:e}=await supabase.from('password_vaults').select('*').eq('user_id',user.id).maybeSingle()
    if(e){setError(e.message);setPhase('setup');return}
    setMeta(data||null);setEntries([]);keyRef.current=null;setSelectedId(null);setPhase(data?'locked':'setup')
  }
  useEffect(()=>{void load();void isDeviceUnlockAvailable().then(setBiometricAvailable)},[user.id])
  useEffect(()=>{function open(){if(phase==='unlocked')openNew()} window.addEventListener('onevault:open-password',open);return()=>window.removeEventListener('onevault:open-password',open)},[phase])

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase()
    return entries.filter(e=>(category==='all'||e.category===category)&&(!q||[e.title,e.username,e.url,e.category].join(' ').toLowerCase().includes(q)))
      .sort((a,b)=>Boolean(b.favorite)-Boolean(a.favorite)||String(a.title).localeCompare(String(b.title)))
  },[entries,query,category])
  const selected=entries.find(e=>e.id===selectedId)||filtered[0]||null
  const strength=passwordStrength(form.password)

  function resetForm(){setForm(blankForm());setEditing(null);setShowForm(false);setShowSecret(false)}
  async function createVault(e){
    e.preventDefault();setError('')
    if(master.length<12)return setError('Use a vault password with at least 12 characters.')
    if(master!==confirm)return setError('The vault passwords do not match.')
    setBusy(true)
    try{
      const salt=b64(crypto.getRandomValues(new Uint8Array(16))),key=await deriveKey(master,salt),encrypted=await encryptEntries([],key)
      const row={user_id:user.id,vault_version:1,salt,iv:encrypted.iv,ciphertext:encrypted.ciphertext,updated_at:new Date().toISOString()}
      const {error:e}=await supabase.from('password_vaults').upsert(row);if(e)throw e
      keyRef.current=key;masterRef.current=master;setMeta(row);setEntries([]);setMaster('');setConfirm('');setPhase('unlocked')
    }catch(err){setError(err.message||'Could not create the password vault.')}finally{setBusy(false)}
  }
  async function unlockFromMaster(password){
    const key=await deriveKey(password,meta.salt)
    const value=await decryptEntries(meta.iv,meta.ciphertext,key)
    keyRef.current=key
    masterRef.current=password
    setEntries(value)
    setSelectedId(value[0]?.id||null)
    setMaster('')
    setPhase('unlocked')
  }
  async function unlock(e){
    e.preventDefault();setError('');if(!master)return setError('Enter your vault password.')
    setBusy(true)
    try{await unlockFromMaster(master)}
    catch{keyRef.current=null;masterRef.current='';setError('Incorrect vault password or corrupted vault.')}finally{setBusy(false)}
  }
  async function unlockBiometric(){
    if(!meta?.biometric_credential_id)return
    setError('');setBiometricBusy(true)
    try{
      const password=await unlockWithDevice({credential_id:meta.biometric_credential_id,prf_salt:meta.biometric_prf_salt,iv:meta.biometric_iv,ciphertext:meta.biometric_ciphertext})
      await unlockFromMaster(password)
    }catch(err){setError(err.message||'Device unlock failed.')}finally{setBiometricBusy(false)}
  }
  async function enableBiometric(){
    if(!masterRef.current)return setError('Unlock the vault with your password first.')
    setError('');setBiometricBusy(true)
    try{
      const wrapped=await registerDeviceUnlock(masterRef.current,user.email||'oneVault')
      const row={...meta,biometric_credential_id:wrapped.credential_id,biometric_prf_salt:wrapped.prf_salt,biometric_iv:wrapped.iv,biometric_ciphertext:wrapped.ciphertext,updated_at:new Date().toISOString()}
      const {error:e}=await supabase.from('password_vaults').upsert(row);if(e)throw e
      setMeta(row)
    }catch(err){setError(err.message||'Could not enable device unlock.')}finally{setBiometricBusy(false)}
  }
  async function disableBiometric(){
    setError('');setBiometricBusy(true)
    try{
      const row={...meta,biometric_credential_id:null,biometric_prf_salt:null,biometric_iv:null,biometric_ciphertext:null,updated_at:new Date().toISOString()}
      const {error:e}=await supabase.from('password_vaults').upsert(row);if(e)throw e
      setMeta(row)
    }catch(err){setError(err.message||'Could not disable device unlock.')}finally{setBiometricBusy(false)}
  }
  function lockVault(){keyRef.current=null;masterRef.current='';setEntries([]);setSelectedId(null);setShowForm(false);setEditing(null);setShowChange(false);setPhase('locked')}
  async function persist(next,nextMeta=meta,key=keyRef.current){
    if(!key||!nextMeta)throw new Error('Unlock the password vault first.')
    const encrypted=await encryptEntries(next,key),row={...nextMeta,iv:encrypted.iv,ciphertext:encrypted.ciphertext,updated_at:new Date().toISOString()}
    const {error:e}=await supabase.from('password_vaults').upsert(row);if(e)throw e
    setMeta(row);setEntries(next)
  }
  function openNew(){setError('');setEditing(null);setForm(blankForm());setShowSecret(false);setShowForm(true)}
  function openEdit(e){setError('');setEditing(e);setForm({title:e.title||'',username:e.username||'',password:e.password||'',url:e.url||'',notes:e.notes||'',category:e.category||'Personal',favorite:Boolean(e.favorite)});setShowSecret(false);setShowForm(true)}
  async function saveEntry(e){
    e.preventDefault();setError('');if(!form.title.trim())return setError('Website or account name is required.');if(!form.password)return setError('Password is required.')
    setBusy(true)
    try{
      const normalized={...form,title:form.title.trim(),username:form.username.trim(),url:form.url.trim(),notes:form.notes.trim()}
      const next=editing?entries.map(x=>x.id===editing.id?{...x,...normalized}:x):[{id:crypto.randomUUID(),...normalized,created_at:new Date().toISOString()},...entries]
      await persist(next);setSelectedId(editing?.id||next[0]?.id||null);resetForm()
    }catch(err){setError(err.message||'Could not save password.')}finally{setBusy(false)}
  }
  async function deleteEntry(entry){
    if(!window.confirm('Delete “'+entry.title+'” from the password vault?'))return
    setBusy(true);try{const next=entries.filter(x=>x.id!==entry.id);await persist(next);setSelectedId(next[0]?.id||null)}catch(err){setError(err.message||'Could not delete password.')}finally{setBusy(false)}
  }
  async function toggleFavorite(entry){try{await persist(entries.map(x=>x.id===entry.id?{...x,favorite:!x.favorite}:x))}catch(err){setError(err.message||'Could not update favorite.')}}
  async function changeMaster(e){
    e.preventDefault();if(newMaster.length<12)return setError('Use a new vault password with at least 12 characters.');if(newMaster!==newMasterConfirm)return setError('The new vault passwords do not match.')
    setBusy(true)
    try{
      const salt=b64(crypto.getRandomValues(new Uint8Array(16))),key=await deriveKey(newMaster,salt),encrypted=await encryptEntries(entries,key),row={...meta,salt,iv:encrypted.iv,ciphertext:encrypted.ciphertext,updated_at:new Date().toISOString()}
      const {error:e}=await supabase.from('password_vaults').upsert(row);if(e)throw e
      keyRef.current=key;masterRef.current=newMaster;setMeta(row);setNewMaster('');setNewMasterConfirm('');setShowChange(false)
    }catch(err){setError(err.message||'Could not change vault password.')}finally{setBusy(false)}
  }
  async function copyValue(label,value){try{await navigator.clipboard.writeText(value);setCopied(label);setTimeout(()=>setCopied(''),1400)}catch{setError('Clipboard access was blocked by the browser.')}}
  function exportBackup(){
    if(!meta)return
    const blob=new Blob([JSON.stringify({vault_version:meta.vault_version,salt:meta.salt,iv:meta.iv,ciphertext:meta.ciphertext,exported_at:new Date().toISOString()},null,2)],{type:'application/json'})
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='oneVault-password-vault-backup.json';a.click();URL.revokeObjectURL(url)
  }

  if(phase==='loading')return <div className="workspace-loading">Loading password vault…</div>
  if(phase==='setup'||phase==='locked'){
    const setup=phase==='setup'
    return <div className="vault-gate"><div className="vault-gate-icon"><ShieldCheck size={24}/></div><div className="panel-kicker">SECURE VAULT</div><h2>{setup?'Create your password vault':'Unlock your password vault'}</h2><p>{setup?'Passwords are encrypted in your browser before they are synced to Supabase.':'Use your vault password or this device’s secure unlock.'}</p>{!setup&&meta?.biometric_credential_id&&biometricAvailable&&<button className="device-unlock-btn" onClick={()=>void unlockBiometric()} disabled={biometricBusy}><Fingerprint size={16}/>{biometricBusy?'Waiting for device…':'Unlock with Face ID / fingerprint / Windows Hello'}</button>}{!setup&&meta?.biometric_credential_id&&biometricAvailable&&<div className="vault-divider"><span>or use password</span></div>}<form onSubmit={setup?createVault:unlock} className="vault-gate-form"><label><span>Master password</span><input type="password" autoComplete="current-password" value={master} onChange={e=>setMaster(e.target.value)} placeholder="At least 12 characters" autoFocus/></label>{setup&&<label><span>Confirm password</span><input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repeat the vault password"/></label>}{error&&<div className="form-error">{error}</div>}<button className="primary-btn" disabled={busy}>{busy?'Working…':setup?'Create secure vault':'Unlock vault'}</button></form><div className="vault-gate-note"><Lock size={13}/> Your master password stays local; device unlock uses WebAuthn user verification when supported.</div></div>
  }

  return <div className="passwords-page">
    <div className="module-toolbar"><div><div className="panel-kicker">SECURE VAULT</div><h2>Password manager.</h2><p>{entries.length} encrypted entries · synced across devices.</p></div><div className="module-toolbar-actions"><button className="secondary-btn" onClick={exportBackup}><span className="text-icon">↓</span> Backup</button><button className="secondary-btn" onClick={()=>setShowChange(true)}><KeyRound size={14}/> Change password</button>{meta?.biometric_credential_id?<button className="secondary-btn" onClick={()=>void disableBiometric()} disabled={biometricBusy}><Fingerprint size={14}/> {biometricBusy?'Updating…':'Device unlock on'}</button>:biometricAvailable?<button className="secondary-btn" onClick={()=>void enableBiometric()} disabled={biometricBusy}><Fingerprint size={14}/> {biometricBusy?'Enabling…':'Enable device unlock'}</button>:null}<button className="secondary-btn" onClick={lockVault}><Lock size={14}/> Lock</button><button className="primary-btn" onClick={openNew}><Plus size={15}/> Add password</button></div></div>
    {error&&<div className="form-error">{error}</div>}
    <div className="passwords-toolbar panel"><div className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search website, username or category"/></div><div className="password-category-tabs">{['all',...CATEGORIES].map(item=><button key={item} className={category===item?'active':''} onClick={()=>setCategory(item)}>{item==='all'?'All':item}</button>)}</div></div>
    <div className="passwords-layout">
      <section className="panel password-list-panel"><div className="panel-header"><div><div className="panel-kicker">ENTRIES</div><h3>{filtered.length} shown</h3></div></div><div className="password-list">
        {filtered.length===0?<div className="side-empty password-empty"><KeyRound size={22}/><strong>{entries.length?'Nothing found':'Your vault is empty'}</strong><span>{entries.length?'Try another search.':'Add your first password to start.'}</span><button className="primary-btn" onClick={openNew}><Plus size={14}/> Add password</button></div>:filtered.map(entry=><button type="button" key={entry.id} className={'password-row '+(selected?.id===entry.id?'selected':'')} onClick={()=>setSelectedId(entry.id)}><span className="password-site-icon">{entry.title.slice(0,1).toUpperCase()}</span><span className="password-row-copy"><strong>{entry.title}</strong><small>{entry.username||'No username'} · {entry.category||'Personal'}</small></span>{entry.favorite&&<Star size={12} fill="currentColor" className="favorite-icon"/>}</button>)}
      </div></section>
      <section className="panel password-detail-panel">{selected?<div className="password-detail"><div className="panel-header"><div><div className="panel-kicker">PASSWORD ENTRY</div><h3>{selected.title}</h3><span className="detail-subtitle">{selected.category}</span></div><div className="detail-actions"><button className="mini-btn" onClick={()=>toggleFavorite(selected)} title="Favorite"><Star size={13} fill={selected.favorite?'currentColor':'none'}/></button><button className="mini-btn" onClick={()=>openEdit(selected)} title="Edit"><Edit3 size={13}/></button><button className="mini-btn danger" onClick={()=>deleteEntry(selected)} title="Delete"><Trash2 size={13}/></button></div></div><div className="secret-field"><span>USERNAME</span><div><strong>{selected.username||'—'}</strong>{selected.username&&<button className="mini-btn" onClick={()=>copyValue('username',selected.username)}>{copied==='username'?<Check size={13}/>:<Copy size={13}/>}</button>}</div></div><div className="secret-field"><span>PASSWORD</span><div><strong>{showSecret?selected.password:'•'.repeat(Math.min(18,Math.max(8,selected.password.length)))}</strong><div className="secret-actions"><button className="mini-btn" onClick={()=>setShowSecret(value=>!value)}>{showSecret?<EyeOff size={13}/>:<Eye size={13}/>}</button><button className="mini-btn" onClick={()=>copyValue('password',selected.password)}>{copied==='password'?<Check size={13}/>:<Copy size={13}/>}</button></div></div></div>{selected.url&&<div className="secret-field"><span>WEBSITE</span><div><a href={selected.url} target="_blank" rel="noreferrer">{selected.url}</a><button className="mini-btn" onClick={()=>copyValue('url',selected.url)}>{copied==='url'?<Check size={13}/>:<Copy size={13}/>}</button></div></div>}{selected.notes&&<div className="secret-field vertical"><span>NOTES</span><p>{selected.notes}</p></div>}<div className="password-detail-footer"><span>Encrypted at rest with your vault key</span><span><ShieldCheck size={11}/> Owner-only access</span></div></div>:<div className="empty-state"><div className="empty-icon"><KeyRound size={24}/></div><h4>Select a password</h4><p>Choose an entry from the vault or create a new one.</p></div>}</section>
    </div>
    {showForm&&<div className="modal-layer"><div className="modal password-entry-modal"><div className="modal-header"><div><div className="panel-kicker">PASSWORD ENTRY</div><h3>{editing?'Edit password':'Add password'}</h3></div><button className="icon-btn" onClick={resetForm}><X size={18}/></button></div><form onSubmit={saveEntry} className="expense-form"><label><span>Website / account name</span><input autoFocus value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. GitHub"/></label><div className="form-grid"><label><span>Username / email</span><input value={form.username} onChange={e=>setForm({...form,username:e.target.value})} placeholder="you@example.com"/></label><label><span>Category</span><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{CATEGORIES.map(item=><option key={item}>{item}</option>)}</select></label></div><label><span>Password</span><div className="secret-input-wrap"><input type={showSecret?'text':'password'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><button type="button" className="secret-input-btn" onClick={()=>setShowSecret(v=>!v)}>{showSecret?<EyeOff size={14}/>:<Eye size={14}/>}</button><button type="button" className="secret-input-btn" onClick={()=>setForm({...form,password:generatePassword()})}><Wand2 size={14}/></button></div></label><div className="strength-meter"><div><span>Password strength</span><strong>{strength.label}</strong></div><div className="strength-track"><i style={{width:String(Math.min(100,strength.score/6*100))+'%'}}/></div></div><label><span>Website URL</span><input value={form.url} onChange={e=>setForm({...form,url:e.target.value})} placeholder="https://example.com"/></label><label><span>Notes</span><textarea rows="4" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Recovery hints, security notes, etc."/></label><label className="toggle-option"><input type="checkbox" checked={form.favorite} onChange={e=>setForm({...form,favorite:e.target.checked})}/><span><strong>Favorite</strong><small>Keep this entry at the top of your vault.</small></span></label>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={resetForm}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':editing?'Save changes':'Add password'}</button></div></form></div></div>}
    {showChange&&<div className="modal-layer"><div className="modal password-entry-modal"><div className="modal-header"><div><div className="panel-kicker">SECURITY</div><h3>Change vault password</h3></div><button className="icon-btn" onClick={()=>setShowChange(false)}><X size={18}/></button></div><form onSubmit={changeMaster} className="expense-form"><label><span>New vault password</span><input type="password" value={newMaster} onChange={e=>setNewMaster(e.target.value)} placeholder="At least 12 characters" autoFocus/></label><label><span>Confirm new password</span><input type="password" value={newMasterConfirm} onChange={e=>setNewMasterConfirm(e.target.value)} placeholder="Repeat the new password"/></label>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setShowChange(false)}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Updating…':'Update password'}</button></div></form></div></div>}
  </div>
}
