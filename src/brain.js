import { supabase } from './lib/supabase'

const BRAIN_API_URL = 'https://onevault.patelviren.com/api/brain'

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function monthKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
}

function toRecord(row, accountMap) {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount) || 0,
    category: row.category || 'Other',
    description: row.description || '',
    spent_at: row.spent_at,
    account: row.account_id ? accountMap.get(row.account_id) || 'Unknown account' : 'No account',
  }
}

function rankTransaction(row, query) {
  const haystack = normalizeText([
    row.description,
    row.category,
    row.account,
    row.type,
  ].join(' '))
  const terms = normalizeText(query).split(/\s+/).filter(Boolean)
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 2 : 0), 0)
}

export async function collectBrainContext(userId, query = '') {
  const [transactionsResult, accountsResult, budgetsResult, remindersResult] = await Promise.all([
    supabase
      .from('expenses')
      .select('id,amount,type,category,description,spent_at,account_id')
      .eq('user_id', userId)
      .order('spent_at', { ascending: false })
      .limit(1200),
    supabase
      .from('accounts')
      .select('id,name,type,balance')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase
      .from('budgets')
      .select('id,category,amount,month')
      .eq('user_id', userId)
      .order('month', { ascending: false })
      .limit(100),
    supabase
      .from('reminders')
      .select('id,title,description,due_at,priority,completed,repeat_rule,notify_telegram')
      .eq('user_id', userId)
      .order('due_at', { ascending: true })
      .limit(400),
  ])

  const firstError = (
    transactionsResult.error ||
    accountsResult.error ||
    budgetsResult.error ||
    remindersResult.error
  )

  if (firstError) throw firstError

  const accounts = accountsResult.data || []
  const accountMap = new Map(accounts.map(account => [account.id, account.name]))
  const transactions = (transactionsResult.data || []).map(row => toRecord(row, accountMap))
  const reminders = remindersResult.data || []
  const budgets = budgetsResult.data || []

  const now = new Date()
  const currentMonth = monthKey(now)
  const currentYear = now.getFullYear()
  const monthRows = transactions.filter(row => monthKey(row.spent_at) === currentMonth)
  const yearRows = transactions.filter(row => new Date(row.spent_at).getFullYear() === currentYear)

  const summarizeRows = rows => ({
    income: rows.filter(row => row.type === 'income').reduce((sum, row) => sum + row.amount, 0),
    expenses: rows.filter(row => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0),
    transactions: rows.length,
  })

  const byCategory = rows => rows
    .filter(row => row.type === 'expense')
    .reduce((map, row) => {
      map[row.category] = (map[row.category] || 0) + row.amount
      return map
    }, {})

  const upcoming = reminders.filter(row => !row.completed && new Date(row.due_at) >= now).slice(0, 30)
  const overdue = reminders.filter(row => !row.completed && new Date(row.due_at) < now).slice(0, 30)
  const queryTerms = normalizeText(query)

  const relevantTransactions = [...transactions]
    .map(row => ({ row, score: rankTransaction(row, queryTerms) }))
    .sort((a, b) => b.score - a.score || new Date(b.row.spent_at) - new Date(a.row.spent_at))
    .slice(0, queryTerms ? 80 : 40)
    .map(item => item.row)

  return {
    generatedAt: now.toISOString(),
    coverage: {
      transactionRows: transactions.length,
      reminders: reminders.length,
      accounts: accounts.length,
      budgets: budgets.length,
      notes: 'Note content is encrypted client-side and is not sent to the Brain yet.',
      passwords: 'Password contents are never provided to the Brain.',
    },
    summaries: {
      currentMonth: summarizeRows(monthRows),
      currentYear: summarizeRows(yearRows),
      currentMonthByCategory: byCategory(monthRows),
      currentYearByCategory: byCategory(yearRows),
    },
    accounts,
    budgets,
    upcomingReminders: upcoming,
    overdueReminders: overdue,
    relevantTransactions,
  }
}


