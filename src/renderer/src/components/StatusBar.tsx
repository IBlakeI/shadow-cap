import { RecordingState } from '../hooks/useCapture'

interface Props {
  state: RecordingState
  recordingTime: number
  bufferDuration: number
}

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function StatusBar({ state, recordingTime, bufferDuration }: Props) {
  return (
    <div className="status-bar">
      <div className={`status-dot dot-${state}`} />
      <span className="status-text">
        {state === 'idle' && 'Ready'}
        {state === 'buffering' && `Buffering — last ${Math.floor(bufferDuration / 60)}m rolling`}
        {state === 'recording' && `Recording — ${formatTime(recordingTime)}`}
        {state === 'saving' && 'Saving…'}
      </span>
      <span className="status-hint">ShadowCap • 100% local</span>
    </div>
  )
}
