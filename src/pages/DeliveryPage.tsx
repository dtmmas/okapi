import { Panel } from '@/components/Panel';
import { StatusBadge } from '@/components/StatusBadge';
import { useSessionStore } from '@/store/useSessionStore';

export default function DeliveryPage() {
  const snapshot = useSessionStore((state) => state.snapshot);
  const deliveryOrders = snapshot?.deliveryOrders ?? [];
  const currencySymbol = snapshot?.brand.currencySymbol ?? 'Q';

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <Panel title="Despacho y reparto" subtitle="Asignacion manual o automatica de pedidos">
        <div className="space-y-4">
          {deliveryOrders.map((order) => (
            <article key={order.id} className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">{order.code}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">{order.customerName}</p>
                </div>
                <StatusBadge value={order.status} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-700 dark:text-zinc-300">
                <div>
                  <p className="text-slate-500 dark:text-zinc-500">Distrito</p>
                  <p className="mt-1 text-slate-950 dark:text-white">{order.district}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-zinc-500">Repartidor</p>
                  <p className="mt-1 text-slate-950 dark:text-white">{order.driver}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-zinc-500">ETA</p>
                  <p className="mt-1 text-slate-950 dark:text-white">{order.eta}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-zinc-500">Total</p>
                  <p className="mt-1 text-slate-950 dark:text-white">
                    {currencySymbol} {order.total}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="Mapa operativo" subtitle="Integracion prevista con Google Maps API">
        <div className="relative min-h-[440px] overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_20%_20%,rgba(251,191,36,0.12),transparent_18%),radial-gradient(circle_at_80%_35%,rgba(14,165,233,0.12),transparent_22%),linear-gradient(135deg,#ffffff_0%,#f5f7fb_100%)] p-5 dark:border-white/10 dark:bg-[radial-gradient(circle_at_20%_20%,rgba(251,191,36,0.16),transparent_18%),radial-gradient(circle_at_80%_35%,rgba(14,165,233,0.18),transparent_22%),linear-gradient(135deg,#111318_0%,#16181f_100%)]">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.05)_1px,transparent_1px)] bg-[size:40px_40px] dark:bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-zinc-500">Lima Metropolitana</p>
              <p className="mt-3 max-w-sm text-sm text-slate-700 dark:text-zinc-300">
                La vista de mapa queda lista para conectar rutas, geocodificacion y seguimiento en vivo por repartidor.
              </p>
            </div>
            <div className="grid gap-3">
              {deliveryOrders.map((order) => (
                <div key={order.code} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm shadow-sm dark:border-white/10 dark:bg-black/20 dark:shadow-none">
                  <span className="text-slate-950 dark:text-white">{order.customerName}</span>
                  <span className="text-slate-500 dark:text-zinc-400">{order.district}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
