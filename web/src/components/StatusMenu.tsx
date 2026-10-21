import { useEffect, useRef, useState } from 'react';
import type { Status } from '../lib/api';
import { STATUS, STATUS_ORDER, cx } from '../lib/ui';
import { CheckIcon, ChevronDownIcon } from './Icons';

/** Selector de estado desplegable: ocupa siempre el mismo espacio sin importar el ancho de la tarjeta. */
export function StatusMenu({ status, onChange, disabled, onOpenChange }: { status: Status; onChange: (s: Status) => void; disabled?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // El contenedor necesita saberlo para elevarse por encima de las tarjetas vecinas.
  useEffect(() => { onOpenChange?.(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}
        className={cx('inline-flex items-center gap-1.5 rounded-full py-1 pr-2 pl-2.5 text-xs font-medium ring-1 ring-inset transition hover:brightness-95 disabled:opacity-60', STATUS[status].badge)}
      >
        <i className={cx('size-1.5 rounded-full', STATUS[status].dot)} />
        {STATUS[status].label}
        <ChevronDownIcon className={cx('size-3.5 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <ul role="listbox" aria-label="Cambiar estado" className="animate-fade absolute top-full left-0 z-30 mt-1.5 w-44 rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
          {STATUS_ORDER.map((st) => (
            <li key={st}>
              <button
                type="button" role="option" aria-selected={st === status}
                onClick={() => { setOpen(false); if (st !== status) onChange(st); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <i className={cx('size-2 rounded-full', STATUS[st].dot)} />
                <span className="flex-1">{STATUS[st].label}</span>
                {st === status && <CheckIcon className="size-4 text-indigo-600" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
