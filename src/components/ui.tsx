'use client';

import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Icon } from './icons';
import { useApp } from '../lib/session';

export const cn = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

// ---------- Button: instant press feedback, never a spinner ----------
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-ledger text-on-ledger border border-transparent',
  secondary: 'bg-surface text-ink border border-line',
  danger: 'bg-surface text-brick border border-brick',
  ghost: 'bg-transparent text-ink border border-transparent',
};

export function Button({ variant = 'primary', block, className, busy, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      aria-busy={busy || undefined}
      {...rest}
      disabled={rest.disabled || busy}
      className={cn(
        'inline-flex min-h-touch items-center justify-center gap-2 rounded-control px-4 text-base font-semibold',
        'transition-transform duration-100 active:scale-[0.98] disabled:opacity-50',
        VARIANT[variant], block && 'w-full', busy && 'opacity-70', className,
      )}
    >
      {children}
    </button>
  );
}

// ---------- Form fields: visible label, reserved message space (no layout jump) ----------
export function Field({ label, error, hint, className, id, ...rest }:
  InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null; hint?: string }) {
  const fieldId = id ?? `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1 block text-sm font-medium">{label}</label>
      <input id={fieldId} aria-invalid={!!error} aria-describedby={`${fieldId}-m`}
        className={cn('min-h-touch w-full rounded-control border bg-surface px-3 text-base', error ? 'border-brick' : 'border-line')} {...rest} />
      <p id={`${fieldId}-m`} className={cn('min-h-[20px] pt-1 text-xs', error ? 'text-brick' : 'text-slate')}>{error ?? hint ?? ''}</p>
    </div>
  );
}

export function Select({ label, children, className, id, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const fieldId = id ?? `s-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1 block text-sm font-medium">{label}</label>
      <select id={fieldId} className="min-h-touch w-full rounded-control border border-line bg-surface px-3 text-base" {...rest}>{children}</select>
      <p className="min-h-[20px]" />
    </div>
  );
}

// ---------- Bottom sheet ----------
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useApp();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="fade-in absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className="sheet-in relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-sheet bg-surface shadow-sheet">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" aria-hidden="true" />
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button type="button" data-close onClick={onClose} aria-label={t('common.close')} className="grid h-10 w-10 place-items-center rounded-control text-slate"><Icon name="close" /></button>
        </div>
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="border-t border-line bg-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Skeletons: same shapes as real content ----------
export const Skeleton = ({ className }: { className?: string }) => <div className={cn('skeleton', className)} aria-hidden="true" />;

export function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-busy="true" className="divide-y divide-line">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex h-16 items-center gap-3 px-4">
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/5" /><Skeleton className="h-3 w-1/4" /></div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function TileSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" aria-busy="true" className="grid grid-cols-2 gap-2 p-4">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-[72px] rounded-card" />)}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid grid-cols-2 gap-3 p-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="rounded-card border border-line bg-surface p-4"><Skeleton className="mb-3 h-3 w-1/2" /><Skeleton className="h-7 w-3/4" /></div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-lg">
      <div className="p-4"><Skeleton className="h-7 w-40" /></div>
      <RowSkeleton count={7} />
    </div>
  );
}

// ---------- Small pieces ----------
export function Chip({ tone = 'neutral', icon, children }: { tone?: 'neutral' | 'warn' | 'bad' | 'good'; icon?: 'alert' | 'check' | 'sync' | 'offline'; children: ReactNode }) {
  const tones = { neutral: 'border-line text-slate', warn: 'border-owed text-owed-text', bad: 'border-brick text-brick', good: 'border-ledger text-ledger' };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', tones[tone])}>
      {icon && <Icon name={icon} size={12} />}{children}
    </span>
  );
}

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  return (
    <div role="status" className={cn('flex items-center gap-2 px-4 py-2 text-sm', tone === 'warn' ? 'bg-owed/15 text-owed-text' : 'bg-line/60 text-slate')}>
      <Icon name="offline" size={16} />{children}
    </div>
  );
}

export function Empty({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <p className="text-base text-slate">{title}</p>
      {action}
    </div>
  );
}

/** Money with a sign-safe tone. Color is never the only signal: callers pair it with a word or icon. */
export function Amount({ text, tone = 'ink', className }: { text: string; tone?: 'ink' | 'in' | 'owed' | 'late'; className?: string }) {
  const tones = { ink: 'text-ink', in: 'text-ledger', owed: 'text-owed-text', late: 'text-brick' };
  return <span className={cn('num font-semibold', tones[tone], className)}>{text}</span>;
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ink' | 'in' | 'owed' | 'late' }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-sm text-slate">{label}</p>
      <p className="mt-1 text-2xl"><Amount text={value} tone={tone} /></p>
    </div>
  );
}

export function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="inline-flex items-center rounded-control border border-line">
      <button type="button" aria-label="-" className="grid h-12 w-12 place-items-center" onClick={() => onChange(Math.max(min, value - 1))}><Icon name="minus" /></button>
      <span className="num w-10 text-center font-semibold">{value}</span>
      <button type="button" aria-label="+" className="grid h-12 w-12 place-items-center" onClick={() => onChange(value + 1)}><Icon name="plus" /></button>
    </div>
  );
}
