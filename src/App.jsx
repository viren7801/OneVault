import { useEffect, useMemo, useState } from 'react'
import { Bell, Check, ChevronRight, CircleDollarSign, LockKeyhole, LogOut, Menu, NotebookPen, Plus, Search, ShieldCheck, Trash2, WalletCards, X } from 'lucide-react'
import { supabase } from './lib/supabase'

const modules = [
  { id: 'pocket', label: 'Pocket', icon: CircleDollarSign, description: 'Expenses, budgets & accounts' },
  { id: 'reminders', label: 'Reminders', icon: Bell, description: 'Tasks, dates & notifications' },
  { id: 'passwords', label: 'Passwords', icon: LockKeyhole, description: 'Private credentials vault' },
  { id: 'notes', label: 'Notes', icon: NotebookPen, description: 'Quick notes & lists' },
]
const categories = ['Food','Shopping','Transport','Bills','Entertainment','Health','Travel','Other']
const money = (n) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n || 0)

function AuthScreen({ onSignedIn }) {
  const [email,setEmail]=useState(import.meta.env.VITE_ALLOWED_EMAIL || '')
  const [password,setPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function submit(e){
    e.preventDefault(); setBusy(true); setError('')
    try {
      const allowed=import.meta.env.VITE_ALLOWED_EMAIL?.trim().toLowerCase()
      if(allowed && email.trim().toLowerCase()!==allowed) throw new Error('This oneVault build is restricted to the owner account.')
      const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password})
      if(error) throw error
      onSignedIn(data.user)
    } catch(err){ setError(err.message || 'Unable to sign in.') }
    finally{ setBusy(false) }
  }
  return <div className="auth-page"><div className="ambient ambient-one"/><div className="ambient ambient-two"/><div className="auth-card">
    <div className="brand-row"><div className="brand-mark">1</div><div><div className="brand-title">oneVault</div><div className="brand-subtitle">Private personal workspace</div></div></div>
    <div className="auth-icon"><ShieldCheck size={24}/></div><div className="panel-kicker">PRIVATE ACCESS</div><h1>Welcome back.</h1><p className="auth-copy">Sign in to your personal oneVault. There is no public registration.</p>
    <form onSubmit={submit} className="auth-form"><label><span>Email</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required/></label><label><span>Password</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>{error&&<div className="form-error">{error}</div>}<button className="primary-btn auth-submit" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form>
    <div className="auth-footnote"><ShieldCheck size={15}/> Protected by Supabase authentication + row-level security.</div>
  </div></div>
}

function ExpenseModal({user,onClose,onSaved}){
  const [amount,setAmount]=useState(''),[category,setCategory]=useState('Food'),[description,setDescription]=useState(''),[spentAt,setSpentAt]=useState(new Date().toISOString().slice(0,16)),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function save(e){
    e.preventDefault(); setError(''); const value=Number(amount)
    if(!value || value<=0){setError('Enter an amount greater than ₹0.');return}
    setBusy(true)
    const {data,error}=await supabase.from('expenses').insert({user_id:user.id,amount:value,type:'expense',category,description:description.trim()||null,spent_at:new Date(spentAt).toISOString()}).select().single()
    if(error) setError(error.message); else onSaved(data); setBusy(false)
  }
  return <div className="modal-layer"><div className="modal expense-modal"><div className="modal-header"><div><div className="panel-kicker">POCKET</div><h3>Add expense</h3></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>
    <form onSubmit={save} className="expense-form"><label className="amount-field"><span>Amount</span><div className="amount-input"><span>₹</span><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" autoFocus/></div></label>
    <div className="form-grid"><label><span>Category</span><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label><span>Date & time</span><input type="datetime-local" value={spentAt} onChange={e=>setSpentAt(e.target.value)}/></label></div>
    <label><span>Description</span><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="What was this for?"/></label>{error&&<div className="form-error">{error}</div>}
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Save expense'}</button></div></form>
  </div></div>
}

