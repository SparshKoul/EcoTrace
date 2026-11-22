import type { AiVerificationDetails } from '../../types';

interface AiResponseCardProps {
  readonly verification?: AiVerificationDetails;
  readonly compact?: boolean;
  readonly onNavigateToMap?: (siteId?: string) => void;
  readonly onDismiss?: () => void;
}

export function AiResponseCard({
  verification,
  compact = false,
  onNavigateToMap,
  onDismiss,
}: AiResponseCardProps) {
  if (!verification) return null;

  const isVerified = verification.status === 'VERIFIED' || verification.status === 'ACCEPTED';
  const isRejected = verification.status === 'REJECTED';

  const confidencePct = Math.round((verification.confidence ?? 0.85) * 100);
  const categoryLabel = (verification.wasteCategory || 'Municipal Waste')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const judgeStatement =
    verification.rejectionReason ||
    verification.auditSummary ||
    (isVerified
      ? 'Vision judge confirmed outdoor solid waste accumulation. Evidence accepted for municipal tracking.'
      : 'Queued for community review.');

  if (compact) {
    return (
      <div className="space-y-2 rounded-xl border border-line bg-surface p-3 text-xs shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${
              isVerified
                ? 'bg-emerald-100 text-emerald-800'
                : isRejected
                ? 'bg-red-100 text-red-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {isVerified ? '● AI Verified' : isRejected ? '✕ AI Rejected' : '▲ Review Flagged'}
          </span>
          <span className="font-semibold text-muted">{confidencePct}% confidence</span>
        </div>

        <p className="italic text-ink">"{judgeStatement}"</p>

        {verification.detectedClasses && verification.detectedClasses.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {verification.detectedClasses.slice(0, 3).map((cls, idx) => (
              <span key={idx} className="rounded bg-tile px-1.5 py-0.5 font-mono text-[10px] text-muted">
                {cls}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border shadow-md transition-all ${
        isVerified
          ? 'border-emerald-300 bg-emerald-50/40'
          : isRejected
          ? 'border-red-300 bg-red-50/40'
          : 'border-amber-300 bg-amber-50/40'
      }`}
    >
      {/* Header Banner */}
      <div
        className={`flex items-center justify-between border-b px-4 py-3 ${
          isVerified
            ? 'border-emerald-200 bg-emerald-100/70 text-emerald-950'
            : isRejected
            ? 'border-red-200 bg-red-100/70 text-red-950'
            : 'border-amber-200 bg-amber-100/70 text-amber-950'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">
            {isVerified ? '🟢' : isRejected ? '🔴' : '🟡'}
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-75">
              AI Verification Result
            </p>
            <h3 className="font-display text-base font-bold leading-tight">
              {isVerified
                ? 'Verified Outdoor Waste'
                : isRejected
                ? 'Rejected — Non-Waste Image'
                : 'Community Review Flagged'}
            </h3>
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${
            isVerified
              ? 'bg-emerald-600 text-white'
              : isRejected
              ? 'bg-red-600 text-white'
              : 'bg-amber-600 text-white'
          }`}
        >
          {verification.status}
        </span>
      </div>

      <div className="space-y-4 p-4 text-sm">
        {/* Category & Confidence Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-surface p-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Waste Category
            </span>
            <p className="mt-0.5 font-display text-base font-bold text-ink">
              {categoryLabel}
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Model Confidence
              </span>
              <span className="text-xs font-bold text-ink">{confidencePct}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-tile">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isVerified ? 'bg-emerald-600' : isRejected ? 'bg-red-500' : 'bg-amber-500'
                }`}
                style={{ width: `${Math.max(10, confidencePct)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Hotspot Merger Indicator */}
        {verification.siteAction && (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink">
            <span className="text-base">📍</span>
            <span>
              {verification.siteAction === 'merged'
                ? 'Merged into nearby hotspot (within 20m radius)'
                : 'New hotspot registered on map'}
            </span>
          </div>
        )}

        {/* Vision Judge Statement */}
        <div className="rounded-xl border border-line bg-surface p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Vision Judge Statement (Azure GPT-5 Mini)
          </p>
          <blockquote className="mt-1.5 border-l-2 border-accent pl-3 font-serif text-sm italic text-ink">
            "{judgeStatement}"
          </blockquote>
        </div>

        {/* Detected Classes Chips */}
        {verification.detectedClasses && verification.detectedClasses.length > 0 && (
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Detected Elements:
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {verification.detectedClasses.map((item, index) => (
                <span
                  key={index}
                  className="rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-xs text-ink"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Stored Evidence Photo Preview */}
        {verification.evidenceUrl && isVerified && (
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Sanitized Evidence Stored (Supabase CDN):
            </span>
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-ink">
              <img
                src={verification.evidenceUrl}
                alt="Verified report evidence"
                className="h-full w-full object-cover"
              />
              <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                PII Sanitized
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          {isVerified && onNavigateToMap && (
            <button
              onClick={() => onNavigateToMap(verification.siteId)}
              className="flex-1 rounded-xl bg-accent px-4 py-3 text-center text-sm font-bold text-white shadow-sm hover:opacity-90 active:scale-[0.98] transition"
            >
              View Hotspot on Map →
            </button>
          )}

          {onDismiss && (
            <button
              onClick={onDismiss}
              className={`rounded-xl border border-line bg-surface px-4 py-3 text-sm font-bold text-ink hover:bg-tile transition ${
                !isVerified ? 'flex-1' : ''
              }`}
            >
              {isVerified ? '+ Report Another Site' : 'Try Again with Clearer Photo'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
