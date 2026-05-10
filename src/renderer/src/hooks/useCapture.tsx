import { useRef, useState, useCallback, useEffect } from 'react'

export type RecordingState = 'idle' | 'buffering' | 'recording' | 'saving'

export type CaptureSource = {
  id: string
  name: string
  thumbnail: string
}

export type Codec = 'vp9' | 'vp8' | 'auto'
export type FrameRate = 15 | 30 | 60
export type OutputFormat = 'webm' | 'mp4' | 'mkv'

const QUALITY_CONSTRAINTS: Record<string, number> = {
  low: 3_000_000,
  medium: 6_000_000,
  high: 10_000_000
}

const CODEC_MIME: Record<Codec, string[]> = {
  vp9: ['video/webm;codecs=vp9', 'video/webm'],
  vp8: ['video/webm;codecs=vp8', 'video/webm'],
  auto: [
    'video/webm;codecs=h264',
    'video/mp4;codecs=h264',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ]
}

function resolveMimeType(codec: Codec): string {
  const types = CODEC_MIME[codec]

  for (const mime of types) {
    if (MediaRecorder.isTypeSupported(mime)) {
      console.log('[capture] Using MIME type:', mime)
      return mime
    }
  }

  console.warn('[capture] No preferred MIME type supported, falling back to video/webm')
  return 'video/webm'
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
  const [codec, setCodecState] = useState<Codec>('auto')
  const [frameRate, setFrameRateState] = useState<FrameRate>(60)
  const [outputFormat, setOutputFormatState] = useState<OutputFormat>('mp4')

  const [savedFiles, setSavedFiles] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)

  const bufferRef = useRef<{ data: Blob; ts: number }[]>([])
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  const clearError = (): void => setError(null)

  /**
   * Derive the full output path from the full webm path returned by
   * saveRecording. Previously baseName had no directory component, so ffmpeg
   * wrote the mp4 to the process working directory — then unlinkSync deleted
   * the source webm, leaving both files in the wrong state.
   */
  const saveBlob = useCallback(
    async (blob: Blob, baseName: string): Promise<string> => {
      const arrayBuffer = await blob.arrayBuffer()
      const webmPath = await window.api.saveRecording(arrayBuffer, `${baseName}.webm`)

      if (outputFormat === 'webm') return webmPath

      // Replace .webm extension on the full path — not the bare basename
      const outputPath = webmPath.replace(/\.webm$/, `.${outputFormat}`)

      return window.api.convertRecording(webmPath, outputPath, outputFormat)
    },
    [outputFormat]
  )

  const refreshSources = useCallback(async () => {
    try {
      const mapped = await window.api.getSources()
      setSources(mapped)
      if (!selectedSource && mapped.length > 0) setSelectedSource(mapped[0])
    } catch (e: unknown) {
      setError(`Failed to get sources: ${e?.['message'] || e}`)
    }
  }, [selectedSource])

  /**
   * Desktop audio requires chromeMediaSource: 'desktop' on the audio
   * constraint — `audio: true` alone does not work for screen capture and
   * will either error or record the wrong device.
   */
  const getStream = useCallback(
    async (sourceId: string): Promise<MediaStream> => {
      const fps = frameRate

      const attempts: object[] = [
        {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          width: 1920,
          height: 1080,
          maxFrameRate: fps
        },
        {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          width: 1280,
          height: 720,
          maxFrameRate: fps
        },
        {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxFrameRate: 30
        }
      ]

      for (const mandatory of attempts) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop'
              }
            } as MediaTrackConstraints,
            video: {
              mandatory
            } as MediaTrackConstraints
          })

          const settings = stream.getVideoTracks()[0]?.getSettings()
          console.log('[capture] acquired stream:', settings)
          console.log('[capture] audio tracks:', stream.getAudioTracks().length)

          return stream
        } catch (e: unknown) {
          console.warn('[capture] getUserMedia attempt failed:', mandatory, e)
        }
      }

      throw new Error('Could not open capture stream. Try selecting another source.')
    },
    [frameRate]
  )

  const makeRecorder = useCallback(
    (stream: MediaStream): MediaRecorder => {
      const mimeType = resolveMimeType(codec)

      return new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: QUALITY_CONSTRAINTS[quality]
      })
    },
    [codec, quality]
  )

  const trimBuffer = useCallback((cutoff: number) => {
    while (bufferRef.current.length > 0 && bufferRef.current[0].ts <= cutoff) {
      bufferRef.current.shift()
    }
  }, [])

  const startBuffer = useCallback(async () => {
    if (!selectedSource) {
      setError('No source selected')
      return
    }

    clearError()

    try {
      const stream = await getStream(selectedSource.id)
      streamRef.current = stream

      const recorder = makeRecorder(stream)
      recorderRef.current = recorder
      bufferRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          bufferRef.current.push({ data: e.data, ts: Date.now() })
          trimBuffer(Date.now() - bufferDuration * 1000)
        }
      }

      recorder.start(500)
      setState('buffering')
    } catch (e: unknown) {
      setError(`Failed to start capture: ${e?.['message'] || e}`)
    }
  }, [selectedSource, bufferDuration, getStream, makeRecorder, trimBuffer])

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

  const saveReplay = useCallback(
    async (seconds?: number) => {
      const cutoff = Date.now() - (seconds ?? bufferDuration) * 1000
      const chunks = bufferRef.current.filter((c) => c.ts > cutoff)

      if (chunks.length === 0) {
        setError('Buffer is empty — start buffering first')
        return
      }

      setState('saving')

      try {
        const blob = new Blob(
          chunks.map((c) => c.data),
          { type: 'video/webm' }
        )
        const path = await saveBlob(blob, `replay_${timestamp()}`)
        setSavedFiles((prev) => [path, ...prev])
      } catch (e: unknown) {
        setError(`Failed to save replay: ${e?.['message'] || e}`)
      }

      setState(recorderRef.current ? 'buffering' : 'idle')
    },
    [bufferDuration, saveBlob]
  )

  const startRecording = useCallback(async () => {
    if (!selectedSource) {
      setError('No source selected')
      return
    }

    if (state === 'buffering' && recorderRef.current) {
      recordingChunksRef.current = [...bufferRef.current.map((c) => c.data)]

      recorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          const chunk = { data: e.data, ts: Date.now() }
          bufferRef.current.push(chunk)
          recordingChunksRef.current.push(e.data)
          trimBuffer(Date.now() - bufferDuration * 1000)
        }
      }

      startTimeRef.current = Date.now()
      timerRef.current = setInterval(
        () => setRecordingTime(Math.floor((Date.now() - startTimeRef.current) / 1000)),
        1000
      )
      setState('recording')
      return
    }

    clearError()

    try {
      const stream = await getStream(selectedSource.id)
      streamRef.current = stream

      const recorder = makeRecorder(stream)
      recorderRef.current = recorder
      recordingChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data)
      }

      recorder.start(500)

      startTimeRef.current = Date.now()
      timerRef.current = setInterval(
        () => setRecordingTime(Math.floor((Date.now() - startTimeRef.current) / 1000)),
        1000
      )
      setState('recording')
    } catch (e: unknown) {
      setError(`Failed to start recording: ${e?.['message'] || e}`)
    }
  }, [selectedSource, state, bufferDuration, getStream, makeRecorder, trimBuffer])

  const stopRecording = useCallback(async () => {
    if (!recorderRef.current) return

    setState('saving')
    if (timerRef.current) clearInterval(timerRef.current)

    await new Promise<void>((resolve) => {
      recorderRef.current!.onstop = () => resolve()
      recorderRef.current!.stop()
    })

    try {
      const blob = new Blob(recordingChunksRef.current, { type: 'video/webm' })
      const path = await saveBlob(blob, `rec_${timestamp()}`)
      setSavedFiles((prev) => [path, ...prev])
    } catch (e: unknown) {
      setError(`Failed to save: ${e?.['message'] || e}`)
    }

    recordingChunksRef.current = []

    if (streamRef.current) {
      const newRecorder = makeRecorder(streamRef.current)
      recorderRef.current = newRecorder

      newRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          bufferRef.current.push({ data: e.data, ts: Date.now() })
          trimBuffer(Date.now() - bufferDuration * 1000)
        }
      }

      newRecorder.start(500)
      setState('buffering')
    } else {
      setState('idle')
    }

    setRecordingTime(0)
  }, [makeRecorder, bufferDuration, saveBlob, trimBuffer])

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

      const bitmap = await new ImageCapture(track).grabFrame()
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0)

      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'))
      const path = await window.api.saveScreenshot(
        await blob.arrayBuffer(),
        `screenshot_${timestamp()}.png`
      )

      setSavedFiles((prev) => [path, ...prev])
      if (ownedStream) stream.getTracks().forEach((t) => t.stop())
    } catch (e: unknown) {
      setError(`Screenshot failed: ${e?.['message'] || e}`)
    }
  }, [selectedSource, getStream])

  const updateBufferDuration = (v: number) => {
    setBufferDurationState(v)
    window.api.saveSettings({ bufferDuration: v })
  }

  const updateQuality = (v: 'low' | 'medium' | 'high') => {
    setQualityState(v)
    window.api.saveSettings({ quality: v })
  }

  const updateCodec = (v: Codec) => {
    setCodecState(v)
    window.api.saveSettings({ codec: v })
  }

  const updateFrameRate = (v: FrameRate) => {
    setFrameRateState(v)
    window.api.saveSettings({ frameRate: v })
  }

  const updateOutputFormat = (v: OutputFormat) => {
    setOutputFormatState(v)
    window.api.saveSettings({ outputFormat: v })
  }

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

  useEffect(() => {
    async function init() {
      const s = await window.api.getSettings()
      setBufferDurationState(s.bufferDuration)
      setQualityState(s.quality)
      if (s.codec) setCodecState(s.codec)
      if (s.frameRate) setFrameRateState(s.frameRate)
      if (s.outputFormat) setOutputFormatState(s.outputFormat)

      const files = await window.api.listSavedFiles()
      setSavedFiles(files)

      await refreshSources()
    }

    init()
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
    codec,
    updateCodec,
    frameRate,
    updateFrameRate,
    outputFormat,
    updateOutputFormat,
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
