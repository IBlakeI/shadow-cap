import { useRef, useState, useCallback, useEffect } from 'react'

export type RecordingState = 'idle' | 'buffering' | 'recording' | 'saving'

export type CaptureSource = {
  id: string
  name: string
  thumbnail: string
}

const QUALITY_CONSTRAINTS: Record<string, number> = {
  low: 2_000_000,
  medium: 8_000_000,
  high: 20_000_000
}

function timestamp(): string {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    '_',
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0')
  ].join('')
}

export const useCapture = () => {
  const [state, setState] = useState<RecordingState>('idle')
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [selectedSource, setSelectedSource] = useState<CaptureSource | null>(null)
  const [bufferDuration, setBufferDurationState] = useState(300)
  const [quality, setQualityState] = useState<'low' | 'medium' | 'high'>('high')
  const [savedFiles, setSavedFiles] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)

  // Rolling buffer: array of { data: Blob, ts: number }
  const bufferRef = useRef<{ data: Blob; ts: number }[]>([])
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  const clearError = (): void => setError(null)

  // ── Load sources ─────────────────────────────────────────────────────────
  const refreshSources = useCallback(async () => {
    try {
      const mapped = await window.api.getSources()
      setSources(mapped)
      if (!selectedSource && mapped.length > 0) setSelectedSource(mapped[0])
    } catch (e: unknown) {
      setError(`Failed to get sources: ${e?.['message'] || e}`)
    }
  }, [selectedSource])

  // ── Get media stream for a source ────────────────────────────────────────
  const getStream = useCallback(
    async (sourceId: string): Promise<MediaStream> => {
      // Try progressively simpler constraints — Windows WGC can reject high-res requests
      const attempts = [
        {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          minWidth: 1280,
          maxWidth: 3840,
          minHeight: 720,
          maxHeight: 2160,
          maxFrameRate: 60
        },
        {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 30
        },
        {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId
        }
      ]

      for (const mandatory of attempts) {
        try {
          return await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { mandatory } as MediaTrackConstraints
          })
        } catch (e: unknown) {
          console.warn('getUserMedia failed with constraints', mandatory, e)
          // try next constraint set
        }
      }
      throw new Error('Could not open capture stream. Try selecting a different source.')
    },
    [quality]
  )

  // ── Start rolling buffer ─────────────────────────────────────────────────
  const startBuffer = useCallback(async () => {
    if (!selectedSource) {
      setError('No source selected')
      return
    }
    clearError()

    try {
      const stream = await getStream(selectedSource.id)
      streamRef.current = stream

      const bitrate = QUALITY_CONSTRAINTS[quality]
      const options: MediaRecorderOptions = {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: bitrate
      }

      // Fallback if vp9 not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        options.mimeType = 'video/webm;codecs=vp8'
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        options.mimeType = 'video/webm'
      }

      const recorder = new MediaRecorder(stream, options)
      recorderRef.current = recorder
      bufferRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          bufferRef.current.push({ data: e.data, ts: Date.now() })
          // Trim old chunks beyond buffer duration
          const cutoff = Date.now() - bufferDuration * 1000
          bufferRef.current = bufferRef.current.filter((c) => c.ts > cutoff)
        }
      }

      recorder.start(1000) // chunk every second
      setState('buffering')
    } catch (e: unknown) {
      setError(`Failed to start capture: ${e?.['message'] || e}`)
    }
  }, [selectedSource, quality, bufferDuration, getStream])

  // ── Stop everything ──────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    bufferRef.current = []
    recordingChunksRef.current = []
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setRecordingTime(0)
    setState('idle')
  }, [])

  // ── Save instant replay (last N seconds from buffer) ─────────────────────
  const saveReplay = useCallback(
    async (seconds?: number) => {
      const duration = seconds ?? bufferDuration
      const cutoff = Date.now() - duration * 1000
      const chunks = bufferRef.current.filter((c) => c.ts > cutoff)

      if (chunks.length === 0) {
        setError('Buffer is empty — start buffering first')
        return
      }

      setState('saving')
      const blob = new Blob(
        chunks.map((c) => c.data),
        { type: 'video/webm' }
      )
      const arrayBuffer = await blob.arrayBuffer()
      const filename = `replay_${timestamp()}.webm`

      try {
        const path = await window.api.saveRecording(arrayBuffer, filename)
        setSavedFiles((prev) => [path, ...prev])
      } catch (e: unknown) {
        setError(`Failed to save replay: ${e?.['message'] || e}`)
      }

      setState(recorderRef.current ? 'buffering' : 'idle')
    },
    [bufferDuration]
  )

  // ── Manual start recording ───────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!selectedSource) {
      setError('No source selected')
      return
    }

    // If already buffering, switch recorder to manual mode
    if (state === 'buffering' && recorderRef.current) {
      recordingChunksRef.current = [...bufferRef.current.map((c) => c.data)]
      recorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          bufferRef.current.push({ data: e.data, ts: Date.now() })
          recordingChunksRef.current.push(e.data)
          const cutoff = Date.now() - bufferDuration * 1000
          bufferRef.current = bufferRef.current.filter((c) => c.ts > cutoff)
        }
      }
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)
      setState('recording')
      return
    }

    clearError()
    try {
      const stream = await getStream(selectedSource.id)
      streamRef.current = stream

      const bitrate = QUALITY_CONSTRAINTS[quality]
      let mimeType = 'video/webm;codecs=vp9'
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8'
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm'

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: bitrate
      })
      recorderRef.current = recorder
      recordingChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data)
      }

      recorder.start(1000)
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)
      setState('recording')
    } catch (e: unknown) {
      setError(`Failed to start recording: ${e?.['message'] || e}`)
    }
  }, [selectedSource, state, quality, bufferDuration, getStream])

  // ── Stop & save manual recording ─────────────────────────────────────────
  const stopRecording = useCallback(async () => {
    if (!recorderRef.current) return
    setState('saving')
    if (timerRef.current) clearInterval(timerRef.current)

    await new Promise<void>((resolve) => {
      recorderRef.current!.onstop = () => resolve()
      recorderRef.current!.stop()
    })

    const blob = new Blob(recordingChunksRef.current, { type: 'video/webm' })
    const arrayBuffer = await blob.arrayBuffer()
    const filename = `rec_${timestamp()}.webm`

    try {
      const path = await window.api.saveRecording(arrayBuffer, filename)
      setSavedFiles((prev) => [path, ...prev])
    } catch (e: unknown) {
      setError(`Failed to save: ${e?.['message'] || e}`)
    }

    // Keep stream alive for continued buffering
    recordingChunksRef.current = []
    if (streamRef.current) {
      // Re-attach buffer recorder
      const bitrate = QUALITY_CONSTRAINTS[quality]
      let mimeType = 'video/webm;codecs=vp9'
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8'
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm'

      const newRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
        videoBitsPerSecond: bitrate
      })
      recorderRef.current = newRecorder
      newRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          bufferRef.current.push({ data: e.data, ts: Date.now() })
          const cutoff = Date.now() - bufferDuration * 1000
          bufferRef.current = bufferRef.current.filter((c) => c.ts > cutoff)
        }
      }
      newRecorder.start(1000)
      setState('buffering')
    } else {
      setState('idle')
    }
    setRecordingTime(0)
  }, [quality, bufferDuration])

  // ── Screenshot ───────────────────────────────────────────────────────────
  const takeScreenshot = useCallback(async () => {
    if (!selectedSource) {
      setError('No source selected')
      return
    }

    try {
      let stream = streamRef.current
      let ownedStream = false

      if (!stream) {
        stream = await getStream(selectedSource.id)
        ownedStream = true
      }

      const track = stream.getVideoTracks()[0]
      // @ts-ignore - ImageCapture may not be in all TS defs
      const imageCapture = new ImageCapture(track)
      const bitmap = await imageCapture.grabFrame()

      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)

      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'))
      const arrayBuffer = await blob.arrayBuffer()
      const filename = `screenshot_${timestamp()}.png`
      const path = await window.api.saveScreenshot(arrayBuffer, filename)
      setSavedFiles((prev) => [path, ...prev])

      if (ownedStream) stream.getTracks().forEach((t) => t.stop())
    } catch (e: unknown) {
      setError(`Screenshot failed: ${e?.['message'] || e}`)
    }
  }, [selectedSource, getStream])

  // ── Settings sync ────────────────────────────────────────────────────────
  const updateBufferDuration = (v: number): void => {
    setBufferDurationState(v)
    window.api.saveSettings({ bufferDuration: v })
  }

  const updateQuality = (v: 'low' | 'medium' | 'high'): void => {
    setQualityState(v)
    window.api.saveSettings({ quality: v })
  }

  // ── Hotkey wiring ────────────────────────────────────────────────────────
  useEffect(() => {
    const offReplay = window.api.onTriggerReplay(() => saveReplay())
    const offToggle = window.api.onTriggerToggleRecording(() => {
      if (state === 'recording') stopRecording()
      else startRecording()
    })
    const offScreenshot = window.api.onTriggerScreenshot(() => takeScreenshot())

    return () => {
      offReplay()
      offToggle()
      offScreenshot()
    }
  }, [saveReplay, startRecording, stopRecording, takeScreenshot, state])

  // Load settings on mount
  useEffect(() => {
    window.api.getSettings().then((s) => {
      setBufferDurationState(s.bufferDuration)
      setQualityState(s.quality)
    })
    refreshSources()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    state,
    sources,
    selectedSource,
    setSelectedSource,
    bufferDuration,
    updateBufferDuration,
    quality,
    updateQuality,
    savedFiles,
    error,
    clearError,
    recordingTime,
    refreshSources,
    startBuffer,
    stopAll,
    saveReplay,
    startRecording,
    stopRecording,
    takeScreenshot
  }
}
