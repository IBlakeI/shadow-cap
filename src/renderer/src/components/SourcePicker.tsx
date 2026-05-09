import { CaptureSource } from '../hooks/useCapture'

interface Props {
  sources: CaptureSource[]
  selected: CaptureSource | null
  onSelect: (s: CaptureSource) => void
  onRefresh: () => void
}

export default function SourcePicker({ sources, selected, onSelect, onRefresh }: Props) {
  return (
    <div className="source-picker">
      <div className="section-header">
        <span className="section-title">CAPTURE SOURCE</span>
        <button className="icon-btn" onClick={onRefresh} title="Refresh sources">
          ↺
        </button>
      </div>

      {sources.length === 0 ? (
        <div className="empty-sources">
          <p>No sources found.</p>
          <button className="btn-secondary" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      ) : (
        <div className="source-grid">
          {sources.map((src) => (
            <button
              key={src.id}
              className={`source-card ${selected?.id === src.id ? 'selected' : ''}`}
              onClick={() => onSelect(src)}
            >
              <div className="source-thumb">
                {src.thumbnail ? (
                  <img src={src.thumbnail} alt={src.name} />
                ) : (
                  <div className="thumb-placeholder">⬛</div>
                )}
                {selected?.id === src.id && <div className="selected-overlay">✓</div>}
              </div>
              <span className="source-name">{src.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
