import type { Status } from './api';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50';
const size = { md: 'h-9.5 px-4 text-sm', sm: 'h-8 px-3 text-[13px]' };
const variant = {
  primary: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500',
  secondary: 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-300 ring-inset hover:bg-slate-50',
  danger: 'bg-white text-rose-600 shadow-sm ring-1 ring-rose-200 ring-inset hover:bg-rose-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
};

export const btn = (v: keyof typeof variant = 'primary', s: keyof typeof size = 'md') => cx(base, size[s], variant[v]);

export const card = 'rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80';
export const field = 'mb-4 flex flex-col gap-1.5 text-[13px] font-medium text-slate-700';
export const input =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-slate-300 ring-inset transition placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none';
export const subtle = 'text-sm text-slate-500';

/** Clases por estado de soporte (literales completos para que Tailwind las detecte). */
export const STATUS: Record<Status, { label: string; short: string; dot: string; badge: string; chip: string; bar: string; bubble: string }> = {
  pending: {
    label: 'Pendiente', short: 'Pendiente', dot: 'bg-amber-500', bar: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-700 ring-amber-600/20', chip: 'bg-amber-50 text-amber-800', bubble: 'bg-amber-50 text-amber-600',
  },
  in_progress: {
    label: 'En progreso', short: 'En curso', dot: 'bg-sky-500', bar: 'bg-sky-400',
    badge: 'bg-sky-50 text-sky-700 ring-sky-600/20', chip: 'bg-sky-50 text-sky-800', bubble: 'bg-sky-50 text-sky-600',
  },
  completed: {
    label: 'Completado', short: 'Listo', dot: 'bg-emerald-500', bar: 'bg-emerald-400',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', chip: 'bg-emerald-50 text-emerald-800', bubble: 'bg-emerald-50 text-emerald-600',
  },
  cancelled: {
    label: 'Cancelado', short: 'Cancelado', dot: 'bg-slate-400', bar: 'bg-slate-300',
    badge: 'bg-slate-100 text-slate-600 ring-slate-500/20', chip: 'bg-slate-100 text-slate-600', bubble: 'bg-slate-100 text-slate-500',
  },
};
export const STATUS_ORDER: Status[] = ['pending', 'in_progress', 'completed', 'cancelled'];

const AVATARS = [
  'bg-indigo-100 text-indigo-700', 'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-violet-100 text-violet-700',
];
/** Color estable por nombre. */
export const avatarTone = (name: string) => AVATARS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATARS.length];
