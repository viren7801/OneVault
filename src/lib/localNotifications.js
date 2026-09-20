import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

const REMINDER_BASE = 1100000000
const DAILY_ID = 1199000001
const WEEKLY_ID = 1199000002
const MAX_SCHEDULED_REMINDERS = 80

let pluginPromise

async function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null
  if (!pluginPromise) {
    pluginPromise = import('@capacitor/local-notifications').then(module => module.LocalNotifications)
  }
  return pluginPromise
}

async function createChannel(plugin) {
  try {
    await plugin.createChannel({
      id: 'onevault_reminders',
      name: 'OneVault reminders',
      description: 'Reminders, daily reviews and OneVault alerts',
      importance: 4,
      visibility: 1,
      vibration: true,
    })
  } catch {
    // Android channels are ignored on iOS.
  }
}

export async function requestNotificationPermission() {
  const plugin = await getPlugin()
  if (!plugin) return { granted: false, native: false }

  const current = await plugin.checkPermissions()
  if (current.display === 'granted') return { granted: true, native: true }

  const requested = await plugin.requestPermissions()
  return { granted: requested.display === 'granted', native: true }
}

export async function getNotificationPermission() {
  const plugin = await getPlugin()
  if (!plugin) return { granted: false, native: false }

  const status = await plugin.checkPermissions()
  return { granted: status.display === 'granted', native: true }
}

export async function getExactNotificationPermission() {
  const plugin = await getPlugin()
  if (!plugin || typeof plugin.checkExactNotificationSetting !== 'function') {
    return { granted: true, native: Boolean(plugin), supported: false }
  }

  try {
    const status = await plugin.checkExactNotificationSetting()
    return { granted: status.exact_alarm === 'granted', native: true, supported: true }
  } catch {
    return { granted: false, native: true, supported: true }
  }
}

export async function syncStoredReminderNotifications(userId) {
  if (!userId) return { native: false, scheduled: 0 }

  const permission = await getNotificationPermission()
  if (!permission.granted) return { native: true, scheduled: 0, permission: 'denied' }

  let prefs = {
    reminderAlerts: false,
    dailyBrief: false,
    weeklyReview: false,
  }

  try {
    const raw = window.localStorage.getItem('onevault:notification-prefs:' + userId)
    prefs = { ...prefs, ...(raw ? JSON.parse(raw) : {}) }
  } catch {}

  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('id,title,description,due_at,completed')
    .eq('user_id', userId)
    .order('due_at', { ascending: true })
    .limit(1000)

  if (error) throw error

  return syncLocalNotifications({
    reminders: reminders || [],
    ...prefs,
  })
}

function isOneVaultId(id) {
  const value = Number(id)
  return (
    (value >= REMINDER_BASE && value < REMINDER_BASE + 85000000) ||
    value === DAILY_ID ||
    value === WEEKLY_ID
  )
}

async function cancelOneVaultNotifications(plugin, pending) {
  const notifications = (pending || [])
    .map(item => Number(item.id))
    .filter(isOneVaultId)
    .map(id => ({ id }))

  if (notifications.length) {
    await plugin.cancel({ notifications })
  }
}

export async function syncLocalNotifications({
  reminders = [],
  reminderAlerts = false,
  dailyBrief = false,
  weeklyReview = false,
} = {}) {
  const plugin = await getPlugin()
  if (!plugin) return { native: false, scheduled: 0 }

  const permission = await plugin.checkPermissions()
  if (permission.display !== 'granted') {
    return { native: true, scheduled: 0, permission: permission.display }
  }

  await createChannel(plugin)

  const pending = await plugin.getPending()
  await cancelOneVaultNotifications(plugin, pending.notifications || [])

  const now = new Date()
  const notifications = []

  if (reminderAlerts) {
    reminders
      .filter(reminder => !reminder.completed && new Date(reminder.due_at) > now)
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
      .slice(0, MAX_SCHEDULED_REMINDERS)
      .forEach(reminder => {
        const due = new Date(reminder.due_at)
        const stamp = due.toLocaleString('en-IN', {
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })
        notifications.push({
          id: stableReminderId(reminder.id),
          title: reminder.title || 'OneVault reminder',
          body: reminder.description
            ? reminder.description + ' · ' + stamp
            : 'Due ' + stamp,
          channelId: 'onevault_reminders',
          schedule: {
            at: due,
            allowWhileIdle: true,
            isExactNotification: true,
          },
          autoCancel: true,
        })
      })
  }

  if (dailyBrief) {
    notifications.push({
      id: DAILY_ID,
      title: 'OneVault daily review',
      body: 'Take a quick look at today’s reminders, spending and budgets.',
      channelId: 'onevault_reminders',
      schedule: {
        on: { hour: 20, minute: 0 },
        repeats: true,
      },
      autoCancel: true,
    })
  }

  if (weeklyReview) {
    notifications.push({
      id: WEEKLY_ID,
      title: 'OneVault weekly review',
      body: 'Review the week: spending, budgets, reminders and unfinished items.',
      channelId: 'onevault_reminders',
      schedule: {
        on: { weekday: 1, hour: 18, minute: 0 },
        repeats: true,
      },
      autoCancel: true,
    })
  }

  if (notifications.length) {
    await plugin.schedule({ notifications })
  }

  return {
    native: true,
    scheduled: notifications.length,
    permission: permission.display,
  }
}

function stableReminderId(id) {
  const text = String(id || '')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return REMINDER_BASE + (Math.abs(hash) % 85000000)
}
