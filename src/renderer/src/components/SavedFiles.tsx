interface Props {
  files: string[]
  onOpenFolder: () => void
}

function fileIcon(path: string) {
  if (path.endsWith('.png') || path.endsWith('.jpg')) return '🖼'
  return '🎬'
}

function shortName(path: string) {
  // Works on both / and \
  return path.split(/[\\/]/).pop() ?? path
}

export default function SavedFiles({ files, onOpenFolder }: Props) {
  return (
    <div className="saved-files">
      <div className="section-header">
        <span className="section-title">SAVED FILES</span>
        <button className="btn-secondary" onClick={onOpenFolder}>
          Open Folder ↗
        </button>
      </div>

      {files.length === 0 ? (
        <div className="empty-files">
          <p>No files saved yet.</p>
          <p className="muted">Start buffering and use Instant Replay to save a clip.</p>
        </div>
      ) : (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={i} className="file-item">
              <span className="file-icon">{fileIcon(f)}</span>
              <span className="file-name">{shortName(f)}</span>
              <span className="file-path muted">{f}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
