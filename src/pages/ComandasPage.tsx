import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Panel } from '@/components/Panel';
import { StatusBadge } from '@/components/StatusBadge';
import { updateStationStatus } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';
import type { KitchenOrder } from '@/types/restaurant';

type Column = 'PENDING' | 'IN_PREPARATION' | 'READY' | 'DELIVERED';

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

export default function ComandasPage() {
  const user = useSessionStore((state) => state.user);
  const snapshot = useSessionStore((state) => state.snapshot);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
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

  async function handleTransition(order: KitchenOrder, nextStatus: Column) {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await updateStationStatus({
        station: order.station,
        orderId: order.orderId,
        status: nextStatus,
      });
      await refreshSnapshot();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No fue posible actualizar el estado.');
    } finally {
      setSubmitting(false);
    }
  }

  function nextAction(order: KitchenOrder) {
    if (order.status === 'PENDING') {
      return { label: 'Iniciar', status: 'IN_PREPARATION' as const, style: 'border-amber-300/30 bg-amber-300/10 hover:bg-amber-300/15' };
    }

    if (order.status === 'IN_PREPARATION') {
      return { label: 'Listo', status: 'READY' as const, style: 'border-emerald-300/30 bg-emerald-500/10 hover:bg-emerald-500/15' };
    }

    if (order.status === 'READY') {
      return { label: 'Entregar', status: 'DELIVERED' as const, style: 'border-sky-300/30 bg-sky-500/10 hover:bg-sky-500/15' };
    }

    return null;
  }

  const cards = filteredOrders.length ? (
    filteredOrders.map((order, index) => {
      const action = nextAction(order);
      const chronometer = order.status === 'PENDING' ? '00:00' : formatChronometer(now, order.startedAt);

      return (
        <article
          key={`${order.id}-${order.station}-${index}`}
          className="w-full max-w-[420px] justify-self-center rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/50 dark:shadow-none"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-950 dark:text-white">{order.code}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                {stationLabel(order.station)}
                {order.tableCode ? ` • ${order.tableCode}` : ''}
              </p>
              <p className="mt-1 truncate text-sm text-slate-700 dark:text-zinc-200">Cliente: {order.customerName}</p>
              <p className="mt-1 truncate text-sm text-slate-600 dark:text-zinc-400">{order.area}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <StatusBadge value={order.priority} />
              <StatusBadge value={order.status} />
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-slate-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-200">
                {chronometer}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-700 dark:text-zinc-200">
            {order.items.map((item, itemIndex) => (
              <div key={`${order.id}-${order.station}-${itemIndex}`} className="whitespace-pre-wrap rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/[0.03]">
                {item}
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting || order.status !== 'PENDING'}
              onClick={() => void handleTransition(order, 'IN_PREPARATION')}
              className="h-10 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-40 dark:text-white"
            >
              Iniciar
            </button>
            <button
              type="button"
              disabled={submitting || order.status !== 'IN_PREPARATION'}
              onClick={() => void handleTransition(order, 'READY')}
              className="h-10 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-500/15 disabled:opacity-40 dark:text-white"
            >
              Listo
            </button>
            <button
              type="button"
              disabled={submitting || order.status !== 'READY'}
              onClick={() => void handleTransition(order, 'DELIVERED')}
              className="h-10 rounded-2xl border border-sky-300/30 bg-sky-500/10 px-4 text-sm font-semibold text-sky-900 transition hover:bg-sky-500/15 disabled:opacity-40 dark:text-white"
            >
              Entregar
            </button>
            {action && !isKds ? (
              <span className="inline-flex items-center text-sm text-slate-500 dark:text-zinc-400">
                Acción: <span className="ml-2 text-slate-700 dark:text-zinc-200">{action.label}</span>
              </span>
            ) : null}
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
