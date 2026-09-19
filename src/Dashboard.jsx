import React, { useEffect, useMemo, useState } from 'react'
import {
  Bell, CalendarClock, ChevronRight, CircleDollarSign, LockKeyhole,
  NotebookPen, PiggyBank, Plus, ShieldCheck, TrendingDown, TrendingUp, WalletCards,
} from 'lucide-react'
import { supabase } from './lib/supabase'

const money = value => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(Number(value) || 0)

const monthStart = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

function getReminderLabel(value) {
  const date = new Date(value)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return 'Today · ' + date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export default function Dashboard({ user, onNavigate, onQuickAdd, onOpenSecurity, autoLockMinutes }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [budgets, setBudgets] = useState([])
  const [reminders, setReminders] = useState([])
  const [passkeys, setPasskeys] = useState(0)
  const [vaultStatus, setVaultStatus] = useState({ passwords: false, notes: false })

  async function load() {
    setLoading(true)
    setError('')

    const start = monthStart()
    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const [tx, ac, bu, rm, pk, pv, nv] = await Promise.all([
      supabase.from('expenses').select('id,amount,type,category,description,spent_at').eq('user_id', user.id).gte('spent_at', start).order('spent_at', { ascending: false }).limit(50),
      supabase.from('accounts').select('id,name,type,balance').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('budgets').select('id,category,amount,month').eq('user_id', user.id).eq('month', new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-01').order('category'),
      supabase.from('reminders').select('id,title,due_at,priority,completed').eq('user_id', user.id).eq('completed', false).gte('due_at', new Date().toISOString()).lte('due_at', soon).order('due_at').limit(5),
      supabase.auth.passkey.list(),
      supabase.from('password_vaults').select('user_id').eq('user_id', user.id).maybeSingle(),
      supabase.from('notes_vaults').select('user_id').eq('user_id', user.id).maybeSingle(),
    ])

    const firstError = tx.error || ac.error || bu.error || rm.error
    if (firstError) setError(firstError.message)

    setTransactions(tx.data || [])
    setAccounts(ac.data || [])
    setBudgets(bu.data || [])
    setReminders(rm.data || [])
    setPasskeys(pk.error ? 0 : (pk.data || []).length)
    setVaultStatus({
      passwords: Boolean(pv.data),
      notes: Boolean(nv.data),
    })
    setLoading(false)
  }

  useEffect(() => { void load() }, [user.id])

  const moneyStats = useMemo(() => {
    const income = transactions.filter(item => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0)
    const expenses = transactions.filter(item => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0)
    const totalBalance = accounts.reduce((sum, item) => sum + Number(item.balance), 0)
    return { income, expenses, net: income - expenses, totalBalance }
  }, [transactions, accounts])

  const budgetProgress = useMemo(() => {
    const rows = budgets.map(budget => {
      const spent = transactions
        .filter(item => item.type === 'expense' && item.category === budget.category)
        .reduce((sum, item) => sum + Number(item.amount), 0)
      return { ...budget, spent, percent: Number(budget.amount) ? Math.min(100, spent / Number(budget.amount) * 100) : 0 }
    })
    const total = rows.reduce((sum, item) => sum + Number(item.amount), 0)
    const spent = rows.reduce((sum, item) => sum + item.spent, 0)
    return { rows, total, spent, percent: total ? Math.min(100, spent / total * 100) : 0 }
  }, [budgets, transactions])

  if (loading) return <div className="dashboard-loading"><ShieldCheck size={18}/> Preparing your private overview…</div>

  return <div className="dashboard-page">
    <div className="dashboard-heading">
      <div>
        <div className="panel-kicker">HOME</div>
        <h2>Your day, at a glance.</h2>
        <p>Private overview of money, reminders and security.</p>
      </div>
      <div className="dashboard-heading-actions">
        <button className="secondary-btn" onClick={()=>void load()}><span className="refresh-glyph">↻</span> Refresh</button>
        <button className="primary-btn" onClick={()=>onQuickAdd()}><Plus size={15}/> Quick add</button>
      </div>
    </div>

    {error && <div className="form-error">{error}</div>}

    <div className="dashboard-grid">
      <button className="dashboard-card dashboard-money-card" onClick={()=>onNavigate('pocket')}>
        <div className="dashboard-card-top"><span className="dashboard-icon"><CircleDollarSign size={17}/></span><span className="dashboard-card-link">Pocket <ChevronRight size={14}/></span></div>
        <div className="dashboard-money-main">{money(moneyStats.totalBalance)}</div>
        <div className="dashboard-card-muted">Total account balance</div>
        <div className="dashboard-money-split"><span><TrendingUp size={12}/> {money(moneyStats.income)} in</span><span><TrendingDown size={12}/> {money(moneyStats.expenses)} out</span></div>
      </button>

      <button className="dashboard-card" onClick={()=>onNavigate('reminders')}>
        <div className="dashboard-card-top"><span className="dashboard-icon"><Bell size={17}/></span><span className="dashboard-card-link">Reminders <ChevronRight size={14}/></span></div>
        <div className="dashboard-stat-number">{reminders.length}</div>
        <div className="dashboard-card-muted">Upcoming in the next 7 days</div>
        <div className="dashboard-list">
          {reminders.length === 0
            ? <span className="dashboard-empty-line">Nothing scheduled soon.</span>
            : reminders.slice(0,3).map(item => <span key={item.id}><strong>{item.title}</strong><small>{getReminderLabel(item.due_at)}</small></span>)}
        </div>
      </button>

      <button className="dashboard-card" onClick={()=>onNavigate('pocket')}>
        <div className="dashboard-card-top"><span className="dashboard-icon"><PiggyBank size={17}/></span><span className="dashboard-card-link">Budgets <ChevronRight size={14}/></span></div>
        <div className="dashboard-stat-number">{budgets.length}</div>
        <div className="dashboard-card-muted">{money(budgetProgress.spent)} of {money(budgetProgress.total)} used</div>
        <div className="dashboard-progress"><i style={{ width: budgetProgress.percent + '%' }}/></div>
        <div className="dashboard-progress-label">{Math.round(budgetProgress.percent)}% of budget used</div>
      </button>

      <button className="dashboard-card" onClick={()=>onNavigate('pocket')}>
        <div className="dashboard-card-top"><span className="dashboard-icon"><WalletCards size={17}/></span><span className="dashboard-card-link">Accounts <ChevronRight size={14}/></span></div>
        <div className="dashboard-stat-number">{accounts.length}</div>
        <div className="dashboard-card-muted">Linked money accounts</div>
        <div className="dashboard-list compact">
          {accounts.length === 0 ? <span className="dashboard-empty-line">No accounts yet.</span> : accounts.slice(0,3).map(account => <span key={account.id}><strong>{account.name}</strong><small>{money(account.balance)}</small></span>)}
        </div>
      </button>

      <button className="dashboard-card dashboard-wide-card" onClick={()=>onNavigate('notes')}>
        <div className="dashboard-card-top"><span className="dashboard-icon"><NotebookPen size={17}/></span><span className="dashboard-card-link">Notes <ChevronRight size={14}/></span></div>
        <div className="dashboard-private-row"><div><strong>{vaultStatus.notes ? 'Encrypted notes vault' : 'Notes vault not set up'}</strong><span>{vaultStatus.notes ? 'Unlock Notes to view your private content.' : 'Create your encrypted vault when you open Notes.'}</span></div><LockKeyhole size={18}/></div>
      </button>

      <button className="dashboard-card dashboard-wide-card" onClick={()=>onNavigate('passwords')}>
        <div className="dashboard-card-top"><span className="dashboard-icon"><LockKeyhole size={17}/></span><span className="dashboard-card-link">Passwords <ChevronRight size={14}/></span></div>
        <div className="dashboard-private-row"><div><strong>{vaultStatus.passwords ? 'Encrypted password vault' : 'Password vault not set up'}</strong><span>{vaultStatus.passwords ? 'Unlock Passwords to access your private credentials.' : 'Create your encrypted vault when you open Passwords.'}</span></div><LockKeyhole size={18}/></div>
      </button>

      <button className="dashboard-card security-dashboard-card" onClick={onOpenSecurity}>
        <div className="dashboard-card-top"><span className="dashboard-icon"><ShieldCheck size={17}/></span><span className="dashboard-card-link">Security <ChevronRight size={14}/></span></div>
        <div className="dashboard-security-number">{passkeys}</div>
        <div className="dashboard-card-muted">Registered device{passkeys === 1 ? '' : 's'} · auto-lock {autoLockMinutes ? autoLockMinutes + 'm' : 'off'}</div>
        <div className="dashboard-security-note"><CalendarClock size={12}/> Sensitive vaults lock when you leave this tab.</div>
      </button>
    </div>

    <div className="dashboard-footer-row">
      <div className="dashboard-account-strip"><ShieldCheck size={14}/><span>Owner-only workspace · {user.email}</span></div>
      <button className="text-btn" onClick={()=>onNavigate('reminders')}>Open reminders <ChevronRight size={13}/></button>
    </div>
  </div>
}
