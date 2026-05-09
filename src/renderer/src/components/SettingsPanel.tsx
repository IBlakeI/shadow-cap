import { useState, useEffect } from 'react'

type Settings = {
  savePath: string
  bufferDuration: number
  hotkeyInstantReplay: string
  hotkeyStartStop: string
  hotkeyScreenshot: string
  quality: 'low' | 'medium' | 'high'
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.getSettings().then(setSettings)
  }, [])

  if (!settings) return <div className="loading">Loading settings…</div>

  const update = (key: keyof Settings, value: unknown) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const save = async () => {
    if (!settings) return
    await window.api.saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const choosePath = async () => {
    const path = await window.api.chooseSavePath()
    if (path) update('savePath', path)
  }

  return (
    <div className="settings-panel">
      <div className="settings-group">
        <label className="settings-label">SAVE LOCATION</label>
        <div className="path-row">
          <input className="settings-input path-input" value={settings.savePath} readOnly />
          <button className="btn-secondary" onClick={choosePath}>
            Browse
          </button>
        </div>
      </div>

      <div className="settings-group">
        <label className="settings-label">VIDEO QUALITY</label>
        <div className="quality-btns">
          {(['low', 'medium', 'high'] as const).map((q) => (
            <button
              key={q}
              className={`quality-btn ${settings.quality === q ? 'active' : ''}`}
              onClick={() => update('quality', q)}
            >
              {q.charAt(0).toUpperCase() + q.slice(1)}
              <span className="quality-hint">
                {q === 'low' && '2 Mbps'}
                {q === 'medium' && '8 Mbps'}
                {q === 'high' && '20 Mbps'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <label className="settings-label">HOTKEYS</label>
        <div className="hotkey-list">
          <HotkeyRow
            label="Instant Replay"
            value={settings.hotkeyInstantReplay}
            onChange={(v) => update('hotkeyInstantReplay', v)}
          />
          <HotkeyRow
            label="Start / Stop Recording"
            value={settings.hotkeyStartStop}
            onChange={(v) => update('hotkeyStartStop', v)}
          />
          <HotkeyRow
            label="Screenshot"
            value={settings.hotkeyScreenshot}
            onChange={(v) => update('hotkeyScreenshot', v)}
          />
        </div>
        <p className="settings-hint">
          Use Electron accelerator syntax: <code>Alt+F10</code>, <code>Ctrl+Shift+R</code>, etc.
          Changes apply after saving.
        </p>
      </div>

      <button className={`btn-primary save-btn ${saved ? 'saved' : ''}`} onClick={save}>
        {saved ? '✓ Saved!' : 'Save Settings'}
      </button>
    </div>
  )
}

function HotkeyRow({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="hotkey-row">
      <span className="hotkey-label">{label}</span>
      <input
        className="settings-input hotkey-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Alt+F10"
      />
    </div>
  )
}
