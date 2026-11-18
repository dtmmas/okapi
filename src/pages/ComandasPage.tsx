import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Panel } from '@/components/Panel';
import { StatusBadge } from '@/components/StatusBadge';
import { updateStationItemStatus } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';
import type { KitchenOrder } from '@/types/restaurant';

type Column = KitchenOrder['status'];
type KitchenItem = KitchenOrder['items'][number];

function stationLabel(station: KitchenOrder['station']) {
  if (station === 'BAR') {
    return 'Bar';
  }

  if (station === 'PASTRY') {
    return 'Pastelería';
  }

  return 'Cocina';
}

function formatChronometer(now: number, startedAt: string) {
  const startTime = new Date(startedAt).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((now - startTime) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function sortByStartedAt(left: KitchenOrder, right: KitchenOrder) {
  const a = new Date(left.startedAt).getTime();
  const b = new Date(right.startedAt).getTime();
  return b - a;
}

function getActionConfig(status: Column) {
  if (status === 'PENDING') {
    return {
      label: 'Iniciar',
      status: 'IN_PREPARATION' as const,
      style: 'border-amber-300/30 bg-amber-300/10 text-amber-900 hover:bg-amber-300/15 dark:text-white',
    };
  }

  if (status === 'IN_PREPARATION') {
    return {
      label: 'Listo',
      status: 'READY' as const,
      style: 'border-emerald-300/30 bg-emerald-500/10 text-emerald-900 hover:bg-emerald-500/15 dark:text-white',
    };
  }

  if (status === 'READY') {
    return {
      label: 'Entregar',
      status: 'DELIVERED' as const,
      style: 'border-sky-300/30 bg-sky-500/10 text-sky-900 hover:bg-sky-500/15 dark:text-white',
    };
  }

  return null;
}

export default function ComandasPage() {
  const user = useSessionStore((state) => state.user);
  const snapshot = useSessionStore((state) => state.snapshot);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [now, setNow] = useState(() => Date.now());
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isKds = location.pathname === '/kds';

  const stationFilter = useMemo(() => {
    const raw = (searchParams.get('station') ?? '').toUpperCase();
    return raw === 'KITCHEN' || raw === 'BAR' || raw === 'PASTRY' ? (raw as KitchenOrder['station']) : null;
  }, [searchParams]);

  const allOrders = useMemo(() => {
    const kitchenOrders = snapshot?.kitchenOrders ?? [];
    const barOrders = snapshot?.barOrders ?? [];
    const pastryOrders = snapshot?.pastryOrders ?? [];
    return [...kitchenOrders, ...barOrders, ...pastryOrders].slice().sort(sortByStartedAt);
  }, [snapshot]);

  const filteredOrders = useMemo(() => {
    const visibleOrders = allOrders.filter((order) => order.status !== 'DELIVERED');

    if (!stationFilter) {
      return visibleOrders;
    }

    return visibleOrders.filter((order) => order.station === stationFilter);
  }, [allOrders, stationFilter]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const stationRole =
      user.role === 'KITCHEN' ? 'KITCHEN' : user.role === 'BAR' ? 'BAR' : user.role === 'PASTRY' ? 'PASTRY' : null;

    if (!stationRole) {
      return;
    }

    if (stationFilter !== stationRole) {
      setSearchParams({ station: stationRole }, { replace: true });
    }
  }, [user, stationFilter, setSearchParams]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    const pollId = window.setInterval(() => {
      void refreshSnapshot();
    }, 10000);

    return () => {
      window.clearInterval(pollId);
    };
  }, [refreshSnapshot]);

  async function handleItemTransition(order: KitchenOrder, item: KitchenItem, nextStatus: Column) {
    setSubmittingKey(`item:${order.station}:${item.id}:${nextStatus}`);
    setErrorMessage(null);
    try {
      await updateStationItemStatus({
        station: order.station,
        orderItemId: item.id,
        status: nextStatus,
      });
      await refreshSnapshot();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No fue posible actualizar el estado del platillo.');
    } finally {
      setSubmittingKey(null);
    }
  }

  const cards = filteredOrders.length ? (
    filteredOrders.map((order) => {
      const chronometer = order.status === 'PENDING' ? '00:00' : formatChronometer(now, order.startedAt);

      return (
        <article
          key={`${order.id}-${order.station}`}
          className="w-full max-w-[390px] justify-self-center rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950/50 dark:shadow-none"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{order.code}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-500">
                {stationLabel(order.station)}
                {order.tableCode ? ` • ${order.tableCode}` : ''}
              </p>
              <p className="mt-1 truncate text-xs text-slate-700 dark:text-zinc-200">{order.customerName}</p>
              <p className="truncate text-xs text-slate-500 dark:text-zinc-400">{order.area}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <StatusBadge value={order.priority} />
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-slate-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-200">
                {chronometer}
              </span>
            </div>
          </div>

          <div className="mt-3 space-y-1.5 text-sm text-slate-700 dark:text-zinc-200">
            {order.items.map((item) => {
              const action = getActionConfig(item.status);
              const isSubmittingItem = submittingKey === `item:${order.station}:${item.id}:${action?.status ?? 'none'}`;

              return (
                <div key={item.id} className="rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-5 text-slate-900 dark:text-white">
                        {item.quantity} x {item.product}
                      </p>
                      {item.notes ? <p className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-zinc-400">Obs: {item.notes}</p> : null}
                    </div>
                    <StatusBadge value={item.status} className="shrink-0" />
                  </div>

                  {action ? (
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        disabled={Boolean(submittingKey)}
                        onClick={() => void handleItemTransition(order, item, action.status)}
                        className={`h-8 rounded-2xl border px-3 text-[11px] font-semibold transition disabled:opacity-40 ${action.style}`}
                      >
                        {isSubmittingItem ? 'Actualizando...' : action.label}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </article>
      );
    })
  ) : (
    <p className="text-sm text-slate-500 dark:text-zinc-500">No hay comandas por el filtro seleccionado.</p>
  );

  if (isKds) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-900 dark:bg-[#07070a] dark:text-white sm:px-6 sm:py-6">
        {errorMessage ? (
          <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
            {errorMessage}
          </div>
        ) : null}
        <div className="grid gap-4 sm:gap-x-6 sm:gap-y-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{cards}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {errorMessage ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">{errorMessage}</div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'ALL', label: 'Todas' },
            { key: 'KITCHEN', label: 'Cocina' },
            { key: 'BAR', label: 'Bar' },
            { key: 'PASTRY', label: 'Pastelería' },
          ].map((option) => {
            const active = option.key === 'ALL' ? !stationFilter : stationFilter === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  if (option.key === 'ALL') {
                    setSearchParams({}, { replace: true });
                    return;
                  }
                  setSearchParams({ station: option.key }, { replace: true });
                }}
                className={`h-11 rounded-2xl border px-4 text-sm font-semibold transition ${
                  active
                    ? 'border-amber-300/40 bg-amber-300/10 text-amber-900 dark:text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-slate-600 dark:text-zinc-400">{filteredOrders.length} ticket(s)</p>
      </div>

      <Panel title="Comandas" subtitle="Cada pedido con su estado y botones de acción">
        <div className="grid gap-4 sm:gap-x-6 sm:gap-y-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{cards}</div>
      </Panel>
    </div>
  );
}
