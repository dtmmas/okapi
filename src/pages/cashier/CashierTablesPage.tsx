import { RotateCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '@/components/AppIcon';
import { StatusBadge } from '@/components/StatusBadge';
import { getAreaIcon } from '@/lib/area-icons';
import { getSortedAreas, normalizeAreaName } from '@/lib/tables';
import { useSessionStore } from '@/store/useSessionStore';

export default function CashierTablesPage() {
  const navigate = useNavigate();
  const snapshot = useSessionStore((state) => state.snapshot);
  const user = useSessionStore((state) => state.user);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const logout = useSessionStore((state) => state.logout);

  const tables = snapshot?.tables ?? [];
  const activeOrders = snapshot?.activeOrders ?? [];
  const cashShiftOpen = Boolean(snapshot?.cashShift?.isOpen);
  const currencySymbol = snapshot?.brand.currencySymbol ?? 'Q';
  const [activeArea, setActiveArea] = useState<string>('');

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshSnapshot();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshSnapshot]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    if (!cashShiftOpen) {
      navigate('/caja', { replace: true });
    }
  }, [cashShiftOpen, navigate, snapshot]);

  const orderByTableCode = useMemo(() => {
    return new Map(activeOrders.map((order) => [order.tableCode ?? '', order]));
  }, [activeOrders]);
  const hasAccountsToCharge = activeOrders.some((order) => Boolean(order.tableCode));
  const occupiedTables = useMemo(
    () =>
      tables
        .filter((table) => Boolean(table.code ? orderByTableCode.get(table.code) : null))
        .sort((left, right) => {
          const leftOrder = left.code ? orderByTableCode.get(left.code) ?? null : null;
          const rightOrder = right.code ? orderByTableCode.get(right.code) ?? null : null;
          const leftPriority = leftOrder?.readyForPayment ? 1 : 0;
          const rightPriority = rightOrder?.readyForPayment ? 1 : 0;
          return rightPriority - leftPriority;
        }),
    [orderByTableCode, tables],
  );
  const areaTabs = useMemo(() => getSortedAreas(occupiedTables.map((table) => table.area)), [occupiedTables]);

  useEffect(() => {
    if (!areaTabs.length) {
      setActiveArea('');
      return;
    }
    if (activeArea && areaTabs.includes(activeArea)) {
      return;
    }
    setActiveArea(areaTabs[0]);
  }, [activeArea, areaTabs]);

  const visibleTables = useMemo(() => {
    if (!activeArea) {
      return occupiedTables;
    }
    return occupiedTables.filter((table) => normalizeAreaName(table.area) === activeArea);
  }, [activeArea, occupiedTables]);

  const chargeCountByArea = useMemo(() => {
    const counts = new Map<string, number>();
    for (const table of occupiedTables) {
      const area = normalizeAreaName(table.area);
      counts.set(area, (counts.get(area) ?? 0) + 1);
    }
    return counts;
  }, [occupiedTables]);
  const readyToChargeCount = useMemo(() => activeOrders.filter((order) => order.readyForPayment).length, [activeOrders]);

  if (!user || !snapshot) {
    return null;
  }

  if (!cashShiftOpen) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-900 dark:bg-[#07070a] dark:text-white sm:px-6 sm:py-6">
      <header className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Caja</p>
            <h1 className="mt-3 font-display text-3xl text-slate-950 dark:text-white sm:text-4xl lg:text-5xl 2xl:text-6xl">Mesas</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400 sm:text-base lg:text-lg">Selecciona una mesa ocupada para cobrar.</p>
            <p className="mt-2 text-xs uppercase tracking-[0.25em] text-amber-300">Cajero logeado: {user.name}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.25em] text-violet-600 dark:text-violet-300">
              {readyToChargeCount} cuenta(s) solicitada(s) para cobro
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshSnapshot()}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-violet-300/30 bg-violet-500/10 px-4 text-sm font-semibold text-violet-900 transition hover:bg-violet-500/15 dark:text-white sm:h-12 sm:text-base lg:h-14 lg:px-5 lg:text-lg"
            >
              <AppIcon icon={RotateCw} className="h-4 w-4" />
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => navigate('/caja')}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-12 sm:text-base lg:h-14 lg:px-5 lg:text-lg"
            >
              Caja
            </button>
            <button
              type="button"
              onClick={logout}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-12 sm:text-base lg:h-14 lg:px-5 lg:text-lg"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-7xl">
        {!hasAccountsToCharge ? (
          <div className="mb-4 rounded-[28px] border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:shadow-none">
            No hay cuentas por cobrar. Cuando un mesero envíe un pedido a una mesa, aquí aparecerá como ocupada.
          </div>
        ) : null}
        {areaTabs.length ? (
          <div className="mb-5 flex flex-wrap gap-2">
            {areaTabs.map((area) => {
              const count = occupiedTables.filter((table) => normalizeAreaName(table.area) === area).length;
              const chargeCount = chargeCountByArea.get(area) ?? 0;
              const isActive = area === activeArea;
              const AreaIcon = getAreaIcon(area);
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => setActiveArea(area)}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'border-amber-300/35 bg-amber-300/10 text-amber-900 dark:text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="relative inline-flex">
                    <AppIcon icon={AreaIcon} className="h-4 w-4" />
                    {chargeCount > 0 ? (
                      <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-4 text-white">
                        {chargeCount}
                      </span>
                    ) : null}
                  </span>
                  <span>{area}</span>
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleTables.map((table) => {
            const order = table.code ? orderByTableCode.get(table.code) ?? null : null;
            const isReadyToCharge = Boolean(order?.readyForPayment);

            return (
              <button
                key={table.id}
                type="button"
                onClick={() => navigate(`/cashier/cobrar/${table.id}`)}
                className={`w-full rounded-[28px] border bg-white p-5 text-left shadow-sm transition hover:bg-slate-50 dark:bg-zinc-950/45 dark:shadow-none dark:hover:bg-zinc-950/60 ${
                  isReadyToCharge
                    ? 'border-violet-300/40 ring-2 ring-violet-300/15 dark:border-violet-400/30 dark:ring-violet-400/10'
                    : 'border-slate-200 dark:border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Mesa</p>
                    <p className="mt-2 font-display text-3xl text-slate-950 dark:text-white">{table.code}</p>
                    <p className="mt-2 truncate text-sm text-slate-600 dark:text-zinc-400">{table.area}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {isReadyToCharge ? <StatusBadge value="BILL_REQUESTED" /> : null}
                    <StatusBadge value={table.status} />
                  </div>
                </div>

                {order ? (
                  <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-white/8 dark:bg-black/20 dark:text-zinc-200 sm:text-base">
                    <p className="flex items-center justify-between gap-3">
                      <span className="text-slate-500 dark:text-zinc-400">Cuenta</span>
                      <span className="font-semibold text-slate-950 dark:text-white">{order.code}</span>
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-slate-500 dark:text-zinc-400">Estado de servicio</span>
                      <StatusBadge value={order.status} />
                    </div>
                    {order.readyForPayment ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-slate-500 dark:text-zinc-400">Cobro</span>
                        <StatusBadge value="BILL_REQUESTED" />
                      </div>
                    ) : null}
                    <p className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-slate-500 dark:text-zinc-400">Cliente</span>
                      <span className="truncate font-semibold text-slate-950 dark:text-white">{order.customerName}</span>
                    </p>
                    <p className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-slate-500 dark:text-zinc-400">Pendiente</span>
                      <span className="font-semibold text-slate-950 dark:text-white">
                        {currencySymbol} {(order.pendingAmount ?? order.total ?? 0).toFixed(2)}
                      </span>
                    </p>
                    {order.paidAmount > 0 ? (
                      <p className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-slate-500 dark:text-zinc-400">Abonado</span>
                        <span className="font-semibold text-slate-950 dark:text-white">
                          {currencySymbol} {order.paidAmount.toFixed(2)}
                        </span>
                      </p>
                    ) : null}
                    {!order.readyForPayment ? (
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-300">
                        {order.status === 'SERVED'
                          ? 'Pedido entregado. Falta que el mesero solicite cuenta.'
                          : 'Caja solo puede cobrar cuando el pedido se entregue y el mesero solicite cuenta.'}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
