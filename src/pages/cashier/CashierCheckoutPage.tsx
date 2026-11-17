import { ArrowLeft, Banknote, CreditCard, Landmark, Receipt, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppIcon } from '@/components/AppIcon';
import { StatusBadge } from '@/components/StatusBadge';
import { payOrder } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';

type Method = 'CASH' | 'CARD' | 'TRANSFER';

function formatMoney(amount: number, currencySymbol: string) {
  return `${currencySymbol} ${amount.toFixed(2)}`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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

  const tableId = params.tableId ? Number(params.tableId) : null;
  const table = useMemo(() => (tableId && snapshot ? snapshot.tables.find((t) => t.id === tableId) ?? null : null), [snapshot, tableId]);
  const order = useMemo(() => {
    if (!snapshot || !table?.code) {
      return null;
    }
    return snapshot.activeOrders.find((o) => o.tableCode === table.code) ?? null;
  }, [snapshot, table]);

  useEffect(() => {
    if (order) {
      setAmountToPay(order.pendingAmount.toFixed(2));
      setReceivedAmount('');
      setReference('');
      setProofImage(null);
      setError(null);
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

  const total = order?.total ?? 0;
  const paidAmount = order?.paidAmount ?? 0;
  const pendingAmount = order?.pendingAmount ?? 0;
  const currencySymbol = snapshot?.brand.currencySymbol ?? 'Q';
  const amountValue = Number(amountToPay || 0);
  const receivedValue = Number(receivedAmount || 0);
  const change = method === 'CASH' && Number.isFinite(receivedValue) ? Math.max(0, receivedValue - amountValue) : 0;

  function buildReceiptHtml(payload: {
    method: Method;
    tableCode: string;
    orderCode: string;
    customerName: string;
    lines: Array<{ quantity: number; product: string; notes?: string; lineTotal: number | null }>;
    total: number;
    paymentAmount: number;
    paidAmount: number;
    pendingAmount: number;
    currencySymbol: string;
    receivedAmount?: number;
    change?: number;
    reference?: string;
  }) {
    const brandName = snapshot?.brand?.name ?? 'Restaurante';
    const now = new Date();
    const dateLabel = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(now);
    const totalLabel = formatMoney(payload.total, payload.currencySymbol);
    const paymentLabel = formatMoney(payload.paymentAmount, payload.currencySymbol);
    const paidLabel = formatMoney(payload.paidAmount, payload.currencySymbol);
    const pendingLabel = formatMoney(payload.pendingAmount, payload.currencySymbol);
    const methodLabel = payload.method === 'CASH' ? 'EFECTIVO' : payload.method === 'CARD' ? 'TARJETA' : 'TRANSFERENCIA';
    const title = payload.pendingAmount > 0 ? 'ABONO' : 'TICKET';

    const itemsHtml = payload.lines
      .map((item) => {
        const left = `${Number(item.quantity)} x ${escapeHtml(item.product)}`;
        const right = item.lineTotal !== null ? escapeHtml(formatMoney(item.lineTotal, payload.currencySymbol)) : '';
        const notes = item.notes ? `<div class="note">${escapeHtml(item.notes)}</div>` : '';
        return `<div class="row"><div class="left">${left}${notes}</div><div class="right">${right}</div></div>`;
      })
      .join('');

    const paymentMeta = payload.method === 'CASH'
      ? `<div class="meta"><strong>Pago:</strong> ${methodLabel}<br/><strong>Abono:</strong> ${escapeHtml(paymentLabel)}<br/><strong>Recibido:</strong> ${escapeHtml(
          formatMoney(payload.receivedAmount ?? 0, payload.currencySymbol),
        )}<br/><strong>Cambio:</strong> ${escapeHtml(formatMoney(payload.change ?? 0, payload.currencySymbol))}</div>`
      : `<div class="meta"><strong>Pago:</strong> ${methodLabel}<br/><strong>Abono:</strong> ${escapeHtml(paymentLabel)}<br/><strong>Referencia:</strong> ${escapeHtml(
          payload.reference ?? '',
        )}</div>`;

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; }
      @page { size: 80mm auto; margin: 0; }
      body { margin: 0; background: #fff; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #111; }
      .ticket { width: 80mm; padding: 3mm 3mm 2mm; margin: 0; }
      .center { text-align: center; }
      .title { font-weight: 900; font-size: 20px; letter-spacing: 0.10em; }
      .subtitle { font-weight: 900; font-size: 14px; margin-top: 4px; }
      .meta { font-size: 12px; margin-top: 8px; font-weight: 800; }
      .divider { border-top: 2px dashed #222; margin: 8px 0; }
      .row { display: flex; gap: 8px; align-items: flex-start; justify-content: space-between; font-size: 13px; padding: 6px 0; }
      .left { flex: 1 1 auto; min-width: 0; font-weight: 800; }
      .right { flex: 0 0 40%; max-width: 40%; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 900; }
      .note { font-weight: 700; font-size: 12px; opacity: 0.88; margin-top: 2px; white-space: pre-wrap; }
      .summary .row { padding: 3px 0; }
      .footer { margin-top: 8px; font-size: 12px; font-weight: 900; text-align: center; letter-spacing: 0.06em; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <div class="ticket">
      <div class="center">
        <div class="subtitle">${escapeHtml(brandName)}</div>
        <div class="title">${title}</div>
        <div class="meta">${escapeHtml(dateLabel)}</div>
      </div>
      <div class="divider"></div>
      <div class="meta"><strong>Mesa:</strong> ${escapeHtml(payload.tableCode)}<br/><strong>Cliente:</strong> ${escapeHtml(payload.customerName)}<br/><strong>Cuenta:</strong> ${escapeHtml(payload.orderCode)}</div>
      <div class="divider"></div>
      ${itemsHtml || '<div class="meta">Sin items.</div>'}
      <div class="divider"></div>
      <div class="summary">
        <div class="row"><div class="left">TOTAL CUENTA</div><div class="right">${escapeHtml(totalLabel)}</div></div>
        <div class="row"><div class="left">ABONO REGISTRADO</div><div class="right">${escapeHtml(paymentLabel)}</div></div>
        <div class="row"><div class="left">ABONADO ACUMULADO</div><div class="right">${escapeHtml(paidLabel)}</div></div>
        <div class="row"><div class="left">SALDO PENDIENTE</div><div class="right">${escapeHtml(pendingLabel)}</div></div>
      </div>
      <div class="divider"></div>
      ${paymentMeta}
      <div class="footer">${payload.pendingAmount > 0 ? 'PAGO PARCIAL REGISTRADO' : 'CUENTA LIQUIDADA'}</div>
    </div>
    <script>
      window.onload = () => { window.print(); };
      window.onafterprint = () => { window.close(); };
    </script>
  </body>
</html>`;
  }

  function openPrintWindow() {
    const printWindow = window.open('', '_blank', 'width=420,height=700');
    if (!printWindow) {
      return null;
    }
    try {
      printWindow.opener = null;
    } catch {
    }
    return printWindow;
  }

  function renderPrintWindow(printWindow: Window, html: string) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  }

  async function handlePay() {
    if (!order) {
      return;
    }

    setSubmitting(true);
    setError(null);
    const printWindow = openPrintWindow();

    try {
      const normalizedReference = reference.trim();
      const amount = Number(amountToPay);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Ingresa un monto válido para el abono.');
      }
      if (amount > pendingAmount) {
        throw new Error('El monto no puede superar el saldo pendiente.');
      }

      let receiptPayload: Parameters<typeof buildReceiptHtml>[0] | null = null;

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
        });

        receiptPayload = {
          method,
          tableCode: table?.code ?? order.tableCode ?? '',
          orderCode: order.code,
          customerName: order.customerName || 'Consumidor final',
          lines: lines.map((line) => ({ quantity: line.quantity, product: line.product, ...(line.notes ? { notes: line.notes } : {}), lineTotal: line.lineTotal })),
          total,
          paymentAmount: result.registeredAmount,
          paidAmount: result.paidAmount,
          pendingAmount: result.remainingAmount,
          currencySymbol,
          receivedAmount: numericReceived,
          change: Math.max(0, numericReceived - amount),
        };

        await refreshSnapshot();
        if (printWindow && receiptPayload) {
          renderPrintWindow(printWindow, buildReceiptHtml(receiptPayload));
        }

        if (result.completed) {
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
        });

        receiptPayload = {
          method,
          tableCode: table?.code ?? order.tableCode ?? '',
          orderCode: order.code,
          customerName: order.customerName || 'Consumidor final',
          lines: lines.map((line) => ({ quantity: line.quantity, product: line.product, ...(line.notes ? { notes: line.notes } : {}), lineTotal: line.lineTotal })),
          total,
          paymentAmount: result.registeredAmount,
          paidAmount: result.paidAmount,
          pendingAmount: result.remainingAmount,
          currencySymbol,
          reference: normalizedReference,
        };

        await refreshSnapshot();
        if (printWindow && receiptPayload) {
          renderPrintWindow(printWindow, buildReceiptHtml(receiptPayload));
        }

        if (result.completed) {
          navigate('/cashier/mesas', { replace: true });
        }
      }
    } catch (err) {
      if (printWindow) {
        printWindow.close();
      }
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
      <header className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Cobro dividido por monto</p>
            <h1 className="mt-3 font-display text-3xl text-slate-950 dark:text-white sm:text-4xl lg:text-5xl">Mesa {table.code}</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400 sm:text-base">
              Cuenta: {order.code} • Cliente: {order.customerName}
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.25em] text-amber-300">Cajero logeado: {user.name}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/cashier/mesas')}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-12 sm:text-base lg:h-14 lg:px-5 lg:text-lg"
          >
            <AppIcon icon={ArrowLeft} className="h-4 w-4" />
            Volver a mesas
          </button>
        </div>
      </header>

      <main className="mx-auto mt-6 grid max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Detalle de cuenta</p>
            <div className="mt-4 space-y-2 text-sm text-slate-700 dark:text-zinc-200">
              {lines.map((item, index) => (
                <div key={`${item.product}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950 dark:text-white">
                        {item.quantity} x {item.product}
                      </p>
                      {item.notes ? <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500 dark:text-zinc-500">{item.notes}</p> : null}
                    </div>
                    <div className="shrink-0 text-right font-semibold text-slate-950 dark:text-white">
                      {item.lineTotal !== null ? formatMoney(item.lineTotal, currencySymbol) : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
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

            <div className="mt-4">
              <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Monto a cobrar</label>
              <input
                value={amountToPay}
                onChange={(event) => setAmountToPay(event.target.value)}
                placeholder={pendingAmount.toFixed(2)}
                inputMode="decimal"
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
                    className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </div>
                {method === 'TRANSFER' ? (
                  <div>
                    <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Comprobante (imagen)</label>
                    <input
                      type="file"
                      accept="image/*"
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
              disabled={submitting}
              onClick={() => void handlePay()}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-500/15 disabled:opacity-50 dark:text-white"
            >
              <AppIcon icon={Receipt} className="h-4 w-4" />
              {submitting ? 'Procesando...' : pendingAmount === amountValue ? 'Liquidar cuenta' : 'Registrar abono'}
            </button>
          </section>
        </aside>
      </main>
    </div>
  );
}
