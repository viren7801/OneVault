import React, { useEffect, useState } from 'react'
import { Check, Fingerprint, KeyRound, Lock, Pencil, ShieldCheck, Trash2, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { registerNativeAwarePasskey } from './lib/nativePasskeys'

function deviceHint(name = '') {
  const value = name.toLowerCase()
  if (value.includes('iphone') || value.includes('ipad') || value.includes('ios')) return 'Face ID / Touch ID'
  if (value.includes('mac')) return 'Touch ID / passkey'
  if (value.includes('windows')) return 'Windows Hello'
  if (value.includes('android')) return 'Fingerprint / face unlock'
  return 'Passkey / device unlock'
}

export default function PasskeyManager({ open, onClose, user, autoLockMinutes, onAutoLockChange, onLockNow }) {
  const [passkeys, setPasskeys] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')

  async function load() {
    if (!open) return
    setLoading(true)
    setError('')
    try {
      const { data, error: listError } = await supabase.auth.passkey.list()
      if (listError) throw listError
      setPasskeys(data || [])
    } catch (err) {
      setError(err.message || 'Could not load your device passkeys.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [open])

  async function addDevice() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { error: registerError } = await registerNativeAwarePasskey()
      if (registerError) throw registerError
      await load()
      setNotice('This device is now registered for oneVault sign-in.')
    } catch (err) {
      setError(err.message || 'Device registration was cancelled or failed.')
    } finally {
      setBusy(false)
    }
  }

  function beginRename(passkey) {
    setEditingId(passkey.id)
    setEditingName(passkey.friendly_name || deviceHint(passkey.friendly_name))
    setError('')
    setNotice('')
  }

  async function saveRename(passkey) {
    const name = editingName.trim()
    if (!name) {
      setError('Enter a device name.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { error: updateError } = await supabase.auth.passkey.update({
        passkeyId: passkey.id,
        friendlyName: name,
      })
      if (updateError) throw updateError
      setEditingId(null)
      setEditingName('')
      await load()
      setNotice('Device name updated.')
    } catch (err) {
      setError(err.message || 'Could not rename this device.')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(passkey) {
    const label = passkey.friendly_name || 'this device'
    if (!window.confirm('Remove “' + label + '” from oneVault sign-in? You will not be able to use that passkey here again.')) return

    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { error: deleteError } = await supabase.auth.passkey.delete({ passkeyId: passkey.id })
      if (deleteError) throw deleteError
      await load()
      setNotice('Device access removed.')
    } catch (err) {
      setError(err.message || 'Could not remove the device.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return <div className="modal-layer">
    <div className="modal device-security-modal">
      <div className="modal-header">
        <div>
          <div className="panel-kicker">DEVICE SECURITY</div>
          <h3>Passkeys & trusted devices</h3>
          <p className="modal-subtle">Sign in with Face ID, Touch ID, fingerprint, Windows Hello or a passkey.</p>
        </div>
        <button className="icon-btn" onClick={onClose}><X size={18}/></button>
      </div>

      <div className="device-security-hero">
        <div className="device-security-icon"><Fingerprint size={22}/></div>
        <div>
          <strong>Private device sign-in</strong>
          <span>{passkeys.length} registered device{passkeys.length === 1 ? '' : 's'}</span>
        </div>
        <ShieldCheck size={17}/>
      </div>

      {error && <div className="form-error">{error}</div>}
      {notice && <div className="telegram-notice"><Check size={14}/> {notice}</div>}

      <div className="device-security-list">
        {loading ? <div className="device-security-empty">Loading devices…</div> : passkeys.length === 0 ? (
          <div className="device-security-empty">
            <KeyRound size={22}/>
            <strong>No passkeys yet.</strong>
            <span>Add this device and oneVault can use its built-in biometric/security prompt on future logins.</span>
          </div>
        ) : passkeys.map(passkey => (
          <div className="device-security-row" key={passkey.id}>
            <div className="device-security-row-icon"><Fingerprint size={16}/></div>
            <div className="device-security-copy">
              {editingId === passkey.id ? (
                <div className="device-name-edit">
                  <input value={editingName} onChange={e=>setEditingName(e.target.value)} autoFocus />
                  <button className="mini-btn" onClick={()=>void saveRename(passkey)} disabled={busy}><Check size={13}/></button>
                  <button className="mini-btn" onClick={()=>{setEditingId(null);setEditingName('')}} disabled={busy}><X size={13}/></button>
                </div>
              ) : (
                <>
                  <strong>{passkey.friendly_name || 'Registered device'}</strong>
                  <small>{deviceHint(passkey.friendly_name)} · Added {passkey.created_at ? new Date(passkey.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : 'recently'}</small>
                </>
              )}
            </div>
            {editingId !== passkey.id && <div className="device-security-actions">
              <button className="mini-btn" title="Rename device" onClick={()=>beginRename(passkey)} disabled={busy}><Pencil size={13}/></button>
              <button className="mini-btn danger" title="Remove device" onClick={()=>void revoke(passkey)} disabled={busy}><Trash2 size={13}/></button>
            </div>}
          </div>
        ))}
      </div>

      <div className="device-security-footer">
        <div className="security-setting-row">
          <div>
            <strong>Auto-lock</strong>
            <span>Sign out this browser after inactivity.</span>
          </div>
          <select value={String(autoLockMinutes)} onChange={e=>onAutoLockChange(Number(e.target.value))}>
            <option value="5">5 minutes</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
            <option value="0">Never</option>
          </select>
        </div>
        <span>Your private passkey key stays with your authenticator. oneVault receives only the verification needed to create a Supabase session.</span>
        <div className="modal-actions"><button className="secondary-btn" onClick={onLockNow}><Lock size={14}/> Lock now</button>
          <button className="secondary-btn" onClick={onClose}>Done</button>
          <button className="primary-btn" onClick={()=>void addDevice()} disabled={busy}>{busy ? 'Waiting for device…' : 'Add this device'}</button>
        </div>
      </div>
    </div>
  </div>
}
