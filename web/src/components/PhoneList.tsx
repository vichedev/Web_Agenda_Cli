import { useState } from 'react';
import { btn, cx, input } from '../lib/ui';
import { PlusIcon, TrashIcon } from './Icons';

const digits = (v: string) => v.replace(/\D/g, '');

/** Editor de una lista de telefonos (E.164 sin +). */
export function PhoneList({ value, onChange, empty }: { value: string[]; onChange: (v: string[]) => void; empty?: string }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    const p = digits(draft);
    if (p.length < 8 || p.length > 15) return setError('Número inválido. Incluya el código de país, ej. 593991234567.');
    if (value.includes(p)) return setError('Ese número ya está en la lista.');
    if (p.startsWith('593') && p.length !== 12) return setError('Un móvil de Ecuador lleva 12 dígitos: 593 + 9 + 8 dígitos (ej. 593986819378).');
    onChange([...value, p]);
    setDraft('');
    setError('');
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          className={input} placeholder="593991234567" inputMode="numeric" aria-label="Número a agregar" value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button type="button" className={cx(btn('secondary'), 'shrink-0')} onClick={add}><PlusIcon className="size-4" />Agregar</button>
      </div>
      {error && <p className="mt-2 text-[13px] text-rose-600">{error}</p>}
      {value.length === 0 ? (
        empty && <p className="mt-3 rounded-lg bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800 ring-1 ring-amber-200">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {value.map((p) => (
            <li key={p} className="flex items-center justify-between px-4 py-2.5">
              <span className="font-medium tabular-nums text-slate-800">+{p}</span>
              <button type="button" aria-label={`Quitar ${p}`} className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" onClick={() => onChange(value.filter((x) => x !== p))}>
                <TrashIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
