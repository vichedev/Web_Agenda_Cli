import type { ReactNode } from 'react';
import { CalendarIcon } from './Icons';
import { avatarTone, cx } from '../lib/ui';

/** Logotipo de la aplicacion. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-900/20', className)}>
      <CalendarIcon className="size-5" />
    </span>
  );
}

/** Encabezado de pagina: titulo, subtitulo y acciones. */
export function PageHead({ title, subtitle, children, lead }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode; lead?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        {lead}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </header>
  );
}

export function Avatar({ name, text, size = 'md' }: { name: string; text: string; size?: 'md' | 'lg' }) {
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-full font-semibold', avatarTone(name), size === 'lg' ? 'size-16 text-xl' : 'size-10 text-sm')}>
      {text}
    </span>
  );
}

/** Tarjeta con encabezado opcional. */
export function Card({ title, description, action, children, className }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4.5">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">{children}</div>;
}

/** Interruptor accesible. */
export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="mb-4 flex cursor-pointer items-start justify-between gap-6">
      <span className="text-sm font-medium text-slate-800">
        {label}
        {hint && <span className="mt-0.5 block text-[13px] font-normal text-slate-500">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-slate-300 transition peer-checked:bg-indigo-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-600 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
    </label>
  );
}
