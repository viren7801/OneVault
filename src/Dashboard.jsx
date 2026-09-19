import React, { useEffect, useMemo, useState } from 'react'
import {
  Bell, CalendarClock, ChevronRight, CircleDollarSign, LockKeyhole,
  NotebookPen, PiggyBank, Plus, ShieldCheck, TrendingDown, TrendingUp, WalletCards,
  Activity,
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

const dayBounds = () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
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
  const [todayReminders, setTodayReminders] = useState([])
  const [passkeys, setPasskeys] = useState(0)
  const [vaultStatus, setVaultStatus] = useState({ passwords: false, notes: false })
  const [clockNow, setClockNow] = useState(() => Date.now())

  async function load() {
    setLoading(true)
    setError('')

    const start = monthStart()
    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const today = dayBounds()

    const [tx, ac, bu, rm, tr, pk, pv, nv] = await Promise.all([
      supabase.from('expenses').select('id,amount,type,category,description,spent_at').eq('user_id', user.id).gte('spent_at', start).order('spent_at', { ascending: false }).limit(50),
      supabase.from('accounts').select('id,name,type,balance').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('budgets').select('id,category,amount,month').eq('user_id', user.id).eq('month', new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-01').order('category'),
      supabase.from('reminders').select('id,title,due_at,priority,completed').eq('user_id', user.id).eq('completed', false).gte('due_at', new Date().toISOString()).lte('due_at', soon).order('due_at').limit(5),
      supabase.from('reminders').select('id,title,due_at,priority,completed').eq('user_id', user.id).eq('completed', false).gte('due_at', today.start).lt('due_at', today.end).order('due_at').limit(8),
      supabase.auth.passkey.list(),
      supabase.from('password_vaults').select('user_id').eq('user_id', user.id).maybeSingle(),
      supabase.from('notes_vaults').select('user_id').eq('user_id', user.id).maybeSingle(),
    ])

    const firstError = tx.error || ac.error || bu.error || rm.error || tr.error
    if (firstError) setError(firstError.message)

    setTransactions(tx.data || [])
    setAccounts(ac.data || [])
    setBudgets(bu.data || [])
    setReminders(rm.data || [])
    setTodayReminders(tr.data || [])
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

  const recentActivity = useMemo(() => {
    return transactions.slice(0, 5).map(item => ({
      ...item,
      label: item.description || item.category || 'Pocket transaction',
      amountLabel: (item.type === 'income' ? '+ ' : '− ') + money(item.amount),
      dateLabel: new Date(item.spent_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    }))
  }, [transactions])

  const nextReminder = useMemo(() => {
    return reminders.find(item => new Date(item.due_at).getTime() > clockNow) || null
  }, [reminders, clockNow])

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const nextReminderMeta = useMemo(() => {
    if (!nextReminder) return null
    const due = new Date(nextReminder.due_at).getTime()
    const diff = Math.max(0, due - clockNow)
    const totalSeconds = Math.floor(diff / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    let countdown = ''
    if (days > 0) countdown = `${days}d ${hours}h`
    else if (hours > 0) countdown = `${hours}h ${minutes}m`
    else if (minutes > 0) countdown = `${minutes}m ${seconds}s`
    else countdown = `${seconds}s`

    const dueDate = new Date(nextReminder.due_at)
    return {
      countdown,
      timeLabel: dueDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      dateLabel: dueDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      priority: nextReminder.priority || 'medium',
    }
  }, [nextReminder, clockNow])

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

  const todayStats = useMemo(() => {
    const now = new Date()
    const todaysTransactions = transactions.filter(item => new Date(item.spent_at).toDateString() === now.toDateString())
    const spent = todaysTransactions
      .filter(item => item.type === 'expense')
      .reduce((sum, item) => sum + Number(item.amount), 0)
    const income = todaysTransactions
      .filter(item => item.type === 'income')
      .reduce((sum, item) => sum + Number(item.amount), 0)
    return { spent, income, transactions: todaysTransactions }
  }, [transactions])

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

    <section className="dashboard-focus-card">
      <div className="dashboard-focus-icon"><Bell size={18}/></div>
      <div className="dashboard-focus-main">
        <div className="panel-kicker">NEXT UP</div>
        {nextReminder && nextReminderMeta ? (
          <>
            <h3>{nextReminder.title}</h3>
            <div className="dashboard-focus-meta">
              <span className={`dashboard-focus-priority ${nextReminderMeta.priority}`}>{nextReminderMeta.priority} priority</span>
              <span>{nextReminderMeta.dateLabel} · {nextReminderMeta.timeLabel}</span>
            </div>
          </>
        ) : (
          <>
            <h3>Nothing waiting for you.</h3>
            <div className="dashboard-focus-meta"><span>Your schedule is clear.</span></div>
          </>
        )}
      </div>
      <div className="dashboard-focus-countdown">
        {nextReminderMeta ? <><strong>{nextReminderMeta.countdown}</strong><span>until next reminder</span></> : <><strong>—</strong><span>no upcoming reminder</span></>}
      </div>
      <button className="dashboard-focus-open" onClick={()=>onNavigate('reminders')}><ChevronRight size={17}/></button>
    </section>

    <section className="dashboard-today">
      <div className="dashboard-today-main">
        <div className="dashboard-section-head">
          <div>
            <div className="panel-kicker">TODAY</div>
            <h3>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          </div>
          <span className="dashboard-today-count">{todayReminders.length} reminder{todayReminders.length === 1 ? '' : 's'}</span>
        </div>

        <div className="dashboard-today-list">
          {todayReminders.length === 0
            ? <div className="dashboard-today-empty">
                <div className="dashboard-today-empty-icon"><Bell size={16}/></div>
                <div><strong>Your day is clear.</strong><span>No pending reminders for today.</span></div>
              </div>
            : todayReminders.slice(0, 4).map(item => (
                <button key={item.id} className="dashboard-today-reminder" onClick={()=>onNavigate('reminders')}>
                  <span className={`dashboard-reminder-priority ${item.priority || 'medium'}`}></span>
                  <span className="dashboard-today-reminder-copy">
                    <strong>{item.title}</strong>
                    <small>{getReminderLabel(item.due_at)} · {item.priority || 'medium'} priority</small>
                  </span>
                  <ChevronRight size={14}/>
                </button>
              ))}
        </div>
      </div>

      <div className="dashboard-today-side">
        <div className="dashboard-section-head compact">
          <div>
            <div className="panel-kicker">QUICK VIEW</div>
            <h3>Make it happen.</h3>
          </div>
          <CalendarClock size={17}/>
        </div>

        <div className="dashboard-today-metrics">
          <div><span>Spent today</span><strong>{money(todayStats.spent)}</strong></div>
          <div><span>Received today</span><strong>{money(todayStats.income)}</strong></div>
        </div>

        <div className="dashboard-quick-actions">
          <button onClick={()=>onQuickAdd()}><Plus size={13}/> Quick add</button>
          <button onClick={()=>onNavigate('reminders')}><Bell size={13}/> Reminders</button>
          <button onClick={()=>onNavigate('notes')}><NotebookPen size={13}/> Notes</button>
          <button onClick={()=>onNavigate('passwords')}><LockKeyhole size={13}/> Passwords</button>
        </div>
      </div>
    </section>

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

    <div className="dashboard-card dashboard-activity-card">
      <div className="dashboard-card-top">
        <span className="dashboard-icon"><Activity size={17}/></span>
        <button className="dashboard-inline-link" onClick={(event)=>{event.stopPropagation(); onNavigate('pocket')}}>Open Pocket <ChevronRight size={13}/></button>
      </div>
      <div className="dashboard-activity-heading">
        <div>
          <strong>Recent activity</strong>
          <span>Latest money movements this month</span>
        </div>
        <span className="dashboard-activity-count">{recentActivity.length}</span>
      </div>
      <div className="dashboard-activity-list">
        {recentActivity.length === 0
          ? <span className="dashboard-empty-line">No Pocket activity this month.</span>
          : recentActivity.map(item => (
            <button key={item.id} className="dashboard-activity-row" onClick={(event)=>{event.stopPropagation(); onNavigate('pocket')}}>
              <span className={`dashboard-activity-dot ${item.type === 'income' ? 'income' : 'expense'}`}></span>
              <span className="dashboard-activity-copy">
                <strong>{item.label}</strong>
                <small>{item.category || (item.type === 'income' ? 'Income' : 'Expense')} · {item.dateLabel}</small>
              </span>
              <strong className={`dashboard-activity-amount ${item.type === 'income' ? 'income' : 'expense'}`}>{item.amountLabel}</strong>
            </button>
          ))}
      </div>
    </div>

    <div className="dashboard-footer-row">
      <div className="dashboard-account-strip"><ShieldCheck size={14}/><span>Owner-only workspace · {user.email}</span></div>
      <button className="text-btn" onClick={()=>onNavigate('reminders')}>Open reminders <ChevronRight size={13}/></button>
    </div>
  </div>
}
