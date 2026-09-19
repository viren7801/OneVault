import { supabase } from './lib/supabase'

const RECEIPT_API_URL = 'https://onevault.patelviren.com/api/scan-receipt'
const MAX_IMAGE_EDGE = 1800
const JPEG_QUALITY = 0.82

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('UNSUPPORTED_IMAGE'))
    }

    image.src = url
  })
}

async function prepareReceiptImage(file) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('UNSUPPORTED_IMAGE')
  }

  const image = await loadImage(file)
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height))
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('IMAGE_PROCESSING_FAILED')

  context.drawImage(image, 0, 0, width, height)

  const blob = await new Promise(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  })

  if (!blob) throw new Error('IMAGE_PROCESSING_FAILED')

  return new File([blob], 'receipt.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result || '')
      const comma = value.indexOf(',')
      resolve(comma >= 0 ? value.slice(comma + 1) : value)
    }
    reader.onerror = () => reject(new Error('Could not read the receipt image.'))
    reader.readAsDataURL(file)
  })
}

export async function scanReceipt(file) {
  const preparedFile = await prepareReceiptImage(file)
  const base64 = await fileToBase64(preparedFile)

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw new Error('AUTH_REQUIRED')
  if (!sessionData.session?.access_token) throw new Error('AUTH_REQUIRED')

  const response = await fetch(RECEIPT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
    body: JSON.stringify({
      image: base64,
      mediaType: preparedFile.type,
    }),
  })

  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const code = body?.code || body?.error
    if (response.status === 401 || code === 'AUTH_REQUIRED') throw new Error('AUTH_REQUIRED')
    if (response.status === 413) throw new Error('IMAGE_TOO_LARGE')
    if (response.status === 422 || code === 'NO_AMOUNT_FOUND') throw new Error('NO_AMOUNT_FOUND')
    if (response.status === 500 && /API key|not configured/i.test(body?.error || '')) {
      throw new Error('SERVER_NOT_CONFIGURED')
    }
    throw new Error('REQUEST_FAILED')
  }

  const amount = Number(String(body?.amount ?? '').replace(/,/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('NO_AMOUNT_FOUND')

  return {
    merchant: String(body?.merchant || '').trim(),
    amount,
    date: body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : new Date().toISOString().slice(0, 10),
    category: String(body?.category || 'Other'),
    note: String(body?.note || body?.merchant || '').trim(),
  }
}
