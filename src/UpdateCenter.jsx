import React, { useEffect, useState } from 'react'
import { Check, DownloadCloud, RefreshCw, X, Zap } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { getLiveUpdateStatus, initializeLiveUpdates, installLatestLiveUpdate } from './lib/liveUpdates'

function shortBundle(id) {
  return id ? id.slice(0, 8) : 'built-in'
}

export default function UpdateCenter() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const [latest, setLatest] = useState(null)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    void initializeLiveUpdates()
  }, [])

  if (!Capacitor.isNativePlatform()) return null

  async function check() {
    setState('checking')
    setMessage('')
    try {
      const status = await getLiveUpdateStatus()
      setLatest(status)
      if (status.available) {
        setState('available')
        setMessage(status.staged
          ? 'The latest update is already downloaded. Tap Update now to apply it.'
          : 'A new oneVault update is ready to install.')
      } else {
        setState('current')
        setMessage('You are already using the latest app update.')
      }
    } catch (error) {
      setState('error')
      setMessage(error?.message || 'Could not check for updates.')
    }
  }

  async function updateNow() {
    setState('downloading')
    setMessage('Downloading the latest oneVault update…')
    setProgress(0)
    try {
      const result = await installLatestLiveUpdate(value => setProgress(value))
      if (!result.updated) {
        setState('current')
        setMessage('You are already using the latest app update.')
        return
      }
      setState('restarting')
      setMessage('Update downloaded. Restarting oneVault…')
      window.setTimeout(() => {
        void result.reload?.()
      }, 350)
    } catch (error) {
      setState('error')
      setMessage(error?.message || 'The update could not be installed.')
    }
  }

  function openCenter() {
    setOpen(true)
    if (state === 'idle') void check()
  }

  return <>
    <button className="onevault-update-pill" onClick={openCenter} title="Check for oneVault updates">
      <DownloadCloud size={15} />
      <span>Updates</span>
    </button>

    {open && <div className="update-center-layer" onMouseDown={() => setOpen(false)}>
      <section className="update-center-card" onMouseDown={event => event.stopPropagation()}>
        <header className="update-center-header">
          <div>
            <div className="update-center-kicker"><Zap size={13} /> ONEVAULT UPDATE CENTER</div>
            <h3>Keep oneVault current</h3>
            <p>Normal app features can be delivered directly to this installed app without another APK.</p>
          </div>
          <button className="update-center-close" onClick={() => setOpen(false)} aria-label="Close"><X size={17} /></button>
        </header>

        <div className="update-center-status">
          <div className="update-center-icon">
            {state === 'current' ? <Check size={20} /> : <RefreshCw size={20} className={state === 'checking' || state === 'downloading' ? 'update-spin' : ''} />}
          </div>
          <div className="update-center-copy">
            <strong>
              {state === 'checking' ? 'Checking for updates…'
                : state === 'available' ? 'Update available'
                : state === 'downloading' ? 'Downloading update…'
                : state === 'restarting' ? 'Applying update…'
                : state === 'current' ? 'oneVault is up to date'
                : 'Ready to update'}
            </strong>
            <span>{message || 'Tap check to see whether a newer web-layer version is available.'}</span>
          </div>
        </div>

        {state === 'downloading' && <div className="update-progress">
          <div className="update-progress-track"><span style={{ width: Math.max(4, progress * 100) + '%' }} /></div>
          <span>{Math.round(progress * 100)}%</span>
        </div>}

        {latest?.latestBundleId && <div className="update-center-meta">
          <span>Current: {shortBundle(latest.currentBundleId)}</span>
          <span>Latest: {shortBundle(latest.latestBundleId)}</span>
        </div>}

        <div className="update-center-actions">
          <button className="secondary-btn" onClick={() => void check()} disabled={state === 'checking' || state === 'downloading' || state === 'restarting'}>
            <RefreshCw size={14} className={state === 'checking' ? 'update-spin' : ''} /> Check again
          </button>
          {state === 'available' && <button className="primary-btn" onClick={() => void updateNow()}>
            <DownloadCloud size={15} /> Update now
          </button>}
          {state === 'current' && <button className="primary-btn" onClick={() => void check()}>
            <Check size={15} /> Check again
          </button>}
        </div>

        <div className="update-center-footnote">
          Native changes such as new Capacitor plugins, signing, or Android/iOS configuration still require a normal native release. UI, JavaScript, and CSS updates can use this button.
        </div>
      </section>
    </div>}
  </>
}
