import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

const REMINDER_BASE = 1100000000
const DAILY_ID = 1199000001
const WEEKLY_ID = 1199000002
const TEST_ID = 1199000099
const MAX_SCHEDULED_REMINDERS = 80
const CHANNEL_ID = 'onevault_reminders_v2'

let pluginPromise

async function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null
  if (!Capacitor.isPluginAvailable('LocalNotifications')) return null
  if (!pluginPromise) {
    pluginPromise = import('@capacitor/local-notifications').then(module => module.LocalNotifications)
  }
  return pluginPromise
}

async function createChannel(plugin) {
  try {
    await plugin.createChannel({
      id: CHANNEL_ID,
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
  if (!plugin) return { granted: false, native: false, pluginAvailable: false }

  const current = await plugin.checkPermissions()
  if (current.display === 'granted') return { granted: true, native: true }

  const requested = await plugin.requestPermissions()
  return { granted: requested.display === 'granted', native: true }
}

export async function getNotificationDiagnostics() {
  const plugin = await getPlugin()
  if (!plugin) {
    return {
      native: Capacitor.isNativePlatform(),
      pluginAvailable: false,
      permission: 'unavailable',
      enabled: false,
      exactAlarm: { granted: false, supported: false },
      channels: [],
      pending: [],
      delivered: [],
    }
  }

  const [permission, enabled, exactAlarm, channels, pending, delivered] = await Promise.all([
    plugin.checkPermissions().catch(() => ({ display: 'unknown' })),
    typeof plugin.areEnabled === 'function'
      ? plugin.areEnabled().catch(() => ({ value: false }))
      : Promise.resolve({ value: true }),
    getExactNotificationPermission(),
    typeof plugin.listChannels === 'function'
      ? plugin.listChannels().catch(() => ({ channels: [] }))
      : Promise.resolve({ channels: [] }),
    plugin.getPending().catch(() => ({ notifications: [] })),
    typeof plugin.getDeliveredNotifications === 'function'
      ? plugin.getDeliveredNotifications().catch(() => ({ notifications: [] }))
      : Promise.resolve({ notifications: [] }),
  ])

  return {
    native: true,
    pluginAvailable: true,
    permission: permission.display,
    enabled: Boolean(enabled?.value),
    exactAlarm,
    channels: channels?.channels || [],
    pending: pending?.notifications || [],
    delivered: delivered?.notifications || [],
  }
}

export async function getNotificationPermission() {
  const plugin = await getPlugin()
  if (!plugin) return { granted: false, native: false, pluginAvailable: false }

  const status = await plugin.checkPermissions()
  return { granted: status.display === 'granted', native: true, pluginAvailable: true }
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

export async function requestExactNotificationPermission() {
  const current = await getExactNotificationPermission()
  if (!current.native || !current.supported || current.granted) return current

  const plugin = await getPlugin()
  if (!plugin || typeof plugin.changeExactNotificationSetting !== 'function') return current

  try {
    const changed = await plugin.changeExactNotificationSetting()
    return {
      ...current,
      granted: changed?.exact_alarm === 'granted',
      supported: true,
    }
  } catch {
    return current
  }
}

export async function syncStoredReminderNotifications(userId) {
  if (!userId) return { native: false, scheduled: 0 }

  const permission = await getNotificationPermission()
  if (!permission.granted) return { native: true, scheduled: 0, permission: 'denied' }

  let prefs = {
    reminderAlerts: true,
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
    value === WEEKLY_ID ||
    value === TEST_ID
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

async function getPendingOneVaultNotifications(plugin) {
  const pending = await plugin.getPending()
  return (pending.notifications || []).filter(item => isOneVaultId(item.id))
}

export async function syncLocalNotifications({
  reminders = [],
  reminderAlerts = false,
  dailyBrief = false,
  weeklyReview = false,
} = {}) {
  const plugin = await getPlugin()
  if (!plugin) return {
    native: Capacitor.isNativePlatform(),
    scheduled: 0,
    reason: Capacitor.isNativePlatform() ? 'plugin_unavailable' : 'not_native',
  }

  const permission = await plugin.checkPermissions()
  if (permission.display !== 'granted') {
    return { native: true, scheduled: 0, permission: permission.display }
  }

  await createChannel(plugin)

  if (reminderAlerts) {
    const exact = await getExactNotificationPermission()
    if (exact.supported && !exact.granted) {
      return {
        native: true,
        scheduled: 0,
        permission: permission.display,
        exactAlarm: 'denied',
        requiresExactAlarm: true,
      }
    }
  }

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
          channelId: CHANNEL_ID,
          schedule: {
            at: due,
            allowWhileIdle: true,
            isExactNotification: true,
            isExactMandatory: true,
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
      channelId: CHANNEL_ID,
      schedule: {
        on: { hour: 20, minute: 0 },
        repeats: true,
        isExactNotification: false,
      },
      autoCancel: true,
    })
  }

  if (weeklyReview) {
    notifications.push({
      id: WEEKLY_ID,
      title: 'OneVault weekly review',
      body: 'Review the week: spending, budgets, reminders and unfinished items.',
      channelId: CHANNEL_ID,
      schedule: {
        on: { weekday: 1, hour: 18, minute: 0 },
        repeats: true,
        isExactNotification: false,
      },
      autoCancel: true,
    })
  }

  if (!notifications.length) {
    return {
      native: true,
      scheduled: 0,
      permission: permission.display,
      exactAlarm: 'not_required',
      pending: 0,
    }
  }

  try {
    const result = await plugin.schedule({ notifications })
    const pendingAfter = await getPendingOneVaultNotifications(plugin)
    const pendingIds = new Set(pendingAfter.map(item => Number(item.id)))
    const missingIds = notifications
      .map(item => Number(item.id))
      .filter(id => !pendingIds.has(id))

    return {
      native: true,
      scheduled: result.notifications?.length || 0,
      permission: permission.display,
      exactAlarm: reminderAlerts ? 'granted' : 'not_required',
      pending: pendingAfter.length,
      missing: missingIds.length,
      warning: result.warning || null,
      warningCode: result.warning?.code || null,
      warningMessage: result.warning?.message || null,
    }
  } catch (error) {
    return {
      native: true,
      scheduled: 0,
      permission: permission.display,
      exactAlarm: reminderAlerts ? 'unknown' : 'not_required',
      errorCode: error?.code || null,
      error: error?.message || 'Unable to schedule local notifications.',
    }
  }
}

export async function scheduleTestNotification() {
  const plugin = await getPlugin()
  if (!plugin) {
    return {
      native: Capacitor.isNativePlatform(),
      scheduled: 0,
      reason: Capacitor.isNativePlatform() ? 'plugin_unavailable' : 'not_native',
    }
  }

  const permission = await requestNotificationPermission()
  if (!permission.granted) {
    return { native: true, scheduled: 0, reason: 'notification_permission' }
  }

  await createChannel(plugin)
  const at = new Date(Date.now() + 10000)

  try {
    await plugin.cancel({ notifications: [{ id: TEST_ID }] })

    const result = await plugin.schedule({
      notifications: [{
        id: TEST_ID,
        title: 'OneVault test notification',
        body: 'If you see this in about 10 seconds, native notifications are working.',
        channelId: CHANNEL_ID,
        schedule: {
          at,
          allowWhileIdle: true,
          isExactNotification: false,
        },
        autoCancel: true,
      }],
    })

    const pendingAfter = await getPendingOneVaultNotifications(plugin)
    const scheduled = pendingAfter.some(item => Number(item.id) === TEST_ID)

    return {
      native: true,
      scheduled: scheduled ? 1 : 0,
      reason: scheduled ? 'scheduled' : 'not_pending',
      warning: result.warning || null,
      warningCode: result.warning?.code || null,
      warningMessage: result.warning?.message || null,
      diagnostics: await getNotificationDiagnostics(),
    }
  } catch (error) {
    return {
      native: true,
      scheduled: 0,
      reason: 'schedule_error',
      errorCode: error?.code || null,
      error: error?.message || 'Unable to schedule test notification.',
      diagnostics: await getNotificationDiagnostics().catch(() => null),
    }
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
