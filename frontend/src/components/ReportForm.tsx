/**
 * ReportForm — live camera capture + submit with real-time AI progress.
 *
 * Step 1 of the pipeline: locks the exact client timestamp and a fresh
 * high-accuracy GPS fix at the capture moment, packages FormData and posts to
 * POST /api/v1/reports with the session token. The submit button shows the
 * live "AI is scanning…" state while the pipeline runs.
 */

import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext';
import { useReports } from '../context/ReportContext';
import { Button } from './ui/Button';

type Mode = 'photo' | 'video';

const PROGRESS_LABEL = 'AI is scanning for privacy (blurring faces/plates) & classifying trash…';

export function ReportForm({ onCreated }: { readonly onCreated?: () => void }) {
  const { signedIn, notify } = useApp();
  const { submitReport, submitting, progressLabel } = useReports();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [mode, setMode] = useState<Mode>('photo');
  const [phase, setPhase] = useState<'idle' | 'starting' | 'live' | 'denied'>('idle');
  const [recording, setRecording] = useState(false);
  const [notes, setNotes] = useState('');
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

  /** Fresh hardware GPS fix, high accuracy, zero cache. */
  const lockFix = (): Promise<{ lat: number; lng: number; accuracy: number }> =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const accuracy = position.coords.accuracy;
          if (accuracy > 50) {
            reject(new Error(`GPS accuracy ${Math.round(accuracy)} m is too coarse (max 50 m).`));
            return;
          }
          resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy });
        },
        () => reject(new Error('Could not lock GPS. Allow location access and try again.')),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
      );
    });

  /** Starts a walking-video recording on the live MediaStream. */
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

  /** Stops the walking-video recording and resolves the encoded Blob. */
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
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Snapshot failed.'))), 'image/jpeg', 0.9);
  });

  const submit = async () => {
    setError(null);
    try {
      if (!signedIn) throw new Error('Please sign in before submitting a report.');
      // Step 1: exact client timestamp + fresh hardware GPS, locked at capture.
      const capturedAt = new Date().toISOString();
      const fix = await lockFix();
      const media = mode === 'photo' ? await capturePhoto() : await stopRecording();

      // Steps 2–5 run inside the shared context: submit → instant map + activity.
      await submitReport({
        media,
        mediaType: mode,
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        capturedAt,
        notes: notes.trim(),
      });
      notify('Report published — live on the map and in your activity.');
      onCreated?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Capture failed.');
    }
  };

  return (
    <div className="eco-card space-y-3">
      <div className="flex gap-2" role="tablist">
        {(['photo', 'video'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            disabled={recording || submitting}
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

      <p className="rounded-xl bg-accent-soft px-3 py-2 text-xs font-semibold text-accent">
        Privacy &amp; transparency: your masked IP, GPS coordinates, and timestamp will be logged publicly on the map
        for civic transparency; faces and vehicle plates are blurred automatically.
      </p>

      <label className="block">
        <span className="eco-label">Notes (optional)</span>
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="What did you see?"
          className="mt-1 w-full rounded-xl border-2 border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      {error && <p role="alert" className="rounded-xl bg-[#fde8e6] px-3 py-2 text-sm font-semibold text-[#b3261e]">{error}</p>}

      <Button
        variant="sun"
        className="w-full"
        disabled={phase !== 'live' || submitting || (mode === 'video' && !recording)}
        onClick={() => void submit()}
      >
        {submitting
          ? (progressLabel ?? PROGRESS_LABEL)
          : mode === 'photo'
            ? 'Capture / Upload & Submit Report'
            : 'Stop & Submit Report'}
      </Button>

      {mode === 'video' && !recording && !submitting && (
        <Button variant="outline" className="w-full" disabled={phase !== 'live'} onClick={startRecording}>
          Start walking video (5–10s)
        </Button>
      )}
    </div>
  );
}
