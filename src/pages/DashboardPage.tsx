import { MetricCard } from '@/components/MetricCard';
import { Panel } from '@/components/Panel';
import { StatusBadge } from '@/components/StatusBadge';
import { useSessionStore } from '@/store/useSessionStore';

export default function DashboardPage() {
  const snapshot = useSessionStore((state) => state.snapshot);

  if (!snapshot) {
    return null;
  }

  const maxSales = Math.max(...snapshot.salesTrend.map((point) => point.total));
  const currencySymbol = snapshot.brand.currencySymbol;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {snapshot.dashboardMetrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Ventas semanales" subtitle="Comportamiento de la semana por todas las sucursales">
          <div className="grid grid-cols-7 gap-3">
            {snapshot.salesTrend.map((point) => (
              <div key={point.label} className="flex flex-col items-center gap-3">
                <div className="flex h-56 w-full items-end rounded-[22px] bg-slate-100 p-2 dark:bg-zinc-950/60">
                  <div
                    className="w-full rounded-[18px] bg-gradient-to-t from-rose-500 via-orange-400 to-amber-300"
                    style={{ height: `${(point.total / maxSales) * 100}%` }}
                  />
                </div>
                <div className="text-center">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">{point.label}</p>
                  <p className="mt-1 text-sm text-slate-900 dark:text-white">
                    {currencySymbol} {point.total.toLocaleString('es-GT')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Productos destacados" subtitle="Combinación ideal entre rotación y margen">
          <div className="space-y-4">
            {snapshot.topProducts.map((product) => (
              <article key={product.id} className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/40 dark:shadow-none">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950 dark:text-white">{product.name}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">{product.sold} vendidos</p>
                  </div>
                  <StatusBadge value="READY" className="text-[10px]" />
                </div>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-zinc-300">
                  <span>
                    Ingreso: {currencySymbol} {product.revenue.toLocaleString('es-GT')}
                  </span>
                  <span>Margen: {product.margin}</span>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </section>

      <Panel title="Órdenes activas" subtitle="Operación en curso entre salón, recojo y reparto">
        <div className="grid gap-4 xl:grid-cols-3">
          {snapshot.activeOrders.map((order) => (
            <article key={order.id} className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/50 dark:shadow-none">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display text-2xl text-slate-950 dark:text-white">{order.code}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">{order.customerName}</p>
                </div>
                <StatusBadge value={order.status} />
              </div>
              <div className="mt-5 space-y-3 text-sm text-slate-600 dark:text-zinc-300">
                <p>
                  <span className="text-slate-500 dark:text-zinc-500">Canal:</span> {order.channel}
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-500">Total:</span> {currencySymbol} {order.total}
                </p>
                <p>
                  <span className="text-slate-500 dark:text-zinc-500">Area:</span> {order.area}
                </p>
              </div>
              <div className="mt-4 space-y-2 rounded-[20px] bg-slate-50 p-4 dark:bg-white/[0.03]">
                {order.items.map((item) => (
                  <div key={`${order.id}-${item.product}`} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="text-slate-900 dark:text-white">{item.product}</p>
                      <p className="text-slate-500 dark:text-zinc-500">{item.notes || item.modifier || 'Sin observaciones'}</p>
                    </div>
                    <span className="text-slate-600 dark:text-zinc-300">x{item.quantity}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
