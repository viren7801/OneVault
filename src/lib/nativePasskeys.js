import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

const STORAGE_KEY = 'supabase_session'
let biometricPromise
let secureStoragePromise

async function getBiometricAuth() {
  if (!Capacitor.isNativePlatform()) return null
  if (!biometricPromise) {
    biometricPromise = import('@aparajita/capacitor-biometric-auth').then(module => module.BiometricAuth)
  }
  return biometricPromise
}

async function getSecureStorage() {
  if (!Capacitor.isNativePlatform()) return null
  if (!secureStoragePromise) {
    secureStoragePromise = import('@aparajita/capacitor-secure-storage').then(module => module.SecureStorage)
  }
  return secureStoragePromise
}

function error(message, code) {
  const result = new Error(message)
  if (code) result.code = code
  return result
}

async function checkBiometricAvailability() {
  const biometricAuth = await getBiometricAuth()
  if (!biometricAuth) return { isAvailable: false, biometryType: 'web' }
  return biometricAuth.checkBiometry()
}

export async function persistNativeSession(session) {
  if (!Capacitor.isNativePlatform() || !session?.access_token || !session?.refresh_token) return false

  try {
    const info = await checkBiometricAvailability()
    if (!info?.isAvailable) return false

    const secureStorage = await getSecureStorage()
    await secureStorage.set(STORAGE_KEY, {
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
    const secureStorage = await getSecureStorage()
    await secureStorage.remove(STORAGE_KEY)
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

    const biometricAuth = await getBiometricAuth()
    const availability = await biometricAuth.checkBiometry()
    if (!availability?.isAvailable) {
      return {
        data: null,
        error: error(
          availability?.reason
            ? 'Biometric unlock is not available: ' + availability.reason
            : 'Set up a fingerprint, face unlock, or device credential in Android Settings first.',
          availability?.code,
        ),
      }
    }

    await biometricAuth.authenticate({
      reason: 'Confirm you want to use this device to unlock oneVault.',
      cancelTitle: 'Cancel',
      allowDeviceCredential: true,
      androidTitle: 'Enable oneVault device unlock',
      androidSubtitle: 'Use your fingerprint or device PIN to protect oneVault.',
      androidConfirmationRequired: false,
    })

    await persistNativeSession(data.session)

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
    const secureStorage = await getSecureStorage()
    const savedSession = await secureStorage.get(STORAGE_KEY)

    if (!savedSession?.access_token || !savedSession?.refresh_token) {
      return {
        data: null,
        error: error('Device unlock is not set up yet. Sign in with your password first, then enable device unlock from Security.'),
      }
    }

    const biometricAuth = await getBiometricAuth()
    const availability = await biometricAuth.checkBiometry()
    if (!availability?.isAvailable) {
      return {
        data: null,
        error: error(
          availability?.reason
            ? 'Biometric unlock is unavailable: ' + availability.reason
            : 'Fingerprint or device unlock is not available on this device.',
          availability?.code,
        ),
      }
    }

    await biometricAuth.authenticate({
      reason: 'Unlock your private oneVault workspace.',
      cancelTitle: 'Cancel',
      allowDeviceCredential: true,
      androidTitle: 'Unlock oneVault',
      androidSubtitle: 'Use your fingerprint or device PIN.',
      androidConfirmationRequired: false,
    })

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
