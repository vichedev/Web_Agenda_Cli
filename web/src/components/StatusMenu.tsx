import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Status } from '../lib/api';
import { STATUS, STATUS_ORDER, cx } from '../lib/ui';
import { CheckIcon, ChevronDownIcon } from './Icons';

const MENU_W = 176;
const MENU_H = STATUS_ORDER.length * 38 + 10;

/**
 * Selector de estado desplegable. El menu se dibuja en una capa fija fuera de la tarjeta, asi que nunca queda
 * recortado por listas con scroll ni tapado por otras tarjetas, y se abre hacia arriba si abajo no hay espacio.
 */
export function StatusMenu({ status, onChange, disabled, onOpenChange }: {
  status: Status; onChange: (s: Status) => void; disabled?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const open = pos !== null;

  const close = () => setPos(null);
  const toggle = () => {
    if (open) return close();
    const r = button.current!.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - MENU_W - 8));
    const flip = window.innerHeight - r.bottom < MENU_H + 12 && r.top > MENU_H + 12;
    setPos(flip ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
  };

  useEffect(() => { onOpenChange?.(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !menu.current?.contains(t)) close();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); button.current?.focus(); } };
    // Al desplazarse la pagina o la lista, la posicion deja de ser valida: se cierra.
    const away = (e: Event) => { if (!menu.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={toggle}
        className={cx('inline-flex items-center gap-1.5 rounded-full py-1 pr-2 pl-2.5 text-xs font-medium ring-1 ring-inset transition hover:brightness-95 disabled:opacity-60', STATUS[status].badge)}
      >
        <i className={cx('size-1.5 rounded-full', STATUS[status].dot)} />
        {STATUS[status].label}
        <ChevronDownIcon className={cx('size-3.5 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>

      {open && createPortal(
        <ul
          ref={menu} role="listbox" aria-label="Cambiar estado"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: MENU_W }}
          className="animate-fade fixed z-60 rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200"
        >
          {STATUS_ORDER.map((st) => (
            <li key={st}>
              <button
                type="button" role="option" aria-selected={st === status}
                onClick={() => { close(); if (st !== status) onChange(st); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <i className={cx('size-2 rounded-full', STATUS[st].dot)} />
                <span className="flex-1">{STATUS[st].label}</span>
                {st === status && <CheckIcon className="size-4 text-indigo-600" />}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}
