import { useEffect, useState } from 'react';
import { AlertTriangle, Boxes, CreditCard, PackageSearch, ReceiptText, Store, Truck, Users } from 'lucide-react';
import { AppIcon } from '@/components/AppIcon';
import { Panel } from '@/components/Panel';
import { getReportsSummary } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';

export default function ReportsPage() {
  const snapshot = useSessionStore((state) => state.snapshot);
  const [filters, setFilters] = useState(() => {
    const now = new Date();
    const dateTo = now.toISOString().slice(0, 10);
    const dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return {
      dateFrom,
      dateTo,
      branchId: null as number | null,
      userId: null as number | null,
    };
  });
  const [reportData, setReportData] = useState<Awaited<ReturnType<typeof getReportsSummary>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getReportsSummary(filters);
        if (!cancelled) {
          setReportData(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No fue posible cargar la reportería.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  if (!snapshot) {
    return null;
  }

  const branchOptions = snapshot.branches;
  const selectedBranch = branchOptions.find((branch) => branch.id === filters.branchId) ?? null;
  const liveTables = filters.branchId ? snapshot.tables.filter((table) => table.branchId === filters.branchId) : snapshot.tables;
  const liveActiveOrders = filters.branchId ? snapshot.activeOrders.filter((order) => order.branchId === filters.branchId) : snapshot.activeOrders;
  const selectedBranchName = selectedBranch?.name ?? null;
  const currencySymbol = snapshot.brand.currencySymbol;
  const currentSalesTrend = reportData?.salesTrend ?? [];
  const currentTopProducts = reportData?.topProducts ?? [];
  const currentSummary = reportData?.summary ?? snapshot.reportSummary;
  const currentPaymentMix = reportData?.paymentMix ?? [];
  const orderCount = reportData?.orderCount ?? 0;
  const maxSales = Math.max(...currentSalesTrend.map((point) => point.total), 1);
  const totalTables = liveTables.length;
  const occupiedTables = liveTables.filter((table) => table.status === 'OCCUPIED').length;
  const occupancyRate = totalTables ? Math.round((occupiedTables / totalTables) * 100) : 0;
  const pendingCollection = liveActiveOrders.reduce((sum, order) => sum + order.pendingAmount, 0);
  const activeDeliveryOrders = filters.branchId
    ? liveActiveOrders.filter((order) => order.type === 'DELIVERY').length
    : snapshot.deliveryOrders.filter((order) => order.status !== 'DELIVERED').length;
  const lowStockItems = snapshot.inventoryItems.filter(
    (item) => item.status === 'LOW' && (!selectedBranchName || item.branch === selectedBranchName),
  );
  const activeCustomersWithCredit = snapshot.customers.filter((customer) => customer.creditUsed > 0);
  const vipCustomers = snapshot.customers.filter((customer) => customer.segment === 'VIP').length;
  const marginRate = currentSummary.sales
    ? Math.round((currentSummary.profit / currentSummary.sales) * 100)
    : 0;
  const estimatedCost = Math.max(0, currentSummary.sales - currentSummary.profit);
  const profitPerOrder = orderCount ? Math.round(currentSummary.profit / orderCount) : 0;
  const averageDailySales = currentSalesTrend.reduce((sum, point) => sum + point.total, 0) / Math.max(currentSalesTrend.length, 1);
  const bestDay = currentSalesTrend.reduce(
    (best, current) => (current.total > best.total ? current : best),
    currentSalesTrend[0] ?? { label: '-', total: 0 },
  );
  const weakestDay = currentSalesTrend.reduce(
    (worst, current) => (current.total < worst.total ? current : worst),
    currentSalesTrend[0] ?? { label: '-', total: 0 },
  );
  const topRevenueTotal = currentTopProducts.reduce((sum, product) => sum + product.revenue, 0);

  const decisions = [
    {
      title: 'Cobros pendientes',
      value: `${currencySymbol} ${pendingCollection.toLocaleString('es-GT')}`,
      detail:
        pendingCollection > 0
          ? `${liveActiveOrders.length} cuentas activas todavía no cerradas`
          : 'No hay saldo pendiente en cuentas abiertas',
      tone:
        pendingCollection > currentSummary.averageTicket * 3
          ? 'alert'
          : pendingCollection > 0
            ? 'watch'
            : 'good',
    },
    {
      title: 'Mesas ocupadas',
      value: `${occupancyRate}%`,
      detail: `${occupiedTables} de ${totalTables} mesas están en uso`,
      tone: occupancyRate >= 70 ? 'good' : occupancyRate >= 40 ? 'watch' : 'alert',
    },
    {
      title: 'Stock por revisar',
      value: String(lowStockItems.length),
      detail:
        lowStockItems.length > 0
          ? `${lowStockItems[0]?.name ?? 'Hay productos'} necesita reposición`
          : 'Inventario sin alertas críticas',
      tone: lowStockItems.length > 0 ? 'alert' : 'good',
    },
    {
      title: 'Delivery en curso',
      value: String(activeDeliveryOrders),
      detail:
        activeDeliveryOrders > 0
          ? 'Conviene revisar promesas de entrega y tiempos'
          : 'No hay entregas activas en este momento',
      tone: activeDeliveryOrders >= 3 ? 'watch' : 'good',
    },
  ] as const;

  const decisionToneClasses = {
    good: 'border-emerald-300/30 bg-emerald-500/10',
    watch: 'border-amber-300/30 bg-amber-300/10',
    alert: 'border-rose-300/30 bg-rose-500/10',
  } as const;

  const executiveCards = [
    {
      label: 'Ventas del período',
      value: `${currencySymbol} ${currentSummary.sales.toLocaleString('es-GT')}`,
      detail: `Promedio diario ${currencySymbol} ${Math.round(averageDailySales).toLocaleString('es-GT')}`,
      icon: ReceiptText,
    },
    {
      label: 'Margen estimado',
      value: `${marginRate}%`,
      detail: `${currencySymbol} ${currentSummary.profit.toLocaleString('es-GT')} de utilidad`,
      icon: CreditCard,
    },
    {
      label: 'Clientes del período',
      value: String(reportData?.customerCount ?? activeCustomersWithCredit.length),
      detail: `${vipCustomers} clientes VIP en cartera`,
      icon: Users,
    },
    {
      label: 'Mejor producto',
      value: currentSummary.bestSeller,
      detail: `Sucursal líder: ${currentSummary.bestBranch}`,
      icon: PackageSearch,
    },
  ] as const;

  const availableUsers = reportData?.availableUsers ?? [];

  const filterSummaryParts: string[] = [];
  if (selectedBranch) {
    filterSummaryParts.push(selectedBranch.name);
  }
  if (filters.userId) {
    const selectedUser = availableUsers.find((item) => item.id === filters.userId);
    if (selectedUser) {
      filterSummaryParts.push(selectedUser.name);
    }
  }
  if (filters.dateFrom || filters.dateTo) {
    filterSummaryParts.push(currentSummary.period);
  }
  const filterSummary = filterSummaryParts.length ? filterSummaryParts.join(' · ') : 'Sin filtros aplicados';

  return (
    <div className="space-y-6">
      <Panel title="Filtros de reportería" subtitle={filterSummary}>
        <div className="grid gap-4 xl:grid-cols-[180px_180px_1fr_1fr_auto]">
          <label className="block">
            <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Desde</span>
            <input
              type="date"
              value={filters.dateFrom ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value || null }))}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Hasta</span>
            <input
              type="date"
              value={filters.dateTo ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value || null }))}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Sucursal</span>
            <select
              value={filters.branchId ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, branchId: event.target.value ? Number(event.target.value) : null }))}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              <option value="">Todas las sucursales</option>
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Usuario</span>
            <select
              value={filters.userId ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, userId: event.target.value ? Number(event.target.value) : null }))}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              <option value="">Todos los usuarios</option>
              {availableUsers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.role}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setFilters({
                  dateFrom: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
                  dateTo: now.toISOString().slice(0, 10),
                  branchId: null,
                  userId: null,
                });
              }}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]"
            >
              Limpiar
            </button>
          </div>
        </div>

        {loading ? <p className="mt-4 text-sm text-slate-600 dark:text-zinc-400">Actualizando reporte...</p> : null}
        {error ? <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</div> : null}
      </Panel>

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {executiveCards.map((card) => (
          <article key={card.label} className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">{card.label}</p>
                <p className="mt-4 font-display text-3xl text-slate-950 dark:text-white">{card.value}</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">{card.detail}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300/15 to-rose-400/15 text-amber-600 dark:text-amber-300">
                <AppIcon icon={card.icon} className="h-5 w-5" />
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Ganancias" subtitle="Lectura rápida de utilidad del período">
          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-[24px] border border-emerald-300/30 bg-emerald-500/10 p-5">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-400">Ganancia estimada</p>
              <p className="mt-4 font-display text-3xl text-slate-950 dark:text-white">
                {currencySymbol} {currentSummary.profit.toLocaleString('es-GT')}
              </p>
              <p className="mt-2 text-sm text-slate-700 dark:text-zinc-300">Lo que queda como utilidad estimada del período filtrado.</p>
            </article>

            <article className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Costo estimado</p>
              <p className="mt-4 font-display text-3xl text-slate-950 dark:text-white">
                {currencySymbol} {estimatedCost.toLocaleString('es-GT')}
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">Referencia del costo total estimado para generar esas ventas.</p>
            </article>

            <article className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Ganancia por venta</p>
              <p className="mt-4 font-display text-3xl text-slate-950 dark:text-white">
                {currencySymbol} {profitPerOrder.toLocaleString('es-GT')}
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                Promedio estimado por ticket en {orderCount} ventas del período.
              </p>
            </article>
          </div>
        </Panel>

        <Panel title="Margen de ganancia" subtitle="Qué tan rentable está siendo el período">
          <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-black/20">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Margen actual</p>
                <p className="mt-3 font-display text-4xl text-slate-950 dark:text-white">{marginRate}%</p>
              </div>
              <p className="max-w-[240px] text-right text-sm text-slate-600 dark:text-zinc-400">
                Ventas {currencySymbol} {currentSummary.sales.toLocaleString('es-GT')} frente a utilidad {currencySymbol}{' '}
                {currentSummary.profit.toLocaleString('es-GT')}
              </p>
            </div>

            <div className="mt-5 h-4 rounded-full bg-slate-200 dark:bg-white/10">
              <div
                className="h-4 rounded-full bg-gradient-to-r from-emerald-400 via-lime-400 to-amber-300"
                style={{ width: `${Math.min(Math.max(marginRate, 0), 100)}%` }}
              />
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-zinc-400">
              <span>0%</span>
              <span>Rentabilidad estimada</span>
              <span>100%</span>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="Lectura ejecutiva" subtitle={currentSummary.period}>
          <div className="grid gap-4 md:grid-cols-2">
            {decisions.map((item) => (
              <article
                key={item.title}
                className={`rounded-[22px] border p-5 shadow-sm dark:shadow-none ${decisionToneClasses[item.tone]}`}
              >
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-400">{item.title}</p>
                <p className="mt-4 font-display text-3xl text-slate-950 dark:text-white">{item.value}</p>
                <p className="mt-2 text-sm text-slate-700 dark:text-zinc-300">{item.detail}</p>
              </article>
            ))}
          </div>

          <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-black/20">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Ticket promedio</p>
                <p className="mt-3 font-display text-2xl text-slate-950 dark:text-white">
                  {currencySymbol} {currentSummary.averageTicket.toLocaleString('es-GT')}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Mejor día</p>
                <p className="mt-3 font-display text-2xl text-slate-950 dark:text-white">{bestDay.label}</p>
                <p className="text-sm text-slate-600 dark:text-zinc-400">
                  {currencySymbol} {bestDay.total.toLocaleString('es-GT')}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Día más débil</p>
                <p className="mt-3 font-display text-2xl text-slate-950 dark:text-white">{weakestDay.label}</p>
                <p className="text-sm text-slate-600 dark:text-zinc-400">
                  {currencySymbol} {weakestDay.total.toLocaleString('es-GT')}
                </p>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Alertas para decidir" subtitle="Puntos que conviene revisar hoy">
          <div className="space-y-4">
            <article className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-300">
                  <AppIcon icon={AlertTriangle} className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">Inventario en alerta</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                    {lowStockItems.length > 0
                      ? `${lowStockItems.length} insumos están por debajo del mínimo. Prioriza compra o ajuste.`
                      : 'No hay productos bajo mínimo en este momento.'}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-700 dark:text-amber-300">
                  <AppIcon icon={Truck} className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">Carga de delivery</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                    {activeDeliveryOrders > 0
                      ? `${activeDeliveryOrders} pedidos de reparto siguen activos. Conviene revisar tiempos y promesas.`
                      : 'Sin entregas activas. La operación de reparto está despejada.'}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <AppIcon icon={Boxes} className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">Capacidad del salón</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                    Con {occupancyRate}% de ocupación puedes decidir si empujas delivery, promociones o refuerzo en salón.
                  </p>
                </div>
              </div>
            </article>
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="Ventas semanales" subtitle="Comparativo visual para detectar ritmo y caídas">
          <div className="overflow-x-auto">
            <div className="grid min-w-max gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(currentSalesTrend.length, 1)}, minmax(78px, 1fr))` }}>
            {currentSalesTrend.map((point) => (
              <div key={point.label} className="flex flex-col items-center gap-3">
                <div className="flex h-60 w-full items-end rounded-[22px] bg-slate-100 p-2 dark:bg-zinc-950/60">
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
          </div>
        </Panel>

        <Panel title="Mix de cobro" subtitle="Cómo se está moviendo el dinero en caja">
          <div className="space-y-4">
            {currentPaymentMix.map((item) => (
              <article key={item.method} className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-950 dark:text-white">
                      {item.method === 'CASH'
                        ? 'Efectivo'
                        : item.method === 'CARD'
                          ? 'Tarjeta'
                          : item.method === 'TRANSFER'
                            ? 'Transferencia'
                            : 'Pago mixto'}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                      {currencySymbol} {Math.round(item.total).toLocaleString('es-GT')}
                    </p>
                  </div>
                  <span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-200">
                    {item.share}%
                  </span>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel title="Productos que más aportan" subtitle="Rotación, ingreso y peso sobre ventas top">
          <div className="space-y-4">
            {currentTopProducts.map((product) => {
              const share = topRevenueTotal ? Math.round((product.revenue / topRevenueTotal) * 100) : 0;
              return (
                <article key={product.id} className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-950 dark:text-white">{product.name}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                        {product.sold} vendidos · Margen {product.margin}
                      </p>
                    </div>
                    <span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-200">
                      {share}%
                    </span>
                  </div>
                  <div className="mt-4">
                    <div className="h-3 rounded-full bg-slate-100 dark:bg-black/30">
                      <div className="h-3 rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500" style={{ width: `${share}%` }} />
                    </div>
                    <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                      Ingreso: {currencySymbol} {product.revenue.toLocaleString('es-GT')}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </Panel>

        <Panel title="Bloques de decisión" subtitle="Atajos para reuniones operativas o cierre diario">
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { label: 'Ventas por sucursal', icon: Store },
              { label: 'Ventas por usuario', icon: Users },
              { label: 'Rentabilidad por producto', icon: ReceiptText },
              { label: 'Clientes del período', icon: Users },
              { label: 'Reposición por stock bajo', icon: Boxes },
              { label: 'Seguimiento de delivery', icon: Truck },
              { label: 'Cobros pendientes por mesa', icon: CreditCard },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-700 dark:text-amber-300">
                    <AppIcon icon={item.icon} className="h-4 w-4" />
                  </div>
                  <span>{item.label}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}
