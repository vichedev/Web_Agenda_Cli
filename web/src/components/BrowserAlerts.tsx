import { useState } from 'react';
import { beep, notificationPermission, notificationsSupported } from '../lib/alerts';
import { btn, cx } from '../lib/ui';

/** Alertas dentro del navegador: permiso de notificaciones del sistema y prueba de sonido/alerta. */
export function BrowserAlerts() {
  const [perm, setPerm] = useState(notificationPermission());
  const ask = async () => {
    if (notificationsSupported()) setPerm(await Notification.requestPermission());
  };
  const label = !notificationsSupported() ? 'No disponible en este navegador'
    : perm === 'granted' ? 'Activadas' : perm === 'denied' ? 'Bloqueadas (cámbielo en los permisos del sitio)' : 'Sin activar';

  return (
    <div className="mt-6 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <h3 className="text-sm font-semibold text-slate-800">Alertas en esta pantalla</h3>
      <p className="mt-1 text-[13px] text-slate-500">
        Con la web abierta suena una alerta y aparece una tarjeta con cuenta regresiva cuando faltan los minutos indicados, y otra al llegar la hora
        (con botón para marcar el soporte "En curso"). Si agenda con poca antelación, la alerta salta de inmediato.
      </p>
      <p className="mt-3 text-[13px] text-slate-600">
        Notificaciones del sistema:{' '}
        <span className={cx('font-medium', perm === 'granted' ? 'text-emerald-700' : perm === 'denied' ? 'text-rose-700' : 'text-slate-700')}>{label}</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {perm === 'default' && notificationsSupported() && <button type="button" className={btn('primary', 'sm')} onClick={ask}>Activar notificaciones</button>}
        <button
          type="button" className={btn('secondary', 'sm')}
          onClick={() => { beep('start'); window.dispatchEvent(new CustomEvent('agenda:test-alert')); }}
        >Probar alerta</button>
      </div>
    </div>
  );
}