function formatInr(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function localBrainFallback(question, context) {
  const q = normalizeText(question)
  const summaries = context?.summaries || {}
  const month = summaries.currentMonth || { income: 0, expenses: 0, transactions: 0 }
  const year = summaries.currentYear || { income: 0, expenses: 0, transactions: 0 }

  if ((q.includes('spent') || q.includes('spend')) && q.includes('this month')) {
    return {
      answer: `You have spent ${formatInr(month.expenses)} this month across ${month.transactions} transactions.`,
      sources: ['summary:currentMonth'],
    }
  }

  if ((q.includes('spent') || q.includes('spend')) && q.includes('this year')) {
    return {
      answer: `You have spent ${formatInr(year.expenses)} this year across ${year.transactions} transactions.`,
      sources: ['summary:currentYear'],
    }
  }

  if ((q.includes('income') || q.includes('earned')) && q.includes('this month')) {
    return {
      answer: `Your income this month is ${formatInr(month.income)}.`,
      sources: ['summary:currentMonth'],
    }
  }

  if ((q.includes('income') || q.includes('earned')) && q.includes('this year')) {
    return {
      answer: `Your income this year is ${formatInr(year.income)}.`,
      sources: ['summary:currentYear'],
    }
  }

  if (q.includes('category') && (q.includes('most') || q.includes('highest') || q.includes('maximum') || q.includes('spend'))) {
    const entries = Object.entries(summaries.currentMonthByCategory || {})
      .sort((a, b) => b[1] - a[1])
    if (entries.length) {
      const [category, amount] = entries[0]
      return {
        answer: `${category} is your highest-spending category this month at ${formatInr(amount)}.`,
        sources: ['summary:currentMonthByCategory'],
      }
    }
    return { answer: 'There is no expense data for this month yet.', sources: [] }
  }

  if (q.includes('overdue') && q.includes('reminder')) {
    const rows = context?.overdueReminders || []
    if (!rows.length) return { answer: 'You have no overdue reminders.', sources: [] }
    const lines = rows.slice(0, 5).map(row => {
      const when = formatDate(row.due_at)
      return when ? `• ${row.title} — ${when}` : `• ${row.title}`
    })
    const more = rows.length > 5 ? ` and ${rows.length - 5} more` : ''
    return {
      answer: `You have ${rows.length} overdue reminder${rows.length === 1 ? '' : 's'}:\n${lines.join('\n')}${more}.`,
      sources: rows.slice(0, 5).map(row => `reminder:${row.id}`),
    }
  }

  if (q.includes('next') && q.includes('reminder') || q.includes('upcoming') && q.includes('reminder')) {
    const rows = context?.upcomingReminders || []
    if (!rows.length) return { answer: 'You have no upcoming reminders.', sources: [] }
    const lines = rows.slice(0, 5).map(row => {
      const when = formatDate(row.due_at)
      return when ? `• ${row.title} — ${when}` : `• ${row.title}`
    })
    return {
      answer: `Your next reminders are:\n${lines.join('\n')}`,
      sources: rows.slice(0, 5).map(row => `reminder:${row.id}`),
    }
  }

  if (q.includes('account') && (q.includes('balance') || q.includes('balances') || q.includes('how much'))) {
    const accounts = context?.accounts || []
    if (!accounts.length) return { answer: 'You do not have any accounts to show.', sources: [] }
    const lines = accounts.slice(0, 8).map(account => `• ${account.name}: ${formatInr(account.balance)}`)
    return {
      answer: `Your account balances are:\n${lines.join('\n')}`,
      sources: accounts.slice(0, 8).map(account => `account:${account.id}`),
    }
  }

  return null
}

export async function askBrain(question, context, { mode = 'quick' } = {}) {
  if (mode === 'quick') {
    const quickAnswer = localBrainFallback(question, context)
    if (quickAnswer) return quickAnswer
    throw new Error('QUICK_UNSUPPORTED')
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error('AUTH_REQUIRED')
  }

  const payload = {
    question: String(question || '').trim(),
    context,
    mode: 'claude',
  }

  try {
    const response = await fetch(BRAIN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + sessionData.session.access_token,
      },
      body: JSON.stringify(payload),
    })

    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
      if (response.status === 401 || body?.code === 'AUTH_REQUIRED') {
        throw new Error('AUTH_REQUIRED')
      }
      if (response.status === 413) throw new Error('CONTEXT_TOO_LARGE')
      if (response.status === 500 && body?.code === 'BRAIN_NOT_CONFIGURED') {
        throw new Error('BRAIN_NOT_CONFIGURED')
      }
      throw new Error(body?.error || 'BRAIN_FAILED')
    }

    return {
      answer: String(body?.answer || '').trim(),
      sources: Array.isArray(body?.sources) ? body.sources : [],
    }
  } catch (error) {
    throw error
  }
}
