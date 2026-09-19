const PROMPT = `You are reading a photo of a purchase receipt or online order confirmation, with special attention to Indian receipts and UPI/card payments.

Return ONLY raw JSON. No markdown fences. No commentary.

{
  "merchant": "store or vendor name, or empty string if unclear",
  "amount": 0,
  "date": "YYYY-MM-DD",
  "category": "Food | Shopping | Transport | Bills | Entertainment | Health | Travel | Other",
  "note": "a short 3-6 word description"
}

Rules:
- Use the FINAL TOTAL / GRAND TOTAL / AMOUNT PAID, never a subtotal, tax-only amount, discount, or line-item amount.
- Read Indian number formats correctly, including commas, decimals and rupee symbols.
- Prefer the transaction date on the receipt. If there is no readable date, use null.
- Pick the closest category from the exact allowed list.
- Keep note short, useful, and based on the receipt.
- If this is not a purchase receipt/order confirmation, or the total cannot be determined confidently, return "amount": null.
`

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const ALLOWED_CATEGORIES = new Set([
  'Food',
  'Shopping',
  'Transport',
  'Bills',
  'Entertainment',
  'Health',
  'Travel',
  'Other',
])

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
}

async function authenticateRequest(req) {
  const authorization = req.headers.authorization || ''
  const match = authorization.match(/^Bearer\\s+(.+)$/i)
  if (!match) return null

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_SERVER_NOT_CONFIGURED')
  }

  const response = await fetch(`${supabaseUrl.replace(/\\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${match[1]}`,
    },
  })

  if (!response.ok) return null

  const user = await response.json()
  const allowedEmail = (
    process.env.ONEVAULT_ALLOWED_EMAIL ||
    process.env.VITE_ALLOWED_EMAIL ||
    ''
  ).trim().toLowerCase()

  if (allowedEmail && String(user?.email || '').trim().toLowerCase() !== allowedEmail) {
    return null
  }

  return user
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}')
  return {}
}

function normalizeJson(text) {
  const cleaned = String(text || '')
    .replace(/^\\s*\`\`\`json\\s*/i, '')
    .replace(/^\\s*\`\`\`\\s*/i, '')
    .replace(/\\s*\`\`\`\\s*$/i, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\\{[\\s\\S]*\\}/)
    if (!match) throw new Error('INVALID_JSON')
    return JSON.parse(match[0])
  }
}

function normalizeDate(value) {
  if (typeof value === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(value)) {
    return value
  }
  return null
}

export default async function handler(req, res) {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const user = await authenticateRequest(req)

    if (!user) {
      res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' })
      return
    }

    const body = readJsonBody(req)
    const image = String(body?.image || '')
    const mediaType = String(body?.mediaType || '').toLowerCase()

    if (!image || !ALLOWED_MEDIA_TYPES.has(mediaType)) {
      res.status(400).json({ error: 'Missing or unsupported receipt image.' })
      return
    }

    if (image.length > 9_500_000) {
      res.status(413).json({ error: 'Receipt image is too large. Choose a smaller image.' })
      return
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      res.status(500).json({ error: 'Receipt scanning API key is not configured.' })
      return
    }

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.RECEIPT_SCAN_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: image,
                },
              },
              {
                type: 'text',
                text: PROMPT,
              },
            ],
          },
        ],
      }),
    })

    if (!anthropicResponse.ok) {
      const providerError = await anthropicResponse.text()
      console.error('[OneVault] Claude receipt scan failed:', providerError.slice(0, 600))
      res.status(502).json({ error: 'Claude could not read this receipt.' })
      return
    }

    const data = await anthropicResponse.json()
    const textBlock = (data.content || []).find(block => block?.type === 'text')

    if (!textBlock?.text) {
      res.status(502).json({ error: 'Claude returned no receipt data.' })
      return
    }

    let parsed
    try {
      parsed = normalizeJson(textBlock.text)
    } catch {
      res.status(502).json({ error: 'Claude returned invalid receipt data.' })
      return
    }

    const amount = Number(String(parsed?.amount ?? '').replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(422).json({
        error: 'Could not find a clear total on the receipt.',
        code: 'NO_AMOUNT_FOUND',
      })
      return
    }

    const category = ALLOWED_CATEGORIES.has(parsed?.category)
      ? parsed.category
      : 'Other'

    res.status(200).json({
      merchant: typeof parsed?.merchant === 'string' ? parsed.merchant.trim().slice(0, 120) : '',
      amount: Math.round(amount * 100) / 100,
      date: normalizeDate(parsed?.date),
      category,
      note: typeof parsed?.note === 'string'
        ? parsed.note.trim().slice(0, 120)
        : '',
    })
  } catch (error) {
    console.error('[OneVault] receipt scan error:', error)
    if (error?.message === 'SUPABASE_SERVER_NOT_CONFIGURED') {
      res.status(500).json({ error: 'Server authentication is not configured.' })
      return
    }
    res.status(500).json({ error: 'Unable to scan this receipt right now.' })
  }
}
