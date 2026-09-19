import { Capacitor } from '@capacitor/core'
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { supabase } from './supabase'

const STORAGE_KEY = 'supabase_session'

function isAndroid() {
  return Capacitor.getPlatform() === 'android'
}

function error(message, code) {
  const result = new Error(message)
  if (code) result.code = code
  return result
}

async function checkBiometricAvailability() {
  if (!Capacitor.isNativePlatform()) {
    return { isAvailable: false, strongBiometryIsAvailable: false, biometryType: 'web' }
  }

  return BiometricAuth.checkBiometry()
}

async function requireBiometricAvailability() {
  const availability = await checkBiometricAvailability()

  if (!availability?.isAvailable) {
    return {
      ok: false,
      error: error(
        availability?.reason
          ? 'Biometric unlock is not available: ' + availability.reason
          : 'Set up a fingerprint, face unlock, or device credential in Android Settings first.',
        availability?.code,
      ),
    }
  }

  if (isAndroid() && !availability?.strongBiometryIsAvailable) {
    return {
      ok: false,
      error: error(
        availability?.strongReason
          ? 'Fingerprint / strong biometric is not available: ' + availability.strongReason
          : 'Set up a fingerprint or another strong biometric in Android Settings before enabling device unlock.',
        availability?.strongCode,
      ),
    }
  }

  return { ok: true, availability }
}

function authenticateOptions(reason, title, subtitle) {
  const options = {
    reason,
    cancelTitle: 'Cancel',
    allowDeviceCredential: true,
    androidTitle: title,
    androidSubtitle: subtitle,
    androidConfirmationRequired: false,
  }

  if (isAndroid()) {
    options.androidBiometryStrength = 'strong'
  }

  return options
}

export async function persistNativeSession(session) {
  if (!Capacitor.isNativePlatform() || !session?.access_token || !session?.refresh_token) return false

  try {
    const availability = await requireBiometricAvailability()
    if (!availability.ok) return false

    await SecureStorage.set(STORAGE_KEY, {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
    return true
  } catch (nativeError) {
    console.warn('[oneVault] native biometric session was not stored:', nativeError?.message || nativeError)
    return false
  }
}

export async function clearNativeSession() {
  if (!Capacitor.isNativePlatform()) return

  try {
    await SecureStorage.remove(STORAGE_KEY)
  } catch (nativeError) {
    console.warn('[oneVault] native biometric session cleanup failed:', nativeError?.message || nativeError)
  }
}

export async function registerNativeAwarePasskey() {
  if (!Capacitor.isNativePlatform()) {
    return supabase.auth.registerPasskey()
  }

  try {
    const { data, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) return { data: null, error: sessionError }

    if (!data.session) {
      return { data: null, error: error('Sign in with your password first, then enable device unlock.') }
    }

    const availability = await requireBiometricAvailability()
    if (!availability.ok) {
      return { data: null, error: availability.error }
    }

    await BiometricAuth.authenticate(
      authenticateOptions(
        'Confirm you want to use this device to unlock oneVault.',
        'Enable oneVault device unlock',
        'Use your fingerprint or strong device biometric. Your PIN remains available as fallback.',
      ),
    )

    const stored = await persistNativeSession(data.session)
    if (!stored) {
      return {
        data: null,
        error: error('The biometric check succeeded, but the protected device session could not be stored.'),
      }
    }

    return { data: { user: data.session.user }, error: null }
  } catch (nativeError) {
    return {
      data: null,
      error: error(
        nativeError?.message || 'Biometric setup was cancelled or failed.',
        nativeError?.code,
      ),
    }
  }
}

export async function signInWithNativeAwarePasskey() {
  if (!Capacitor.isNativePlatform()) {
    return supabase.auth.signInWithPasskey()
  }

  try {
    const savedSession = await SecureStorage.get(STORAGE_KEY)

    if (!savedSession?.access_token || !savedSession?.refresh_token) {
      return {
        data: null,
        error: error('Device unlock is not set up yet. Sign in with your password first, then enable device unlock from Security.'),
      }
    }

    const availability = await requireBiometricAvailability()
    if (!availability.ok) {
      return { data: null, error: availability.error }
    }

    await BiometricAuth.authenticate(
      authenticateOptions(
        'Unlock your private oneVault workspace.',
        'Unlock oneVault',
        'Use your fingerprint or strong device biometric. Your PIN remains available as fallback.',
      ),
    )

    const { data, error: setSessionError } = await supabase.auth.setSession({
      access_token: savedSession.access_token,
      refresh_token: savedSession.refresh_token,
    })

    if (setSessionError) {
      await clearNativeSession()
      return { data: null, error: setSessionError }
    }

    await persistNativeSession(data.session)

    return { data, error: null }
  } catch (nativeError) {
    return {
      data: null,
      error: error(
        nativeError?.message || 'Biometric unlock failed or was cancelled.',
        nativeError?.code,
      ),
    }
  }
}
