'use client';
import { clsx } from 'clsx';
import { forwardRef, useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import type { Tone } from './tokens';

export const cx = clsx;

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'whatsapp';
const BUTTON: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover border border-accent',
  secondary: 'bg-surface text-ink border border-line hover:border-ink',
  ghost: 'bg-transparent text-ink border border-transparent hover:bg-surface-muted',
  danger: 'bg-danger text-white border border-danger hover:opacity-90',
  whatsapp: 'bg-whatsapp text-white border border-whatsapp hover:opacity-90',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        size === 'md' && 'min-h-11 px-4 text-sm',
        size === 'lg' && 'min-h-14 px-6 text-base',
        BUTTON[variant],
        className,
      )}
      {...rest}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {children}
    </button>
  );
});

export interface FieldProps {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  required?: boolean;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}

/** Label above, error next to the field (SPEC Part 11). */
export function Field({ label, error, hint, required, children, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children(id, [hintId, errId].filter(Boolean).join(' ') || undefined)}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const control =
  'w-full rounded-sm border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none disabled:bg-surface-muted aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cx(control, 'min-h-11', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cx(control, 'min-h-24', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined} className={cx(control, 'min-h-11 pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line', disabled && 'opacity-50')}
      >
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
      <span>{label}</span>
    </label>
  );
}

const TONE: Record<Tone, string> = {
  neutral: 'bg-[#EEF0F2] text-[#3E444A]',
  info: 'bg-[#E3EDF7] text-[#1F4A73]',
  waiting: 'bg-[#FBF0DC] text-[#7A4C0B]',
  success: 'bg-[#E2F1E8] text-[#1F5E3A]',
  danger: 'bg-[#F8E1DF] text-[#8C1D17]',
  returned: 'bg-[#EEE6F6] text-[#553180]',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONE[tone], className)}>{children}</span>;
}

/** Status → tone, consistent everywhere (grey new, blue in progress, amber waiting, green done, red failed, purple returned). */
export function toneFor(status: string): Tone {
  const s = status.toUpperCase();
  if (['DELIVERED', 'PAID', 'COD_COLLECTED', 'CONVERTED', 'PUBLISHED', 'APPROVED', 'ACTIVE', 'SENT', 'CLOSED_WON', 'RECEIVED', 'HIRED', 'COMPLETED'].includes(s)) return 'success';
  if (['CANCELLED', 'FAILED', 'REJECTED', 'BLOCKED', 'INACTIVE', 'ARCHIVED'].includes(s)) return 'danger';
  if (['RETURNED', 'REFUNDED', 'PICKUP_SCHEDULED', 'PICKED_UP_RETURN'].includes(s)) return 'returned';
  if (['PENDING', 'COD_PENDING', 'PENDING_APPROVAL', 'QUOTED', 'REQUESTED', 'DRAFT_PENDING', 'SCHEDULED', 'QUEUED', 'AWAITING'].includes(s)) return 'waiting';
  if (['NEW', 'DRAFT', 'PLACED', 'UNPUBLISHED', 'CLOSED'].includes(s)) return 'neutral';
  return 'info';
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={toneFor(status)}>{label ?? status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}

export function Card({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-md border border-line bg-surface p-4', className)} {...rest}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-r-transparent" aria-hidden />
      {label}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line px-6 py-12 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'danger' | 'success' | 'warning'; children: ReactNode }) {
  const cls = {
    info: 'border-info/30 bg-[#E3EDF7] text-[#1F4A73]',
    danger: 'border-danger/30 bg-[#F8E1DF] text-[#8C1D17]',
    success: 'border-success/30 bg-[#E2F1E8] text-[#1F5E3A]',
    warning: 'border-warning/30 bg-[#FBF0DC] text-[#7A4C0B]',
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('rounded-sm border px-3 py-2 text-sm', cls)}>
      {children}
    </div>
  );
}
