export default function TitleBar() {
  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <span className="app-logo">●</span>
        <span className="app-name">SHADOWCAP</span>
      </div>
      <div className="window-controls">
        <button className="wc-btn minimize" onClick={() => window.api.minimize()} title="Minimize">
          —
        </button>
        <button className="wc-btn maximize" onClick={() => window.api.maximize()} title="Maximize">
          ⬜
        </button>
        <button className="wc-btn close" onClick={() => window.api.close()} title="Close">
          ✕
        </button>
      </div>
    </div>
  )
}
