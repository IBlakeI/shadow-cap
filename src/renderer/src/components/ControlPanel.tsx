import { useCapture, RecordingState } from '../hooks/useCapture'

interface Props {
  capture: ReturnType<typeof useCapture>
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const STATE_LABELS: Record<RecordingState, string> = {
  idle: 'IDLE',
  buffering: 'BUFFERING',
  recording: 'RECORDING',
  saving: 'SAVING…'
}

export default function ControlPanel({ capture }: Props) {
  const { state, recordingTime, bufferDuration, updateBufferDuration } = capture

  const isIdle = state === 'idle'
  const isBuffering = state === 'buffering'
  const isRecording = state === 'recording'
  const isSaving = state === 'saving'

  return (
    <div className="control-panel">
      <div className="section-header">
        <span className="section-title">CONTROLS</span>
      </div>

      {/* Status indicator */}
      <div className={`state-indicator state-${state}`}>
        <span className="state-dot" />
        <span className="state-label">{STATE_LABELS[state]}</span>
        {isRecording && <span className="recording-timer">{formatTime(recordingTime)}</span>}
      </div>

      {/* Buffer toggle */}
      <div className="control-section">
        <p className="control-desc">
          Start the rolling buffer first — it silently records the last{' '}
          <strong>{Math.floor(bufferDuration / 60)} min</strong> so you can save a replay anytime.
        </p>

        <div className="btn-row">
          {(isIdle || isBuffering) && !isSaving && (
            <button
              className={`btn-primary ${isBuffering ? 'active-glow' : ''}`}
              onClick={isBuffering ? capture.stopAll : capture.startBuffer}
              disabled={!capture.selectedSource || isSaving}
            >
              {isBuffering ? '⏹ Stop Buffer' : '⏺ Start Buffer'}
            </button>
          )}

          {(isBuffering || isRecording) && (
            <button
              className={`btn-record ${isRecording ? 'recording-pulse' : ''}`}
              onClick={isRecording ? capture.stopRecording : capture.startRecording}
              disabled={isSaving}
            >
              {isRecording ? '⏹ Stop Recording' : '⏺ Record Now'}
            </button>
          )}
        </div>
      </div>

      {/* Instant replay */}
      <div className="control-section replay-section">
        <span className="control-label">INSTANT REPLAY</span>
        <p className="control-desc">Save the last N seconds from the buffer.</p>
        <div className="replay-btns">
          {[30, 60, 120, 300].map((s) => (
            <button
              key={s}
              className="btn-replay"
              onClick={() => capture.saveReplay(s)}
              disabled={!isBuffering && !isRecording}
            >
              {s >= 60 ? `${s / 60}m` : `${s}s`}
            </button>
          ))}
          <button
            className="btn-replay btn-replay-full"
            onClick={() => capture.saveReplay()}
            disabled={!isBuffering && !isRecording}
          >
            Full
          </button>
        </div>
      </div>

      {/* Screenshot */}
      <div className="control-section">
        <span className="control-label">SCREENSHOT</span>
        <button
          className="btn-secondary"
          onClick={capture.takeScreenshot}
          disabled={!capture.selectedSource || isSaving}
        >
          📷 Take Screenshot
        </button>
      </div>

      {/* Buffer duration slider */}
      <div className="control-section">
        <span className="control-label">
          BUFFER DURATION — {Math.floor(bufferDuration / 60)} min {bufferDuration % 60}s
        </span>
        <input
          type="range"
          min={30}
          max={1800}
          step={30}
          value={bufferDuration}
          onChange={(e) => updateBufferDuration(Number(e.target.value))}
          className="slider"
          disabled={isBuffering || isRecording}
        />
        <div className="slider-labels">
          <span>30s</span>
          <span>30 min</span>
        </div>
      </div>
    </div>
  )
}
