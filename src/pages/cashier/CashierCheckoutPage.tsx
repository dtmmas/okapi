import { ArrowLeft, Banknote, CreditCard, Landmark, Printer, Receipt, Split, Undo2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppIcon } from '@/components/AppIcon';
import { ActiveUserLabel } from '@/components/ActiveUserLabel';
import { openReceiptPrintSession, printReceipt } from '@/lib/printing/print-service';
import { receiptItemNote } from '@/lib/printing/receipt-builders';
import { StatusBadge } from '@/components/StatusBadge';
import { payOrder } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';
import type { ReceiptDocument, ReceiptSection } from '@/types/printing';

type Method = 'CASH' | 'CARD' | 'TRANSFER';
type SplitMode = 'AMOUNT' | 'EQUAL' | 'ITEMS';

function formatMoney(amount: number, currencySymbol: string) {
  return `${currencySymbol} ${amount.toFixed(2)}`;
}

function formatPaymentMethodLabel(method: Method | 'MIXED') {
  return method === 'CASH' ? 'EFECTIVO' : method === 'CARD' ? 'TARJETA' : method === 'TRANSFER' ? 'TRANSFERENCIA' : 'MIXTO';
}

export default function CashierCheckoutPage() {
  const navigate = useNavigate();
  const params = useParams();
  const snapshot = useSessionStore((state) => state.snapshot);
  const user = useSessionStore((state) => state.user);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const [method, setMethod] = useState<Method>('CASH');
  const [amountToPay, setAmountToPay] = useState('');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [reference, setReference] = useState('');
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>('AMOUNT');
  const [splitPeopleCount, setSplitPeopleCount] = useState(2);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);

  const tableId = params.tableId ? Number(params.tableId) : null;
  const table = useMemo(() => (tableId && snapshot ? snapshot.tables.find((t) => t.id === tableId) ?? null : null), [snapshot, tableId]);
  const order = useMemo(() => {
    if (!snapshot || !table?.code) {
      return null;
    }
    return snapshot.activeOrders.find((o) => o.tableCode === table.code) ?? null;
  }, [snapshot, table]);

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
    if (order) {
      setAmountToPay(order.pendingAmount.toFixed(2));
      setReceivedAmount('');
      setReference('');
      setProofImage(null);
      setError(null);
      setSplitMode('AMOUNT');
      setSplitPeopleCount(2);
      setSelectedItemIds([]);
    }
  }, [order?.id, order?.paymentCount, order?.pendingAmount]);

  const lines = useMemo(() => {
    if (!snapshot || !order) {
      return [];
    }
    const productByName = new Map(snapshot.menuProducts.map((product) => [product.name, product]));
    return order.items.map((item) => {
      const product = productByName.get(item.product) ?? null;
      const unitPrice = product ? product.price : null;
      const lineTotal = unitPrice !== null ? unitPrice * item.quantity : null;
      return { ...item, unitPrice, lineTotal };
    });
  }, [snapshot, order]);

  const selectedSplitLines = useMemo(() => lines.filter((line) => selectedItemIds.includes(line.id)), [lines, selectedItemIds]);

  const total = order?.total ?? 0;
  const paidAmount = order?.paidAmount ?? 0;
  const pendingAmount = order?.pendingAmount ?? 0;
  const currencySymbol = snapshot?.brand.currencySymbol ?? 'Q';
  const amountValue = Number(amountToPay || 0);
  const receivedValue = Number(receivedAmount || 0);
  const change = method === 'CASH' && Number.isFinite(receivedValue) ? Math.max(0, receivedValue - amountValue) : 0;
  const isChargeEnabled = Boolean(order?.readyForPayment);
  const selectedItemsAmount = useMemo(
    () => selectedSplitLines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0),
    [selectedSplitLines],
  );
  const chargeBlockMessage =
    order?.status === 'READY'
      ? 'La cuenta todavía está lista en estación, pero aún no se ha marcado como entregada al cliente.'
      : order?.status === 'IN_PREPARATION'
        ? 'La cuenta sigue en preparación. Caja podrá cobrar cuando todo el pedido se entregue al cliente.'
        : order?.status === 'OPEN'
          ? 'La cuenta aún no entra en preparación. Caja podrá cobrar cuando el pedido se entregue al cliente.'
          : null;

  function buildReceiptDocument(payload: {
    title?: string;
    method: Method | 'MIXED';
    tableCode: string;
    orderCode: string;
    customerName: string;
    lines: Array<{ quantity: number; product: string; notes?: string; sentByName?: string | null; lineTotal: number | null }>;
    total: number;
    paymentAmount: number;
    paidAmount: number;
    pendingAmount: number;
    currencySymbol: string;
    collectedByName?: string | null;
    payments?: Array<{ method: Method | 'MIXED'; amount: number; collectedByName?: string | null; reference?: string | null; createdAt?: string }>;
    showPaymentsHistory?: boolean;
    showPaymentMeta?: boolean;
    footerLabel?: string;
    receivedAmount?: number;
    change?: number;
    reference?: string;
  }): ReceiptDocument {
    const brandName = snapshot?.brand?.name ?? 'Restaurante';
    const now = new Date();
    const printedAt = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(now);
    const previousPaidAmount = Math.max(0, Number((payload.paidAmount - payload.paymentAmount).toFixed(2)));
    const methodLabel = formatPaymentMethodLabel(payload.method);
    const title = payload.title ?? (payload.pendingAmount > 0 ? 'RECIBO DE ABONO' : 'LIQUIDACION FINAL');

    const sections: ReceiptSection[] = [];

    if (payload.showPaymentsHistory && payload.payments?.length) {
      sections.push({
        title: 'PAGOS REGISTRADOS',
        entries: payload.payments.map((payment) => {
          const paymentDate = payment.createdAt
            ? new Date(payment.createdAt).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })
            : '';
          const lines = [formatMoney(payment.amount, payload.currencySymbol), `Cobró: ${payment.collectedByName ?? 'Sin registrar'}`];
          if (paymentDate) {
            lines.push(paymentDate);
          }
          if (payment.reference) {
            lines.push(`Ref: ${payment.reference}`);
          }
          return {
            title: formatPaymentMethodLabel(payment.method),
            lines,
          };
        }),
      });
    }

    if (payload.showPaymentMeta !== false) {
      sections.push({
        entries: [
          {
            lines:
              payload.method === 'CASH'
                ? [
                    `Pago: ${methodLabel}`,
                    `Pago actual: ${formatMoney(payload.paymentAmount, payload.currencySymbol)}`,
                    `Recibido: ${formatMoney(payload.receivedAmount ?? 0, payload.currencySymbol)}`,
                    `Cambio: ${formatMoney(payload.change ?? 0, payload.currencySymbol)}`,
                  ]
                : [
                    `Pago: ${methodLabel}`,
                    `Pago actual: ${formatMoney(payload.paymentAmount, payload.currencySymbol)}`,
                    `Referencia: ${payload.reference ?? ''}`,
                  ],
          },
        ],
      });
    }

    return {
      title,
      brandName,
      printedAt,
      metadata: [
        { label: 'Abrió el pedido', value: order?.openedByName ?? 'Sin registrar' },
        ...(payload.paymentAmount > 0 ? [{ label: 'Cobró', value: payload.collectedByName ?? 'Sin registrar' }] : []),
        { label: 'Mesa', value: payload.tableCode },
        { label: 'Cliente', value: payload.customerName },
        { label: 'Cuenta', value: payload.orderCode },
      ],
      items: payload.lines.map((item) => ({
        left: `${Number(item.quantity)} x ${item.product}`,
        right: item.lineTotal !== null ? formatMoney(item.lineTotal, payload.currencySymbol) : '',
        note: receiptItemNote(item),
      })),
      summary: [
        { label: 'TOTAL CUENTA', value: formatMoney(payload.total, payload.currencySymbol) },
        ...(previousPaidAmount > 0
          ? [{ label: 'ABONOS PREVIOS', value: formatMoney(previousPaidAmount, payload.currencySymbol) }]
          : []),
        {
          label: payload.pendingAmount > 0 ? 'ABONO REGISTRADO' : 'PAGO ACTUAL',
          value: formatMoney(payload.paymentAmount, payload.currencySymbol),
        },
        ...(previousPaidAmount > 0 || payload.pendingAmount > 0
          ? [{ label: 'TOTAL ABONADO', value: formatMoney(payload.paidAmount, payload.currencySymbol) }]
          : []),
        { label: 'SALDO PENDIENTE', value: formatMoney(payload.pendingAmount, payload.currencySymbol) },
      ],
      summaryNote:
        previousPaidAmount > 0
          ? `${formatMoney(previousPaidAmount, payload.currencySymbol)} + ${formatMoney(payload.paymentAmount, payload.currencySymbol)} = ${formatMoney(
              payload.paidAmount,
              payload.currencySymbol,
            )}`
          : undefined,
      sections,
      footerLabel: payload.footerLabel ?? (payload.pendingAmount > 0 ? 'ABONO REGISTRADO' : 'CUENTA LIQUIDADA'),
    };
  }

  function buildFullAccountReceiptDocument(payments: Array<{ method: Method | 'MIXED'; amount: number; collectedByName?: string | null; reference?: string | null; createdAt?: string }>) {
    if (!order) {
      return null;
    }

    return buildReceiptDocument({
      title: pendingAmount > 0 ? 'PRECUENTA' : 'LIQUIDACION FINAL',
      method: payments.at(-1)?.method === 'CARD' || payments.at(-1)?.method === 'TRANSFER' ? payments.at(-1)!.method : 'CASH',
      tableCode: table?.code ?? order.tableCode ?? '',
      orderCode: order.code,
      customerName: order.customerName || 'Consumidor final',
      lines,
      total,
      paymentAmount: payments.at(-1)?.amount ?? 0,
      collectedByName: payments.at(-1)?.collectedByName,
      paidAmount: payments.reduce((sum, payment) => sum + payment.amount, 0),
      pendingAmount: Math.max(0, Number((total - payments.reduce((sum, payment) => sum + payment.amount, 0)).toFixed(2))),
      currencySymbol,
      payments,
      showPaymentsHistory: true,
      showPaymentMeta: payments.length > 0,
      footerLabel: pendingAmount > 0 ? 'PRECUENTA INFORMATIVA' : 'LIQUIDACION FINAL REGISTRADA',
      reference: payments.at(-1)?.reference ?? undefined,
    });
  }

  async function handlePrintFullAccount(paymentsOverride?: Array<{ method: Method | 'MIXED'; amount: number; reference?: string | null; createdAt?: string }>) {
    if (!order) {
      return;
    }

    const payments = [...(paymentsOverride ?? order.payments)].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
    const document = buildFullAccountReceiptDocument(payments);
    if (!document) {
      return;
    }
    await printReceipt(document);
  }

  function applyEqualSplit(peopleCount: number) {
    if (pendingAmount <= 0) {
      return;
    }

    const normalizedPeople = Math.max(2, peopleCount);
    setSplitMode('EQUAL');
    setSplitPeopleCount(normalizedPeople);
    setAmountToPay((pendingAmount / normalizedPeople).toFixed(2));
  }

  function toggleSplitLine(itemId: number) {
    setSplitMode('ITEMS');
    setSelectedItemIds((current) => {
      const targetLine = lines.find((line) => line.id === itemId);
      if (targetLine?.paid) {
        return current;
      }

      const next = current.includes(itemId) ? current.filter((currentItemId) => currentItemId !== itemId) : [...current, itemId];
      const nextAmount = lines
        .filter((line) => next.includes(line.id))
        .reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);
      setAmountToPay(nextAmount > 0 ? Math.min(nextAmount, pendingAmount).toFixed(2) : pendingAmount.toFixed(2));
      return next;
    });
  }

  async function handlePay() {
    if (!order) {
      return;
    }

    setSubmitting(true);
    setError(null);
    const printSession = openReceiptPrintSession();

    try {
      const normalizedReference = reference.trim();
      const amount = Number(amountToPay);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Ingresa un monto válido para el abono.');
      }
      if (splitMode === 'ITEMS' && selectedItemIds.length === 0) {
        throw new Error('Selecciona al menos un producto para cobrar por productos.');
      }
      if (amount > pendingAmount) {
        throw new Error('El monto no puede superar el saldo pendiente.');
      }

      let receiptDocument: ReceiptDocument | null = null;
      const receiptLines = splitMode === 'ITEMS' && selectedSplitLines.length ? selectedSplitLines : lines;

      if (method === 'CASH') {
        const numericReceived = Number(receivedAmount);
        if (!Number.isFinite(numericReceived) || numericReceived <= 0) {
          throw new Error('Ingresa el monto recibido.');
        }

        const result = await payOrder({
          orderId: order.id,
          method,
          amount,
          receivedAmount: numericReceived,
          appliedItemIds: splitMode === 'ITEMS' ? selectedItemIds : null,
        });

        receiptDocument = buildReceiptDocument({
          method,
          tableCode: table?.code ?? order.tableCode ?? '',
          orderCode: order.code,
          customerName: order.customerName || 'Consumidor final',
          lines: receiptLines,
          total,
          paymentAmount: result.registeredAmount,
          paidAmount: result.paidAmount,
          pendingAmount: result.remainingAmount,
          currencySymbol,
          receivedAmount: numericReceived,
          change: Math.max(0, numericReceived - amount),
          collectedByName: result.collectedByName,
        });

        await refreshSnapshot();
        if (receiptDocument) {
          await printSession.print(receiptDocument);
        }

        if (result.completed) {
          const completedPayments = [
            ...order.payments,
            { method, amount: result.registeredAmount, collectedByName: result.collectedByName, reference: null, createdAt: new Date().toISOString() },
          ];
          if (window.confirm('Cuenta liquidada. Deseas imprimir la liquidacion final detallada con todos los abonos registrados?')) {
            await handlePrintFullAccount(completedPayments);
          }
          navigate('/cashier/mesas', { replace: true });
        }
      } else {
        if (!normalizedReference) {
          throw new Error('Ingresa el número de referencia.');
        }
        if (method === 'TRANSFER' && !proofImage) {
          throw new Error('Adjunta la imagen del comprobante.');
        }

        const result = await payOrder({
          orderId: order.id,
          method,
          amount,
          reference: normalizedReference,
          proofImage: method === 'TRANSFER' ? proofImage : null,
          appliedItemIds: splitMode === 'ITEMS' ? selectedItemIds : null,
        });

        receiptDocument = buildReceiptDocument({
          method,
          tableCode: table?.code ?? order.tableCode ?? '',
          orderCode: order.code,
          customerName: order.customerName || 'Consumidor final',
          lines: receiptLines,
          total,
          paymentAmount: result.registeredAmount,
          paidAmount: result.paidAmount,
          pendingAmount: result.remainingAmount,
          currencySymbol,
          reference: normalizedReference,
          collectedByName: result.collectedByName,
        });

        await refreshSnapshot();
        if (receiptDocument) {
          await printSession.print(receiptDocument);
        }

        if (result.completed) {
          const completedPayments = [
            ...order.payments,
            { method, amount: result.registeredAmount, collectedByName: result.collectedByName, reference: normalizedReference, createdAt: new Date().toISOString() },
          ];
          if (window.confirm('Cuenta liquidada. Deseas imprimir la liquidacion final detallada con todos los abonos registrados?')) {
            await handlePrintFullAccount(completedPayments);
          }
          navigate('/cashier/mesas', { replace: true });
        }
      }
    } catch (err) {
      printSession.cancel();
      setError(err instanceof Error ? err.message : 'No fue posible cobrar.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!snapshot || !user) {
    return null;
  }

  if (!table || !order) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-900 dark:bg-[#07070a] dark:text-white sm:px-6 sm:py-6">
        <div className="mx-auto max-w-4xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
          <p className="text-sm text-slate-600 dark:text-zinc-400">No hay una cuenta activa para cobrar en esta mesa.</p>
          <ActiveUserLabel height="h-12" />
          <button
            type="button"
            onClick={() => navigate('/cashier/mesas', { replace: true })}
            className="mt-4 inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
          >
            <AppIcon icon={ArrowLeft} className="h-4 w-4" />
            Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-900 dark:bg-[#07070a] dark:text-white sm:px-6 sm:py-6">
      <header className="w-full text-left">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Cobro dividido por monto</p>
            <h1 className="mt-3 font-display text-3xl text-slate-950 dark:text-white sm:text-4xl lg:text-5xl">Mesa {table.code}</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400 sm:text-base">
              Cuenta: {order.code} • Cliente: {order.customerName}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge value={order.status} />
              {order.readyForPayment ? <StatusBadge value="BILL_REQUESTED" /> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <ActiveUserLabel height="h-11 sm:h-12 lg:h-14" />
          <button
            type="button"
            onClick={() => navigate('/cashier/mesas')}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-12 sm:text-base lg:h-14 lg:px-5 lg:text-lg"
          >
            <AppIcon icon={ArrowLeft} className="h-4 w-4" />
            Volver a mesas
          </button>
          </div>
        </div>
      </header>

      <main className="mt-6 grid w-full min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,32rem)]">
        <section className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Detalle de cuenta</p>
              {splitMode === 'ITEMS' && selectedSplitLines.length ? (
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 dark:text-violet-300">
                  {selectedSplitLines.length} producto(s) marcado(s)
                </span>
              ) : null}
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-700 dark:text-zinc-200">
              {lines.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!isChargeEnabled || item.paid}
                  onClick={() => toggleSplitLine(item.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition dark:bg-white/[0.03] ${
                    item.paid
                      ? 'cursor-not-allowed border-emerald-300/30 bg-emerald-500/10 opacity-70'
                      : selectedItemIds.includes(item.id)
                        ? 'border-violet-300/35 bg-violet-500/10'
                        : 'border-transparent bg-slate-50 dark:border-white/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold leading-snug text-slate-950 dark:text-white">
                          {item.quantity} x {item.product}
                        </p>
                        {item.paid ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
                            Abonado
                          </span>
                        ) : null}
                      </div>
                      {item.notes ? <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500 dark:text-zinc-500">{item.notes}</p> : null}
                    </div>
                    <div className="shrink-0 text-right font-semibold text-slate-950 dark:text-white">
                      {item.lineTotal !== null ? formatMoney(item.lineTotal, currencySymbol) : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-zinc-500">
              Toca productos para calcular un cobro por selección. Los productos ya abonados quedan bloqueados y marcados en verde.
            </p>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Pagos registrados</p>
            <div className="mt-4 space-y-3">
              {order.payments.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-white/10 dark:bg-black/20 dark:text-zinc-400">Aún no hay pagos registrados.</div>
              ) : (
                order.payments.map((payment) => (
                  <div key={payment.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge value={payment.method} />
                          <p className="text-sm text-slate-500 dark:text-zinc-500">{new Date(payment.createdAt).toLocaleString('es-GT')}</p>
                        </div>
                        {payment.reference ? <p className="mt-2 text-sm text-slate-700 dark:text-zinc-300">Referencia: {payment.reference}</p> : null}
                      </div>
                      <p className="text-sm font-semibold text-slate-950 dark:text-white">{formatMoney(payment.amount, currencySymbol)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Resumen</p>
            <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-200">
              <p className="flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-zinc-400">Total cuenta</span>
                <span className="font-semibold text-slate-950 dark:text-white">{formatMoney(total, currencySymbol)}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-zinc-400">Abonado</span>
                <span className="font-semibold text-slate-950 dark:text-white">{formatMoney(paidAmount, currencySymbol)}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span className="text-zinc-400">Pendiente</span>
                <span className="font-semibold text-amber-300">{formatMoney(pendingAmount, currencySymbol)}</span>
              </p>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Registrar abono</p>

            {chargeBlockMessage ? (
              <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                {chargeBlockMessage}
              </div>
            ) : null}

            <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-black/20">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!isChargeEnabled || submitting}
                  onClick={() => {
                    setSplitMode('AMOUNT');
                    setSelectedItemIds([]);
                    setAmountToPay(pendingAmount.toFixed(2));
                  }}
                  className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-3 text-xs font-semibold transition ${
                    splitMode === 'AMOUNT'
                      ? 'border-amber-300/40 bg-amber-300/10 text-amber-900 dark:text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200'
                  }`}
                >
                  <AppIcon icon={Split} className="h-4 w-4" />
                  Por monto
                </button>
                <button
                  type="button"
                  disabled={!isChargeEnabled || submitting}
                  onClick={() => applyEqualSplit(splitPeopleCount)}
                  className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-3 text-xs font-semibold transition ${
                    splitMode === 'EQUAL'
                      ? 'border-amber-300/40 bg-amber-300/10 text-amber-900 dark:text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200'
                  }`}
                >
                  <AppIcon icon={Users} className="h-4 w-4" />
                  Por personas
                </button>
                <button
                  type="button"
                  disabled={!isChargeEnabled || submitting}
                  onClick={() => setSplitMode('ITEMS')}
                  className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-3 text-xs font-semibold transition ${
                    splitMode === 'ITEMS'
                      ? 'border-amber-300/40 bg-amber-300/10 text-amber-900 dark:text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200'
                  }`}
                >
                  <AppIcon icon={Receipt} className="h-4 w-4" />
                  Por productos
                </button>
              </div>

              {splitMode === 'EQUAL' ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {[2, 3, 4, 5, 6].map((count) => (
                      <button
                        key={count}
                        type="button"
                        disabled={!isChargeEnabled || submitting}
                        onClick={() => applyEqualSplit(count)}
                        className={`h-9 rounded-2xl border px-3 text-xs font-semibold transition ${
                          splitPeopleCount === count
                            ? 'border-violet-300/40 bg-violet-500/10 text-violet-900 dark:text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200'
                        }`}
                      >
                        {count} personas
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-500">
                    Divide el saldo pendiente entre las personas seleccionadas.
                  </p>
                </div>
              ) : null}

              {splitMode === 'ITEMS' ? (
                <div className="text-xs text-slate-500 dark:text-zinc-500">
                  Productos seleccionados: <span className="font-semibold text-slate-700 dark:text-zinc-200">{formatMoney(selectedItemsAmount, currencySymbol)}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-4">
              <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Monto a cobrar</label>
              <input
                value={amountToPay}
                onChange={(event) => setAmountToPay(event.target.value)}
                placeholder={pendingAmount.toFixed(2)}
                inputMode="decimal"
                disabled={!isChargeEnabled || submitting}
                className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
              />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                { value: 'CASH' as const, label: 'Efectivo', icon: Banknote },
                { value: 'CARD' as const, label: 'Tarjeta', icon: CreditCard },
                { value: 'TRANSFER' as const, label: 'Transferencia', icon: Landmark },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMethod(option.value)}
                  disabled={!isChargeEnabled || submitting}
                  className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition ${
                    method === option.value
                      ? 'border-amber-300/40 bg-amber-300/10 text-amber-900 dark:text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <AppIcon icon={option.icon} className="h-4 w-4" />
                  {option.label}
                </button>
              ))}
            </div>

            {method === 'CASH' ? (
              <div className="mt-4">
                <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Monto recibido</label>
                <input
                  value={receivedAmount}
                  onChange={(event) => setReceivedAmount(event.target.value)}
                  placeholder={amountToPay || pendingAmount.toFixed(2)}
                  inputMode="decimal"
                  disabled={!isChargeEnabled || submitting}
                  className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-200">
                  <p className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-zinc-400">Abono</span>
                    <span className="font-semibold text-slate-950 dark:text-white">{formatMoney(Number.isFinite(amountValue) ? amountValue : 0, currencySymbol)}</span>
                  </p>
                  <p className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-zinc-400">Cambio</span>
                    <span className="font-semibold text-slate-950 dark:text-white">{formatMoney(change, currencySymbol)}</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Número de referencia</label>
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="Ej: 000123456789"
                    disabled={!isChargeEnabled || submitting}
                    className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </div>
                {method === 'TRANSFER' ? (
                  <div>
                    <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Comprobante (imagen)</label>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!isChargeEnabled || submitting}
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (!file) {
                          setProofImage(null);
                          return;
                        }
                        if (!file.type.startsWith('image/')) {
                          setError('El comprobante debe ser una imagen.');
                          setProofImage(null);
                          return;
                        }
                        if (file.size > 1_800_000) {
                          setError('La imagen es muy grande. Usa una foto más liviana.');
                          setProofImage(null);
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          const value = typeof reader.result === 'string' ? reader.result : null;
                          setProofImage(value);
                        };
                        reader.onerror = () => {
                          setError('No fue posible leer la imagen.');
                          setProofImage(null);
                        };
                        reader.readAsDataURL(file);
                      }}
                      className="mt-3 block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-black/30 dark:text-white dark:file:bg-white/[0.06] dark:file:text-white dark:hover:bg-white/[0.04]"
                    />
                    {proofImage ? (
                      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-black/20">
                        <img src={proofImage} alt="Comprobante" className="h-56 w-full object-contain" />
                        <button
                          type="button"
                          onClick={() => setProofImage(null)}
                          className="inline-flex w-full items-center justify-center gap-2 border-t border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]"
                        >
                          <AppIcon icon={Undo2} className="h-4 w-4" />
                          Quitar imagen
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</div>
            ) : null}

            <button
              type="button"
              disabled={submitting || !isChargeEnabled}
              onClick={() => void handlePay()}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-500/15 disabled:opacity-50 dark:text-white"
            >
              <AppIcon icon={Receipt} className="h-4 w-4" />
              {submitting ? 'Procesando...' : pendingAmount === amountValue ? 'Liquidar cuenta' : 'Registrar abono'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handlePrintFullAccount()}
              className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
            >
              <AppIcon icon={Printer} className="h-4 w-4" />
              {pendingAmount > 0 ? 'Imprimir precuenta' : 'Imprimir liquidacion final'}
            </button>
          </section>
        </aside>
      </main>
    </div>
  );
}
