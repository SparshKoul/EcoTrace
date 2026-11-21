import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { fetchComplaint } from '../../services/api';
import { useApp } from '../../state/AppContext';
import type { ComplaintLetter } from '../../types';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';

interface ComplaintModalProps {
  readonly siteId: string;
  readonly onClose: () => void;
}

export function ComplaintModal({ siteId, onClose }: ComplaintModalProps) {
  const { notify } = useApp();
  const [letter, setLetter] = useState<ComplaintLetter | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchComplaint(siteId)
      .then((result) => { if (active) setLetter(result); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not draft the complaint.');
      });
    return () => { active = false; };
  }, [siteId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    if (!letter) return;
    try {
      await navigator.clipboard.writeText(letter.body);
      notify('Complaint text copied.');
    } catch {
      notify('Clipboard is unavailable. Select the text to copy it.');
    }
  };

  const downloadPdf = () => {
    if (!letter) return;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('EcoTrace — Citizen Complaint Draft', 18, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(letter.body, 174);
    doc.text(lines, 18, 30);
    doc.save(`ecotrace-complaint-${letter.siteId}.pdf`);
  };

  const mailto = letter
    ? `mailto:?subject=${encodeURIComponent(letter.subject)}&body=${encodeURIComponent(letter.body)}`
    : 'mailto:';

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="complaint-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-sheet bg-surface shadow-2xl sm:rounded-sheet"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div>
            <p className="eco-label">Citizen draft</p>
            <h2 id="complaint-title" className="font-display text-2xl font-bold">Legal complaint preview</h2>
            <p className="mt-1 text-xs text-muted">
              Addressed to the ULB head, with the MLA and MP in CC. Nothing is sent automatically.
            </p>
          </div>
          <Button variant="quiet" aria-label="Close complaint preview" onClick={onClose}>✕</Button>
        </header>

        <div className="overflow-y-auto p-5">
          {error && <p className="rounded-xl bg-[#fde8e6] p-4 text-sm text-[#b3261e]">{error}</p>}
          {!letter && !error && <p className="animate-pulse text-sm text-muted">Preparing the verified letter…</p>}
          {letter && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="accent">{letter.citations.length} verified citations</Chip>
                <Chip tone="neutral">Review before sending</Chip>
              </div>
              <div className="rounded-2xl border border-line bg-page p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                  Every quoted rule passed the deterministic exact-substring check against the SWM Rules, 2026 corpus.
                </p>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">{letter.body}</pre>
              </div>
              <div>
                <p className="eco-label">Verified sources</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
                  {letter.citations.map((citation) => <li key={citation}>{citation}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>

        <footer className="no-print flex flex-wrap gap-2 border-t border-line p-5">
          <Button variant="outline" onClick={() => void copy()} disabled={!letter}>Copy text</Button>
          <Button variant="outline" onClick={downloadPdf} disabled={!letter}>Download PDF</Button>
          <a
            href={mailto}
            onClick={() => notify('Your mail app will open with the draft. Review before sending.')}
            aria-disabled={!letter}
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full border-2 border-accent bg-accent px-5 py-2 text-sm font-bold text-white ${letter ? '' : 'pointer-events-none opacity-45'}`}
          >
            Open in mail app
          </a>
        </footer>
      </div>
    </div>
  );
}