function Pocket({user,openExpense}){
  const [expenses,setExpenses]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
  async function load(){setLoading(true);const {data,error}=await supabase.from('expenses').select('*').eq('type','expense').order('spent_at',{ascending:false}).limit(50);if(error)setError(error.message);else setExpenses(data||[]);setLoading(false)}
  useEffect(()=>{load()},[])
  const monthTotal=useMemo(()=>{const now=new Date();return expenses.filter(x=>{const d=new Date(x.spent_at);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}).reduce((s,x)=>s+Number(x.amount),0)},[expenses])
  async function remove(id){const {error}=await supabase.from('expenses').delete().eq('id',id);if(error)setError(error.message);else setExpenses(x=>x.filter(e=>e.id!==id))}
  return <>
    <div className="pocket-summary"><div className="summary-main"><span>This month</span><strong>{money(monthTotal)}</strong><small>Tracked expenses in oneVault</small></div><button className="primary-btn" onClick={openExpense}><Plus size={17}/> Add expense</button></div>
    <section className="panel expense-list-panel"><div className="panel-header"><div><div className="panel-kicker">TRANSACTIONS</div><h3>Recent expenses</h3></div><button className="text-btn" onClick={load}>Refresh</button></div>{error&&<div className="form-error">{error}</div>}
      {loading?<div className="loading-state">Loading your expenses…</div>:expenses.length===0?<div className="empty-state compact-empty"><div className="empty-icon"><WalletCards size={22}/></div><h4>No expenses yet</h4><p>Add your first transaction and it will sync across devices.</p><button className="primary-btn" onClick={openExpense}><Plus size={16}/> Add expense</button></div>:<div className="expense-list">{expenses.slice(0,8).map(x=><div className="expense-row" key={x.id}><div className="expense-category-icon"><CircleDollarSign size={18}/></div><div className="expense-details"><strong>{x.description||x.category}</strong><span>{x.category} · {new Date(x.spent_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</span></div><strong className="expense-amount">-{money(x.amount)}</strong><button className="icon-btn danger-btn" onClick={()=>remove(x.id)}><Trash2 size={16}/></button></div>)}</div>}
    </section>
  </>
}

function App(){
  const [user,setUser]=useState(null),[authLoading,setAuthLoading]=useState(true),[active,setActive]=useState('pocket'),[mobileOpen,setMobileOpen]=useState(false),[quickAdd,setQuickAdd]=useState(false),[expenseModal,setExpenseModal]=useState(false),[reminderCount,setReminderCount]=useState(0)
  const activeModule=useMemo(()=>modules.find(m=>m.id===active),[active])
  useEffect(()=>{let mounted=true;supabase.auth.getSession().then(({data})=>{if(mounted){setUser(data.session?.user||null);setAuthLoading(false)}});const {data:sub}=supabase.auth.onAuthStateChange((_e,session)=>{setUser(session?.user||null);setAuthLoading(false)});return()=>{mounted=false;sub.subscription.unsubscribe()}},[])
  useEffect(()=>{if(user) supabase.from('reminders').select('id',{count:'exact',head:true}).eq('completed',false).then(({count})=>setReminderCount(count||0))},[user])
  if(authLoading)return <div className="loading-screen">Loading oneVault…</div>
  if(!user)return <AuthScreen onSignedIn={setUser}/>
  async function signOut(){await supabase.auth.signOut();setUser(null)}
  return <div className="app-shell"><div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <aside className={`sidebar ${mobileOpen?'open':''}`}><div className="brand-row"><div className="brand-mark">1</div><div><div className="brand-title">oneVault</div><div className="brand-subtitle">Personal workspace</div></div><button className="icon-btn mobile-close" onClick={()=>setMobileOpen(false)}><X size={18}/></button></div>
      <nav className="module-nav"><div className="nav-label">YOUR SPACE</div>{modules.map(m=>{const Icon=m.icon;return <button key={m.id} className={`module-btn ${active===m.id?'selected':''}`} onClick={()=>{setActive(m.id);setMobileOpen(false)}}><span className="module-icon"><Icon size={19}/></span><span className="module-copy"><strong>{m.label}</strong><small>{m.description}</small></span><ChevronRight size={15} className="module-arrow"/></button>})}</nav>
      <div className="sidebar-footer"><div className="privacy-card"><ShieldCheck size={18}/><div><strong>Private mode</strong><span>Owner-only database access.</span></div></div><button className="logout-btn" onClick={signOut}><LogOut size={16}/> Sign out</button></div>
    </aside>{mobileOpen&&<button className="backdrop" onClick={()=>setMobileOpen(false)}/>}<main className="main-area"><header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" onClick={()=>setMobileOpen(true)}><Menu size={20}/></button><div><div className="eyebrow">PRIVATE DASHBOARD</div><h1>{activeModule.label}</h1></div></div><div className="topbar-actions"><button className="icon-btn"><Search size={19}/></button><button className="primary-btn" onClick={()=>active==='pocket'?setExpenseModal(true):setQuickAdd(true)}><Plus size={17}/> Quick add</button></div></header>
      <section className="content"><div className="hero-row"><div><span className="pill"><span className="status-dot"/> Private workspace</span><h2>Everything personal,<br/><span>in one place.</span></h2><p>Expenses, reminders, passwords and notes with one clean interface across your devices.</p></div><div className="date-card"><div className="date-label">TODAY</div><div className="date-value">{new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div><div className="date-helper">{user.email}</div></div></div>
      <div className="stat-grid"><button className="stat-card" onClick={()=>setActive('pocket')}><div className="stat-icon"><WalletCards size={18}/></div><div className="stat-meta"><span>Pocket</span><small>Expense tracker</small></div><strong>Live</strong></button><button className="stat-card" onClick={()=>setActive('reminders')}><div className="stat-icon"><Bell size={18}/></div><div className="stat-meta"><span>Upcoming</span><small>Open reminders</small></div><strong>{reminderCount}</strong></button><button className="stat-card" onClick={()=>setActive('passwords')}><div className="stat-icon"><LockKeyhole size={18}/></div><div className="stat-meta"><span>Vault</span><small>Secure credentials</small></div><strong>Ready</strong></button><button className="stat-card" onClick={()=>setActive('notes')}><div className="stat-icon"><NotebookPen size={18}/></div><div className="stat-meta"><span>Notes</span><small>Personal workspace</small></div><strong>Ready</strong></button></div>
      {active==='pocket'?<Pocket user={user} openExpense={()=>setExpenseModal(true)}/>:<div className="workspace-grid"><section className="panel large-panel"><div className="panel-header"><div><div className="panel-kicker">MODULE</div><h3>{activeModule.label}</h3></div><button className="text-btn" onClick={()=>setQuickAdd(true)}>Add new <Plus size={15}/></button></div><div className="empty-state"><div className="empty-icon">{(()=>{const Icon=activeModule.icon;return <Icon size={25}/>})()}</div><h4>{activeModule.label} is next</h4><p>The secure backend is ready. We’ll build this module next.</p><button className="primary-btn" onClick={()=>setQuickAdd(true)}><Plus size={16}/> Explore actions</button></div></section><section className="panel security-panel"><div className="panel-kicker">SECURITY FOUNDATION</div><h3>Private by design.</h3><p>Authentication and database access are enforced before sensitive data is connected.</p><div className="security-list"><div><Check size={16}/> Owner-only access</div><div><Check size={16}/> Row-level security</div><div><Check size={16}/> Encrypted password vault</div><div><Check size={16}/> Cross-device sync</div></div></section></div>}
      </section></main>
    {quickAdd&&<div className="modal-layer"><div className="modal"><div className="modal-header"><div><div className="panel-kicker">QUICK ADD</div><h3>What do you want to create?</h3></div><button className="icon-btn" onClick={()=>setQuickAdd(false)}><X size={18}/></button></div><div className="quick-grid">{modules.map(m=>{const Icon=m.icon;return <button key={m.id} className="quick-option" onClick={()=>{setActive(m.id);setQuickAdd(false);if(m.id==='pocket')setExpenseModal(true)}}><span className="module-icon"><Icon size={20}/></span><span><strong>{m.label}</strong><small>{m.description}</small></span><ChevronRight size={15}/></button>})}</div></div></div>}
    {expenseModal&&<ExpenseModal user={user} onClose={()=>setExpenseModal(false)} onSaved={()=>setExpenseModal(false)}/>}</div>
}
export default App
