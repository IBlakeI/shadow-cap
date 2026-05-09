import { JSX, useState } from 'react'
import { useCapture } from './hooks/useCapture'
import TitleBar from './components/TitleBar'
import SourcePicker from './components/SourcePicker'
import ControlPanel from './components/ControlPanel'
import StatusBar from './components/StatusBar'
import SettingsPanel from './components/SettingsPanel'
import SavedFiles from './components/SavedFiles'
import './assets/main.css'

type Tab = 'capture' | 'files' | 'settings'

const App = (): JSX.Element => {
  const capture = useCapture()
  const [tab, setTab] = useState<Tab>('capture')

  return (
    <div className="app">
      <TitleBar />

      <nav className="tab-bar">
        {(['capture', 'files', 'settings'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'capture' && <span className="tab-icon">⬛</span>}
            {t === 'files' && <span className="tab-icon">▤</span>}
            {t === 'settings' && <span className="tab-icon">⚙</span>}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <main className="content">
        {capture.error && (
          <div className="error-banner">
            <span>{capture.error}</span>
            <button onClick={capture.clearError}>✕</button>
          </div>
        )}

        {tab === 'capture' && (
          <div className="capture-layout">
            <SourcePicker
              sources={capture.sources}
              selected={capture.selectedSource}
              onSelect={capture.setSelectedSource}
              onRefresh={capture.refreshSources}
            />
            <ControlPanel capture={capture} />
          </div>
        )}

        {tab === 'files' && (
          <SavedFiles files={capture.savedFiles} onOpenFolder={() => window.api.openSaveFolder()} />
        )}

        {tab === 'settings' && <SettingsPanel />}
      </main>

      <StatusBar
        state={capture.state}
        recordingTime={capture.recordingTime}
        bufferDuration={capture.bufferDuration}
      />
    </div>
  )
}
export default App
