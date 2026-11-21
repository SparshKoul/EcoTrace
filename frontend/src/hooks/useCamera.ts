import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { RULES } from '../config/rules';

export type CameraPhase = 'idle' | 'starting' | 'live' | 'denied' | 'unsupported' | 'error';

export interface CameraController {
  readonly phase: CameraPhase;
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly recorderSupported: boolean;
  readonly recording: boolean;
  readonly elapsedMs: number;
  readonly error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  capture: () => Promise<Blob | null>;
  startRecording: () => void;
  stopRecording: () => Promise<Blob | null>;
}

const pickMimeType = (): string | undefined =>
  ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(
    (type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
  );

/**
 * FR-1.1: a real rear-facing MediaStream. There is deliberately no file input anywhere in the app:
 * the only way to produce evidence is this live camera or walking-mode recording.
 */
export function useCamera(): CameraController {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [phase, setPhase] = useState<CameraPhase>('idle');
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderSupported = typeof MediaRecorder !== 'undefined';

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (streamRef.current && video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => undefined);
    }
  }, [phase]);

  const stop = useCallback(() => {
    const activeRecorder = recorderRef.current;
    if (activeRecorder && activeRecorder.state === 'recording') activeRecorder.stop();
    recorderRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    timerRef.current = null;
    stopTimerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRecording(false);
    setElapsedMs(0);
    setPhase('idle');
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase('unsupported');
      setError('Live camera capture is not available in this browser.');
      return;
    }
    setPhase('starting');
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });
      streamRef.current = stream;
      setPhase('live');
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : '';
      setPhase(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
      setError('The camera could not start. Check browser permissions and try again.');
    }
  }, []);

  const capture = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || phase !== 'live' || !video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 2048 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.85));
  }, [phase]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !recorderSupported || recorderRef.current?.state === 'recording') return;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.start(250);
    setElapsedMs(0);
    setRecording(true);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
    stopTimerRef.current = setTimeout(() => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    }, RULES.WALKING_MAX_MS);
  }, [recorderSupported]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return Promise.resolve(null);
    if (timerRef.current) clearInterval(timerRef.current);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    timerRef.current = null;
    stopTimerRef.current = null;
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || 'video/webm';
        resolve(new Blob(chunksRef.current, { type }));
        setRecording(false);
        recorderRef.current = null;
      };
      recorder.stop();
    });
  }, []);

  return {
    phase, videoRef, recorderSupported, recording, elapsedMs, error,
    start, stop, capture, startRecording, stopRecording,
  };
}
