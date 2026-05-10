import { useState, useEffect } from 'react'
import type { Codec, FrameRate, OutputFormat } from '../hooks/useCapture'

type Settings = {
  savePath: string
  bufferDuration: number
  hotkeyInstantReplay: string
  hotkeyStartStop: string
  hotkeyScreenshot: string
  quality: 'low' | 'medium' | 'high'
  codec: Codec
  frameRate: FrameRate
  outputFormat: OutputFormat
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.getSettings().then(setSettings)
  }, [])

  if (!settings) return <div className="loading">Loading settings…</div>

  const update = (key: keyof Settings, value: unknown) =>
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))

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

  const isMp4OrMkv = settings.outputFormat !== 'webm'

  return (
    <div className="settings-panel">
      {/* Save location */}
      <div className="settings-group">
        <label className="settings-label">SAVE LOCATION</label>
        <div className="path-row">
          <input className="settings-input path-input" value={settings.savePath} readOnly />
          <button className="btn-secondary" onClick={choosePath}>
            Browse
          </button>
        </div>
      </div>

      {/* Output format */}
      <div className="settings-group">
        <label className="settings-label">OUTPUT FORMAT</label>
        <div className="quality-btns">
          <button
            className={`quality-btn ${settings.outputFormat === 'mp4' ? 'active' : ''}`}
            onClick={() => update('outputFormat', 'mp4')}
          >
            MP4
            <span className="quality-hint">Most compatible</span>
          </button>
          <button
            className={`quality-btn ${settings.outputFormat === 'mkv' ? 'active' : ''}`}
            onClick={() => update('outputFormat', 'mkv')}
          >
            MKV
            <span className="quality-hint">Open container</span>
          </button>
          <button
            className={`quality-btn ${settings.outputFormat === 'webm' ? 'active' : ''}`}
            onClick={() => update('outputFormat', 'webm')}
          >
            WebM
            <span className="quality-hint">No conversion</span>
          </button>
        </div>

        {!isMp4OrMkv && (
          <p className="settings-hint">
            WebM is saved directly with no post-processing. Use MP4 for broad player/editor
            compatibility.
          </p>
        )}
      </div>

      {/* Video quality */}
      <div className="settings-group">
        <label className="settings-label">VIDEO QUALITY (BITRATE)</label>
        <div className="quality-btns">
          {(['low', 'medium', 'high'] as const).map((q) => (
            <button
              key={q}
              className={`quality-btn ${settings.quality === q ? 'active' : ''}`}
              onClick={() => update('quality', q)}
            >
              {q.charAt(0).toUpperCase() + q.slice(1)}
              <span className="quality-hint">
                {q === 'low' && '3 Mbps'}
                {q === 'medium' && '6 Mbps'}
                {q === 'high' && '10 Mbps'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Codec */}
      <div className="settings-group">
        <label className="settings-label">VIDEO CODEC</label>
        <div className="quality-btns">
          <button
            className={`quality-btn ${settings.codec === 'vp8' ? 'active' : ''}`}
            onClick={() => update('codec', 'vp8')}
          >
            VP8
            <span className="quality-hint">Fast · gaming</span>
          </button>
          <button
            className={`quality-btn ${settings.codec === 'vp9' ? 'active' : ''}`}
            onClick={() => update('codec', 'vp9')}
          >
            VP9
            <span className="quality-hint">Best quality</span>
          </button>
          <button
            className={`quality-btn ${settings.codec === 'auto' ? 'active' : ''}`}
            onClick={() => update('codec', 'auto')}
          >
            Auto
            <span className="quality-hint">Prefers H264</span>
          </button>
        </div>
        <p className="settings-hint">
          VP8 is recommended for gaming — much lighter on CPU than VP9. Auto will use H264 hardware
          acceleration if your GPU supports it, which gives the best quality/performance ratio.
        </p>
      </div>

      {/* Frame rate */}
      <div className="settings-group">
        <label className="settings-label">CAPTURE FRAME RATE</label>
        <div className="quality-btns">
          {([15, 30, 60] as FrameRate[]).map((fps) => (
            <button
              key={fps}
              className={`quality-btn ${settings.frameRate === fps ? 'active' : ''}`}
              onClick={() => update('frameRate', fps)}
            >
              {fps} fps
              <span className="quality-hint">
                {fps === 15 && 'Lightest'}
                {fps === 30 && 'Balanced'}
                {fps === 60 && 'Smooth'}
              </span>
            </button>
          ))}
        </div>
        <p className="settings-hint">
          30 fps is a good default. 60 fps doubles encoding load — only use if your machine handles
          it without impacting game performance.
        </p>
      </div>

      {/* Hotkeys */}
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
          Electron accelerator syntax: <code>Alt+F10</code>, <code>Ctrl+Shift+R</code>. Changes
          apply after saving.
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
