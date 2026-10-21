import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { btn, cx } from '../lib/ui';
import { CloseIcon, WarningIcon } from './Icons';

const SIZE = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' } as const;
const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal accesible: capa difuminada, cierre con Esc o clic fuera, foco atrapado (y devuelto al cerrar),
 * bloqueo del scroll de la pagina y animacion de entrada.
 */
export function Modal({ open, onClose, title, description, icon: Icon, tone = 'neutral', size = 'md', footer, children }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode;
  icon?: ComponentType<{ className?: string }>; tone?: 'neutral' | 'danger'; size?: keyof typeof SIZE; footer?: ReactNode; children?: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    // Foco inicial: el elemento marcado, o el primer campo del formulario.
    const t = window.setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>('input,textarea,select');
      (el ?? panel.current)?.focus();
    }, 30);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div
      className="animate-overlay fixed inset-0 z-70 overflow-y-auto bg-slate-900/45 backdrop-blur-[3px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="grid min-h-full place-items-center p-4 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div
          ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
          className={cx('animate-rise relative w-full rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 focus:outline-none', SIZE[size])}
        >
          <div className="flex items-start gap-4 px-6 pt-6 pb-2">
            {Icon && (
              <span className={cx('grid size-11 shrink-0 place-items-center rounded-full', tone === 'danger' ? 'bg-rose-50 text-rose-600 ring-8 ring-rose-50/60' : 'bg-indigo-50 text-indigo-600')}>
                <Icon className="size-5.5" />
              </span>
            )}
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 id={titleId} className="text-[17px] leading-snug font-semibold tracking-tight text-slate-900">{title}</h2>
              {description && <div className="mt-1 text-sm leading-relaxed text-slate-500">{description}</div>}
            </div>
            <button type="button" aria-label="Cerrar" onClick={onClose} className="-mt-1 -mr-2 grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
              <CloseIcon className="size-4.5" />
            </button>
          </div>
          {children && <div className="px-6 pt-3 pb-6">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2.5 rounded-b-2xl border-t border-slate-100 bg-slate-50/80 px-6 py-4">{footer}</div>}
          {!children && !footer && <div className="pb-4" />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------- Confirmaciones (sustituyen a window.confirm) ----------

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'primary';
}
type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(() => Promise.resolve(false));

/** `const confirm = useConfirm(); if (await confirm({ title: '...', tone: 'danger' })) { ... }` */
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback<Confirm>((options) => new Promise<boolean>((resolve) => setState({ options, resolve })), []);
  const finish = (value: boolean) => { state?.resolve(value); setState(null); };
  const o = state?.options;
  const danger = o?.tone !== 'primary';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state} onClose={() => finish(false)} size="sm" tone={danger ? 'danger' : 'neutral'} icon={WarningIcon}
        title={o?.title ?? ''} description={o?.message}
        footer={
          <>
            <button type="button" data-autofocus className={btn('secondary')} onClick={() => finish(false)}>{o?.cancelText ?? 'Cancelar'}</button>
            <button type="button" className={btn(danger ? 'dangerSolid' : 'primary')} onClick={() => finish(true)}>{o?.confirmText ?? 'Confirmar'}</button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}
