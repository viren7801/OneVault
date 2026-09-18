import React, { useEffect, useMemo, useState } from 'react'
import {
  Bell, Check, ChevronRight, CircleDollarSign, CreditCard, Edit3, Filter,
  LockKeyhole, LogOut, Menu, NotebookPen, Plus, Search, ShieldCheck,
  Trash2, WalletCards, X, TrendingDown, TrendingUp, PiggyBank, RefreshCw,
} from 'lucide-react'
import { supabase } from './lib/supabase'

const modules = [
  { id: 'pocket', label: 'Pocket', icon: CircleDollarSign, description: 'Expenses, budgets & accounts' },
  { id: 'reminders', label: 'Reminders', icon: Bell, description: 'Tasks, dates & notifications' },
  { id: 'passwords', label: 'Passwords', icon: LockKeyhole, description: 'Private credentials vault' },
  { id: 'notes', label: 'Notes', icon: NotebookPen, description: 'Quick notes & lists' },
]

const categories = ['Food', 'Shopping', 'Transport', 'Bills', 'Entertainment', 'Health', 'Travel', 'Other']
const accountTypes = ['Cash', 'Bank', 'Credit Card', 'Wallet', 'Investment', 'Other']
const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0)
const monthStart = (offset = 0) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + offset, 1) }
const monthKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` }
const monthLabel = (d) => new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })

function AuthScreen({ onSignedIn }) {
  const [email, setEmail] = useState(import.meta.env.VITE_ALLOWED_EMAIL || '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const allowed = import.meta.env.VITE_ALLOWED_EMAIL?.trim().toLowerCase()
      if (allowed && email.trim().toLowerCase() !== allowed) throw new Error('This oneVault build is restricted to the owner account.')
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      onSignedIn(data.user)
    } catch (err) { setError(err.message || 'Unable to sign in.') }
    finally { setBusy(false) }
  }

  return <div className="auth-page"><div className="ambient ambient-one"/><div className="ambient ambient-two"/><div className="auth-card">
    <div className="brand-row"><div className="brand-mark">1</div><div><div className="brand-title">oneVault</div><div className="brand-subtitle">Private personal workspace</div></div></div>
    <div className="auth-icon"><ShieldCheck size={24}/></div><div className="panel-kicker">PRIVATE ACCESS</div><h1>Welcome back.</h1><p className="auth-copy">Sign in to your personal oneVault. There is no public registration.</p>
    <form onSubmit={submit} className="auth-form"><label><span>Email</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required/></label><label><span>Password</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>{error&&<div className="form-error">{error}</div>}<button className="primary-btn auth-submit" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form>
    <div className="auth-footnote"><ShieldCheck size={15}/> Protected by Supabase authentication + row-level security.</div>
  </div></div>
}

function TransactionModal({ user, accounts, initial, onClose, onSaved }) {
  const isEdit = Boolean(initial?.id)
  const [type, setType] = useState(initial?.type || 'expense')
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [category, setCategory] = useState(initial?.category || 'Food')
  const [description, setDescription] = useState(initial?.description || '')
  const [accountId, setAccountId] = useState(initial?.account_id || '')
  const [spentAt, setSpentAt] = useState(initial?.spent_at ? new Date(initial.spent_at).toISOString().slice(0,16) : new Date().toISOString().slice(0,16))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault(); setBusy(true); setError('')
    const value = Number(amount)
    if (!value || value <= 0) { setError('Enter an amount greater than ₹0.'); setBusy(false); return }

    try {
      const payload = {
        user_id: user.id, amount: value, type, category,
        description: description.trim() || null,
        account_id: accountId || null,
        spent_at: new Date(spentAt).toISOString(),
      }
      if (isEdit) {
        const { data, error } = await supabase.from('expenses').update(payload).eq('id', initial.id).eq('user_id', user.id).select().single()
        if (error) throw error
        await onSaved(data, initial)
      } else {
        const { data, error } = await supabase.from('expenses').insert(payload).select().single()
        if (error) throw error
        await onSaved(data, null)
      }
      onClose()
    } catch (err) { setError(err.message || 'Unable to save transaction.') }
    finally { setBusy(false) }
  }

  return <div className="modal-layer"><div className="modal expense-modal">
    <div className="modal-header"><div><div className="panel-kicker">POCKET</div><h3>{isEdit ? 'Edit transaction' : 'Add transaction'}</h3></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>
    <div className="segmented"><button className={type==='expense'?'active':''} onClick={()=>setType('expense')} type="button"><TrendingDown size={15}/> Expense</button><button className={type==='income'?'active':''} onClick={()=>setType('income')} type="button"><TrendingUp size={15}/> Income</button></div>
    <form onSubmit={save} className="expense-form"><label className="amount-field"><span>Amount</span><div className="amount-input"><span>₹</span><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" autoFocus/></div></label>
      <div className="form-grid"><label><span>Category</span><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label><span>Account</span><select value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">No account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
      <div className="form-grid"><label><span>Date & time</span><input type="datetime-local" value={spentAt} onChange={e=>setSpentAt(e.target.value)}/></label><label><span>Description</span><input value={description} onChange={e=>setDescription(e.target.value)} placeholder="What was this for?"/></label></div>
      {error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':isEdit?'Save changes':'Save transaction'}</button></div>
    </form>
  </div></div>
}

function AccountModal({ user, initial, onClose, onSaved }) {
  const [name, setName] = useState(initial?.name || '')
  const [type, setType] = useState(initial?.type ? initial.type.replace(/(^|\s)\S/g, s=>s.toUpperCase()) : 'Bank')
  const [balance, setBalance] = useState(initial ? String(initial.balance) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const payload = { user_id: user.id, name: name.trim(), type: type.toLowerCase(), balance: Number(balance) || 0 }
      if (!payload.name) throw new Error('Enter an account name.')
      const response = initial
        ? await supabase.from('accounts').update(payload).eq('id', initial.id).eq('user_id', user.id).select().single()
        : await supabase.from('accounts').insert(payload).select().single()
      if (response.error) throw response.error
      onSaved(response.data); onClose()
    } catch (err) { setError(err.message || 'Unable to save account.') }
    finally { setBusy(false) }
  }
  return <div className="modal-layer"><div className="modal">
    <div className="modal-header"><div><div className="panel-kicker">POCKET</div><h3>{initial?'Edit account':'Add account'}</h3></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>
    <form onSubmit={save} className="expense-form"><label><span>Name</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. HDFC Bank" autoFocus/></label><div className="form-grid"><label><span>Type</span><select value={type} onChange={e=>setType(e.target.value)}>{accountTypes.map(t=><option key={t}>{t}</option>)}</select></label><label><span>Current balance</span><input inputMode="decimal" value={balance} onChange={e=>setBalance(e.target.value)} placeholder="0"/></label></div>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Save account'}</button></div></form>
  </div></div>
}

function BudgetModal({ user, initial, onClose, onSaved }) {
  const [category, setCategory] = useState(initial?.category || 'Food')
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const value = Number(amount)
      if (!value || value <= 0) throw new Error('Enter a budget greater than ₹0.')
      const month = `${monthKey(new Date())}-01`
      const { data, error } = await supabase.from('budgets').upsert({ user_id: user.id, category, amount: value, month }, { onConflict: 'user_id,category,month' }).select().single()
      if (error) throw error
      onSaved(data); onClose()
    } catch (err) { setError(err.message || 'Unable to save budget.') }
    finally { setBusy(false) }
  }
  return <div className="modal-layer"><div className="modal">
    <div className="modal-header"><div><div className="panel-kicker">POCKET</div><h3>Set monthly budget</h3></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>
    <form onSubmit={save} className="expense-form"><label><span>Category</span><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label><span>Budget amount</span><div className="amount-input"><span>₹</span><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"/></div></label>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Save budget'}</button></div></form>
  </div></div>
}

function Pocket({ user, onQuickAdd }) {
  const [transactions, setTransactions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [accountModal, setAccountModal] = useState(null)
  const [budgetModal, setBudgetModal] = useState(null)
  const [editing, setEditing] = useState(null)
  const [transactionModal, setTransactionModal] = useState(null)

  async function load() {
    setLoading(true); setError('')
    const start = monthStart(-6).toISOString()
    const [tx, ac, bu] = await Promise.all([
      supabase.from('expenses').select('*').gte('spent_at', start).order('spent_at', { ascending: false }).limit(500),
      supabase.from('accounts').select('*').order('created_at', { ascending: true }),
      supabase.from('budgets').select('*').eq('month', `${monthKey(new Date())}-01`).order('category'),
    ])
    if (tx.error || ac.error || bu.error) setError(tx.error?.message || ac.error?.message || bu.error?.message || 'Unable to load Pocket data.')
    setTransactions(tx.data || []); setAccounts(ac.data || []); setBudgets(bu.data || []); setLoading(false)
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    function handleOpen(event) { setTransactionModal({ type: event.detail || 'expense' }) }
    window.addEventListener('onevault:open-transaction', handleOpen)
    return () => window.removeEventListener('onevault:open-transaction', handleOpen)
  }, [])

  const currentMonth = monthKey(new Date())
  const current = useMemo(() => transactions.filter(x => monthKey(x.spent_at) === currentMonth), [transactions])
  const income = useMemo(() => current.filter(x=>x.type==='income').reduce((s,x)=>s+Number(x.amount),0), [current])
  const expenses = useMemo(() => current.filter(x=>x.type==='expense').reduce((s,x)=>s+Number(x.amount),0), [current])
  const balance = income - expenses
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return transactions.filter(x => {
      const matchesType = filter === 'all' || x.type === filter
      const matchesQuery = !q || `${x.description || ''} ${x.category}`.toLowerCase().includes(q)
      return matchesType && matchesQuery
    }).slice(0, 120)
  }, [transactions, query, filter])

  const categoryTotals = useMemo(() => categories.map(category => ({ category, total: current.filter(x=>x.type==='expense' && x.category===category).reduce((s,x)=>s+Number(x.amount),0) })).filter(x=>x.total>0).sort((a,b)=>b.total-a.total), [current])
  const maxCategory = Math.max(1, ...categoryTotals.map(x=>x.total))
  const sixMonths = useMemo(() => Array.from({ length: 6 }, (_, i) => { const d = monthStart(i-5); const key=monthKey(d); return { key, label:d.toLocaleDateString('en-IN',{month:'short'}), total:transactions.filter(x=>x.type==='expense' && monthKey(x.spent_at)===key).reduce((s,x)=>s+Number(x.amount),0) } }), [transactions])
  const maxSix = Math.max(1, ...sixMonths.map(x=>x.total))

  async function adjustBalance(accountId, delta) {
    if (!accountId || !delta) return
    const account = accounts.find(a=>a.id===accountId)
    if (!account) return
    const next = Number(account.balance) + delta
    const { data, error } = await supabase.from('accounts').update({ balance: next }).eq('id', accountId).eq('user_id', user.id).select().single()
    if (!error && data) setAccounts(items => items.map(a => a.id===data.id ? data : a))
  }

  async function saveTransaction(next, previous) {
    if (previous) {
      const oldDelta = previous.type === 'income' ? -Number(previous.amount) : Number(previous.amount)
      await adjustBalance(previous.account_id, oldDelta)
    }
    const newDelta = next.type === 'income' ? Number(next.amount) : -Number(next.amount)
    await adjustBalance(next.account_id, newDelta)
    setTransactions(items => previous ? items.map(t => t.id===next.id ? next : t) : [next, ...items])
  }

  async function deleteTransaction(tx) {
    if (!window.confirm(`Delete ${tx.type} of ${money(tx.amount)}?`)) return
    const { error } = await supabase.from('expenses').delete().eq('id', tx.id).eq('user_id', user.id)
    if (error) { setError(error.message); return }
    const restore = tx.type === 'income' ? -Number(tx.amount) : Number(tx.amount)
    await adjustBalance(tx.account_id, restore)
    setTransactions(items => items.filter(x=>x.id!==tx.id))
  }

  async function deleteAccount(account) {
    if (!window.confirm(`Delete ${account.name}? Transactions will stay but lose their account link.`)) return
    const { error } = await supabase.from('accounts').delete().eq('id', account.id).eq('user_id', user.id)
    if (error) setError(error.message); else setAccounts(items => items.filter(x=>x.id!==account.id))
  }

  async function deleteBudget(id) {
    const { error } = await supabase.from('budgets').delete().eq('id', id).eq('user_id', user.id)
    if (error) setError(error.message); else setBudgets(items=>items.filter(x=>x.id!==id))
  }

  if (loading) return <div className="loading-state pocket-loading">Loading Pocket…</div>

  return <div className="pocket-page">
    <div className="pocket-toolbar"><div><div className="panel-kicker">POCKET</div><h2>Money, without the mess.</h2><p>Track cash flow, accounts and monthly limits in one view.</p></div><div className="pocket-actions"><button className="secondary-btn" onClick={load}><RefreshCw size={15}/> Refresh</button><button className="secondary-btn" onClick={()=>setAccountModal({})}><CreditCard size={15}/> Account</button><button className="secondary-btn" onClick={()=>setBudgetModal({})}><PiggyBank size={15}/> Budget</button><button className="primary-btn" onClick={()=>onQuickAdd('expense')}><Plus size={16}/> Transaction</button></div></div>

    {error&&<div className="form-error pocket-error">{error}</div>}

    <div className="pocket-kpis"><div className="money-card"><span>Income · {monthLabel(new Date())}</span><strong>{money(income)}</strong><small><TrendingUp size={13}/> Money in</small></div><div className="money-card"><span>Expenses · {monthLabel(new Date())}</span><strong>{money(expenses)}</strong><small><TrendingDown size={13}/> Money out</small></div><div className="money-card"><span>Net this month</span><strong className={balance>=0?'positive':''}>{money(balance)}</strong><small><CircleDollarSign size={13}/> Income minus expenses</small></div><div className="money-card"><span>Accounts</span><strong>{accounts.length}</strong><small><WalletCards size={13}/> Linked accounts</small></div></div>

    <div className="pocket-chart-grid"><section className="panel chart-panel"><div className="panel-header"><div><div className="panel-kicker">SPENDING</div><h3>Last 6 months</h3></div></div><div className="bar-chart">{sixMonths.map(item=><div className="bar-col" key={item.key}><div className="bar-value">{item.total ? money(item.total) : '—'}</div><div className="bar-track"><div className="bar-fill" style={{height:`${Math.max(6,(item.total/maxSix)*100)}%`}}/></div><span>{item.label}</span></div>)}</div></section>
      <section className="panel chart-panel"><div className="panel-header"><div><div className="panel-kicker">THIS MONTH</div><h3>By category</h3></div></div><div className="category-bars">{categoryTotals.length===0?<div className="small-muted">No expenses recorded this month.</div>:categoryTotals.slice(0,6).map(item=><div className="category-row" key={item.category}><div><span>{item.category}</span><strong>{money(item.total)}</strong></div><div className="category-track"><div className="category-fill" style={{width:`${(item.total/maxCategory)*100}%`}}/></div></div>)}</div></section></div>

    <div className="pocket-columns"><section className="panel transactions-panel"><div className="panel-header"><div><div className="panel-kicker">TRANSACTIONS</div><h3>History</h3></div><span className="results-count">{filtered.length} shown</span></div><div className="transaction-filters"><div className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search description or category"/></div><div className="filter-tabs"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>All</button><button className={filter==='expense'?'active':''} onClick={()=>setFilter('expense')}>Expenses</button><button className={filter==='income'?'active':''} onClick={()=>setFilter('income')}>Income</button></div><Filter size={15} className="filter-icon"/></div>
      {filtered.length===0?<div className="empty-state compact-empty"><div className="empty-icon"><WalletCards size={22}/></div><h4>No matching transactions</h4><p>Try another search or add a new transaction.</p><button className="primary-btn" onClick={()=>onQuickAdd('expense')}><Plus size={16}/> Add transaction</button></div>:<div className="transaction-table"><div className="tx-head"><span>Transaction</span><span>Account</span><span>Date</span><span>Amount</span><span/></div>{filtered.map(tx=>{const account=accounts.find(a=>a.id===tx.account_id);return <div className="tx-row" key={tx.id}><div className="tx-main"><div className={`tx-icon ${tx.type}`}><CircleDollarSign size={16}/></div><div><strong>{tx.description||tx.category}</strong><small>{tx.category}</small></div></div><span>{account?.name || '—'}</span><span>{new Date(tx.spent_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</span><strong className={tx.type==='income'?'income-text':'expense-text'}>{tx.type==='income'?'+':'-'}{money(tx.amount)}</strong><div className="row-actions"><button className="icon-btn" onClick={()=>setEditing(tx)}><Edit3 size={14}/></button><button className="icon-btn danger-btn" onClick={()=>deleteTransaction(tx)}><Trash2 size={14}/></button></div></div>})}</div>}
    </section>

    <aside className="pocket-side"><section className="panel accounts-panel"><div className="panel-header"><div><div className="panel-kicker">ACCOUNTS</div><h3>Your money</h3></div><button className="icon-btn" onClick={()=>setAccountModal({})}><Plus size={16}/></button></div>{accounts.length===0?<div className="side-empty">Add a bank, cash wallet or card.</div>:<div className="account-list">{accounts.map(account=><div className="account-row" key={account.id}><div className="module-icon"><CreditCard size={16}/></div><div><strong>{account.name}</strong><small>{account.type}</small></div><div className="account-right"><strong>{money(account.balance)}</strong><div><button onClick={()=>setAccountModal(account)} className="mini-btn"><Edit3 size={12}/></button><button onClick={()=>deleteAccount(account)} className="mini-btn danger"><Trash2 size={12}/></button></div></div></div>)}</div>}</section>
      <section className="panel budgets-panel"><div className="panel-header"><div><div className="panel-kicker">BUDGETS</div><h3>This month</h3></div><button className="icon-btn" onClick={()=>setBudgetModal({})}><Plus size={16}/></button></div>{budgets.length===0?<div className="side-empty">Set category limits to keep spending on track.</div>:<div className="budget-list">{budgets.map(b=>{const spent=current.filter(x=>x.type==='expense'&&x.category===b.category).reduce((s,x)=>s+Number(x.amount),0);const pct=Math.min(100,(spent/Number(b.amount))*100);return <div className="budget-row" key={b.id}><div><strong>{b.category}</strong><span>{money(spent)} of {money(b.amount)}</span></div><div className="budget-track"><div className={`budget-fill ${pct>=100?'over':''}`} style={{width:`${pct}%`}}/></div><div className="budget-foot"><small>{Math.round(pct)}% used</small><button className="mini-btn danger" onClick={()=>deleteBudget(b.id)}><Trash2 size={12}/></button></div></div>})}</div>}</section></aside></div>

    {transactionModal&&<TransactionModal user={user} accounts={accounts} initial={transactionModal} onClose={()=>setTransactionModal(null)} onSaved={saveTransaction}/>} {editing&&<TransactionModal user={user} accounts={accounts} initial={editing} onClose={()=>setEditing(null)} onSaved={saveTransaction}/>} {accountModal!==null&&<AccountModal user={user} initial={accountModal?.id?accountModal:null} onClose={()=>setAccountModal(null)} onSaved={data=>setAccounts(items=>accountModal?.id?items.map(a=>a.id===data.id?data:a):[...items,data])}/>} {budgetModal!==null&&<BudgetModal user={user} initial={budgetModal?.id?budgetModal:null} onClose={()=>setBudgetModal(null)} onSaved={data=>setBudgets(items=>{const i=items.findIndex(b=>b.id===data.id);return i>=0?items.map(b=>b.id===data.id?data:b):[...items,data]})}/>} 
  </div>
}


const reminderPriorities = ['low', 'medium', 'high']
const reminderRepeats = [
  { value: '', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
]
const toDateTimeLocal = (value) => {
  const d = value ? new Date(value) : new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const reminderDateKey = (value) => {
  const d = new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const startOfDay = (value = new Date()) => {
  const d = new Date(value)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
const sameCalendarDay = (a, b) => reminderDateKey(a) === reminderDateKey(b)
const nextReminderDate = (value, rule) => {
  const d = new Date(value)
  if (rule === 'daily') d.setDate(d.getDate() + 1)
  if (rule === 'weekly') d.setDate(d.getDate() + 7)
  if (rule === 'monthly') d.setMonth(d.getMonth() + 1)
  if (rule === 'yearly') d.setFullYear(d.getFullYear() + 1)
  return d
}
const formatReminderTime = (value) => new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
const formatReminderDate = (value) => new Date(value).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })

function ReminderModal({ user, initial, onClose, onSaved }) {
  const isEdit = Boolean(initial?.id)
  const [title, setTitle] = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [dueAt, setDueAt] = useState(toDateTimeLocal(initial?.due_at))
  const [priority, setPriority] = useState(initial?.priority || 'medium')
  const [repeatRule, setRepeatRule] = useState(initial?.repeat_rule || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (!title.trim()) throw new Error('Enter a reminder title.')
      const due = new Date(dueAt)
      if (Number.isNaN(due.getTime())) throw new Error('Choose a valid date and time.')
      const payload = {
        user_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        due_at: due.toISOString(),
        repeat_rule: repeatRule || null,
        priority,
        completed: initial?.completed || false,
      }
      const response = isEdit
        ? await supabase.from('reminders').update(payload).eq('id', initial.id).eq('user_id', user.id).select().single()
        : await supabase.from('reminders').insert(payload).select().single()
      if (response.error) throw response.error
      await onSaved(response.data, initial || null)
      onClose()
    } catch (err) {
      setError(err.message || 'Unable to save reminder.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="modal-layer"><div className="modal reminder-modal">
    <div className="modal-header">
      <div><div className="panel-kicker">REMINDERS</div><h3>{isEdit ? 'Edit reminder' : 'New reminder'}</h3></div>
      <button className="icon-btn" onClick={onClose}><X size={18}/></button>
    </div>
    <form onSubmit={save} className="expense-form">
      <label><span>Title</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="What do you need to remember?" autoFocus /></label>
      <label><span>Description</span><textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Add some context…" rows="3" /></label>
      <div className="form-grid">
        <label><span>Date & time</span><input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} /></label>
        <label><span>Priority</span><select value={priority} onChange={e=>setPriority(e.target.value)}>{reminderPriorities.map(item=><option key={item} value={item}>{item[0].toUpperCase()+item.slice(1)}</option>)}</select></label>
      </div>
      <label><span>Repeat</span><select value={repeatRule} onChange={e=>setRepeatRule(e.target.value)}>{reminderRepeats.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      {error&&<div className="form-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':isEdit?'Save changes':'Create reminder'}</button></div>
    </form>
  </div></div>
}

function Reminders({ user }) {
  const [reminders, setReminders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [viewDate, setViewDate] = useState(startOfDay(new Date()))
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()))
  const [hoveredDate, setHoveredDate] = useState(null)
  const [modal, setModal] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase.from('reminders').select('*').order('due_at', { ascending: true }).limit(1000)
    if (error) setError(error.message)
    setReminders(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    function handleOpen() { setModal({}) }
    window.addEventListener('onevault:open-reminder', handleOpen)
    return () => window.removeEventListener('onevault:open-reminder', handleOpen)
  }, [])

  const today = startOfDay(new Date())
  const pendingCount = reminders.filter(r => !r.completed).length
  const todayCount = reminders.filter(r => !r.completed && sameCalendarDay(r.due_at, today)).length
  const overdueCount = reminders.filter(r => !r.completed && new Date(r.due_at) < new Date()).length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return reminders.filter(r => {
      const matchesQuery = !q || `${r.title} ${r.description || ''}`.toLowerCase().includes(q)
      const matchesFilter =
        filter === 'all' ||
        (filter === 'pending' && !r.completed) ||
        (filter === 'completed' && r.completed) ||
        (filter === 'today' && !r.completed && sameCalendarDay(r.due_at, today)) ||
        (filter === 'overdue' && !r.completed && new Date(r.due_at) < new Date())
      return matchesQuery && matchesFilter
    })
  }, [reminders, query, filter])

  const monthStartDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const firstCalendarDay = new Date(monthStartDate)
  firstCalendarDay.setDate(1 - monthStartDate.getDay())
  const calendarDays = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(firstCalendarDay)
    d.setDate(firstCalendarDay.getDate() + i)
    return d
  })
  const selectedItems = filtered.filter(r => sameCalendarDay(r.due_at, selectedDate)).sort((a,b)=>new Date(a.due_at)-new Date(b.due_at))
  const reminderDraftForDay = (day) => { const due = new Date(day); due.setHours(9, 0, 0, 0); return { due_at: due.toISOString() } }
  const upcoming = filtered.filter(r => new Date(r.due_at) >= today).slice().sort((a,b)=>new Date(a.due_at)-new Date(b.due_at)).slice(0, 8)

  function saveReminder(data, previous) {
    setReminders(items => previous
      ? items.map(item => item.id === data.id ? data : item).sort((a,b)=>new Date(a.due_at)-new Date(b.due_at))
      : [...items, data].sort((a,b)=>new Date(a.due_at)-new Date(b.due_at)))
  }

  async function toggleComplete(reminder) {
    try {
      const nextCompleted = !reminder.completed
      const { data, error } = await supabase.from('reminders').update({ completed: nextCompleted }).eq('id', reminder.id).eq('user_id', user.id).select().single()
      if (error) throw error

      if (nextCompleted && reminder.repeat_rule) {
        const nextDue = nextReminderDate(reminder.due_at, reminder.repeat_rule)
        const { data: nextReminder, error: nextError } = await supabase.from('reminders').insert({
          user_id: user.id,
          title: reminder.title,
          description: reminder.description,
          due_at: nextDue.toISOString(),
          repeat_rule: reminder.repeat_rule,
          priority: reminder.priority,
          completed: false,
        }).select().single()
        if (nextError) throw nextError
        setReminders(items => [nextReminder, ...items.map(item => item.id === reminder.id ? data : item)].sort((a,b)=>new Date(a.due_at)-new Date(b.due_at)))
      } else {
        setReminders(items => items.map(item => item.id === reminder.id ? data : item))
      }
    } catch (err) { setError(err.message || 'Unable to update reminder.') }
  }

  async function snooze(reminder, minutes) {
    try {
      const due = new Date(reminder.due_at)
      due.setMinutes(due.getMinutes() + minutes)
      const { data, error } = await supabase.from('reminders').update({ due_at: due.toISOString(), completed: false }).eq('id', reminder.id).eq('user_id', user.id).select().single()
      if (error) throw error
      setReminders(items => items.map(item => item.id === reminder.id ? data : item))
    } catch (err) { setError(err.message || 'Unable to snooze reminder.') }
  }

  async function deleteReminder(reminder) {
    if (!window.confirm('Delete “' + reminder.title + '”?')) return
    const { error } = await supabase.from('reminders').delete().eq('id', reminder.id).eq('user_id', user.id)
    if (error) { setError(error.message); return }
    setReminders(items => items.filter(item => item.id !== reminder.id))
    if (modal?.id === reminder.id) setModal(null)
  }

  function shiftMonth(offset) {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1))
  }

  if (loading) return <div className="loading-state reminders-loading">Loading reminders…</div>

  return <div className="reminders-page">
    <div className="reminders-toolbar">
      <div><div className="panel-kicker">REMINDERS</div><h2>Everything you don't want to forget.</h2><p>Plan your day, schedule repeats and keep the important things visible.</p></div>
      <div className="reminders-actions"><button className="secondary-btn" onClick={load}><RefreshCw size={15}/> Refresh</button><button className="primary-btn" onClick={()=>setModal({})}><Plus size={16}/> New reminder</button></div>
    </div>
    {error&&<div className="form-error pocket-error">{error}</div>}
    <div className="reminder-kpis">
      <button className={`reminder-stat ${filter==='pending'?'active':''}`} onClick={()=>setFilter('pending')}><strong>{pendingCount}</strong><span>Pending</span></button>
      <button className={`reminder-stat ${filter==='today'?'active':''}`} onClick={()=>setFilter('today')}><strong>{todayCount}</strong><span>Today</span></button>
      <button className={`reminder-stat ${filter==='overdue'?'active':''}`} onClick={()=>setFilter('overdue')}><strong>{overdueCount}</strong><span>Overdue</span></button>
      <button className={`reminder-stat ${filter==='completed'?'active':''}`} onClick={()=>setFilter('completed')}><strong>{reminders.filter(r=>r.completed).length}</strong><span>Completed</span></button>
    </div>
    <div className="reminders-layout">
      <section className="panel calendar-panel">
        <div className="panel-header">
          <div><div className="panel-kicker">CALENDAR</div><h3>{viewDate.toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</h3></div>
          <div className="calendar-nav"><button className="icon-btn" onClick={()=>shiftMonth(-1)}><ChevronRight size={16} className="rotate-180"/></button><button className="icon-btn" onClick={()=>setViewDate(startOfDay(new Date()))}>Today</button><button className="icon-btn" onClick={()=>shiftMonth(1)}><ChevronRight size={16}/></button></div>
        </div>
        <div className="reminder-search"><div className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search reminders"/></div><div className="filter-tabs"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>All</button><button className={filter==='pending'?'active':''} onClick={()=>setFilter('pending')}>Open</button><button className={filter==='completed'?'active':''} onClick={()=>setFilter('completed')}>Done</button></div></div>
        <div className="calendar-grid calendar-weekdays">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><span key={d}>{d}</span>)}</div>
        <div className="calendar-grid">
          {calendarDays.map(day => {
            const dayItems = filtered.filter(r => sameCalendarDay(r.due_at, day))
            const inMonth = day.getMonth() === viewDate.getMonth()
            const selected = sameCalendarDay(day, selectedDate)
            const dateKey = reminderDateKey(day)
            const previewItems = reminders.filter(r => sameCalendarDay(r.due_at, day)).sort((a,b)=>new Date(a.due_at)-new Date(b.due_at))
            const showPreview = hoveredDate === dateKey
            return <div key={day.toISOString()} className={`calendar-day ${inMonth?'':'muted'} ${sameCalendarDay(day,today)?'today':''} ${selected?'selected':''} ${showPreview?'preview-open':''}`} onMouseEnter={()=>setHoveredDate(dateKey)} onMouseLeave={()=>setHoveredDate(null)} onFocus={()=>setHoveredDate(dateKey)} onBlur={()=>setHoveredDate(null)} onClick={()=>setSelectedDate(startOfDay(day))} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedDate(startOfDay(day))}}}>
              <span className="calendar-number">{day.getDate()}</span>
              {dayItems.length>0&&<div className="calendar-dots">{dayItems.slice(0,3).map(item=><i key={item.id} className={`priority-dot ${item.priority||'medium'} ${item.completed?'done':''}`}/>)}{dayItems.length>3&&<b>+{dayItems.length-3}</b>}</div>}
              {showPreview&&<div className="calendar-preview" onClick={e=>e.stopPropagation()}>
                <div className="calendar-preview-head"><strong>{day.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}</strong><span>{previewItems.length ? `${previewItems.length} reminder${previewItems.length===1?'':'s'}` : 'Nothing scheduled'}</span></div>
                {previewItems.length===0
                  ? <div className="calendar-preview-empty">No reminders</div>
                  : <div className="calendar-preview-list">{previewItems.slice(0,4).map(item=><div className={`calendar-preview-item ${item.completed?'done':''}`} key={item.id}><i className={`priority-dot ${item.priority||'medium'}`}/><div><strong>{item.title}</strong><span>{formatReminderTime(item.due_at)}{item.completed?' · Done':''}</span></div></div>)}{previewItems.length>4&&<div className="calendar-preview-more">+{previewItems.length-4} more</div>}</div>}
                <button type="button" className="calendar-preview-add" onClick={()=>setModal(reminderDraftForDay(day))}><Plus size={13}/> Add reminder</button>
              </div>}
            </div>
          })}
        </div>
      </section>
      <aside className="reminders-side">
        <section className="panel agenda-panel">
          <div className="panel-header"><div><div className="panel-kicker">AGENDA</div><h3>{selectedDate.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'})}</h3></div><span className="results-count">{selectedItems.length}</span></div>
          <div className="reminder-list">
            {selectedItems.length===0?<div className="side-empty">Nothing scheduled for this day.</div>:selectedItems.map(reminder=><ReminderRow key={reminder.id} reminder={reminder} onEdit={()=>setModal(reminder)} onDelete={()=>deleteReminder(reminder)} onToggle={()=>toggleComplete(reminder)} onSnooze={snooze}/>)}
          </div>
        </section>
        <section className="panel agenda-panel">
          <div className="panel-header"><div><div className="panel-kicker">UP NEXT</div><h3>Coming up</h3></div></div>
          <div className="reminder-list">
            {upcoming.length===0?<div className="side-empty">No upcoming reminders.</div>:upcoming.map(reminder=><ReminderRow key={reminder.id} reminder={reminder} compact onEdit={()=>setModal(reminder)} onDelete={()=>deleteReminder(reminder)} onToggle={()=>toggleComplete(reminder)} onSnooze={snooze}/>)}
          </div>
        </section>
      </aside>
    </div>
    {modal&&<ReminderModal user={user} initial={modal} onClose={()=>setModal(null)} onSaved={saveReminder}/>}
  </div>
}

function ReminderRow({ reminder, compact = false, onEdit, onDelete, onToggle, onSnooze }) {
  const overdue = !reminder.completed && new Date(reminder.due_at) < new Date()
  return <div className={`reminder-row ${reminder.completed?'completed':''} ${compact?'compact':''}`}>
    <button className={`check-reminder ${reminder.completed?'checked':''}`} onClick={onToggle} title={reminder.completed?'Mark open':'Mark complete'}>{reminder.completed?<Check size={14}/>:null}</button>
    <div className="reminder-main">
      <strong>{reminder.title}</strong>
      {reminder.description&&<small>{reminder.description}</small>}
      <div className="reminder-meta"><span className={`priority-pill ${reminder.priority||'medium'}`}>{reminder.priority||'medium'}</span>{reminder.repeat_rule&&<span>{reminder.repeat_rule}</span>}<span className={overdue?'overdue-text':''}>{formatReminderDate(reminder.due_at)} · {formatReminderTime(reminder.due_at)}</span></div>
    </div>
    <div className="reminder-actions">
      {!reminder.completed&&<button className="mini-btn" onClick={()=>onSnooze(reminder,15)} title="Snooze 15 min">+15</button>}
      <button className="mini-btn" onClick={onEdit} title="Edit"><Edit3 size={12}/></button>
      <button className="mini-btn danger" onClick={onDelete} title="Delete"><Trash2 size={12}/></button>
    </div>
  </div>
}


function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [active, setActive] = useState('pocket')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [quickAdd, setQuickAdd] = useState(false)
  const [transactionType, setTransactionType] = useState('expense')
  const activeModule = useMemo(() => modules.find(m => m.id === active), [active])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => { if (mounted) { setUser(data.session?.user || null); setAuthLoading(false) } })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { setUser(session?.user || null); setAuthLoading(false) })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  if (authLoading) return <div className="loading-screen">Loading oneVault…</div>
  if (!user) return <AuthScreen onSignedIn={setUser}/>

  async function signOut() { await supabase.auth.signOut(); setUser(null) }
  function openTransaction(type = 'expense') { setTransactionType(type); setQuickAdd(false); window.dispatchEvent(new CustomEvent('onevault:open-transaction', { detail: type })) }
  function openReminder() { setQuickAdd(false); window.dispatchEvent(new CustomEvent('onevault:open-reminder')) }

  return <div className="app-shell"><div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <aside className={`sidebar ${mobileOpen?'open':''}`}><div className="brand-row"><div className="brand-mark">1</div><div><div className="brand-title">oneVault</div><div className="brand-subtitle">Personal workspace</div></div><button className="icon-btn mobile-close" onClick={()=>setMobileOpen(false)}><X size={18}/></button></div>
      <nav className="module-nav"><div className="nav-label">YOUR SPACE</div>{modules.map(m=>{const Icon=m.icon;return <button key={m.id} className={`module-btn ${active===m.id?'selected':''}`} onClick={()=>{setActive(m.id);setMobileOpen(false)}}><span className="module-icon"><Icon size={19}/></span><span className="module-copy"><strong>{m.label}</strong><small>{m.description}</small></span><ChevronRight size={15} className="module-arrow"/></button>})}</nav>
      <div className="sidebar-footer"><div className="privacy-card"><ShieldCheck size={18}/><div><strong>Private mode</strong><span>Owner-only database access.</span></div></div><button className="logout-btn" onClick={signOut}><LogOut size={16}/> Sign out</button></div>
    </aside>
    {mobileOpen&&<button className="backdrop" onClick={()=>setMobileOpen(false)}/>}<main className="main-area"><header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" onClick={()=>setMobileOpen(true)}><Menu size={20}/></button><div><div className="eyebrow">PRIVATE DASHBOARD</div><h1>{activeModule.label}</h1></div></div><div className="topbar-actions"><button className="primary-btn" onClick={()=>active==='pocket'?openTransaction('expense'):active==='reminders'?openReminder():setQuickAdd(true)}><Plus size={17}/> Quick add</button></div></header>
      <section className="content"><div className="hero-row"><div><span className="pill"><span className="status-dot"/> Private workspace</span><h2>Everything personal,<br/><span>in one place.</span></h2><p>Expenses, reminders, passwords and notes with one clean interface across your devices.</p></div><div className="date-card"><div className="date-label">TODAY</div><div className="date-value">{new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div><div className="date-helper">{user.email}</div></div></div>
        {active==='pocket'?<Pocket user={user} onQuickAdd={openTransaction}/>:active==='reminders'?<Reminders user={user}/>:<div className="workspace-grid"><section className="panel large-panel"><div className="panel-header"><div><div className="panel-kicker">MODULE</div><h3>{activeModule.label}</h3></div><button className="text-btn" onClick={()=>setQuickAdd(true)}>Add new <Plus size={15}/></button></div><div className="empty-state"><div className="empty-icon">{(()=>{const Icon=activeModule.icon;return <Icon size={25}/>})()}</div><h4>{activeModule.label} is next</h4><p>The secure backend is ready. We’ll build this module on the same private foundation.</p><button className="primary-btn" onClick={()=>setQuickAdd(true)}><Plus size={16}/> Explore actions</button></div></section><section className="panel security-panel"><div className="panel-kicker">SECURITY FOUNDATION</div><h3>Private by design.</h3><p>Authentication and database access are enforced before sensitive data is connected.</p><div className="security-list"><div><Check size={16}/> Owner-only access</div><div><Check size={16}/> Row-level security</div><div><Check size={16}/> Encrypted password vault</div><div><Check size={16}/> Cross-device sync</div></div></section></div>}
      </section></main>
    {quickAdd&&<div className="modal-layer"><div className="modal"><div className="modal-header"><div><div className="panel-kicker">QUICK ADD</div><h3>What do you want to create?</h3></div><button className="icon-btn" onClick={()=>setQuickAdd(false)}><X size={18}/></button></div><div className="quick-grid">{modules.map(m=>{const Icon=m.icon;return <button key={m.id} className="quick-option" onClick={()=>{setActive(m.id);setQuickAdd(false)}}><span className="module-icon"><Icon size={20}/></span><span><strong>{m.label}</strong><small>{m.description}</small></span><ChevronRight size={15}/></button>})}</div></div></div>}
  </div>
}
export default App
