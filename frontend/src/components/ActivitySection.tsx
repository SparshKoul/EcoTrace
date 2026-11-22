/**
 * ActivitySection — the signed-in user's reports with instant reflection.
 *
 * `myReports` already contains a just-submitted report the moment the 201
 * lands (prepended by ReportContext), so new cards appear with zero delay.
 */

import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { useReports } from '../context/ReportContext';

export function ActivitySection({ onNavigateToMap }: { readonly onNavigateToMap: () => void }) {
  const { myReports, setFocusReportId, submitting } = useReports();

  if (myReports.length === 0 && !submitting) {
    return (
      <div className="eco-card text-center">
        <p className="font-display text-xl font-bold">No reports yet</p>
        <Button variant="sun" className="mt-3" onClick={onNavigateToMap}>Capture your first report</Button>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {submitting && (
        <li key="pending" className="eco-card animate-pulse text-center text-sm font-semibold text-accent">
          AI is scanning for privacy (blurring faces/plates) &amp; classifying trash…
        </li>
      )}
      {myReports.map((item) => {
        const itemsList = Array.isArray(item.detected_items)
          ? item.detected_items.join(', ')
          : String(item.detected_items ?? '');
        return (
          <li key={item.id} className="eco-card space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold capitalize">{item.trash_category?.replace(/_/g, ' ')}</p>
                <p className="text-xs text-muted">Severity {item.severity}/5 · {itemsList || '—'}</p>
              </div>
              <Chip tone={item.site_status === 'cleaned' ? 'accent' : 'warn'}>{item.site_status}</Chip>
            </div>

            {item.media_type === 'video' && item.sanitized_media_url ? (
              <video controls className="h-40 w-full rounded-xl bg-ink" src={item.sanitized_media_url} />
            ) : item.thumbnail_url ? (
              <img alt="Sanitized evidence" className="h-40 w-full rounded-xl object-cover" src={item.thumbnail_url} />
            ) : null}

            <p className="rounded-full bg-accent-soft px-2 py-1 text-xs font-bold text-accent">
              🔒 {item.pii_blur_count} sensitive items blurred
            </p>
            <div className="rounded-xl bg-tile p-2 text-[11px] text-muted">
              <p>Captured: {item.captured_at ? new Date(item.captured_at).toLocaleString() : '—'}</p>
              <p>GPS: {item.lat.toFixed(5)}, {item.lng.toFixed(5)}</p>
              <p>Origin IP: {item.request_ip_masked ?? 'masked'}</p>
              <p>Status: VERIFIED • LIVE ON MAP</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setFocusReportId(item.id);
                  onNavigateToMap();
                }}
              >
                View on Map
              </Button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
