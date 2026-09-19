import React, { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Check,
  Clock3,
  MessageCircle,
  PiggyBank,
  ShieldAlert,
  WalletCards,
  X,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import {
  getNotificationPermission,
  requestNotificationPermission,
  syncLocalNotifications,
} from './lib/localNotifications'

const PREF_KEY = userId => 'onevault:notification-prefs:' + userId
const READ_KEY = userId => 'onevault:notification-read:' + userId

const DEFAULT_PREFS = {
  reminderAlerts: false,
  dailyBrief: false,
  weeklyReview: false,
}

function loadPrefs(userId) {
  try {
    const raw = window.localStorage.getItem(PREF_KEY(userId))
    return { ...DEFAULT_PREFS, ...(raw ? JSON.parse(raw) : {}) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function savePrefs(userId, prefs) {
  window.localStorage.setItem(PREF_KEY(userId), JSON.stringify(prefs))
}

function loadReadIds(userId) {
  try {
    const raw = window.localStorage.getItem(READ_KEY(userId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveReadIds(userId, ids) {
  window.localStorage.setItem(READ_KEY(userId), JSON.stringify(ids.slice(-120)))
}

function monthKey(date) {
  const d = new Date(date)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

function makeNotification(id, type, title, body, createdAt, action) {
  return { id, type, title, body, createdAt: new Date(createdAt || Date.now()), action }
}

function iconFor(type) {
  if (type === 'budget') return PiggyBank
  if (type === 'account') return WalletCards
  if (type === 'telegram') return MessageCircle
  if (type === 'security') return ShieldAlert
  if (type === 'upcoming') return Clock3
  return Bell
}

function relativeDate(date) {
  const value = new Date(date)
  const diff = Date.now() - value.getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return minutes + 'm ago'
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours + 'h ago'
  const days = Math.round(hours / 24)
  if (days < 7) return days + 'd ago'
  return value.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function NotificationsCenter({ user, open, onOpen, onClose, onNavigate }) {
  const [items, setItems] = useState([])
  const [prefs, setPrefs] = useState(() => loadPrefs(user.id))
  const [readIds, setReadIds] = useState(() => loadReadIds(user.id))
  const [loading, setLoading] = useState(false)
  const [devicePermission, setDevicePermission] = useState({ granted: false, native: false })
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function loadCenter({ silent = false } = {}) {
    if (!silent) setLoading(true)
    setError('')

    try {
      const [{ data: reminders, error: remindersError }, { data: budgets, error: budgetsError }, { data: expenses, error: expensesError }, { data: accounts, error: accountsError }] = await Promise.all([
        supabase.from('reminders').select('id,title,description,due_at,priority,completed,notify_telegram').eq('user_id', user.id).order('due_at', { ascending: true }).limit(1000),
        supabase.from('budgets').select('id,category,amount,month').eq('user_id', user.id).order('month', { ascending: false }).limit(100),
        supabase.from('expenses').select('amount,type,category,spent_at').eq('user_id', user.id).order('spent_at', { ascending: false }).limit(1200),
        supabase.from('accounts').select('id,name,balance,type').eq('user_id', user.id).order('created_at', { ascending: true }),
      ])

      const firstError = remindersError || budgetsError || expensesError || accountsError
      if (firstError) throw firstError

      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const endTomorrow = new Date(tomorrow)
      endTomorrow.setDate(endTomorrow.getDate() + 1)

      const next = []

      ;(reminders || [])
        .filter(item => !item.completed && new Date(item.due_at) < now)
        .slice(0, 8)
        .forEach(item => {
          next.push(makeNotification(
            'overdue:' + item.id,
            'overdue',
            'Reminder overdue',
            item.title + (item.description ? ' · ' + item.description : ''),
            item.due_at,
            'reminders',
          ))
        })

      ;(reminders || [])
        .filter(item => !item.completed && new Date(item.due_at) >= today && new Date(item.due_at) < tomorrow)
        .slice(0, 8)
        .forEach(item => {
          next.push(makeNotification(
            'today:' + item.id,
            'today',
            'Reminder due today',
            item.title + ' · ' + new Date(item.due_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
            item.due_at,
            'reminders',
          ))
        })

      ;(reminders || [])
        .filter(item => !item.completed && new Date(item.due_at) >= tomorrow && new Date(item.due_at) < endTomorrow)
        .slice(0, 6)
        .forEach(item => {
          next.push(makeNotification(
            'upcoming:' + item.id,
            'upcoming',
            'Upcoming tomorrow',
            item.title + ' · ' + new Date(item.due_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
            item.due_at,
            'reminders',
          ))
        })

      const month = monthKey(now)
      const monthExpenses = (expenses || []).filter(item => item.type === 'expense' && monthKey(item.spent_at) === month)
      ;(budgets || [])
        .filter(item => monthKey(item.month) === month && Number(item.amount) > 0)
        .forEach(budget => {
          const spent = monthExpenses
            .filter(item => item.category === budget.category)
            .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
          const threshold = Number(budget.amount) * 0.8
          if (spent >= threshold) {
            const percent = Math.round((spent / Number(budget.amount)) * 100)
            next.push(makeNotification(
              'budget:' + budget.id + ':' + month,
              'budget',
              percent >= 100 ? 'Budget exceeded' : 'Budget is getting close',
              budget.category + ' is at ₹' + Math.round(spent).toLocaleString('en-IN') + ' of ₹' + Math.round(Number(budget.amount)).toLocaleString('en-IN') + ' (' + percent + '%).',
              now,
              'pocket',
            ))
          }
        })

      ;(accounts || [])
        .filter(account => Number(account.balance) < 0)
        .slice(0, 5)
        .forEach(account => {
          next.push(makeNotification(
            'account:' + account.id,
            'account',
            'Account needs attention',
            account.name + ' is below zero at ₹' + Math.round(Number(account.balance)).toLocaleString('en-IN') + '.',
            now,
            'pocket',
          ))
        })

      const telegramNeeded = (reminders || []).some(item => !item.completed && item.notify_telegram)
      if (telegramNeeded) {
        try {
          const { data } = await supabase.functions.invoke('telegram', { body: { action: 'status' } })
          if (!data?.connected) {
            next.push(makeNotification(
              'telegram:disconnected',
              'telegram',
              'Telegram reminders are disconnected',
              'Some reminders are configured for Telegram delivery. Reconnect Telegram to keep those alerts working.',
              now,
              'reminders',
            ))
          }
        } catch {
          // Telegram status should never block the notification center.
        }
      }

      next.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      setItems(next.slice(0, 40))
    } catch (loadError) {
      setError(loadError.message || 'Could not load notifications.')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  async function refreshPermission() {
    try {
      setDevicePermission(await getNotificationPermission())
    } catch {
      setDevicePermission({ granted: false, native: false })
    }
  }

  async function syncDevice() {
    try {
      const result = await requestNotificationPermission()
      setDevicePermission({ granted: result.granted, native: result.native })
      if (!result.granted) {
        setNotice('Device notifications are not enabled. You can allow them in Android/iPhone settings.')
        return
      }

      const { data: reminders } = await supabase
        .from('reminders')
        .select('id,title,description,due_at,completed')
        .eq('user_id', user.id)
        .order('due_at', { ascending: true })
        .limit(1000)

      await syncLocalNotifications({
        reminders: reminders || [],
        reminderAlerts: prefs.reminderAlerts,
        dailyBrief: prefs.dailyBrief,
        weeklyReview: prefs.weeklyReview,
      })

      setNotice('Device notifications are enabled.')
    } catch (syncError) {
      setError(syncError.message || 'Could not enable notifications.')
    }
  }



  async function syncFromPrefs({ silent = true } = {}) {
    if (!prefs.reminderAlerts && !prefs.dailyBrief && !prefs.weeklyReview) return
    try {
      const permission = await getNotificationPermission()
      setDevicePermission(permission)
      if (!permission.granted) return

      const { data: reminders } = await supabase
        .from('reminders')
        .select('id,title,description,due_at,completed')
        .eq('user_id', user.id)
        .order('due_at', { ascending: true })
        .limit(1000)

      await syncLocalNotifications({
        reminders: reminders || [],
        reminderAlerts: prefs.reminderAlerts,
        dailyBrief: prefs.dailyBrief,
        weeklyReview: prefs.weeklyReview,
      })
    } catch (syncError) {
      if (!silent) setError(syncError.message || 'Could not refresh device notifications.')
    }
  }

  async function updatePreference(key, value) {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    savePrefs(user.id, next)

    if (value) {
      const result = await requestNotificationPermission()
      setDevicePermission({ granted: result.granted, native: result.native })
      if (!result.granted) {
        const reverted = { ...next, [key]: false }
        setPrefs(reverted)
        savePrefs(user.id, reverted)
        setNotice('Notification permission was not granted.')
        return
      }
    }

    try {
      const { data: reminders } = await supabase
        .from('reminders')
        .select('id,title,description,due_at,completed')
        .eq('user_id', user.id)
        .order('due_at', { ascending: true })
        .limit(1000)

      await syncLocalNotifications({
        reminders: reminders || [],
        reminderAlerts: next.reminderAlerts,
        dailyBrief: next.dailyBrief,
        weeklyReview: next.weeklyReview,
      })
    } catch (syncError) {
      setError(syncError.message || 'Could not update notification settings.')
    }
  }

  function markAllRead() {
    const nextIds = Array.from(new Set([...readIds, ...items.map(item => item.id)]))
    setReadIds(nextIds)
    saveReadIds(user.id, nextIds)
  }

  function openItem(item) {
    if (item.action) onNavigate?.(item.action)
    const nextIds = Array.from(new Set([...readIds, item.id]))
    setReadIds(nextIds)
    saveReadIds(user.id, nextIds)
    onClose()
  }

  useEffect(() => {
    refreshPermission()
    void loadCenter()
    const interval = window.setInterval(() => {
      void loadCenter({ silent: true })
      void syncFromPrefs()
    }, 60000)
    void syncFromPrefs()
    return () => window.clearInterval(interval)
  }, [user.id, prefs.reminderAlerts, prefs.dailyBrief, prefs.weeklyReview])

  useEffect(() => {
    if (!open) return
    void loadCenter()
    void refreshPermission()
  }, [open])

  const unreadCount = useMemo(
    () => items.filter(item => !readIds.includes(item.id)).length,
    [items, readIds],
  )

  return (
    <>
      <button
        className="notification-topbar-btn"
        onClick={() => void onOpen?.()}
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={17}/>
        {unreadCount > 0 && <span>{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notification-layer" onMouseDown={onClose}>
          <section className="notification-center" onMouseDown={event => event.stopPropagation()}>
            <header className="notification-center-header">
              <div>
                <div className="panel-kicker">ONEVAULT</div>
                <h3>Notifications</h3>
                <p>Reminders, budgets, accounts and important workspace signals.</p>
              </div>
              <div className="notification-center-actions">
                <button className="text-btn" onClick={markAllRead} disabled={!unreadCount}><Check size={14}/> Mark all read</button>
                <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={17}/></button>
              </div>
            </header>

            <div className="notification-device-card">
              <div>
                <strong>{devicePermission.granted ? 'Device notifications on' : 'Device notifications off'}</strong>
                <span>{devicePermission.granted ? 'OneVault can alert you even when the app is closed.' : 'Enable alerts for reminders and scheduled reviews.'}</span>
              </div>
              <button className={devicePermission.granted ? 'secondary-btn' : 'primary-btn'} onClick={()=>void syncDevice()}>
                {devicePermission.granted ? 'Refresh' : 'Enable'}
              </button>
            </div>

            <div className="notification-settings">
              <div className="notification-settings-head">
                <div><div className="panel-kicker">ALERTS</div><strong>Choose what OneVault should notify you about.</strong></div>
                <button className="text-btn" onClick={()=>void loadCenter()}><Bell size={13}/> Refresh</button>
              </div>
              <div className="notification-setting-grid">
                <button type="button" className={'notification-setting ' + (prefs.reminderAlerts ? 'active' : '')} onClick={()=>void updatePreference('reminderAlerts', !prefs.reminderAlerts)}>
                  <Bell size={15}/><span><strong>Reminder alerts</strong><small>Notify at scheduled reminder times.</small></span><i>{prefs.reminderAlerts ? 'On' : 'Off'}</i>
                </button>
                <button type="button" className={'notification-setting ' + (prefs.dailyBrief ? 'active' : '')} onClick={()=>void updatePreference('dailyBrief', !prefs.dailyBrief)}>
                  <Clock3 size={15}/><span><strong>Daily review</strong><small>Daily 8:00 PM workspace check-in.</small></span><i>{prefs.dailyBrief ? 'On' : 'Off'}</i>
                </button>
                <button type="button" className={'notification-setting ' + (prefs.weeklyReview ? 'active' : '')} onClick={()=>void updatePreference('weeklyReview', !prefs.weeklyReview)}>
                  <PiggyBank size={15}/><span><strong>Weekly review</strong><small>Sunday 6:00 PM spending and reminder review.</small></span><i>{prefs.weeklyReview ? 'On' : 'Off'}</i>
                </button>
              </div>
            </div>

            <div className="notification-list">
              {loading ? (
                <div className="notification-empty">Checking your workspace…</div>
              ) : items.length === 0 ? (
                <div className="notification-empty"><Check size={20}/><strong>You're all caught up.</strong><span>No urgent reminders, budget warnings or account alerts right now.</span></div>
              ) : items.map(item => {
                const Icon = iconFor(item.type)
                const unread = !readIds.includes(item.id)
                return (
                  <button key={item.id} className={'notification-item ' + (unread ? 'unread' : '')} onClick={()=>openItem(item)}>
                    <span className={'notification-item-icon ' + item.type}><Icon size={16}/></span>
                    <span className="notification-item-copy"><strong>{item.title}</strong><small>{item.body}</small><em>{relativeDate(item.createdAt)}</em></span>
                    {unread && <b className="notification-unread-dot"/>}
                  </button>
                )
              })}
            </div>

            {notice && <div className="telegram-notice">{notice}</div>}
            {error && <div className="form-error notification-error">{error}</div>}
          </section>
        </div>
      )}
    </>
  )
}
