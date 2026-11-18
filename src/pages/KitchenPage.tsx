import { Panel } from '@/components/Panel';
import { StatusBadge } from '@/components/StatusBadge';
import { useSessionStore } from '@/store/useSessionStore';
import { updateStationStatus } from '@/services/api';

const columns = ['PENDING', 'IN_PREPARATION', 'READY'] as const;

export default function KitchenPage() {
  const kitchenOrders = useSessionStore((state) => state.snapshot?.kitchenOrders ?? []);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);

  async function handleUpdate(orderId: number, status: (typeof columns)[number]) {
    await updateStationStatus({ station: 'KITCHEN', orderId, status });
    await refreshSnapshot();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      {columns.map((column) => (
        <Panel key={column} title={column === 'PENDING' ? 'Pendiente' : column === 'IN_PREPARATION' ? 'En preparacion' : 'Listo'} subtitle="Kitchen Display System">
          <div className="space-y-4">
            {kitchenOrders
              .filter((order) => order.status === column)
              .map((order) => (
                <article key={order.id} className="rounded-[24px] border border-white/10 bg-zinc-950/50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{order.code}</p>
                      <p className="text-sm text-zinc-500">{order.area}</p>
                    </div>
                    <StatusBadge value={order.priority} />
                  </div>
                  <p className="mt-4 text-sm text-zinc-300">Tiempo: {order.elapsedMinutes} min</p>
                  <div className="mt-4 space-y-2 text-sm text-zinc-200">
                    {order.items.map((item, index) => (
                      <div
                        key={`${order.id}-${index}`}
                        className="whitespace-pre-wrap rounded-2xl bg-white/[0.03] px-3 py-2"
                      >
                        {item.quantity} x {item.product}
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex gap-2">
                    {order.status === 'PENDING' ? (
                      <button
                        type="button"
                        onClick={() => void handleUpdate(order.orderId, 'IN_PREPARATION')}
                        className="h-10 flex-1 rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-white transition hover:bg-amber-300/15"
                      >
                        Iniciar
                      </button>
                    ) : null}
                    {order.status === 'IN_PREPARATION' ? (
                      <button
                        type="button"
                        onClick={() => void handleUpdate(order.orderId, 'READY')}
                        className="h-10 flex-1 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 text-sm font-semibold text-white transition hover:bg-emerald-500/15"
                      >
                        Listo
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
