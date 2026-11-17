import { ArrowLeftRight, Beef, CakeSlice, ChefHat, Coffee, CreditCard, Fish, GlassWater, IceCreamCone, LayoutDashboard, LogOut, Martini, Pizza, ReceiptText, Salad, Sandwich, SendHorizontal, UserRound, UtensilsCrossed } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon, type IconComponent } from '@/components/AppIcon';
import { createOrUpdateOrder, moveTableAccount } from '@/services/api';
import { usePosWizardStore } from '@/store/usePosWizardStore';
import { useSessionStore } from '@/store/useSessionStore';
import type { MenuCategory } from '@/types/restaurant';

export default function PosMenuPage() {
  const navigate = useNavigate();
  const user = useSessionStore((state) => state.user);
  const logout = useSessionStore((state) => state.logout);
  const snapshot = useSessionStore((state) => state.snapshot);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const tableId = usePosWizardStore((state) => state.tableId);
  const customerId = usePosWizardStore((state) => state.customerId);
  const customerName = usePosWizardStore((state) => state.customerName);
  const customerPhone = usePosWizardStore((state) => state.customerPhone);
  const cart = usePosWizardStore((state) => state.cart);
  const addToCart = usePosWizardStore((state) => state.addToCart);
  const incrementLine = usePosWizardStore((state) => state.incrementLine);
  const decrementLine = usePosWizardStore((state) => state.decrementLine);
  const removeLine = usePosWizardStore((state) => state.removeLine);
  const clearCart = usePosWizardStore((state) => state.clearCart);
  const reset = usePosWizardStore((state) => state.reset);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [moveToTableId, setMoveToTableId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [modalProductId, setModalProductId] = useState<number | null>(null);
  const [modalNotes, setModalNotes] = useState('');
  const [modalSauce, setModalSauce] = useState<string>('');
  const [preBillOpen, setPreBillOpen] = useState(false);

  const tables = snapshot?.tables ?? [];
  const menuCategories = snapshot?.menuCategories ?? [];
  const menuProducts = snapshot?.menuProducts ?? [];
  const activeOrders = snapshot?.activeOrders ?? [];

  const categoryGroups = useMemo(() => {
    const stationWeight = (station: 'KITCHEN' | 'BAR' | 'PASTRY') => {
      if (station === 'KITCHEN') {
        return 0;
      }
      if (station === 'BAR') {
        return 1;
      }
      return 2;
    };

    return menuCategories
      .filter((category) => !category.parentId)
      .slice()
      .sort((a, b) => stationWeight(a.station) - stationWeight(b.station));
  }, [menuCategories]);

  const activeGroup = useMemo(() => {
    if (!categoryGroups.length) {
      return null;
    }

    if (selectedGroupId) {
      return categoryGroups.find((group) => group.id === selectedGroupId) ?? categoryGroups[0];
    }

    return categoryGroups[0];
  }, [categoryGroups, selectedGroupId]);

  const subcategories = useMemo(() => {
    if (!activeGroup) {
      return [];
    }

    return menuCategories
      .filter((category) => category.parentId === activeGroup.id)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [menuCategories, activeGroup]);

  const selectedTable = useMemo(() => tables.find((item) => item.id === tableId) ?? null, [tables, tableId]);
  const activeOrder = useMemo(() => {
    if (!selectedTable) {
      return null;
    }

    return activeOrders.find((order) => order.tableCode === selectedTable.code) ?? null;
  }, [activeOrders, selectedTable]);
  const canCharge = Boolean(user?.permissions?.includes('CASH_MANAGE'));

  const preBillItems = useMemo(() => {
    if (!activeOrder) {
      return [];
    }

    return activeOrder.items.map((item) => {
      const product = menuProducts.find((productRow) => productRow.name === item.product) ?? null;
      const unitPrice = product ? product.price : null;
      const lineTotal = unitPrice !== null ? unitPrice * item.quantity : null;
      return { ...item, unitPrice, lineTotal };
    });
  }, [activeOrder, menuProducts]);

  const preBillComputedTotal = useMemo(() => {
    if (!preBillItems.length) {
      return 0;
    }
    return preBillItems.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0);
  }, [preBillItems]);
  const currencySymbol = snapshot?.brand.currencySymbol ?? 'Q';

  function escapeHtml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatMoney(amount: number) {
    return `${currencySymbol} ${amount.toFixed(2)}`;
  }

  function handlePrintPreBill() {
    if (!activeOrder) {
      return;
    }

    const brandName = snapshot?.brand?.name ?? 'Restaurante';
    const now = new Date();
    const dateLabel = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(now);
    const tableLabel = selectedTable?.code ?? activeOrder.tableCode ?? '';
    const customerLabel = activeOrder.customerName || customerName || 'Consumidor final';
    const total = activeOrder.total ?? 0;
    const hasPrices = preBillItems.some((item) => item.unitPrice !== null);
    const totalLabel = formatMoney(total);
    const totalFontSize = totalLabel.length >= 16 ? 12 : totalLabel.length >= 13 ? 13 : 14;

    const itemsHtml = preBillItems
      .map((item) => {
        const left = `${Number(item.quantity)} x ${escapeHtml(item.product)}`;
        const right = hasPrices && item.lineTotal !== null ? escapeHtml(formatMoney(item.lineTotal)) : '';
        const notes = item.notes ? `<div class="note">${escapeHtml(item.notes)}</div>` : '';
        return `<div class="row"><div class="left">${left}${notes}</div><div class="right">${right}</div></div>`;
      })
      .join('');

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Precuenta</title>
    <style>
      * { box-sizing: border-box; }
      @page { size: 80mm auto; margin: 0; }
      body { margin: 0; background: #fff; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #111; }
      .ticket { width: 80mm; padding: 3mm 3mm 2mm; margin: 0; }
      .center { text-align: center; }
      .title { font-weight: 900; font-size: 20px; letter-spacing: 0.10em; }
      .subtitle { font-weight: 900; font-size: 14px; margin-top: 4px; }
      .meta { font-size: 12px; margin-top: 8px; font-weight: 700; }
      .divider { border-top: 2px dashed #222; margin: 8px 0; }
      .row { display: flex; gap: 8px; align-items: flex-start; justify-content: space-between; font-size: 13px; padding: 6px 0; }
      .left { flex: 1 1 auto; min-width: 0; font-weight: 800; }
      .right { flex: 0 0 40%; max-width: 40%; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 900; }
      .note { font-weight: 700; font-size: 12px; opacity: 0.88; margin-top: 2px; white-space: pre-wrap; }
      .total { font-size: 15px; }
      .total .left { font-weight: 900; }
      .total .right { font-size: var(--total-size, 14px); }
      .footer { margin-top: 8px; font-size: 12px; font-weight: 900; text-align: center; letter-spacing: 0.06em; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <div class="ticket" style="--total-size: ${totalFontSize}px;">
      <div class="center">
        <div class="subtitle">${escapeHtml(brandName)}</div>
        <div class="title">PRECUENTA</div>
        <div class="meta">${escapeHtml(dateLabel)}</div>
      </div>
      <div class="divider"></div>
      <div class="meta"><strong>Mesa:</strong> ${escapeHtml(tableLabel)}<br/><strong>Cliente:</strong> ${escapeHtml(customerLabel)}<br/><strong>Cuenta:</strong> ${escapeHtml(activeOrder.code)}</div>
      <div class="divider"></div>
      ${itemsHtml || '<div class="meta">Sin items.</div>'}
      <div class="divider"></div>
      <div class="row total"><div class="left">TOTAL</div><div class="right">${escapeHtml(totalLabel)}</div></div>
      ${hasPrices ? '' : '<div class="meta">* Los precios por línea pueden no estar disponibles en esta vista.</div>'}
      <div class="footer">NO ES COMPROBANTE DE PAGO</div>
    </div>
    <script>
      window.onload = () => { window.print(); };
      window.onafterprint = () => { window.close(); };
    </script>
  </body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=420,height=700');
    if (!printWindow) {
      return;
    }
    try {
      printWindow.opener = null;
    } catch {
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  }

  const selectedCategory = useMemo(() => {
    if (!subcategories.length) {
      return null;
    }

    if (selectedCategoryId) {
      return subcategories.find((category) => category.id === selectedCategoryId) ?? subcategories[0];
    }

    return subcategories[0];
  }, [subcategories, selectedCategoryId]);

  const productsForCategory = useMemo(() => {
    if (!selectedCategory) {
      return [];
    }

    return menuProducts.filter((product) => product.categoryId === selectedCategory.id);
  }, [menuProducts, selectedCategory]);

  const cartLines = useMemo(() => Object.values(cart), [cart]);
  const cartTotal = useMemo(() => {
    return cartLines.reduce((sum, line) => {
      const product = menuProducts.find((item) => item.id === line.productId);
      return sum + (product ? product.price * line.quantity : 0);
    }, 0);
  }, [cartLines, menuProducts]);

  const destinationTables = useMemo(
    () => tables.filter((table) => table.id !== tableId && table.status !== 'OCCUPIED'),
    [tables, tableId],
  );

  async function handleSend() {
    if (!selectedTable) {
      navigate('/pos/mesas');
      return;
    }

    if (!customerName.trim() && !activeOrder) {
      navigate('/pos/cliente');
      return;
    }

    if (!cartLines.length) {
      setError('Agrega al menos un producto.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const customer = customerName.trim()
        ? {
            name: customerName.trim(),
            phone: customerPhone.trim() || undefined,
          }
        : undefined;

      await createOrUpdateOrder({
        tableId: selectedTable.id,
        ...(customerId ? { customerId } : {}),
        ...(customer ? { customer } : {}),
        type: 'DINE_IN',
        items: cartLines.map((line) => {
          const combinedNotes = [line.notes, line.sauce ? `Salsa/Aderezo: ${line.sauce}` : '']
            .map((part) => part.trim())
            .filter(Boolean)
            .join('\n');

          return {
            productId: line.productId,
            quantity: line.quantity,
            ...(combinedNotes ? { notes: combinedNotes } : {}),
          };
        }),
      });
      clearCart();
      await refreshSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible registrar el pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMoveTable() {
    if (!selectedTable || !moveToTableId) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await moveTableAccount({ fromTableId: selectedTable.id, toTableId: moveToTableId });
      await refreshSnapshot();
      usePosWizardStore.getState().setTable(moveToTableId);
      setMoveToTableId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible mover la cuenta.');
    } finally {
      setSubmitting(false);
    }
  }

  function stationLabel(station: 'KITCHEN' | 'BAR' | 'PASTRY') {
    if (station === 'BAR') {
      return 'Bar';
    }

    if (station === 'PASTRY') {
      return 'Pastelería';
    }

    return 'Cocina';
  }

  function getCategoryIcon(category: MenuCategory): IconComponent {
    const name = category.name.trim().toLowerCase();

    if (name.includes('pizza')) {
      return Pizza;
    }
    if (name.includes('hamburg') || name.includes('burger') || name.includes('sandwich') || name.includes('panini')) {
      return Sandwich;
    }
    if (name.includes('ensalada') || name.includes('veg')) {
      return Salad;
    }
    if (name.includes('carne') || name.includes('pollo') || name.includes('parrilla') || name.includes('res')) {
      return Beef;
    }
    if (name.includes('marisco') || name.includes('pescado') || name.includes('ceviche')) {
      return Fish;
    }
    if (name.includes('cafe') || name.includes('desayuno')) {
      return Coffee;
    }
    if (name.includes('helado')) {
      return IceCreamCone;
    }
    if (name.includes('postre') || name.includes('torta') || name.includes('pastel') || name.includes('dulce')) {
      return CakeSlice;
    }
    if (name.includes('bebida') || name.includes('refresco') || name.includes('jugo') || name.includes('soda')) {
      return GlassWater;
    }
    if (name.includes('licor') || name.includes('coctel') || name.includes('vino') || name.includes('cerveza')) {
      return Martini;
    }

    if (category.station === 'BAR') {
      return Martini;
    }

    if (category.station === 'PASTRY') {
      return CakeSlice;
    }

    return ChefHat;
  }

  const sauceOptions = useMemo(
    () => [
      '',
      'Sin salsa',
      'Mayonesa',
      'Ketchup',
      'Mostaza',
      'BBQ',
      'Chipotle',
      'Ranch',
      'César',
      'Vinagreta',
      'Ají / Picante',
    ],
    [],
  );

  const modalProduct = useMemo(
    () => (modalProductId ? menuProducts.find((item) => item.id === modalProductId) ?? null : null),
    [menuProducts, modalProductId],
  );

  function openProductModal(productId: number) {
    setModalProductId(productId);
    setModalNotes('');
    setModalSauce('');
    setProductModalOpen(true);
  }

  function closeProductModal() {
    setProductModalOpen(false);
    setModalProductId(null);
    setModalNotes('');
    setModalSauce('');
  }

  function confirmAddProduct() {
    if (!modalProductId) {
      return;
    }

    addToCart({
      productId: modalProductId,
      notes: modalNotes,
      sauce: modalSauce ? modalSauce : null,
    });
    closeProductModal();
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-900 dark:bg-[#07070a] dark:text-white sm:px-6 sm:py-6 lg:px-10 lg:py-8">
      <header className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">POS</p>
            <h1 className="mt-3 font-display text-3xl text-slate-950 dark:text-white sm:text-4xl lg:text-5xl 2xl:text-6xl">Menú</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400 sm:text-base lg:text-lg">
              Mesa: {selectedTable?.code ?? 'No seleccionada'} • Cliente: {customerName || '—'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-12 sm:text-base lg:h-14 lg:px-5 lg:text-lg"
            >
              <AppIcon icon={LayoutDashboard} className="h-4 w-4" />
              Panel
            </button>
            <button
              type="button"
              onClick={() => navigate('/pos/mesas')}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-12 sm:text-base lg:h-14 lg:px-5 lg:text-lg"
            >
              <AppIcon icon={UtensilsCrossed} className="h-4 w-4" />
              Mesas
            </button>
            <button
              type="button"
              onClick={() => navigate('/pos/cliente')}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-12 sm:text-base lg:h-14 lg:px-5 lg:text-lg"
            >
              <AppIcon icon={UserRound} className="h-4 w-4" />
              Cliente
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                navigate('/pos/mesas');
              }}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-12 sm:text-base lg:h-14 lg:px-5 lg:text-lg"
            >
              <AppIcon icon={ArrowLeftRight} className="h-4 w-4" />
              Cambiar mesa
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

      <main className="mx-auto mt-6 grid max-w-7xl gap-6 sm:mt-8 lg:mt-10 lg:grid-cols-[1.15fr_0.85fr] 2xl:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:p-5 lg:p-6">
          <div className="flex flex-wrap gap-2">
            {categoryGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setSelectedCategoryId(null);
                }}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition sm:px-5 sm:py-2.5 sm:text-base lg:text-lg ${
                  activeGroup?.id === group.id
                    ? 'border-amber-300/40 bg-amber-300/10 text-amber-950 dark:text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${activeGroup?.id === group.id ? 'border-amber-300/20 bg-amber-300/10 text-amber-700 dark:text-amber-200' : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300'}`}>
                    <AppIcon icon={getCategoryIcon(group)} className="h-4 w-4" />
                  </span>
                  <span>{group.name}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {subcategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategoryId(category.id)}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition sm:text-base ${
                  selectedCategory?.id === category.id
                    ? 'border-emerald-300/40 bg-emerald-500/10 text-emerald-950 dark:text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${selectedCategory?.id === category.id ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200' : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300'}`}>
                    <AppIcon icon={getCategoryIcon(category)} className="h-4 w-4" />
                  </span>
                  <span>{category.name}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {productsForCategory.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => openProductModal(product.id)}
                className="rounded-[24px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-zinc-950/40 dark:shadow-none dark:hover:bg-zinc-950/55 sm:p-5 lg:p-6"
              >
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="mb-4 aspect-[4/3] w-full rounded-[18px] border border-slate-200 object-cover dark:border-white/10"
                    loading="lazy"
                  />
                ) : (
                  <div className="mb-4 aspect-[4/3] w-full rounded-[18px] border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]" />
                )}
                <p className="font-semibold text-slate-950 dark:text-white sm:text-lg lg:text-xl">{product.name}</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400 sm:text-base lg:text-lg">
                  {currencySymbol} {product.price.toFixed(2)}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">{stationLabel(product.station)}</p>
              </button>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:p-5 lg:p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Cuenta</p>
            <div className="mt-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-white/8 dark:bg-black/20 dark:text-zinc-200 sm:text-base lg:text-lg">
              <p className="flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-zinc-400">Código</span>
                <span className="font-semibold text-slate-950 dark:text-white">{activeOrder?.code ?? 'Sin cuenta'}</span>
              </p>
              <p className="mt-2 flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-zinc-400">Total actual</span>
                <span className="font-semibold text-slate-950 dark:text-white">
                  {currencySymbol} {(activeOrder?.total ?? 0).toFixed(2)}
                </span>
              </p>
            </div>

            {activeOrder ? (
              <div className={`mt-4 grid gap-2 ${canCharge ? 'sm:grid-cols-2' : ''}`}>
                <button
                  type="button"
                  onClick={() => setPreBillOpen(true)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-sky-300/30 bg-sky-500/10 px-4 text-sm font-semibold text-sky-900 transition hover:bg-sky-500/15 dark:text-white sm:h-12 sm:text-base lg:h-14 lg:text-lg"
                >
                  <AppIcon icon={ReceiptText} className="h-4 w-4" />
                  Precuenta
                </button>
                {canCharge ? (
                  <button
                    type="button"
                    onClick={() => navigate('/caja')}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-500/15 dark:text-white sm:h-12 sm:text-base lg:h-14 lg:text-lg"
                  >
                    <AppIcon icon={CreditCard} className="h-4 w-4" />
                    Cobrar
                  </button>
                ) : null}
              </div>
            ) : null}

            {activeOrder ? (
              <div className="mt-4 space-y-2 text-sm text-slate-700 dark:text-zinc-200">
                {activeOrder.items.map((item, index) => (
                  <div
                    key={`${item.product}-${item.quantity}-${index}`}
                    className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/[0.03]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-slate-950 dark:text-white">{item.product}</p>
                      {item.notes ? <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500 dark:text-zinc-500">{item.notes}</p> : null}
                    </div>
                    <span className="shrink-0">x{item.quantity}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500 dark:text-zinc-500">Al enviar el primer pedido se abrirá la cuenta.</p>
            )}
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:p-5 lg:p-6">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Nuevo pedido</p>
              <button
                type="button"
                onClick={clearCart}
                className="text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900 dark:text-zinc-300 dark:decoration-white/20 dark:hover:text-white"
              >
                Limpiar
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {cartLines.length ? (
                cartLines.map((line) => {
                  const product = menuProducts.find((item) => item.id === line.productId);
                  if (!product) {
                    return null;
                  }

                  const details = [line.sauce ? `Salsa: ${line.sauce}` : '', line.notes].filter(Boolean).join(' • ');

                  return (
                    <div
                      key={line.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-white/[0.03] dark:text-zinc-200 sm:text-base lg:text-lg"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-slate-950 dark:text-white">{product.name}</p>
                        <p className="text-xs text-slate-500 dark:text-zinc-500">
                          {stationLabel(product.station)}
                          {details ? ` • ${details}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => decrementLine(line.id)}
                          className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-100 dark:border-white/10 dark:bg-black/20 dark:text-white dark:hover:bg-white/[0.06] sm:h-11 sm:w-11"
                        >
                          -
                        </button>
                        <span className="w-6 text-center text-slate-950 dark:text-white">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => incrementLine(line.id)}
                          className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-100 dark:border-white/10 dark:bg-black/20 dark:text-white dark:hover:bg-white/[0.06] sm:h-11 sm:w-11"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-100 dark:border-white/10 dark:bg-black/20 dark:text-white dark:hover:bg-white/[0.06] sm:h-11 sm:w-11"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500 dark:text-zinc-500">Agrega productos desde el menú.</p>
              )}
            </div>

            {error ? (
              <div className="mt-4 rounded-[22px] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200 sm:text-base">
                {error}
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-between text-sm text-slate-700 dark:text-zinc-200">
              <span>Total nuevo</span>
              <span className="font-semibold text-slate-950 dark:text-white">
                {currencySymbol} {cartTotal.toFixed(2)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={submitting}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white sm:h-14 sm:text-base lg:h-16 lg:text-lg"
            >
              <AppIcon icon={SendHorizontal} className="h-4 w-4" />
              {submitting ? 'Enviando...' : 'Enviar a comandas'}
            </button>
          </section>

          {activeOrder && destinationTables.length ? (
            <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:p-5 lg:p-6">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Mover cuenta</p>
              <div className="mt-3 flex gap-2">
                <select
                  value={moveToTableId ?? ''}
                  onChange={(event) => setMoveToTableId(event.target.value ? Number(event.target.value) : null)}
                  className="h-12 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:h-14 sm:text-base lg:h-16 lg:text-lg"
                >
                  <option value="">Mesa destino</option>
                  {destinationTables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.code} ({table.area})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={submitting || !moveToTableId}
                  onClick={() => void handleMoveTable()}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-500/15 disabled:opacity-50 dark:text-white sm:h-14 sm:px-5 sm:text-base lg:h-16 lg:text-lg"
                >
                  <AppIcon icon={ArrowLeftRight} className="h-4 w-4" />
                  Mover
                </button>
              </div>
            </section>
          ) : null}
        </aside>
      </main>

      {productModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 dark:bg-black/60">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b0b10] dark:text-white dark:shadow-none sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Detalle del item</p>
                <h2 className="mt-2 truncate font-display text-2xl text-slate-950 dark:text-white sm:text-3xl">{modalProduct?.name ?? 'Producto'}</h2>
              </div>
              <button
                type="button"
                onClick={closeProductModal}
                className="h-10 w-10 rounded-2xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
              >
                ×
              </button>
            </div>

            {modalProduct?.imageUrl ? (
              <img
                src={modalProduct.imageUrl}
                alt={modalProduct.name}
                className="mt-4 aspect-[4/3] w-full rounded-[22px] border border-slate-200 object-cover dark:border-white/10"
                loading="lazy"
              />
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Salsa / aderezo</label>
                <select
                  value={modalSauce}
                  onChange={(event) => setModalSauce(event.target.value)}
                  className="mt-3 h-12 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:h-14 sm:text-base lg:h-16 lg:text-lg"
                >
                  {sauceOptions.map((option) => (
                    <option key={option || 'none'} value={option}>
                      {option ? option : 'Seleccionar'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Observaciones</label>
                <textarea
                  value={modalNotes}
                  onChange={(event) => setModalNotes(event.target.value)}
                  placeholder="Ej: sin cebolla, término medio, huevos al gusto..."
                  rows={4}
                  className="mt-3 w-full resize-none rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:text-base lg:text-lg"
                />
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeProductModal}
                className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-14 sm:text-base lg:h-16 lg:text-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmAddProduct}
                className="h-12 rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white sm:h-14 sm:text-base lg:h-16 lg:text-lg"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {preBillOpen && activeOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 dark:bg-black/60">
          <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b0b10] dark:text-white dark:shadow-none sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Cuenta</p>
                <h2 className="mt-2 truncate font-display text-2xl text-slate-950 dark:text-white sm:text-3xl">Precuenta</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400 sm:text-base">
                  Mesa: {selectedTable?.code ?? activeOrder.tableCode ?? '—'} • Cliente: {activeOrder.customerName || customerName || 'Consumidor final'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreBillOpen(false)}
                className="h-10 w-10 rounded-2xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
              >
                ×
              </button>
            </div>

            <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-200 sm:text-base">
              <p className="flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-zinc-400">Cuenta</span>
                <span className="font-semibold text-slate-950 dark:text-white">{activeOrder.code}</span>
              </p>
              <p className="mt-2 flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-zinc-400">Total</span>
                <span className="font-semibold text-slate-950 dark:text-white">{formatMoney(activeOrder.total ?? 0)}</span>
              </p>
              {preBillComputedTotal > 0 && Math.abs(preBillComputedTotal - (activeOrder.total ?? 0)) > 0.01 ? (
                <p className="mt-2 text-xs text-slate-500 dark:text-zinc-500">Detalle calculado: {formatMoney(preBillComputedTotal)}</p>
              ) : null}
            </div>

            <div className="mt-4 max-h-[52vh] space-y-2 overflow-auto pr-1 text-sm text-slate-700 dark:text-zinc-200">
              {preBillItems.length ? (
                preBillItems.map((item, index) => (
                  <div key={`${item.product}-${item.quantity}-${index}`} className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/[0.03]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-slate-950 dark:text-white">
                          {item.quantity} x {item.product}
                        </p>
                        {item.notes ? <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500 dark:text-zinc-500">{item.notes}</p> : null}
                      </div>
                      <div className="shrink-0 text-right font-semibold text-slate-950 dark:text-white">
                        {item.lineTotal !== null ? formatMoney(item.lineTotal) : ''}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 dark:text-zinc-500">Sin items.</p>
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPreBillOpen(false)}
                className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-14 sm:text-base lg:h-16 lg:text-lg"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handlePrintPreBill}
                className="h-12 rounded-2xl border border-sky-300/30 bg-sky-500/10 text-sm font-semibold text-sky-900 transition hover:bg-sky-500/15 dark:text-white sm:h-14 sm:text-base lg:h-16 lg:text-lg"
              >
                Imprimir
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
