import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type WaStatus } from '../lib/api';
import { btn, cx } from '../lib/ui';
import { useConfirm } from './Modal';

export const WA_INFO: Record<WaStatus['state'], { label: string; dot: string; badge: string }> = {
  starting: { label: 'Iniciando', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  qr: { label: 'Esperando escaneo', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  connected: { label: 'Conectado', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  disconnected: { label: 'Reconectando', dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  mismatch: { label: 'Número incorrecto', dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
};

export function WhatsAppPanel() {
  const qc = useQueryClient();
  // Se consulta cada 2 s: el QR de WhatsApp rota cada ~20 s.
  const { data } = useQuery({ queryKey: ['wa'], queryFn: api.waStatus, refetchInterval: 2000, staleTime: 0 });
  const confirm = useConfirm();
  const logout = useMutation({ mutationFn: api.waLogout, onSuccess: () => qc.invalidateQueries({ queryKey: ['wa'] }) });
  const info = data ? WA_INFO[data.state] : WA_INFO.starting;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cx('inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium ring-1 ring-inset', info.badge)}>
          <i className={cx('size-2 rounded-full', info.dot)} />{data ? info.label : 'Consultando'}
        </span>
        {data?.me && <span className="font-medium tabular-nums text-slate-700">+{data.me}</span>}
      </div>
      {data?.notice && <p className="mt-3 rounded-lg bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700 ring-1 ring-rose-200">{data.notice}</p>}
      {data?.state === 'qr' && data.qr && (
        <div className="mt-5 inline-block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <img src={data.qr} alt="Código QR de WhatsApp" width={232} height={232} className="rounded-md" />
          <p className="mt-3 max-w-58 text-[13px] text-slate-500">En el teléfono: WhatsApp, Dispositivos vinculados, Vincular un dispositivo.</p>
        </div>
      )}
      {data?.state === 'connected' && (
        <button type="button" className={cx(btn('danger', 'sm'), 'mt-4')} onClick={async () => { if (await confirm({ title: 'Desvincular WhatsApp', message: 'El bot dejará de recibir y enviar mensajes hasta que vuelva a escanear un código QR. Sus soportes y clientes no se tocan.', confirmText: 'Desvincular', tone: 'danger' })) logout.mutate(); }}>
          Desvincular
        </button>
      )}
    </div>
  );
}
