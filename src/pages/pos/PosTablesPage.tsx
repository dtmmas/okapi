import { LogOut } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '@/components/AppIcon';
import { ActiveUserLabel } from '@/components/ActiveUserLabel';
import { AdminPanelBackButton } from '@/components/AdminPanelBackButton';
import { StatusBadge } from '@/components/StatusBadge';
import { TableCapacity } from '@/components/TableCapacity';
import { TableCardMark } from '@/components/TableCardMark';
import { TableStatusControl } from '@/components/TableReservationDetails';
import { useTableRefresh } from '@/hooks/useTableRefresh';
import { getAreaIcon } from '@/lib/area-icons';
import { getSortedAreas, normalizeAreaName, sortTablesInArea } from '@/lib/tables';
import { useSessionStore } from '@/store/useSessionStore';
import { usePosWizardStore } from '@/store/usePosWizardStore';

export default function PosTablesPage() {
  const navigate = useNavigate();
  const logout = useSessionStore((state) => state.logout);
  const tables = useSessionStore((state) => state.snapshot?.tables ?? []);
  const tableAreas = useSessionStore((state) => state.snapshot?.tableAreas ?? []);
  const activeOrders = useSessionStore((state) => state.snapshot?.activeOrders ?? []);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const setTable = usePosWizardStore((state) => state.setTable);
  const setCustomer = usePosWizardStore((state) => state.setCustomer);
  const clearCart = usePosWizardStore((state) => state.clearCart);
  const [activeArea, setActiveArea] = useState<string>('');
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useTableRefresh(refreshSnapshot);

  const areaTabs = useMemo(() => getSortedAreas(tables.map((table) => table.area), tableAreas), [tableAreas, tables]);

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
    const filtered = !activeArea
      ? tables
      : tables.filter((table) => normalizeAreaName(table.area) === activeArea);
    return sortTablesInArea(filtered);
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
    if (!table) {
      return;
    }

    if (table.status === 'RESERVED') {
      setSelectionError(`La mesa ${table.code} está reservada. Elige otra mesa o consulta con Administración.`);
      return;
    }

    const order = table ? activeOrders.find((item) => item.tableCode === table.code) : null;
    setSelectionError(null);

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
            <AdminPanelBackButton />
            <ActiveUserLabel height="h-11 sm:h-12 lg:h-14" />
            <button
              type="button"
              onClick={logout}
              className="session-exit inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition sm:h-12 sm:text-base lg:h-14 lg:px-5 lg:text-lg"
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

        {selectionError ? (
          <div className="mb-5 rounded-[24px] border border-rose-300/30 bg-rose-500/10 px-5 py-4 text-sm font-medium text-rose-800 dark:text-rose-200">
            {selectionError}
          </div>
        ) : null}

        {visibleTables.length ? (
          <div className="isolate grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {visibleTables.map((table) => {
            const order = activeOrders.find((item) => item.tableCode === table.code);
            const isReadyToCharge = Boolean(order?.readyForPayment);

            return (
              <div
                key={table.id}
                data-table-status={table.status}
                className={`group relative rounded-[20px] border p-2.5 text-left shadow-sm transition-[background-color,border-color,box-shadow] dark:shadow-none sm:p-3 ${isReadyToCharge ? 'ring-2 ring-violet-400' : ''}`}
              >
                <button
                  type="button"
                  aria-label={`Seleccionar mesa ${table.code}`}
                  onClick={() => handleSelect(table.id)}
                  className="absolute inset-0 z-0 rounded-[inherit]"
                />
                <div className="relative z-10 space-y-2 pointer-events-none">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {isReadyToCharge ? (
                      <StatusBadge value="BILL_REQUESTED" className="px-2 py-0.5 text-[9px] tracking-[0.14em]" />
                    ) : null}
                    <TableStatusControl table={table} badgeClassName="px-2 py-0.5 text-[9px] tracking-[0.14em]" />
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <TableCardMark status={table.status} size="xs" className="shadow-none" />
                    <div className="min-w-0">
                      <p className="table-code truncate text-lg text-slate-950 dark:text-white sm:text-xl">{table.code}</p>
                      <div className="mt-1">
                        <TableCapacity capacity={table.capacity} compact />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-[10px] font-semibold text-slate-950 dark:border-white/8 dark:bg-black/20 dark:text-white sm:text-[11px]">
                    {order?.code ?? 'Sin orden'}
                  </div>
                </div>
              </div>
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
