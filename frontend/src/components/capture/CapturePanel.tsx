import { useEffect, useMemo, useRef, useState } from 'react';
import { RULES, TYPE_LABEL } from '../../config/rules';
import { gateMessage, recordGate, shutterGate, submitGate, type GateFacts } from '../../domain/captureGates';
import { useCamera } from '../../hooks/useCamera';
import { useApp } from '../../state/AppContext';
import type { ReportReceipt, ReportType } from '../../types';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { GpsBadge } from '../ui/GpsBadge';
import { AiResponseCard } from '../ui/AiResponseCard';

type Mode = 'photo' | 'walking' | 'no_bin';

const PHOTO_TYPES: readonly ReportType[] = ['dump', 'construction', 'water', 'overflowing_bin'];

export function CapturePanel({ onNavigate }: { onNavigate?: (tab: any) => void } = {}) {
  const { fix, online, signedIn, gpsDenied, sendReport, notify, sites, setFocusReport } = useApp();
  const camera = useCamera();
  const [mode, setMode] = useState<Mode>('photo');
  const [type, setType] = useState<ReportType>('dump');
  const [note, setNote] = useState('');
  const [media, setMedia] = useState<Blob[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<ReportReceipt | null>(null);
  const previewsRef = useRef<string[]>([]);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => () => previewsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const facts = useMemo<GateFacts>(() => ({
    busy: sending || camera.phase === 'starting',
    online,
    signedIn,
    cameraState: camera.phase,
    recorderSupported: camera.recorderSupported,
    fix,
    chosen: true,
    missingBin: mode === 'no_bin',
  }), [sending, camera.phase, camera.recorderSupported, online, signedIn, fix, mode]);

  const activeGate = mode === 'no_bin'
    ? submitGate(facts)
    : mode === 'walking'
      ? (media.length > 0 ? submitGate(facts) : recordGate(facts))
      : (media.length > 0 ? submitGate(facts) : shutterGate(facts));
  const blockedMessage = gateMessage(activeGate);

  const addMedia = async () => {
    if (mode === 'walking') {
      const blob = await camera.stopRecording();
      if (!blob) return;
      if (camera.elapsedMs < RULES.WALKING_MIN_MS) {
        notify(`Walking video must be at least ${RULES.WALKING_MIN_MS / 1000} seconds. Try a longer stretch.`);
        return;
      }
      setMedia([blob]);
      notify('Walking video captured locally. Add a note, then submit.');
      return;
    }
    const blob = await camera.capture();
    if (!blob) return;
    setMedia([blob]);
    setPreviews((current) => [...current, URL.createObjectURL(blob)]);
  };

  const reset = () => {
    previews.forEach((url) => URL.revokeObjectURL(url));
    setPreviews([]);
    setMedia([]);
    setNote('');
    camera.stop();
  };

  const submit = async () => {
    if (activeGate.kind !== 'ready') {
      notify(blockedMessage);
      return;
    }
    setSending(true);
    setLastReceipt(null);
    try {
      const receipt = await sendReport({
        type: mode === 'no_bin' ? 'no_bin' : type,
        mode: mode === 'walking' ? 'walking' : 'photo',
        location: fix!,
        note: note.trim(),
        media,
      });
      setLastReceipt(receipt);
      if (receipt.status === 'REJECTED') {
        notify('Image evaluated by AI and rejected as non-waste.');
      } else {
        notify(`Report ${receipt.report_id} verified. Status: ${receipt.status}.`);
      }
      reset();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Submission failed. Try again.');
    } finally {
      setSending(false);
    }
  };

  const progress = Math.min(100, Math.round((camera.elapsedMs / RULES.WALKING_MAX_MS) * 100));

  return (
    <section className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-28" aria-labelledby="capture-heading">
      <header>
        <p className="eco-label">New evidence</p>
        <h1 id="capture-heading" className="font-display text-3xl font-bold">Report a site</h1>
        <p className="mt-1 text-sm text-muted">
          Live camera only — gallery uploads are disabled. Every report needs a GPS fix within {RULES.GPS_MAX_ACCURACY_M} m.
        </p>
      </header>

      {lastReceipt?.aiVerification && (
        <AiResponseCard
          verification={lastReceipt.aiVerification}
          onNavigateToMap={(siteId) => {
            const targetSite = sites.find((s) => s.id === siteId || s.id === lastReceipt.site_id);
            if (targetSite) {
              setFocusReport({
                id: lastReceipt.report_id,
                site_id: targetSite.id,
                trash_category: targetSite.type,
                severity_score: targetSite.severity,
                report_count: targetSite.reportCount,
                latitude: targetSite.lat,
                longitude: targetSite.lng,
                cover_media_url: targetSite.evidenceUrl,
                media_type: 'photo',
                ulb_name: targetSite.boundary.ulb,
                mla_constituency: targetSite.boundary.mla,
                mp_constituency: targetSite.boundary.mp,
                updated_at: new Date().toISOString(),
                status: 'open',
              } as any);
            }
            if (onNavigate) onNavigate('map');
          }}
          onDismiss={() => setLastReceipt(null)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <GpsBadge />
        {!online && <Chip tone="bad">Offline</Chip>}
        {gpsDenied && <Chip tone="bad">Location permission required</Chip>}
      </div>

      <div className="flex gap-2 rounded-full bg-tile p-1" role="tablist" aria-label="Capture mode">
        {([
          ['photo', 'Snapshot'],
          ['walking', 'Walking video'],
          ['no_bin', 'Missing bin'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => { setMode(value); setMedia([]); setPreviews([]); }}
            className={`min-h-10 flex-1 rounded-full px-3 text-sm font-bold transition ${mode === value ? 'bg-surface text-accent shadow-sm' : 'text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode !== 'no_bin' && (
        <div className="eco-card space-y-3">
          <div className="flex items-center justify-between">
            <span className="eco-label">Waste type</span>
            <span className="text-xs text-muted">Required before submit</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PHOTO_TYPES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={type === value}
                onClick={() => setType(value)}
                className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold ${type === value ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-muted'}`}
              >
                {TYPE_LABEL[value]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="eco-card overflow-hidden p-0">
        <div className="relative aspect-[4/3] w-full bg-ink">
          <video
            ref={camera.videoRef}
            playsInline
            muted
            className={`h-full w-full object-cover ${mode === 'no_bin' ? 'invisible' : ''}`}
          />
          {mode !== 'no_bin' && camera.phase !== 'live' && (
            <div className="absolute inset-0 grid place-items-center bg-ink/85 p-6 text-center text-sm text-white">
              {camera.error ?? 'Start the rear camera to capture evidence.'}
            </div>
          )}
          {mode === 'no_bin' && (
            <div className="absolute inset-0 grid place-items-center bg-tile p-6 text-center">
              <div>
                <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full border-4 border-ink bg-sun text-3xl">🚫</div>
                <p className="font-display text-xl font-bold">No dustbin within 1 km</p>
                <p className="mt-1 text-sm text-muted">Mark an infrastructure gap. No photo is needed.</p>
              </div>
            </div>
          )}
          {mode === 'walking' && camera.recording && (
            <div className="absolute inset-x-4 top-4 rounded-full bg-ink/80 px-4 py-2 text-center text-sm font-bold text-white">
              Recording · {(camera.elapsedMs / 1000).toFixed(1)}s / {RULES.WALKING_MAX_MS / 1000}s
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/30">
                <div className="h-full bg-sun transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3 p-4">
          {camera.phase === 'idle' && mode !== 'no_bin' && (
            <Button variant="sun" onClick={() => void camera.start()} className="w-full">
              Start rear camera
            </Button>
          )}

          {mode === 'photo' && camera.phase === 'live' && media.length === 0 && (
            <Button variant="sun" onClick={() => void addMedia()} className="w-full" disabled={activeGate.kind !== 'ready'}>
              Capture snapshot
            </Button>
          )}

          {mode === 'walking' && camera.phase === 'live' && !camera.recording && media.length === 0 && (
            <Button variant="sun" onClick={camera.startRecording} className="w-full" disabled={activeGate.kind !== 'ready'}>
              Start walking capture ({RULES.WALKING_MIN_MS / 1000}–{RULES.WALKING_MAX_MS / 1000}s)
            </Button>
          )}
          {mode === 'walking' && camera.recording && (
            <Button variant="danger" onClick={() => void addMedia()} className="w-full">
              Stop and use this clip
            </Button>
          )}

          {media.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl bg-tile p-3">
              {previews[0] && <img src={previews[0]} alt="Captured evidence preview" className="h-16 w-20 rounded-xl object-cover" />}
              <div className="flex-1">
                <p className="text-sm font-bold">Evidence ready</p>
                <p className="text-xs text-muted">
                  {mode === 'walking' ? 'Walking video' : 'Snapshot'} · stays in private storage until verified
                </p>
              </div>
              <Button variant="quiet" onClick={() => { setMedia([]); setPreviews([]); }}>Remove</Button>
            </div>
          )}

          {blockedMessage && (
            <p role="status" className="rounded-xl bg-[#fff2d6] px-3 py-2 text-sm font-semibold text-[#8a5b00]">
              {blockedMessage}
            </p>
          )}

          <label className="block">
            <span className="eco-label">Note (optional)</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="What did you see? Approximate stretch of road…"
              className="mt-1 w-full rounded-xl border-2 border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <div className="flex gap-2">
            <Button onClick={() => void submit()} disabled={activeGate.kind !== 'ready' || sending} className="flex-1">
              {sending ? 'Submitting…' : mode === 'no_bin' ? 'Mark missing bin' : 'Submit report'}
            </Button>
            {(media.length > 0 || note) && (
              <Button variant="outline" onClick={reset} disabled={sending}>Clear</Button>
            )}
          </div>
          <p className="rounded-xl bg-accent-soft px-3 py-2 text-center text-xs font-semibold text-accent">
            Privacy &amp; transparency: your masked IP, GPS coordinates, and timestamp will be logged publicly on the
            map for civic transparency; faces and vehicle plates are blurred automatically before publication.
          </p>
          <p className="text-center text-xs text-muted">
            Submission returns 202 Accepted. AI verification and legal drafting happen asynchronously.
          </p>
        </div>
      </div>
    </section>
  );
}
