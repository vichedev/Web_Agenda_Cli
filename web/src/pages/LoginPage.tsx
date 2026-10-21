import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowIcon, EyeIcon, EyeOffIcon, LockIcon, UserIcon } from '../components/Icons';
import { Logo } from '../components/ui';
import { api, auth } from '../lib/api';
import { btn, cx, input } from '../lib/ui';

export function LoginPage() {
  const nav = useNavigate();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      auth.set((await api.login(user, password)).token);
      nav('/');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-50 px-4 py-10">
      {/* Fondo: puntos y un resplandor suave detras de la tarjeta */}
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(var(--color-slate-300)_1px,transparent_1px)] bg-size-[22px_22px] mask-[radial-gradient(ellipse_70%_60%_at_50%_45%,#000,transparent)]" />
      <div aria-hidden="true" className="absolute top-[-12rem] left-1/2 size-130 -translate-x-1/2 rounded-full bg-indigo-200/50 blur-3xl" />

      <div className="animate-rise relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="size-12 rounded-2xl" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Agenda de Soportes</h1>
          <p className="mt-1.5 text-sm text-slate-500">Inicie sesión para gestionar su agenda.</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl bg-white p-7 shadow-xl shadow-slate-900/5 ring-1 ring-slate-200">
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-700">Usuario</span>
            <span className="relative block">
              <UserIcon className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-slate-400" />
              <input className={cx(input, 'h-11 pl-10')} autoFocus autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} required />
            </span>
          </label>

          <label className="mb-5 block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-700">Contraseña</span>
            <span className="relative block">
              <LockIcon className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-slate-400" />
              <input
                className={cx(input, 'h-11 pr-11 pl-10')} type={show ? 'text' : 'password'} autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} required
              />
              <button
                type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >{show ? <EyeOffIcon className="size-4.5" /> : <EyeIcon className="size-4.5" />}</button>
            </span>
          </label>

          {error && <div role="alert" className="mb-4 rounded-lg bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700 ring-1 ring-rose-200">{error}</div>}

          <button type="submit" disabled={busy} className={cx(btn(), 'group h-11 w-full')}>
            {busy ? 'Verificando…' : <>Continuar<ArrowIcon className="size-4 transition-transform group-hover:translate-x-0.5" /></>}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-slate-400">Acceso restringido al equipo de soporte.</p>
      </div>
    </div>
  );
}
