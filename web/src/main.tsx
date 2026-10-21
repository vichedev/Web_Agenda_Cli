import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { CalendarIcon, LogoutIcon, SettingsIcon, UsersIcon } from './components/Icons';
import { Alerts } from './components/Alerts';
import { Realtime } from './components/Realtime';
import { Logo } from './components/ui';
import { WA_INFO } from './components/WhatsAppPanel';
import { api, auth } from './lib/api';
import { cx } from './lib/ui';
import { CalendarPage } from './pages/CalendarPage';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { ClientsPage } from './pages/ClientsPage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000 } } });

const navLink = ({ isActive }: { isActive: boolean }) =>
  cx(
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
    isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white',
  );

/** Estado de la conexion de WhatsApp, siempre visible en la barra lateral. */
function WaChip() {
  const { data } = useQuery({ queryKey: ['wa'], queryFn: api.waStatus, refetchInterval: 5000, staleTime: 0 });
  const info = data ? WA_INFO[data.state] : WA_INFO.starting;
  return (
    <Link to="/settings" className="hidden rounded-xl bg-white/5 p-3 ring-1 ring-white/10 transition hover:bg-white/10 md:block">
      <span className="flex items-center gap-2 text-xs font-medium text-slate-400">
        <i className={cx('size-2 rounded-full', info.dot)} />WhatsApp
      </span>
      <span className="mt-1 block text-sm font-medium text-white">{info.label}</span>
      {data?.me && <span className="block text-xs tabular-nums text-slate-400">+{data.me}</span>}
    </Link>
  );
}

function Layout() {
  if (!auth.get()) return <Navigate to="/login" replace />;
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="flex items-center gap-3 overflow-x-auto bg-slate-900 px-4 py-3 md:sticky md:top-0 md:h-screen md:flex-col md:items-stretch md:gap-0 md:overflow-visible md:px-4 md:py-5">
        <div className="flex items-center gap-3 pr-3 md:px-2 md:pb-6">
          <Logo />
          <div className="hidden leading-tight md:block">
            <p className="font-semibold text-white">Agenda</p>
            <p className="text-xs text-slate-400">Gestión de soportes</p>
          </div>
        </div>

        <p className="mb-2 hidden px-3 text-[11px] font-medium tracking-wider text-slate-500 uppercase md:block">Menú</p>
        <nav className="flex gap-1 md:flex-1 md:flex-col">
          <NavLink to="/" end className={navLink}><CalendarIcon className="size-4.5" /><span className="hidden md:inline">Calendario</span></NavLink>
          <NavLink to="/clients" className={navLink}><UsersIcon className="size-4.5" /><span className="hidden md:inline">Clientes</span></NavLink>
          <NavLink to="/settings" className={navLink}><SettingsIcon className="size-4.5" /><span className="hidden md:inline">Configuración</span></NavLink>
        </nav>

        <WaChip />
        <button
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white md:mt-3"
          onClick={() => { auth.clear(); window.location.assign('/login'); }}
        >
          <LogoutIcon className="size-4.5" /><span className="hidden md:inline">Cerrar sesión</span>
        </button>
      </aside>

      <Realtime />
      <Alerts />
      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-9 md:py-9">
        <Outlet />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route index element={<CalendarPage />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="clients/:id" element={<ClientDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
