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

      <ol className="space-y-3">
        {items.map((item) => {
          const itemsList = Array.isArray(item.detected_items) ? item.detected_items.join(', ') : String(item.detected_items ?? '');
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
                <p>Status: {item.grouped ? 'MERGED INTO EXISTING SITE' : item.status}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFocusReport(item);
                    onNavigate('map');
                  }}
                >
                  View on Map
                </Button>
                <Button variant="outline" onClick={() => setComplaintSite(item.site_id)}>Complaint Letter</Button>
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
