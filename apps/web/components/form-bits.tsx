'use client';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';

const cls = 'w-full border border-line bg-surface px-3 py-3 text-base text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none aria-[invalid=true]:border-danger';

export function FormField({ label, error, hint, required, children }: { label: string; error?: string; hint?: string; required?: boolean; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId();
  const d = error ? `${id}-e` : hint ? `${id}-h` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children(id, d)}
      {hint && !error && <p id={`${id}-h`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-e`} role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export const TextInput = (p: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) => {
  const { invalid, className, ...rest } = p;
  return <input aria-invalid={invalid || undefined} className={`${cls} min-h-12 ${className ?? ''}`} {...rest} />;
};
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) => {
  const { invalid, className, ...rest } = p;
  return <textarea aria-invalid={invalid || undefined} rows={4} className={`${cls} ${className ?? ''}`} {...rest} />;
};
export const SelectInput = (p: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) => {
  const { invalid, className, ...rest } = p;
  return <select aria-invalid={invalid || undefined} className={`${cls} min-h-12 ${className ?? ''}`} {...rest} />;
};

export function SubmitButton({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy} aria-busy={busy || undefined} className="inline-flex min-h-12 items-center justify-center bg-accent px-7 text-[15px] text-white hover:bg-accent-hover disabled:opacity-70">
      {busy ? 'Sending…' : children}
    </button>
  );
}

export function Notice({ tone, children }: { tone: 'success' | 'danger'; children: ReactNode }) {
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={`border px-4 py-3 text-sm ${tone === 'success' ? 'border-success/40 bg-[#E2F1E8] text-[#1F5E3A]' : 'border-danger/40 bg-[#F8E1DF] text-[#8C1D17]'}`}>{children}</div>;
}
