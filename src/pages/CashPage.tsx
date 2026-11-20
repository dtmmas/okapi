import { ArrowDownCircle, ArrowUpCircle, CreditCard, Receipt, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '@/components/AppIcon';
import { printReceipt } from '@/lib/printing/print-service';
import { Panel } from '@/components/Panel';
import { StatusBadge } from '@/components/StatusBadge';
import { closeAdminCashShift, closeCashShift, createCashMovement, listAdminCashShifts, openCashShift } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';
import type { ReceiptDocument } from '@/types/printing';
import type { CashMovement, CashShiftControlItem } from '@/types/restaurant';

type CashPageProps = {
  view?: 'overview' | 'movements';
};

type GroupedSaleMovement = {
  orderCode: string;
  customerName?: string;
  tableCode?: string;
  totalAmount: number;
  latestCreatedAt: string;
  payments: CashMovement[];
  orderTotal?: number;
  orderPaidAmount?: number;
  orderPendingAmount?: number;
  orderItems?: CashMovement['orderItems'];
  orderPayments?: CashMovement['orderPayments'];
};

function formatMoney(amount: number, currencySymbol: string) {
  return `${currencySymbol} ${amount.toFixed(2)}`;
}

function formatPaymentMethodLabel(method: CashMovement['method']) {
  return method === 'CASH' ? 'EFECTIVO' : method === 'CARD' ? 'TARJETA' : method === 'TRANSFER' ? 'TRANSFERENCIA' : 'MIXTO';
}

function formatAuditDetail(movement: Pick<CashMovement, 'method' | 'paymentReference' | 'reference'>) {
  if (movement.method === 'CARD') {
    return movement.paymentReference ? `Referencia tarjeta: ${movement.paymentReference}` : 'Pago con tarjeta';
  }

  if (movement.method === 'TRANSFER') {
    return movement.paymentReference ? `Referencia transferencia/deposito: ${movement.paymentReference}` : 'Transferencia o deposito';
  }

  if (movement.method === 'MIXED') {
    return movement.paymentReference ? `Referencia mixta: ${movement.paymentReference}` : 'Pago mixto';
  }

  return movement.reference;
}

export default function CashPage({ view = 'overview' }: CashPageProps) {
  const navigate = useNavigate();
  const snapshot = useSessionStore((state) => state.snapshot);
  const user = useSessionStore((state) => state.user);
  const movements = snapshot?.cashMovements ?? [];
  const cashShift = snapshot?.cashShift ?? null;
  const branches = snapshot?.branches ?? [];
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const [openingAmount, setOpeningAmount] = useState('500');
  const [closingAmount, setClosingAmount] = useState('');
  const [movementType, setMovementType] = useState<'ENTRY' | 'EXPENSE' | 'WITHDRAWAL'>('ENTRY');
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReference, setMovementReference] = useState('');
  const [movementNotes, setMovementNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminCashShifts, setAdminCashShifts] = useState<CashShiftControlItem[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminClosingAmounts, setAdminClosingAmounts] = useState<Record<number, string>>({});
  const [adminSubmittingShiftId, setAdminSubmittingShiftId] = useState<number | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [adminBranchFilter, setAdminBranchFilter] = useState('');
  const [adminOpenOnly, setAdminOpenOnly] = useState(false);
  const [adminDateFrom, setAdminDateFrom] = useState('');
  const [adminDateTo, setAdminDateTo] = useState('');
  const [expandedPaymentsByOrder, setExpandedPaymentsByOrder] = useState<Record<string, boolean>>({});
  const [detailDialogOrderCode, setDetailDialogOrderCode] = useState<string | null>(null);
  const [printDialogOrderCode, setPrintDialogOrderCode] = useState<string | null>(null);
  const currencySymbol = snapshot?.brand.currencySymbol ?? 'Q';
  const canManageCashiers = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';
  const isOverviewView = view === 'overview';
  const isMovementsView = view === 'movements';

  async function loadAdminCashShifts() {
    if (!canManageCashiers) {
      setAdminCashShifts([]);
      return;
    }

    setAdminLoading(true);
    try {
      const shifts = await listAdminCashShifts({
        branchId: adminBranchFilter ? Number(adminBranchFilter) : null,
        openOnly: adminOpenOnly,
        dateFrom: adminDateFrom || null,
        dateTo: adminDateTo || null,
      });
      setAdminCashShifts(shifts);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'No fue posible cargar el control administrativo de cajas.');
    } finally {
      setAdminLoading(false);
    }
  }

  useEffect(() => {
    if (!canManageCashiers) {
      return;
    }

    void loadAdminCashShifts();
  }, [adminBranchFilter, adminDateFrom, adminDateTo, adminOpenOnly, canManageCashiers]);

  const cashShiftLabel = useMemo(() => {
    if (!cashShift?.isOpen) {
      return 'Caja cerrada';
    }
    const openedAt = new Date(cashShift.openedAt);
    const openedAtLabel = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(openedAt);
    return `Abierta desde ${openedAtLabel}`;
  }, [cashShift]);

  const totals = useMemo(() => {
    const opening = cashShift?.openingAmount ?? 0;
    const cashSales = movements
      .filter((movement) => movement.type === 'SALE' && movement.method === 'CASH')
      .reduce((sum, movement) => sum + movement.amount, 0);
    const entries = movements.filter((movement) => movement.type === 'ENTRY').reduce((sum, movement) => sum + movement.amount, 0);
    const outflows = movements
      .filter((movement) => movement.type === 'EXPENSE' || movement.type === 'WITHDRAWAL')
      .reduce((sum, movement) => sum + movement.amount, 0);

    return {
      opening,
      cashSales,
      entries,
      outflows,
      estimatedCash: opening + cashSales + entries - outflows,
    };
  }, [cashShift?.openingAmount, movements]);

  const adminCashOverview = useMemo(() => {
    const today = new Date();
    const isSameDay = (value: string | null) => {
      if (!value) {
        return false;
      }
      const date = new Date(value);
      return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
      );
    };

    const openShifts = adminCashShifts.filter((shift) => shift.isOpen);
    const openedToday = adminCashShifts.filter((shift) => isSameDay(shift.openedAt));
    const closedToday = adminCashShifts.filter((shift) => isSameDay(shift.closedAt));
    const pendingCashiers = Array.from(new Set(openShifts.map((shift) => shift.openedBy)));

    return {
      openCount: openShifts.length,
      openedTotal: openedToday.reduce((sum, shift) => sum + shift.openingAmount, 0),
      closedTotal: closedToday.reduce((sum, shift) => sum + (shift.closingAmount ?? 0), 0),
      pendingCashiers,
    };
  }, [adminCashShifts]);

  const groupedMovements = useMemo(() => {
    const salesByOrder = new Map<string, GroupedSaleMovement>();
    const standaloneMovements: CashMovement[] = [];

    for (const movement of movements) {
      if (movement.type === 'SALE' && movement.orderCode) {
        const current = salesByOrder.get(movement.orderCode);
        if (current) {
          current.totalAmount += movement.amount;
          current.latestCreatedAt = current.latestCreatedAt.localeCompare(movement.createdAt) > 0 ? current.latestCreatedAt : movement.createdAt;
          current.payments.push(movement);
          continue;
        }

        salesByOrder.set(movement.orderCode, {
          orderCode: movement.orderCode,
          customerName: movement.customerName,
          tableCode: movement.tableCode,
          totalAmount: movement.amount,
          latestCreatedAt: movement.createdAt,
          payments: [movement],
          orderTotal: movement.orderTotal,
          orderPaidAmount: movement.orderPaidAmount,
          orderPendingAmount: movement.orderPendingAmount,
          orderItems: movement.orderItems,
          orderPayments: movement.orderPayments,
        });
        continue;
      }

      standaloneMovements.push(movement);
    }

    return {
      salesGroups: [...salesByOrder.values()]
        .map((group) => ({
          ...group,
          payments: [...group.payments].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        }))
        .sort((left, right) => right.latestCreatedAt.localeCompare(left.latestCreatedAt)),
      standaloneMovements,
    };
  }, [movements]);

  const selectedPrintGroup = useMemo(
    () => groupedMovements.salesGroups.find((group) => group.orderCode === printDialogOrderCode) ?? null,
    [groupedMovements.salesGroups, printDialogOrderCode],
  );
  const selectedDetailGroup = useMemo(
    () => groupedMovements.salesGroups.find((group) => group.orderCode === detailDialogOrderCode) ?? null,
    [groupedMovements.salesGroups, detailDialogOrderCode],
  );

  function formatDateTime(value: string | null) {
    if (!value) {
      return 'Pendiente';
    }

    return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  function togglePaymentsVisibility(orderCode: string) {
    setExpandedPaymentsByOrder((current) => ({
      ...current,
      [orderCode]: !current[orderCode],
    }));
  }

  function buildGroupedAccountReceiptDocument(group: GroupedSaleMovement): ReceiptDocument {
    const brandName = snapshot?.brand?.name ?? 'Restaurante';
    const printedAt = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());

    return {
      title: 'REIMPRESION DE CUENTA',
      brandName,
      printedAt,
      metadata: [
        { label: 'Cuenta', value: group.orderCode },
        { label: 'Mesa', value: group.tableCode ?? '-' },
        { label: 'Cliente', value: group.customerName ?? 'Consumidor final' },
      ],
      items: group.orderItems?.map((item) => ({
        left: `${item.quantity} x ${item.product}`,
        right: item.lineTotal !== null && item.lineTotal !== undefined ? formatMoney(item.lineTotal, currencySymbol) : '',
        note: item.notes,
      })),
      emptyItemsLabel: 'Sin detalle disponible.',
      summary: [
        { label: 'TOTAL CUENTA', value: formatMoney(group.orderTotal ?? group.totalAmount, currencySymbol) },
        { label: 'TOTAL ABONADO', value: formatMoney(group.orderPaidAmount ?? group.totalAmount, currencySymbol) },
        { label: 'SALDO PENDIENTE', value: formatMoney(group.orderPendingAmount ?? 0, currencySymbol) },
      ],
      sections: [
        {
          title: 'ABONOS REGISTRADOS',
          entries:
            group.orderPayments?.length
              ? group.orderPayments.map((payment) => ({
                  title: formatPaymentMethodLabel(payment.method),
                  lines: [
                    formatMoney(payment.amount, currencySymbol),
                    new Intl.DateTimeFormat('es-GT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(payment.createdAt)),
                    ...(payment.reference ? [`Ref: ${payment.reference}`] : []),
                  ],
                }))
              : [{ lines: ['Sin abonos registrados.'] }],
        },
      ],
      footerLabel: 'DOCUMENTO DE REIMPRESION',
    };
  }

  function buildGroupedPaymentReceiptDocument(group: GroupedSaleMovement, payment: NonNullable<GroupedSaleMovement['orderPayments']>[number], paymentIndex: number): ReceiptDocument {
    const brandName = snapshot?.brand?.name ?? 'Restaurante';
    const printedAt = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
    const paymentDate = new Intl.DateTimeFormat('es-GT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(payment.createdAt));

    return {
      title: `REIMPRESION DE ABONO ${paymentIndex + 1}`,
      brandName,
      printedAt,
      metadata: [
        { label: 'Cuenta', value: group.orderCode },
        { label: 'Mesa', value: group.tableCode ?? '-' },
        { label: 'Cliente', value: group.customerName ?? 'Consumidor final' },
      ],
      items: [],
      summary: [
        { label: 'TOTAL CUENTA', value: formatMoney(group.orderTotal ?? group.totalAmount, currencySymbol) },
        { label: 'TOTAL ABONADO', value: formatMoney(group.orderPaidAmount ?? group.totalAmount, currencySymbol) },
        { label: 'SALDO PENDIENTE', value: formatMoney(group.orderPendingAmount ?? 0, currencySymbol) },
      ],
      sections: [
        {
          entries: [
            {
              lines: [
                `Metodo: ${formatPaymentMethodLabel(payment.method)}`,
                `Fecha: ${paymentDate}`,
                `Monto: ${formatMoney(payment.amount, currencySymbol)}`,
                ...(payment.reference ? [`Ref: ${payment.reference}`] : []),
              ],
            },
          ],
        },
      ],
      footerLabel: 'DOCUMENTO DE REIMPRESION',
    };
  }

  async function handleReprintGroupedAccount(group: GroupedSaleMovement) {
    await printReceipt(buildGroupedAccountReceiptDocument(group));
  }

  async function handleReprintGroupedPayment(group: GroupedSaleMovement, paymentIndex: number) {
    const payment = group.orderPayments?.[paymentIndex];
    if (!payment) {
      return;
    }
    await printReceipt(buildGroupedPaymentReceiptDocument(group, payment, paymentIndex));
  }

  async function handleOpenShift() {
    setSubmitting(true);
    setError(null);
    try {
      const value = Number(openingAmount);
      await openCashShift({ openingAmount: Number.isFinite(value) ? value : 0 });
      await refreshSnapshot();
      if (canManageCashiers) {
        await loadAdminCashShifts();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible abrir la caja.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCloseShift() {
    setSubmitting(true);
    setError(null);
    try {
      const value = Number(closingAmount);
      await closeCashShift({ closingAmount: Number.isFinite(value) ? value : 0 });
      await refreshSnapshot();
      if (canManageCashiers) {
        await loadAdminCashShifts();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cerrar la caja.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateMovement() {
    setSubmitting(true);
    setError(null);
    try {
      const amount = Number(movementAmount);
      await createCashMovement({
        type: movementType,
        amount: Number.isFinite(amount) ? amount : 0,
        reference: movementReference,
        notes: movementNotes || null,
      });
      setMovementDialogOpen(false);
      setMovementAmount('');
      setMovementReference('');
      setMovementNotes('');
      await refreshSnapshot();
      if (canManageCashiers) {
        await loadAdminCashShifts();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible registrar el movimiento.');
    } finally {
      setSubmitting(false);
    }
  }

  function openMovementDialog(type: 'ENTRY' | 'EXPENSE' | 'WITHDRAWAL') {
    setMovementType(type);
    setMovementDialogOpen(true);
    setError(null);
  }

  async function handleAdminCloseShift(shiftId: number) {
    setAdminSubmittingShiftId(shiftId);
    setAdminError(null);
    setAdminSuccess(null);

    try {
      const value = Number(adminClosingAmounts[shiftId] ?? 0);
      await closeAdminCashShift(shiftId, { closingAmount: Number.isFinite(value) ? value : 0 });
      setAdminSuccess('La caja seleccionada fue cerrada correctamente.');
      await refreshSnapshot();
      await loadAdminCashShifts();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'No fue posible cerrar la caja seleccionada.');
    } finally {
      setAdminSubmittingShiftId(null);
    }
  }

  return (
    <>
      {isOverviewView ? (
        <Panel
          title="Detalle de caja"
          subtitle={`Caja y arqueo del turno actual${user?.name ? ` • Cajero: ${user.name}` : ''}`}
          action={
            cashShift?.isOpen ? (
              <button
                type="button"
                onClick={() => navigate('/cashier/mesas')}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white"
              >
                <AppIcon icon={CreditCard} className="h-4 w-4" />
                Ir a mesas y cobrar
              </button>
            ) : null
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['Apertura', `${currencySymbol} ${totals.opening.toFixed(2)}`],
              ['Ventas en efectivo', `${currencySymbol} ${totals.cashSales.toFixed(2)}`],
              ['Entradas / salidas', `${currencySymbol} ${(totals.entries - totals.outflows).toFixed(2)}`],
              ['Efectivo estimado', `${currencySymbol} ${totals.estimatedCash.toFixed(2)}`],
            ].map(([label, value]) => (
              <article key={label} className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/45 dark:shadow-none">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">{label}</p>
                <p className="mt-4 font-display text-3xl text-slate-950 dark:text-white">{value}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 rounded-[24px] border border-slate-200/80 bg-slate-50 p-5 dark:border-white/10 dark:bg-black/20">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Estado de caja</p>
            <p className="mt-3 font-semibold text-slate-950 dark:text-white">{cashShiftLabel}</p>
            {cashShift?.isOpen ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                Apertura: {currencySymbol} {cashShift.openingAmount.toFixed(2)} • Responsable: {cashShift.openedBy}
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">Debes abrir caja para habilitar el POS del mesero.</p>
            )}

            {error && !movementDialogOpen ? (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</div>
            ) : null}

            {cashShift?.isOpen ? (
              <div className="mt-4 space-y-4">
                <button
                  type="button"
                  onClick={() => navigate('/cashier/mesas')}
                  className="flex w-full items-center justify-between rounded-[22px] border border-amber-300/25 bg-amber-300/10 px-4 py-4 text-left transition hover:bg-amber-300/15"
                >
                  <span>
                    <span className="block text-sm font-semibold text-amber-950 dark:text-white">Mesas para cobro</span>
                    <span className="mt-1 block text-sm text-amber-700 dark:text-amber-100/80">Ve directo a las cuentas activas para cobrar.</span>
                  </span>
                  <AppIcon icon={Receipt} className="h-5 w-5 text-amber-900 dark:text-white" />
                </button>

                <div className="rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950/45 dark:shadow-none">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Entradas y salidas de efectivo</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => openMovementDialog('ENTRY')}
                      className="flex items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-500/15 dark:text-white"
                    >
                      <AppIcon icon={ArrowUpCircle} className="h-4 w-4" />
                      Entrada de efectivo
                    </button>
                    <button
                      type="button"
                      onClick={() => openMovementDialog('WITHDRAWAL')}
                      className="flex items-center gap-2 rounded-2xl border border-orange-300/30 bg-orange-500/10 px-4 py-3 text-sm font-semibold text-orange-800 transition hover:bg-orange-500/15 dark:text-white"
                    >
                      <AppIcon icon={ArrowDownCircle} className="h-4 w-4" />
                      Salida de efectivo
                    </button>
                    <button
                      type="button"
                      onClick={() => openMovementDialog('EXPENSE')}
                      className="rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-800 transition hover:bg-rose-500/15 dark:text-white"
                    >
                      Registrar gasto
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    value={closingAmount}
                    onChange={(event) => setClosingAmount(event.target.value)}
                    placeholder="Efectivo de cierre"
                    className="h-12 w-56 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleCloseShift()}
                    className="h-12 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-5 text-sm font-semibold text-rose-800 transition hover:bg-rose-500/15 disabled:opacity-50 dark:text-white"
                  >
                    {submitting ? 'Procesando...' : 'Cerrar caja'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  value={openingAmount}
                  onChange={(event) => setOpeningAmount(event.target.value)}
                  placeholder="Monto de apertura"
                  className="h-12 w-56 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
                />
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleOpenShift()}
                  className="h-12 rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-500/15 disabled:opacity-50 dark:text-white"
                >
                  {submitting ? 'Procesando...' : 'Abrir caja'}
                </button>
              </div>
            )}
          </div>
        </Panel>
      ) : null}

      {isMovementsView ? (
        <Panel
          title="Movimientos"
          subtitle="Cuentas agrupadas con sus abonos y movimientos manuales separados"
          action={
            cashShift?.isOpen ? (
              <button
                type="button"
                onClick={() => navigate('/cashier/mesas')}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white"
              >
                <AppIcon icon={CreditCard} className="h-4 w-4" />
                Ir a mesas y cobros
              </button>
            ) : null
          }
        >
          <div className="space-y-4">
            {groupedMovements.salesGroups.map((group) => (
              <article
                key={group.orderCode}
                className="rounded-[24px] border border-emerald-300/35 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-zinc-950/45 dark:shadow-none"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-950 dark:text-white">{group.orderCode}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                      {group.tableCode ? `Mesa ${group.tableCode}` : group.customerName ?? 'Consumidor final'}
                      {group.tableCode && group.customerName ? ` • ${group.customerName}` : ''}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                      {group.payments.length} abono(s) registrado(s)
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <StatusBadge value="SALE" />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-zinc-200">
                      {currencySymbol} {group.totalAmount.toFixed(2)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">Ultimo abono: {group.latestCreatedAt}</p>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => togglePaymentsVisibility(group.orderCode)}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-500/15 dark:text-emerald-100"
                      >
                        {expandedPaymentsByOrder[group.orderCode] ? 'Contraer abonos' : `Desplegar abonos (${group.payments.length})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailDialogOrderCode(group.orderCode)}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-sky-300/30 bg-sky-500/10 px-3 text-xs font-semibold text-sky-900 transition hover:bg-sky-500/15 dark:text-sky-100"
                      >
                        Ver detalle
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrintDialogOrderCode(group.orderCode)}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-violet-300/30 bg-violet-500/10 px-3 text-xs font-semibold text-violet-900 transition hover:bg-violet-500/15 dark:text-violet-100"
                      >
                        <AppIcon icon={Printer} className="h-4 w-4" />
                        Reimpresion
                      </button>
                    </div>
                  </div>
                </div>

                {expandedPaymentsByOrder[group.orderCode] ? (
                  <div className="mt-4 space-y-2">
                    {group.payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3 dark:border-white/8 dark:bg-black/20"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{payment.createdAt}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">{formatAuditDetail(payment)}</p>
                        </div>
                        <div className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <StatusBadge value={payment.method} />
                          </div>
                          <p className="mt-2 text-sm text-slate-700 dark:text-zinc-200">
                            {currencySymbol} {payment.amount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}

            {groupedMovements.standaloneMovements.map((movement) => (
              <article key={movement.id} className="flex items-center justify-between gap-4 rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">{movement.reference}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">{movement.createdAt}</p>
                  {(movement.method === 'CARD' || movement.method === 'TRANSFER' || movement.method === 'MIXED') && movement.paymentReference ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">{formatAuditDetail(movement)}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <StatusBadge value={movement.type} />
                    <StatusBadge value={movement.method} />
                  </div>
                  <p className="mt-2 text-sm text-slate-700 dark:text-zinc-200">
                    {currencySymbol} {movement.amount.toFixed(2)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      ) : null}

      {canManageCashiers && isOverviewView ? (
        <Panel
          title="Control administrativo de cajas"
          subtitle="Supervisa aperturas y cierres de caja por responsable, y cierra una caja específica cuando el cajero no lo haga."
        >
          {adminError ? (
            <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{adminError}</div>
          ) : null}
          {adminSuccess ? (
            <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">{adminSuccess}</div>
          ) : null}

          <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/45 dark:shadow-none">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Cajas abiertas</p>
              <p className="mt-4 font-display text-3xl text-slate-950 dark:text-white">{adminCashOverview.openCount}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">Visibles con los filtros actuales.</p>
            </article>
            <article className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/45 dark:shadow-none">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Total abierto del día</p>
              <p className="mt-4 font-display text-3xl text-slate-950 dark:text-white">
                {currencySymbol} {adminCashOverview.openedTotal.toFixed(2)}
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">Suma de aperturas registradas hoy.</p>
            </article>
            <article className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/45 dark:shadow-none">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Total cerrado del día</p>
              <p className="mt-4 font-display text-3xl text-slate-950 dark:text-white">
                {currencySymbol} {adminCashOverview.closedTotal.toFixed(2)}
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">Suma de cierres registrados hoy.</p>
            </article>
            <article className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/45 dark:shadow-none">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Pendientes de cierre</p>
              <p className="mt-4 font-display text-3xl text-slate-950 dark:text-white">{adminCashOverview.pendingCashiers.length}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                {adminCashOverview.pendingCashiers.length
                  ? adminCashOverview.pendingCashiers.join(', ')
                  : 'No hay cajeros pendientes.'}
              </p>
            </article>
          </div>

          <div className="mb-5 grid gap-3 rounded-[24px] border border-slate-200/80 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_auto]">
            <select
              value={adminBranchFilter}
              onChange={(event) => setAdminBranchFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={adminDateFrom}
              onChange={(event) => setAdminDateFrom(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
            />
            <input
              type="date"
              value={adminDateTo}
              onChange={(event) => setAdminDateTo(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
            />
            <label className="inline-flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200">
              <input
                type="checkbox"
                checked={adminOpenOnly}
                onChange={(event) => setAdminOpenOnly(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
              />
              Solo abiertas
            </label>
          </div>

          {adminLoading ? (
            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50 px-4 py-5 text-sm text-slate-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
              Cargando cajas de cajeros...
            </div>
          ) : adminCashShifts.length ? (
            <div className="space-y-4">
              {adminCashShifts.map((shift) => (
                <article key={shift.id} className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/45 dark:shadow-none">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-sky-300/25 bg-sky-500/10 text-sky-700 dark:text-sky-200">
                          <AppIcon icon={ShieldCheck} className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-semibold text-slate-950 dark:text-white">{shift.branchName}</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                            Responsable: {shift.openedBy} • Rol: {shift.openedByRole}
                          </p>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] ${
                        shift.isOpen
                          ? 'border border-emerald-300/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                          : 'border border-slate-300/40 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-300'
                      }`}
                    >
                      {shift.isOpen ? 'Abierta' : 'Cerrada'}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Apertura</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">{formatDateTime(shift.openedAt)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Cierre</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">{formatDateTime(shift.closedAt)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Monto apertura</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
                        {currencySymbol} {shift.openingAmount.toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Movimientos</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">{shift.movementCount}</p>
                    </div>
                  </div>

                  {shift.isOpen ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <input
                        value={adminClosingAmounts[shift.id] ?? ''}
                        onChange={(event) =>
                          setAdminClosingAmounts((current) => ({
                            ...current,
                            [shift.id]: event.target.value,
                          }))
                        }
                        placeholder="Monto de cierre administrativo"
                        className="h-12 w-64 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
                      />
                      <button
                        type="button"
                        disabled={adminSubmittingShiftId === shift.id}
                        onClick={() => void handleAdminCloseShift(shift.id)}
                        className="h-12 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-5 text-sm font-semibold text-rose-800 transition hover:bg-rose-500/15 disabled:opacity-50 dark:text-white"
                      >
                        {adminSubmittingShiftId === shift.id ? 'Cerrando...' : `Cerrar caja de ${shift.openedBy}`}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
                      Cierre registrado: {currencySymbol} {(shift.closingAmount ?? 0).toFixed(2)}
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50 px-4 py-5 text-sm text-slate-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300">
              Todavía no hay cajas registradas para mostrar en el control administrativo.
            </div>
          )}
        </Panel>
      ) : null}

      {movementDialogOpen && isOverviewView ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm dark:bg-black/70">
          <div className="w-full max-w-xl rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[#0b0b10] dark:shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Movimiento de caja</p>
                <h3 className="mt-2 font-display text-2xl text-slate-950 dark:text-white">
                  {movementType === 'ENTRY' ? 'Registrar entrada de efectivo' : movementType === 'WITHDRAWAL' ? 'Registrar salida de efectivo' : 'Registrar gasto'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMovementDialogOpen(false)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
              >
                Cerrar
              </button>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</div>
            ) : null}

            <div className="mt-5 grid gap-4">
              <input
                value={movementReference}
                onChange={(event) => setMovementReference(event.target.value)}
                placeholder={movementType === 'ENTRY' ? 'Concepto de la entrada' : movementType === 'WITHDRAWAL' ? 'Concepto de la salida' : 'Concepto del gasto'}
                className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
              />
              <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                <input
                  value={movementAmount}
                  onChange={(event) => setMovementAmount(event.target.value)}
                  placeholder="Monto"
                  type="number"
                  min="0"
                  step="0.01"
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
                />
                <input
                  value={movementNotes}
                  onChange={(event) => setMovementNotes(event.target.value)}
                  placeholder="Notas opcionales"
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleCreateMovement()}
                  className="h-12 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
                >
                  {submitting ? 'Procesando...' : movementType === 'ENTRY' ? 'Guardar entrada' : movementType === 'WITHDRAWAL' ? 'Guardar salida' : 'Guardar gasto'}
                </button>
                <button
                  type="button"
                  onClick={() => setMovementDialogOpen(false)}
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {selectedDetailGroup && isMovementsView ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm dark:bg-black/70">
          <div className="w-full max-w-3xl rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[#0b0b10] dark:shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Detalle de venta</p>
                <h3 className="mt-2 font-display text-2xl text-slate-950 dark:text-white">{selectedDetailGroup.orderCode}</h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-zinc-500">
                  {selectedDetailGroup.tableCode ? `Mesa ${selectedDetailGroup.tableCode}` : selectedDetailGroup.customerName ?? 'Consumidor final'}
                  {selectedDetailGroup.tableCode && selectedDetailGroup.customerName ? ` • ${selectedDetailGroup.customerName}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailDialogOrderCode(null)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <article className="rounded-[22px] border border-slate-200/80 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">Total cuenta</p>
                <p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">
                  {currencySymbol} {(selectedDetailGroup.orderTotal ?? selectedDetailGroup.totalAmount).toFixed(2)}
                </p>
              </article>
              <article className="rounded-[22px] border border-slate-200/80 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">Total abonado</p>
                <p className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">
                  {currencySymbol} {(selectedDetailGroup.orderPaidAmount ?? selectedDetailGroup.totalAmount).toFixed(2)}
                </p>
              </article>
              <article className="rounded-[22px] border border-slate-200/80 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">Saldo pendiente</p>
                <p className="mt-3 text-xl font-semibold text-amber-700 dark:text-amber-300">
                  {currencySymbol} {(selectedDetailGroup.orderPendingAmount ?? 0).toFixed(2)}
                </p>
              </article>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-[24px] border border-slate-200/80 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Consumo</p>
                <div className="mt-4 space-y-3">
                  {selectedDetailGroup.orderItems?.length ? (
                    selectedDetailGroup.orderItems.map((item, index) => (
                      <div key={`${selectedDetailGroup.orderCode}-item-${index}`} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950 dark:text-white">
                              {item.quantity} x {item.product}
                            </p>
                            {item.notes ? <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">{item.notes}</p> : null}
                          </div>
                          <p className="text-sm font-semibold text-slate-700 dark:text-zinc-200">
                            {item.lineTotal !== null && item.lineTotal !== undefined ? `${currencySymbol} ${item.lineTotal.toFixed(2)}` : ''}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-zinc-500">No hay detalle de productos disponible.</p>
                  )}
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200/80 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Abonos registrados</p>
                <div className="mt-4 space-y-3">
                  {selectedDetailGroup.orderPayments?.length ? (
                    selectedDetailGroup.orderPayments.map((payment, paymentIndex) => (
                      <div key={`${selectedDetailGroup.orderCode}-payment-${paymentIndex}`} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950 dark:text-white">Abono {paymentIndex + 1}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">
                              {formatPaymentMethodLabel(payment.method)} • {formatDateTime(payment.createdAt)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">
                              {payment.reference
                                ? payment.method === 'TRANSFER'
                                  ? `Referencia transferencia/deposito: ${payment.reference}`
                                  : `Referencia: ${payment.reference}`
                                : 'Sin referencia adicional'}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-slate-700 dark:text-zinc-200">
                            {currencySymbol} {payment.amount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-zinc-500">No hay abonos registrados.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {selectedPrintGroup && isMovementsView ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm dark:bg-black/70">
          <div className="w-full max-w-xl rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[#0b0b10] dark:shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Reimpresion</p>
                <h3 className="mt-2 font-display text-2xl text-slate-950 dark:text-white">{selectedPrintGroup.orderCode}</h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-zinc-500">
                  Selecciona si deseas imprimir la cuenta total o uno de los abonos registrados.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrintDialogOrderCode(null)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => {
                  handleReprintGroupedAccount(selectedPrintGroup);
                  setPrintDialogOrderCode(null);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-4 text-left text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white"
              >
                <span>Cuenta total</span>
                <span>{currencySymbol} {(selectedPrintGroup.orderTotal ?? selectedPrintGroup.totalAmount).toFixed(2)}</span>
              </button>

              {selectedPrintGroup.orderPayments?.map((payment, paymentIndex) => (
                <button
                  key={`${selectedPrintGroup.orderCode}-${paymentIndex}-${payment.createdAt}`}
                  type="button"
                  onClick={() => {
                    handleReprintGroupedPayment(selectedPrintGroup, paymentIndex);
                    setPrintDialogOrderCode(null);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
                >
                  <div>
                    <p>Abono {paymentIndex + 1}</p>
                    <p className="mt-1 text-xs font-normal text-slate-500 dark:text-zinc-500">
                      {formatPaymentMethodLabel(payment.method)} • {formatDateTime(payment.createdAt)}
                    </p>
                    {payment.reference ? (
                      <p className="mt-1 text-xs font-normal text-slate-500 dark:text-zinc-500">
                        {payment.method === 'TRANSFER' ? 'Ref. transferencia/deposito' : 'Ref. operacion'}: {payment.reference}
                      </p>
                    ) : null}
                  </div>
                  <span>{currencySymbol} {payment.amount.toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
