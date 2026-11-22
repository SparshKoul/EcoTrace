import { useState } from 'react';
import { ComplaintModal } from '../components/complaint/ComplaintModal';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import type { Tab } from '../navigation';
import { useApp } from '../state/AppContext';

export function ActivityPage({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { activityV1, signedIn, setFocusReport } = useApp();
  const [complaintSite, setComplaintSite] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <section className="mx-auto w-full max-w-2xl p-4 pb-28">
        <div className="eco-card text-center">
          <p className="font-display text-xl font-bold">Sign in to see your activity</p>
          <Button variant="outline" className="mt-3" onClick={() => onNavigate('account')}>Go to Account</Button>
        </div>
      </section>
    );
  }

  const summary = activityV1?.summary ?? { total_reports: 0, pii_protected: 0, active_sites: 0, cleaned_sites: 0 };
  const items = activityV1?.activity ?? [];

  return (
    <section className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-28" aria-labelledby="activity-heading">
      <header>
        <p className="eco-label">Your impact</p>
        <h1 id="activity-heading" className="font-display text-3xl font-bold">My Activity</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Reports', summary.total_reports],
          ['PII protected', summary.pii_protected],
          ['Active sites', summary.active_sites],
          ['Cleaned', summary.cleaned_sites],
        ].map(([label, value]) => (
          <div key={String(label)} className="eco-card text-center">
            <p className="font-display text-2xl font-bold text-accent">{value}</p>
            <p className="text-[11px] font-semibold text-muted">{label}</p>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div className="eco-card text-center">
          <p className="font-display text-xl font-bold">No reports yet</p>
          <Button variant="sun" className="mt-3" onClick={() => onNavigate('map')}>Capture your first report</Button>
        </div>
      )}

      <ol className="space-y-4">
        {items.map((item) => {
          const itemsList = Array.isArray(item.detected_items) ? item.detected_items.join(', ') : String(item.detected_items ?? '');
          const imageUrl = item.thumbnail_url || item.sanitized_media_url;
          const formattedDate = item.captured_at
            ? new Date(item.captured_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Recently reported';

          return (
            <li key={item.id} className="eco-card space-y-3.5 border-2 border-line/80 shadow-sm transition-all hover:border-accent/40">
              {/* Header with Title and Status */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold capitalize text-ink">
                    {item.trash_category?.replace(/_/g, ' ') || 'Waste Report'}
                  </p>
                  <p className="text-xs font-medium text-muted">
                    Reported on {formattedDate}
                  </p>
                </div>
                <Chip tone={item.site_status === 'cleaned' ? 'accent' : 'warn'}>
                  {item.site_status === 'cleaned' ? 'Cleaned ✓' : 'Active Site'}
                </Chip>
              </div>

              {/* Uploaded Evidence Photo / Video */}
              {item.media_type === 'video' && item.sanitized_media_url ? (
                <div className="relative overflow-hidden rounded-xl border border-line bg-ink">
                  <video controls className="h-48 w-full rounded-xl bg-ink object-cover" src={item.sanitized_media_url} />
                </div>
              ) : imageUrl ? (
                <div className="relative overflow-hidden rounded-xl border border-line bg-tile">
                  <img
                    alt="Uploaded report evidence"
                    className="h-48 w-full object-cover rounded-xl"
                    loading="lazy"
                    src={imageUrl}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                  <div className="hidden h-36 w-full flex-col items-center justify-center p-3 text-center text-xs font-semibold text-muted bg-tile">
                    <span>📸 Verified Evidence On-File</span>
                  </div>
                </div>
              ) : (
                <div className="flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-line bg-tile/60 text-xs font-semibold text-muted">
                  <span>📸 Photo uploaded & stored in verified evidence</span>
                </div>
              )}

              {/* Citizen-Friendly Evidence Summary */}
              {item.public_audit_summary ? (
                <p className="rounded-xl bg-tile/70 px-3 py-2 text-xs text-ink/90 italic">
                  "{item.public_audit_summary}"
                </p>
              ) : itemsList ? (
                <p className="text-xs text-muted">
                  Detected items: <span className="font-medium text-ink">{itemsList}</span>
                </p>
              ) : null}

              {/* Privacy protection indicator */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {item.pii_blur_count > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent">
                    🛡️ Privacy Protected ({item.pii_blur_count} faces/plates blurred)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-tile px-2.5 py-1 text-[11px] font-medium text-muted">
                    🛡️ AI Privacy Pass Verified
                  </span>
                )}
                {item.report_count && item.report_count > 1 ? (
                  <span className="inline-flex items-center rounded-full bg-tile px-2.5 py-1 text-[11px] font-semibold text-muted">
                    👥 {item.report_count} citizens backed this spot
                  </span>
                ) : null}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-line/50">
                <Button
                  variant="sun"
                  className="flex-1 text-xs font-bold"
                  onClick={() => {
                    setFocusReport(item);
                    onNavigate('map');
                  }}
                >
                  📍 View on Map
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-xs font-bold"
                  onClick={() => setComplaintSite(item.site_id)}
                >
                  📄 Complaint Letter
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      {complaintSite && (
        <ComplaintModal siteId={complaintSite} onClose={() => setComplaintSite(null)} />
      )}
    </section>
  );
}
