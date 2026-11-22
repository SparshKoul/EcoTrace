/** Live photo/video capture with instant GPS + timestamp lock and AI pipeline progress. */

import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/AppContext';
import type { V1ReportResult } from '../../types';
import { Button } from '../ui/Button';

interface CaptureModalProps {
  readonly onClose: () => void;
  readonly onCreated: (report: V1ReportResult) => void;
}

type Mode = 'photo' | 'video';

const STEPS = [
  'Uploading evidence & locking GPS/Timestamp…',
  'AI scanning & blurring faces/license plates…',
  'Publishing to Live Map & Your Activity Feed…',
];

export function CaptureModal({ onClose, onCreated }: CaptureModalProps) {
  const { sendV1Report, signedIn, fix: currentFix } = useApp();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [mode, setMode] = useState<Mode>('photo');
  const [phase, setPhase] = useState<'idle' | 'starting' | 'live' | 'denied'>('idle');
  const [recording, setRecording] = useState(false);
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setPhase('live');
      } catch {
        if (active) setPhase('denied');
      }
    };
    void start();
    return () => {
      active = false;
      const activeRecorder = recorderRef.current;
      if (activeRecorder && activeRecorder.state === 'recording') activeRecorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const lockFix = (): Promise<{ lat: number; lng: number; accuracy: number }> => {
    if (currentFix && Number.isFinite(currentFix.lat) && Number.isFinite(currentFix.lng)) {
      return Promise.resolve({ lat: currentFix.lat, lng: currentFix.lng, accuracy: currentFix.accuracyM ?? 15 });
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const accuracy = position.coords.accuracy;
          resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy });
        },
        () => reject(new Error('Could not lock GPS. Allow location access and try again.')),
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 5_000 },
      );
    });
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mimeType = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(
      (type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
    );
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.start();
    setRecording(true);
  };

  const stopRecording = (): Promise<Blob> => new Promise((resolve) => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.onstop = () => {
      resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' }));
      setRecording(false);
    };
    recorder.stop();
  });

  const capturePhoto = (): Promise<Blob> => new Promise((resolve, reject) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      reject(new Error('Camera not ready.'));
      return;
    }
    const canvas = document.createElement('canvas');
    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas context not available.'));
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Snapshot failed.'))), 'image/jpeg', 0.8);
  });

  const submit = async () => {
    setError(null);
    setStep(0);
    try {
      if (!signedIn) throw new Error('Please sign in before submitting a report.');
      // Timestamp and GPS are locked at the exact capture moment.
      const capturedAt = new Date().toISOString();
      const fix = await lockFix();
      const media = mode === 'photo' ? await capturePhoto() : await stopRecording();

      setStep(1);
      const result = await sendV1Report({
        media,
        mediaType: mode,
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        capturedAt,
        notes: notes.trim(),
      });
      setStep(2);
      onCreated(result);
      window.setTimeout(onClose, 500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Capture failed.');
      setStep(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-ink/70 sm:items-center" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="capture-title" className="w-full max-w-lg rounded-t-sheet bg-surface p-4 shadow-2xl sm:rounded-sheet">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="capture-title" className="font-display text-2xl font-bold">Capture evidence</h2>
          <Button variant="quiet" aria-label="Close capture" onClick={onClose}>✕</Button>
        </div>

        <div className="mb-3 flex gap-2" role="tablist">
          {(['photo', 'video'] as const).map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              disabled={recording || step !== null}
              className={`min-h-10 flex-1 rounded-full px-3 text-sm font-bold ${mode === value ? 'bg-accent text-white' : 'bg-tile text-muted'}`}
            >
              {value === 'photo' ? '📷 Photo' : '🎥 Video (5–10s)'}
            </button>
          ))}
        </div>

        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-ink">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          {phase !== 'live' && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white">
              {phase === 'denied' ? 'Camera access was blocked. Allow it in your browser settings.' : 'Starting rear camera…'}
            </div>
          )}
          {recording && (
            <span className="absolute left-3 top-3 rounded-full bg-[#b3261e] px-3 py-1 text-xs font-bold text-white">● REC</span>
          )}
        </div>

        <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-xs font-semibold text-accent">
          Privacy &amp; transparency: your masked IP, GPS coordinates, and timestamp will be logged publicly on the map
          for civic transparency; faces and vehicle plates are blurred automatically.
        </p>

        <label className="mt-3 block">
          <span className="eco-label">Notes (optional)</span>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What did you see?"
            className="mt-1 w-full rounded-xl border-2 border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>

        {error && <p role="alert" className="mt-3 rounded-xl bg-[#fde8e6] px-3 py-2 text-sm font-semibold text-[#b3261e]">{error}</p>}

        {step !== null && (
          <ol className="mt-3 space-y-1 rounded-xl bg-tile p-3 text-xs font-semibold">
            {STEPS.map((label, index) => (
              <li key={label} className={index <= step ? 'text-accent' : 'text-muted'}>
                {index < step ? '✓' : index === step ? '→' : '·'} {label}
              </li>
            ))}
          </ol>
        )}

        <div className="mt-4 flex gap-2">
          {mode === 'photo' ? (
            <Button variant="sun" className="flex-1" disabled={phase !== 'live' || step !== null} onClick={() => void submit()}>
              Capture &amp; submit
            </Button>
          ) : recording ? (
            <Button variant="danger" className="flex-1" disabled={step !== null} onClick={() => void submit()}>
              Stop &amp; submit
            </Button>
          ) : (
            <Button variant="sun" className="flex-1" disabled={phase !== 'live' || step !== null} onClick={startRecording}>
              Start walking video
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
