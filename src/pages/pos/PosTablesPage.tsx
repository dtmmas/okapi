import { LogOut, UtensilsCrossed } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '@/components/AppIcon';
import { StatusBadge } from '@/components/StatusBadge';
import { getAreaIcon } from '@/lib/area-icons';
import { getSortedAreas, normalizeAreaName } from '@/lib/tables';
import { useSessionStore } from '@/store/useSessionStore';
import { usePosWizardStore } from '@/store/usePosWizardStore';

export default function PosTablesPage() {
  const navigate = useNavigate();
  const logout = useSessionStore((state) => state.logout);
  const tables = useSessionStore((state) => state.snapshot?.tables ?? []);
  const activeOrders = useSessionStore((state) => state.snapshot?.activeOrders ?? []);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const setTable = usePosWizardStore((state) => state.setTable);
  const setCustomer = usePosWizardStore((state) => state.setCustomer);
  const clearCart = usePosWizardStore((state) => state.clearCart);
  const [activeArea, setActiveArea] = useState<string>('');

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const areaTabs = useMemo(() => getSortedAreas(tables.map((table) => table.area)), [tables]);

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
      return tables;
    }
    return tables.filter((table) => normalizeAreaName(table.area) === activeArea);
  }, [activeArea, tables]);

  const accountCountByArea = useMemo(() => {
    const counts = new Map<string, number>();
    for (const table of tables) {
      const hasActiveOrder = activeOrders.some((order) => order.tableCode === table.code);
      if (!hasActiveOrder) {
        continue;
      }
      const area = normalizeAreaName(table.area);
      counts.set(area, (counts.get(area) ?? 0) + 1);
    }
    return counts;
  }, [activeOrders, tables]);

  function handleSelect(tableId: number) {
    const table = tables.find((item) => item.id === tableId);
    const order = table ? activeOrders.find((item) => item.tableCode === table.code) : null;

    clearCart();
    setTable(tableId);
    setCustomer({ name: order?.customerName ?? '', phone: '' });

    if (order) {
      navigate('/pos/menu');
      return;
    }

    navigate('/pos/cliente');
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-900 dark:bg-[#07070a] dark:text-white sm:px-6 sm:py-6 lg:px-10 lg:py-8">
      <header className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">POS</p>
            <h1 className="mt-3 font-display text-3xl text-slate-950 dark:text-white sm:text-4xl lg:text-5xl 2xl:text-6xl">Selecciona una mesa</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400 sm:text-base lg:text-lg">Toca una mesa para abrir o continuar una cuenta.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-12 sm:text-base lg:h-14 lg:px-5 lg:text-lg"
            >
              Panel
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 text-sm font-semibold text-rose-900 transition hover:bg-rose-500/15 dark:text-white sm:h-12 sm:text-base lg:h-14 lg:px-5 lg:text-lg"
            >
              <AppIcon icon={LogOut} className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-6 max-w-7xl sm:mt-8 lg:mt-10">
        {areaTabs.length ? (
          <div className="mb-5 flex flex-wrap gap-2">
            {areaTabs.map((area) => {
              const count = tables.filter((table) => normalizeAreaName(table.area) === area).length;
              const occupiedCount = accountCountByArea.get(area) ?? 0;
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
                    {occupiedCount > 0 ? (
                      <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-4 text-white">
                        {occupiedCount}
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

        {visibleTables.length ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {visibleTables.map((table) => {
            const order = activeOrders.find((item) => item.tableCode === table.code);

            return (
              <button
                key={table.id}
                type="button"
                onClick={() => handleSelect(table.id)}
                className="group flex min-h-[150px] flex-col justify-between rounded-[28px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300/25 hover:bg-amber-50 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none dark:hover:bg-white/[0.05] sm:min-h-[170px] sm:p-5 lg:min-h-[200px] lg:p-6 2xl:min-h-[230px]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 sm:h-12 sm:w-12 lg:h-14 lg:w-14 dark:border-white/10 dark:bg-black/30">
                      <AppIcon icon={UtensilsCrossed} className="h-4 w-4 text-amber-300/90 sm:h-5 sm:w-5 lg:h-6 lg:w-6" />
                    </div>
                    <div>
                      <p className="font-display text-2xl text-slate-950 dark:text-white sm:text-3xl lg:text-4xl">{table.code}</p>
                      <p className="text-xs text-slate-500 dark:text-zinc-500 sm:text-sm lg:text-base">{table.area}</p>
                    </div>
                  </div>
                  <StatusBadge value={table.status} />
                </div>

                <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 dark:border-white/8 dark:bg-black/20 dark:text-zinc-200 sm:mt-6 sm:text-sm lg:text-base">
                  <p className="flex items-center justify-between gap-4">
                    <span className="text-slate-500 dark:text-zinc-400">Cuenta</span>
                    <span className="font-semibold text-slate-950 dark:text-white">{order?.code ?? 'Sin cuenta'}</span>
                  </p>
                </div>
              </button>
            );
          })}
          </div>
        ) : (
          <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:shadow-none">
            No hay mesas registradas en esta área todavía.
          </div>
        )}
      </main>
    </div>
  );
}
