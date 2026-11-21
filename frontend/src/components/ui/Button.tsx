import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'sun' | 'outline' | 'quiet' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly children: ReactNode;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-accent text-white border-accent shadow-[0_3px_0_#07544f]',
  sun: 'bg-sun text-ink border-ink shadow-[0_3px_0_#221c15]',
  outline: 'bg-surface text-ink border-ink',
  quiet: 'bg-transparent text-ink border-transparent',
  danger: 'bg-[#b3261e] text-white border-[#b3261e] shadow-[0_3px_0_#7d1a15]',
};

export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 px-5 py-2 text-sm font-bold transition-transform active:translate-y-[2px] active:shadow-none disabled:opacity-45 disabled:active:translate-y-0 ${VARIANT_CLASS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
