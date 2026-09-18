function bytesToBase64Url(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < source.length; i += 1) binary += String.fromCharCode(source[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value) {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4) normalized += '='
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length))
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return null
}

async function encryptTextWithRawKey(secret, rawKey) {
  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt'])
  const iv = randomBytes(12)
  const plaintext = new TextEncoder().encode(secret)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return { iv: bytesToBase64Url(iv), ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)) }
}

async function decryptTextWithRawKey(payload, rawKey) {
  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt'])
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(payload.iv) },
    key,
    base64UrlToBytes(payload.ciphertext),
  )
  return new TextDecoder().decode(plaintext)
}

export async function isDeviceUnlockAvailable() {
  if (!window.isSecureContext || !window.PublicKeyCredential) return false
  if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export async function registerDeviceUnlock(secret, userLabel = 'oneVault') {
  if (!(await isDeviceUnlockAvailable())) {
    throw new Error('Device unlock is not available in this browser or device.')
  }

  const challenge = randomBytes(32)
  const prfSalt = randomBytes(32)
  const userId = randomBytes(16)

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'oneVault' },
      user: {
        id: userId,
        name: userLabel,
        displayName: 'oneVault',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
      timeout: 60000,
      attestation: 'none',
      extensions: {
        prf: {
          eval: { first: prfSalt },
        },
      },
    },
  })

  if (!credential) throw new Error('Device unlock setup was cancelled.')

  const extensionResults = credential.getClientExtensionResults?.() || {}
  const prfOutput = asBytes(extensionResults?.prf?.results?.first)

  if (!prfOutput) {
    throw new Error('This device can use a platform authenticator, but secure PRF-based vault unlock is not available in this browser. Use your password instead.')
  }

  const wrappedSecret = await encryptTextWithRawKey(secret, prfOutput)

  return {
    credential_id: bytesToBase64Url(credential.rawId),
    prf_salt: bytesToBase64Url(prfSalt),
    iv: wrappedSecret.iv,
    ciphertext: wrappedSecret.ciphertext,
  }
}

export async function unlockWithDevice(record) {
  if (!record?.credential_id || !record?.prf_salt || !record?.iv || !record?.ciphertext) {
    throw new Error('Device unlock is not configured for this vault.')
  }

  if (!window.isSecureContext || !navigator.credentials) {
    throw new Error('Device unlock requires a secure browser context.')
  }

  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [
        {
          id: base64UrlToBytes(record.credential_id),
          type: 'public-key',
        },
      ],
      userVerification: 'required',
      timeout: 60000,
      extensions: {
        prf: {
          eval: {
            first: base64UrlToBytes(record.prf_salt),
          },
        },
      },
    },
  })

  if (!credential) throw new Error('Device unlock was cancelled.')

  const extensionResults = credential.getClientExtensionResults?.() || {}
  const prfOutput = asBytes(extensionResults?.prf?.results?.first)

  if (!prfOutput) {
    throw new Error('The browser did not return a secure device-unlock result. Use your vault password instead.')
  }

  return decryptTextWithRawKey(
    { iv: record.iv, ciphertext: record.ciphertext },
    prfOutput,
  )
}
