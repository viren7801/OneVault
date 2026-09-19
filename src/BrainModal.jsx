import React, { useEffect, useRef, useState } from 'react'
import { ArrowUp, Search, Sparkles, X, Zap } from 'lucide-react'
import { askBrain, collectBrainContext } from './brain'

const SUGGESTIONS = [
  'How much have I spent this month?',
  'What are my next reminders?',
  'Which category am I spending the most on?',
  'Show me my overdue reminders.',
]

function formatAnswer(answer) {
  return String(answer || '').replace(/\n{3,}/g, '\n\n').trim()
}

export default function BrainModal({ user, onClose }) {
  const [question, setQuestion] = useState('')
  const [mode, setMode] = useState('quick')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState([])
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(timer)
  }, [])

  async function submit(event) {
    event?.preventDefault()
    const value = question.trim()
    if (!value || busy) return

    setBusy(true)
    setError('')
    setAnswer('')
    setSources([])
    setStage(mode === 'quick' ? 'Reading your OneVault data…' : 'Reading your OneVault data…')

    try {
      const context = await collectBrainContext(user.id, value)
      setStage(mode === 'quick' ? 'Quick answer…' : 'Claude is reasoning…')
      const result = await askBrain(value, context, { mode })
      setAnswer(formatAnswer(result.answer))
      setSources(result.sources || [])
      setStage('')
    } catch (brainError) {
      const code = brainError?.message || ''
      if (code === 'AUTH_REQUIRED') {
        setError('Your OneVault session expired. Sign in again and retry.')
      } else if (code === 'BRAIN_NOT_CONFIGURED') {
        setError('OneVault Brain is not configured on the server yet.')
      } else if (code === 'CONTEXT_TOO_LARGE') {
        setError('There is too much workspace data for this question. Try making the question more specific.')
      } else if (code === 'QUICK_UNSUPPORTED') {
        setError('Quick mode does not support this question yet. Switch to Claude for deeper reasoning.')
      } else {
        setError('OneVault Brain could not answer right now. Please try again.')
      }
      setStage('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-layer brain-layer" onMouseDown={onClose}>
      <section className="brain-modal" onMouseDown={event => event.stopPropagation()}>
        <header className="brain-header">
          <div className="brain-title-wrap">
            <div className="brain-icon"><Sparkles size={18}/></div>
            <div>
              <div className="panel-kicker">ONEVAULT BRAIN</div>
              <h3>Ask your workspace.</h3>
              <p>
            Quick mode answers supported questions locally. Claude mode sends only the selected workspace context for deeper reasoning.
            Password contents are never sent.
          </p>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18}/></button>
        </header>

        <div className="brain-mode-row">
          <div className="brain-mode-toggle" role="tablist" aria-label="Answer mode">
            <button
              type="button"
              className={mode === 'quick' ? 'active' : ''}
              onClick={() => { setMode('quick'); setAnswer(''); setSources([]); setError('') }}
              role="tab"
              aria-selected={mode === 'quick'}
            >
              <Zap size={13}/>
              Quick
            </button>
            <button
              type="button"
              className={mode === 'claude' ? 'active' : ''}
              onClick={() => { setMode('claude'); setAnswer(''); setSources([]); setError('') }}
              role="tab"
              aria-selected={mode === 'claude'}
            >
              <Sparkles size={13}/>
              Claude
            </button>
          </div>
          <span className="brain-mode-hint">
            {mode === 'quick'
              ? 'Instant local answers · no AI usage'
              : 'Deeper reasoning with Claude Sonnet 5'}
          </span>
        </div>

        <form className="brain-query" onSubmit={submit}>
          <Search size={17}/>
          <input
            ref={inputRef}
            value={question}
            onChange={event => setQuestion(event.target.value)}
            placeholder="Ask anything about your money, reminders or accounts…"
            aria-label="Ask OneVault"
          />
          <button type="submit" className="brain-submit" disabled={busy || !question.trim()} aria-label="Ask">
            <ArrowUp size={16}/>
          </button>
        </form>

        {!answer && !busy && !error && (
          <div className="brain-suggestions">
            <span>Try asking</span>
            <div>
              {SUGGESTIONS.map(item => (
                <button key={item} type="button" onClick={() => setQuestion(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}

        {busy && (
          <div className="brain-thinking">
            <div className="brain-thinking-icon"><Sparkles size={16}/></div>
            <div><strong>{stage || 'Thinking…'}</strong><span>Checking the relevant parts of your workspace.</span></div>
          </div>
        )}

        {error && <div className="form-error brain-error">{error}</div>}

        {answer && (
          <div className="brain-answer">
            <div className="brain-answer-head">
              <div><div className="panel-kicker">{mode === 'claude' ? 'CLAUDE ANSWER' : 'QUICK ANSWER'}</div><h4>Your OneVault context</h4></div>
              <button className="text-btn" type="button" onClick={() => { setAnswer(''); setSources([]); setError(''); setQuestion(''); window.setTimeout(() => inputRef.current?.focus(), 0) }}>
                Ask another
              </button>
            </div>
            <div className="brain-answer-body">{answer}</div>
            <div className="brain-privacy-note">
              <Sparkles size={13}/>
              <span>
                {mode === 'claude'
                  ? 'Claude received only workspace context. Password contents are excluded, and note content remains encrypted client-side.'
                  : 'No AI was used. The answer was calculated from your OneVault data locally.'}
              </span>
            </div>
            {sources.length > 0 && (
              <div className="brain-sources">
                <div className="panel-kicker">SUPPORTING DATA</div>
                <div className="brain-source-list">
                  {sources.slice(0, 6).map(source => <span key={source}>{source}</span>)}
                </div>
              </div>
            )}
          </div>
        )}

        <footer className="brain-footer">
          <span>
            {mode === 'quick'
              ? 'Quick mode · local calculation · no Claude usage.'
              : 'Claude mode · private context · only the relevant workspace data is sent.'}
          </span>
          <button type="button" className="secondary-btn" onClick={onClose}>Close</button>
        </footer>
      </section>
    </div>
  )
}
