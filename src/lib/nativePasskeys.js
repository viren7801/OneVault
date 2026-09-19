import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

let nativePasskeysPromise

async function getNativePasskeys() {
  if (!Capacitor.isNativePlatform()) return null
  if (!Capacitor.isPluginAvailable('Passkeys')) {
    throw new Error('Native passkey support is not included in this oneVault build.')
  }
  if (!nativePasskeysPromise) {
    nativePasskeysPromise = import('@capawesome/capacitor-passkeys').then(module => module.Passkeys)
  }
  return nativePasskeysPromise
}

function normalizeNativeError(error, fallback) {
  if (error instanceof Error) return error
  const normalized = new Error(error?.message || fallback)
  if (error?.code) normalized.code = error.code
  return normalized
}

export async function registerNativeAwarePasskey() {
  const nativePasskeys = await getNativePasskeys()
  if (!nativePasskeys) {
    return supabase.auth.registerPasskey()
  }

  try {
    const { data: options, error: startError } = await supabase.auth.passkey.startRegistration()
    if (startError) return { data: null, error: startError }
    if (!options?.challenge_id || !options?.options) {
      return { data: null, error: new Error('Supabase did not return valid passkey registration options.') }
    }

    const credential = await nativePasskeys.createPasskey(options.options)
    return await supabase.auth.passkey.verifyRegistration({
      challengeId: options.challenge_id,
      credential,
    })
  } catch (error) {
    return {
      data: null,
      error: normalizeNativeError(error, 'Native passkey registration failed.'),
    }
  }
}

export async function signInWithNativeAwarePasskey() {
  const nativePasskeys = await getNativePasskeys()
  if (!nativePasskeys) {
    return supabase.auth.signInWithPasskey()
  }

  try {
    const { data: options, error: startError } = await supabase.auth.passkey.startAuthentication()
    if (startError) return { data: null, error: startError }
    if (!options?.challenge_id || !options?.options) {
      return { data: null, error: new Error('Supabase did not return valid passkey sign-in options.') }
    }

    const credential = await nativePasskeys.getPasskey(options.options)
    return await supabase.auth.passkey.verifyAuthentication({
      challengeId: options.challenge_id,
      credential,
    })
  } catch (error) {
    return {
      data: null,
      error: normalizeNativeError(error, 'Native passkey sign-in failed.'),
    }
  }
}
