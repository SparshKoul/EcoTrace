import type { ReactNode } from 'react';

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'bad' }) {
  const toneClass = {
    neutral: 'bg-tile text-muted border-line',
    accent: 'bg-accent-soft text-accent border-accent/30',
    warn: 'bg-[#fff2d6] text-[#8a5b00] border-[#f0cf8b]',
    bad: 'bg-[#fde8e6] text-[#b3261e] border-[#f2b8b4]',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${toneClass}`}>
      {children}
    </span>
  );
}
