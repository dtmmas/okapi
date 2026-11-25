import { Banknote, Check, ChefHat, CreditCard, Landmark, Pencil, Printer, Receipt, Salad, Split, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ActiveUserLabel } from '@/components/ActiveUserLabel';
import { AppIcon } from '@/components/AppIcon';
import { getAreaIcon } from '@/lib/area-icons';
import { getCategoryIcon } from '@/lib/menu-category-icon';
import { isMenuSectionVisibleInPos } from '@/lib/menu-sections';
import { getSortedAreas, normalizeAreaName, sortTablesInArea } from '@/lib/tables';
import { openReceiptPrintSession, printReceipt } from '@/lib/printing/print-service';
import { receiptItemNote } from '@/lib/printing/receipt-builders';
import { assignCounterOrderTable, createCounterOrder } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';
import type { MenuCategory } from '@/types/restaurant';
import type { ReceiptDocument, ReceiptSection } from '@/types/printing';

type PayMethod = 'CASH' | 'CARD' | 'TRANSFER';
type SplitMode = 'AMOUNT' | 'EQUAL' | 'ITEMS';
type RegisteredPayment = {
  method: PayMethod;
  amount: number;
  receivedAmount: number | null;
  reference: string | null;
  proofImage: string | null;
  lineIds: string[];
};
type CounterReceiptLine = { quantity: number; product: string; notes?: string; lineTotal: number };
type CounterReceiptPayment = {
  method: PayMethod;
  amount: number;
  receivedAmount: number | null;
  reference: string | null;
  collectedByName: string;
  createdAt: string;
};
type PaidCounterOrder = {
  id: number;
  code: string;
  total: number;
  change: number;
  customerName?: string;
  lines?: CounterReceiptLine[];
  payments?: CounterReceiptPayment[];
};

function formatPaymentMethodLabel(method: PayMethod | 'MIXED') {
  return method === 'CASH' ? 'EFECTIVO' : method === 'CARD' ? 'TARJETA' : method === 'TRANSFER' ? 'TRANSFERENCIA' : 'MIXTO';
}
type MenuSection = 'DISHES' | 'BEVERAGES' | 'PRODUCTS' | 'EXTRAS' | 'SAUCES' | 'DRESSINGS';
type ModifierSection = 'SAUCES' | 'DRESSINGS';
type ModifierOption = { id: number; label: string; imageUrl?: string | null; section: ModifierSection; price: number };
type CartLine = { id: string; productId: number; quantity: number; notes: string; sauces: string[]; dressings: string[] };

function normalizeLabel(value?: string | null) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function inferSectionFromName(name?: string | null): MenuSection | null {
  const normalized = normalizeLabel(name);
  if (!normalized) return null;
  if (normalized.includes('salsa')) return 'SAUCES';
  if (normalized.includes('aderezo') || normalized.includes('alino') || normalized.includes('dressing')) return 'DRESSINGS';
  if (normalized === 'extras' || normalized === 'extra') return 'EXTRAS';
  if (normalized === 'bebidas' || normalized === 'bebida') return 'BEVERAGES';
  if (normalized === 'platillos' || normalized === 'platillo') return 'DISHES';
  if (normalized === 'productos' || normalized === 'producto') return 'PRODUCTS';
  return null;
}

function productSupportsModifiers(
  product: { name: string; isPrepared: boolean; station: 'KITCHEN' | 'BAR' | 'PASTRY' },
  category?: MenuCategory | null,
  section?: MenuSection | null,
) {
  const resolvedSection = section ?? (product.isPrepared ? 'DISHES' : 'PRODUCTS');
  if (resolvedSection !== 'DISHES' || product.station !== 'KITCHEN') return false;
  const blocked = ['bebida', 'refresco', 'soda', 'jugo', 'agua', 'cafe', 'te', 'licor', 'vino', 'cerveza', 'coctel', 'cocktail', 'batido', 'smoothie', 'postre', 'helado', 'pastel', 'torta', 'flan', 'cheesecake'];
  const haystack = [product.name, category?.name ?? ''].map((value) => normalizeLabel(value)).join(' ');
  return !blocked.some((keyword) => haystack.includes(keyword));
}

function stationLabel(station: 'KITCHEN' | 'BAR' | 'PASTRY') {
  if (station === 'BAR') return 'Bar';
  if (station === 'PASTRY') return 'Pastelería';
  return 'Cocina';
}

export default function CashierCounterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const assignOrderId = (location.state as { assignOrderId?: number } | null)?.assignOrderId ?? null;
  const snapshot = useSessionStore((state) => state.snapshot);
  const user = useSessionStore((state) => state.user);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const [step, setStep] = useState<'ORDER' | 'PAY' | 'TABLE'>('ORDER');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [method, setMethod] = useState<PayMethod>('CASH');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [reference, setReference] = useState('');
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>('AMOUNT');
  const [splitPeopleCount, setSplitPeopleCount] = useState(2);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [registeredPayments, setRegisteredPayments] = useState<RegisteredPayment[]>([]);
  const [amountToPay, setAmountToPay] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidOrder, setPaidOrder] = useState<PaidCounterOrder | null>(null);
  const [activeArea, setActiveArea] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [pickerCategoryId, setPickerCategoryId] = useState<number | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [modalProductId, setModalProductId] = useState<number | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [modalNotes, setModalNotes] = useState('');
  const [modalSauces, setModalSauces] = useState<string[]>([]);
  const [modalDressings, setModalDressings] = useState<string[]>([]);
  const [modifierDialogSection, setModifierDialogSection] = useState<ModifierSection | null>(null);
  const [modifierDraftSelection, setModifierDraftSelection] = useState<string[]>([]);

  const cashShiftOpen = Boolean(snapshot?.cashShift?.isOpen);
  const currency = snapshot?.brand.currencySymbol ?? 'Q';
  const menuCategories = snapshot?.menuCategories ?? [];
  const menuProducts = snapshot?.menuProducts ?? [];
  const tables = (snapshot?.tables ?? []).filter((table) => !user?.branchId || table.branchId === user.branchId);

  useEffect(() => {
    if (snapshot && !cashShiftOpen) navigate('/caja', { replace: true });
  }, [cashShiftOpen, navigate, snapshot]);

  useEffect(() => {
    if (!assignOrderId || !snapshot) return;
    const existing = snapshot.unassignedCounterOrders.find((order) => order.id === assignOrderId);
    if (!existing) return;
    setPaidOrder({ id: existing.id, code: existing.code, total: existing.total, change: 0 });
    setStep('TABLE');
  }, [assignOrderId, snapshot]);

  const categoryById = useMemo(() => new Map(menuCategories.map((category) => [category.id, category])), [menuCategories]);
  const menuProductById = useMemo(() => new Map(menuProducts.map((product) => [product.id, product])), [menuProducts]);
  const categorySectionById = useMemo(() => {
    function resolveCategorySection(category: MenuCategory, seen = new Set<number>()): MenuSection {
      if (seen.has(category.id)) return category.station === 'BAR' ? 'PRODUCTS' : 'DISHES';
      seen.add(category.id);
      const explicitSection = inferSectionFromName(category.name);
      if (explicitSection) return explicitSection;
      if (category.parentId) {
        const parent = categoryById.get(category.parentId);
        if (parent) return resolveCategorySection(parent, seen);
      }
      return category.station === 'BAR' ? 'PRODUCTS' : 'DISHES';
    }
    return new Map(menuCategories.map((category) => [category.id, resolveCategorySection(category)] as const));
  }, [categoryById, menuCategories]);

  const categoryGroups = useMemo(() => {
    const groupOrder = (category: MenuCategory) => {
      const normalized = normalizeLabel(category.name);
      if (normalized === 'platillos' || normalized === 'platillo') return 0;
      if (normalized === 'bebidas' || normalized === 'bebida') return 1;
      if (normalized === 'productos' || normalized === 'producto') return 2;
      if (normalized === 'postres' || normalized === 'postre') return 3;
      if (normalized === 'extras' || normalized === 'extra') return 4;
      return 5;
    };
    return menuCategories
      .filter((category) => !category.parentId && isMenuSectionVisibleInPos(category))
      .slice()
      .sort((a, b) => groupOrder(a) - groupOrder(b) || a.name.localeCompare(b.name, 'es'));
  }, [menuCategories]);

  const activeGroup = useMemo(() => {
    if (!categoryGroups.length) return null;
    if (selectedGroupId) return categoryGroups.find((group) => group.id === selectedGroupId) ?? categoryGroups[0];
    return categoryGroups[0];
  }, [categoryGroups, selectedGroupId]);

  const subcategories = useMemo(() => {
    if (!activeGroup) return [];
    return menuCategories.filter((category) => category.parentId === activeGroup.id).slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [activeGroup, menuCategories]);

  function sectionColor(category: MenuCategory | null | undefined, fallback: string) {
    let current = category;
    const seen = new Set<number>();
    while (current) {
      if (current.color) return current.color;
      if (!current.parentId || seen.has(current.id)) break;
      seen.add(current.id);
      current = categoryById.get(current.parentId) ?? null;
    }
    return fallback;
  }

  function collectCategoryTreeIds(parentId: number) {
    const ids = new Set<number>([parentId]);
    const queue = [parentId];
    while (queue.length) {
      const currentId = queue.shift();
      if (!currentId) continue;
      menuCategories.forEach((category) => {
        if (category.parentId === currentId && !ids.has(category.id)) {
          ids.add(category.id);
          queue.push(category.id);
        }
      });
    }
    return ids;
  }

  const pickerCategory = pickerCategoryId ? categoryById.get(pickerCategoryId) ?? null : null;
  const pickerChildCategories = pickerCategory
    ? menuCategories.filter((category) => category.parentId === pickerCategory.id).slice().sort((a, b) => a.name.localeCompare(b.name, 'es'))
    : [];
  const pickerProducts = pickerCategory
    ? menuProducts
        .filter((product) => product.categoryId && collectCategoryTreeIds(pickerCategory.id).has(product.categoryId))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    : [];

  const modifierOptions = useMemo(() => {
    const uniqueNames = new Map<string, ModifierOption>();
    menuProducts.forEach((product) => {
      if (!product.categoryId) return;
      const section = categorySectionById.get(product.categoryId);
      if (section !== 'SAUCES' && section !== 'DRESSINGS') return;
      const normalizedName = normalizeLabel(product.name);
      if (!normalizedName || uniqueNames.has(normalizedName)) return;
      uniqueNames.set(normalizedName, { id: product.id, label: product.name, imageUrl: product.imageUrl ?? null, section, price: Number(product.price ?? 0) });
    });
    return Array.from(uniqueNames.values()).sort((a, b) => a.section.localeCompare(b.section) || a.label.localeCompare(b.label, 'es'));
  }, [categorySectionById, menuProducts]);
  const modifierOptionByName = useMemo(() => new Map(modifierOptions.map((option) => [normalizeLabel(option.label), option] as const)), [modifierOptions]);
  const activeModifierOptions = modifierOptions.filter((option) => option.section === modifierDialogSection);

  function modifierTotal(labels: string[]) {
    return labels.reduce((sum, label) => sum + (modifierOptionByName.get(normalizeLabel(label))?.price ?? 0), 0);
  }

  const total = cart.reduce((sum, line) => {
    const product = menuProductById.get(line.productId);
    if (!product) return sum;
    return sum + (product.price + modifierTotal(line.sauces) + modifierTotal(line.dressings)) * line.quantity;
  }, 0);

  const modalProduct = modalProductId ? menuProductById.get(modalProductId) ?? null : null;
  const modalProductCategory = modalProduct?.categoryId ? categoryById.get(modalProduct.categoryId) ?? null : null;
  const modalProductSection = modalProduct?.categoryId ? categorySectionById.get(modalProduct.categoryId) ?? null : null;
  const modalProductAllowsModifiers = modalProduct ? productSupportsModifiers(modalProduct, modalProductCategory, modalProductSection) : false;

  const freeTables = useMemo(() => tables.filter((table) => table.status === 'FREE'), [tables]);
  const areaTabs = useMemo(() => getSortedAreas(freeTables.map((table) => table.area), snapshot?.tableAreas ?? []), [freeTables, snapshot?.tableAreas]);
  const visibleTables = useMemo(() => {
    const area = activeArea || areaTabs[0] || '';
    return sortTablesInArea(freeTables.filter((table) => !area || normalizeAreaName(table.area) === area));
  }, [activeArea, areaTabs, freeTables]);

  function upsertLine(lineId: string | null, payload: { productId: number; notes: string; sauces: string[]; dressings: string[] }) {
    const notes = payload.notes.trim();
    const sauces = [...new Set(payload.sauces.map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    const dressings = [...new Set(payload.dressings.map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    setCart((current) => {
      const same = current.find((line) => line.id !== lineId && line.productId === payload.productId && line.notes === notes && line.sauces.join('||') === sauces.join('||') && line.dressings.join('||') === dressings.join('||'));
      const existing = lineId ? current.find((line) => line.id === lineId) : null;
      if (same) {
        return current
          .filter((line) => line.id !== lineId)
          .map((line) => (line.id === same.id ? { ...line, quantity: line.quantity + (existing?.quantity ?? 1) } : line));
      }
      if (existing) return current.map((line) => (line.id === existing.id ? { ...line, productId: payload.productId, notes, sauces, dressings } : line));
      return [...current, { id: `L${Date.now()}${Math.random().toString(16).slice(2)}`, productId: payload.productId, quantity: 1, notes, sauces, dressings }];
    });
  }

  function openProductModal(productId: number, lineId?: string | null) {
    const existing = lineId ? cart.find((line) => line.id === lineId) ?? null : null;
    setProductPickerOpen(false);
    setPickerCategoryId(null);
    setModalProductId(productId);
    setEditingLineId(existing?.id ?? null);
    setModalNotes(existing?.notes ?? '');
    setModalSauces(existing?.sauces ?? []);
    setModalDressings(existing?.dressings ?? []);
    setModifierDialogSection(null);
    setProductModalOpen(true);
  }

  function confirmAddProduct() {
    if (!modalProductId) return;
    upsertLine(editingLineId, {
      productId: modalProductId,
      notes: modalNotes,
      sauces: modalProductAllowsModifiers ? modalSauces : [],
      dressings: modalProductAllowsModifiers ? modalDressings : [],
    });
    setProductModalOpen(false);
  }

  function lineAmount(line: CartLine) {
    const product = menuProductById.get(line.productId);
    if (!product) return 0;
    return (product.price + modifierTotal(line.sauces) + modifierTotal(line.dressings)) * line.quantity;
  }

  const paidAmount = Number(registeredPayments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2));
  const pendingAmount = Number(Math.max(0, total - paidAmount).toFixed(2));
  const paidLineIds = new Set(registeredPayments.flatMap((payment) => payment.lineIds));
  const amountValue = Number(amountToPay || 0);

  function orderItems() {
    return cart.flatMap((line) => {
      const product = menuProductById.get(line.productId);
      const notes = [line.sauces.length ? `Salsas: ${line.sauces.join(', ')}` : '', line.dressings.length ? `Aderezos: ${line.dressings.join(', ')}` : '', line.notes]
        .map((part) => part.trim())
        .filter(Boolean)
        .join('\n');
      const extras = [...line.sauces, ...line.dressings]
        .map((label) => modifierOptionByName.get(normalizeLabel(label)))
        .filter((option): option is ModifierOption => Boolean(option && option.price > 0));
      return [
        { productId: line.productId, quantity: line.quantity, ...(notes ? { notes } : {}) },
        ...extras.map((option) => ({ productId: option.id, quantity: line.quantity, notes: `Cobro adicional para ${product?.name ?? 'producto'}` })),
      ];
    });
  }

  function cartReceiptLines(lineIds: string[] = []) {
    const source = lineIds.length ? cart.filter((line) => lineIds.includes(line.id)) : cart;
    return source.map((line) => {
      const product = menuProductById.get(line.productId);
      const notes = [line.sauces.length ? `Salsas: ${line.sauces.join(', ')}` : '', line.dressings.length ? `Aderezos: ${line.dressings.join(', ')}` : '', line.notes]
        .map((part) => part.trim())
        .filter(Boolean)
        .join('\n');
      return {
        quantity: line.quantity,
        product: product?.name ?? 'Producto',
        ...(notes ? { notes } : {}),
        lineTotal: lineAmount(line),
      };
    });
  }

  function toReceiptPayments(payments: RegisteredPayment[]): CounterReceiptPayment[] {
    const collectedByName = user?.name ?? 'Sin registrar';
    const createdAt = new Date().toISOString();
    return payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount,
      receivedAmount: payment.receivedAmount,
      reference: payment.reference,
      collectedByName,
      createdAt,
    }));
  }

  function buildCounterReceipt(payload: {
    title: string;
    orderCode: string;
    customerName: string;
    accountTotal: number;
    lines: CounterReceiptLine[];
    payments: CounterReceiptPayment[];
    paymentAmount: number;
    paidAmount: number;
    pendingAmount: number;
    showPaymentsHistory: boolean;
    showPaymentMeta: boolean;
    footerLabel: string;
  }): ReceiptDocument {
    const currentPayment = payload.payments.at(-1);
    const previousPaidAmount = Math.max(0, Number((payload.paidAmount - payload.paymentAmount).toFixed(2)));
    const sections: ReceiptSection[] = [];
    if (payload.showPaymentsHistory && payload.payments.length) {
      sections.push({
        title: 'PAGOS REGISTRADOS',
        entries: payload.payments.map((payment) => ({
          title: formatPaymentMethodLabel(payment.method),
          lines: [
            `${currency} ${payment.amount.toFixed(2)}`,
            `Cobró: ${payment.collectedByName}`,
            ...(payment.reference ? [`Ref: ${payment.reference}`] : []),
          ],
        })),
      });
    }
    if (payload.showPaymentMeta && currentPayment) {
      sections.push({
        entries: [
          {
            lines:
              currentPayment.method === 'CASH'
                ? [
                    `Pago: ${formatPaymentMethodLabel(currentPayment.method)}`,
                    `Pago actual: ${currency} ${payload.paymentAmount.toFixed(2)}`,
                    `Recibido: ${currency} ${(currentPayment.receivedAmount ?? 0).toFixed(2)}`,
                    `Cambio: ${currency} ${Math.max(0, (currentPayment.receivedAmount ?? 0) - currentPayment.amount).toFixed(2)}`,
                  ]
                : [
                    `Pago: ${formatPaymentMethodLabel(currentPayment.method)}`,
                    `Pago actual: ${currency} ${payload.paymentAmount.toFixed(2)}`,
                    `Referencia: ${currentPayment.reference ?? ''}`,
                  ],
          },
        ],
      });
    }
    return {
      title: payload.title,
      brandName: snapshot?.brand?.name ?? 'Restaurante',
      printedAt: new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()),
      metadata: [
        { label: 'Abrió el pedido', value: user?.name ?? 'Sin registrar' },
        ...(payload.paymentAmount > 0 ? [{ label: 'Cobró', value: currentPayment?.collectedByName ?? user?.name ?? 'Sin registrar' }] : []),
        { label: 'Mesa', value: 'Mostrador' },
        { label: 'Cliente', value: payload.customerName },
        { label: 'Cuenta', value: payload.orderCode },
      ],
      items: payload.lines.map((item) => ({
        left: `${item.quantity} x ${item.product}`,
        right: `${currency} ${item.lineTotal.toFixed(2)}`,
        note: receiptItemNote({ notes: item.notes, sentByName: user?.name }),
      })),
      summary: [
        { label: 'TOTAL CUENTA', value: `${currency} ${payload.accountTotal.toFixed(2)}` },
        ...(previousPaidAmount > 0 ? [{ label: 'ABONOS PREVIOS', value: `${currency} ${previousPaidAmount.toFixed(2)}` }] : []),
        { label: payload.pendingAmount > 0 ? 'ABONO REGISTRADO' : 'PAGO ACTUAL', value: `${currency} ${payload.paymentAmount.toFixed(2)}` },
        ...(previousPaidAmount > 0 || payload.pendingAmount > 0 ? [{ label: 'TOTAL ABONADO', value: `${currency} ${payload.paidAmount.toFixed(2)}` }] : []),
        { label: 'SALDO PENDIENTE', value: `${currency} ${payload.pendingAmount.toFixed(2)}` },
      ],
      sections,
      footerLabel: payload.footerLabel,
    };
  }

  async function printCounterReceipt(document: ReceiptDocument) {
    const printSession = openReceiptPrintSession();
    try {
      await printSession.print(document);
    } catch (err) {
      printSession.cancel();
      throw err;
    }
  }

  async function submitPayments(payments: RegisteredPayment[]) {
    const printSession = openReceiptPrintSession();
    setSubmitting(true);
    setError(null);
    try {
      const created = await createCounterOrder({
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        payments: payments.map((payment) => ({
          method: payment.method,
          amount: payment.amount,
          receivedAmount: payment.receivedAmount,
          reference: payment.reference,
          proofImage: payment.proofImage,
        })),
        items: orderItems(),
      });
      const lines = cartReceiptLines();
      const receiptPayments = toReceiptPayments(payments);
      const paidSum = Number(receiptPayments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2));
      const lastPayment = receiptPayments.at(-1);
      const customer = customerName.trim() || 'Consumidor final';
      const settled: PaidCounterOrder = { ...created, customerName: customer, lines, payments: receiptPayments };
      try {
        if (lastPayment) {
          await printSession.print(buildCounterReceipt({
            title: 'LIQUIDACION FINAL',
            orderCode: created.code,
            customerName: customer,
            accountTotal: created.total,
            lines: payments.at(-1)?.lineIds.length ? cartReceiptLines(payments.at(-1)!.lineIds) : lines,
            payments: receiptPayments,
            paymentAmount: lastPayment.amount,
            paidAmount: paidSum,
            pendingAmount: 0,
            showPaymentsHistory: false,
            showPaymentMeta: true,
            footerLabel: 'CUENTA LIQUIDADA',
          }));
          if (window.confirm('Cuenta liquidada. Deseas imprimir la liquidacion final detallada con todos los abonos registrados?')) {
            await printReceipt(buildCounterReceipt({
              title: 'LIQUIDACION FINAL',
              orderCode: created.code,
              customerName: customer,
              accountTotal: created.total,
              lines,
              payments: receiptPayments,
              paymentAmount: lastPayment.amount,
              paidAmount: paidSum,
              pendingAmount: 0,
              showPaymentsHistory: true,
              showPaymentMeta: true,
              footerLabel: 'LIQUIDACION FINAL REGISTRADA',
            }));
          }
        } else {
          printSession.cancel();
        }
      } catch (printError) {
        printSession.cancel();
        setError(printError instanceof Error ? printError.message : 'La cuenta se cobró, pero no se pudo imprimir el ticket.');
      }
      setPaidOrder(settled);
      setRegisteredPayments([]);
      setStep('TABLE');
      await refreshSnapshot();
    } catch (err) {
      printSession.cancel();
      setError(err instanceof Error ? err.message : 'No fue posible cobrar el pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  async function registerSplitPayment() {
    if (!cart.length) {
      setError('Agrega al menos un producto.');
      return;
    }
    const amount = Number(amountToPay);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Ingresa un monto válido para el abono.');
      return;
    }
    if (amount - pendingAmount > 0.01) {
      setError('El monto no puede superar el saldo pendiente.');
      return;
    }
    if (splitMode === 'ITEMS' && selectedLineIds.length === 0) {
      setError('Selecciona al menos un producto para cobrar por productos.');
      return;
    }
    const selectedTotal = Number(cart.filter((line) => selectedLineIds.includes(line.id)).reduce((sum, line) => sum + lineAmount(line), 0).toFixed(2));
    if (splitMode === 'ITEMS' && Math.abs(selectedTotal - amount) > 0.01) {
      setError('El monto no coincide con los productos seleccionados.');
      return;
    }
    let received: number | null = null;
    if (method === 'CASH') {
      received = Number(receivedAmount);
      if (!Number.isFinite(received) || received < amount) {
        setError('El monto recibido es menor al abono.');
        return;
      }
    } else if (!reference.trim()) {
      setError('La referencia es obligatoria para tarjeta o transferencia.');
      return;
    }
    if (method === 'TRANSFER' && !proofImage) {
      setError('Adjunta la imagen del comprobante.');
      return;
    }

    const nextPayments = [
      ...registeredPayments,
      {
        method,
        amount: Number(amount.toFixed(2)),
        receivedAmount: received,
        reference: reference.trim() || null,
        proofImage: method === 'TRANSFER' ? proofImage : null,
        lineIds: splitMode === 'ITEMS' ? selectedLineIds : [],
      },
    ];
    const nextPending = Number((total - nextPayments.reduce((sum, payment) => sum + payment.amount, 0)).toFixed(2));
    setSelectedLineIds([]);
    setReference('');
    setProofImage(null);
    setReceivedAmount('');
    setError(null);
    if (nextPending <= 0.01) {
      await submitPayments(nextPayments);
      return;
    }
    const receiptPayments = toReceiptPayments(nextPayments);
    const lastPayment = receiptPayments.at(-1);
    if (lastPayment) {
      try {
        await printCounterReceipt(buildCounterReceipt({
          title: 'RECIBO DE ABONO',
          orderCode: 'Mostrador',
          customerName: customerName.trim() || 'Consumidor final',
          accountTotal: total,
          lines: nextPayments.at(-1)?.lineIds.length ? cartReceiptLines(nextPayments.at(-1)!.lineIds) : cartReceiptLines(),
          payments: receiptPayments,
          paymentAmount: lastPayment.amount,
          paidAmount: Number((total - nextPending).toFixed(2)),
          pendingAmount: nextPending,
          showPaymentsHistory: true,
          showPaymentMeta: true,
          footerLabel: 'ABONO REGISTRADO',
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No fue posible imprimir el abono.');
      }
    }
    setRegisteredPayments(nextPayments);
    setAmountToPay(nextPending.toFixed(2));
    setSplitMode('AMOUNT');
  }

  async function printPreBill() {
    try {
      const receiptPayments = toReceiptPayments(registeredPayments);
      await printCounterReceipt(buildCounterReceipt({
        title: pendingAmount > 0 ? 'PRECUENTA' : 'LIQUIDACION FINAL',
        orderCode: 'Mostrador',
        customerName: customerName.trim() || 'Consumidor final',
        accountTotal: total,
        lines: cartReceiptLines(),
        payments: receiptPayments,
        paymentAmount: receiptPayments.at(-1)?.amount ?? 0,
        paidAmount,
        pendingAmount,
        showPaymentsHistory: receiptPayments.length > 0,
        showPaymentMeta: receiptPayments.length > 0,
        footerLabel: pendingAmount > 0 ? 'PRECUENTA INFORMATIVA' : 'LIQUIDACION FINAL REGISTRADA',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible imprimir.');
    }
  }

  async function reprintPaidOrder() {
    if (!paidOrder?.lines?.length || !paidOrder.payments?.length) return;
    const paidSum = Number(paidOrder.payments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2));
    const lastPayment = paidOrder.payments.at(-1)!;
    try {
      await printCounterReceipt(buildCounterReceipt({
        title: 'LIQUIDACION FINAL',
        orderCode: paidOrder.code,
        customerName: paidOrder.customerName || 'Consumidor final',
        accountTotal: paidOrder.total,
        lines: paidOrder.lines,
        payments: paidOrder.payments,
        paymentAmount: lastPayment.amount,
        paidAmount: paidSum,
        pendingAmount: 0,
        showPaymentsHistory: true,
        showPaymentMeta: true,
        footerLabel: 'LIQUIDACION FINAL REGISTRADA',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible imprimir.');
    }
  }

  async function assignTable(tableId: number) {
    if (!paidOrder) return;
    setSubmitting(true);
    setError(null);
    try {
      await assignCounterOrderTable(paidOrder.id, tableId);
      await refreshSnapshot();
      navigate('/cashier/mesas', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible asignar la mesa.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!snapshot || !user) return null;

  const formatMoney = (amount: number) => `${currency} ${amount.toFixed(2)}`;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 px-4 py-3 text-slate-900 dark:bg-[#07070a] dark:text-white sm:px-6 lg:h-screen lg:overflow-hidden lg:px-8 lg:py-3">
      <header className="w-full text-left">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="text-left">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Mostrador</p>
            <h1 className="mt-3 font-display text-3xl text-slate-950 dark:text-white sm:text-4xl lg:text-5xl">Menú</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400 sm:text-base">
              {step === 'TABLE' ? 'Elige el área y la mesa.' : 'Elige la sección, la categoría y el producto. El cobro es el paso siguiente.'}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => navigate('/cashier/mesas')} className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 sm:h-12">Volver</button>
            <ActiveUserLabel height="h-12" />
          </div>
        </div>
      </header>

      {step === 'ORDER' ? (
        <main className="mt-4 grid w-full min-w-0 gap-4 lg:h-[calc(100vh-8.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(28rem,36rem)] lg:overflow-hidden">
          <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:p-5 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:p-6">
            <div className="shrink-0">
              <div className="flex flex-wrap gap-2">
                {categoryGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => { setSelectedGroupId(group.id); setProductPickerOpen(false); setPickerCategoryId(null); }}
                    className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition sm:px-5 sm:py-2.5 sm:text-base ${activeGroup?.id === group.id ? 'border-amber-300/40 bg-amber-300/10 text-amber-950 dark:text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200'}`}
                    style={activeGroup?.id === group.id ? { borderColor: sectionColor(group, '#f59e0b') } : undefined}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300" style={activeGroup?.id === group.id ? { borderColor: sectionColor(group, '#f59e0b'), color: sectionColor(group, '#f59e0b') } : undefined}>
                        <AppIcon icon={getCategoryIcon(group)} className="h-4 w-4" />
                      </span>
                      <span>{group.name}</span>
                    </span>
                  </button>
                ))}
              </div>
              {activeGroup ? (
                <div className="mt-5 flex items-center gap-3">
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">Categorías de {activeGroup.name}</span>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                </div>
              ) : null}
            </div>
            <div className="mt-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
                {(subcategories.length ? subcategories : activeGroup ? [activeGroup] : []).map((category) => (
                  <button key={category.id} type="button" onClick={() => { setPickerCategoryId(category.id); setProductPickerOpen(true); }} className="rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-zinc-950/40 dark:shadow-none dark:hover:bg-zinc-950/55" style={{ borderColor: category.color ?? undefined }}>
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-black/20" style={{ color: sectionColor(category, '#10b981') }}>
                        <AppIcon icon={getCategoryIcon(category)} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-950 dark:text-white sm:text-lg">{category.name}</p>
                        <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">Toca para ver los productos disponibles.</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-4 lg:h-full lg:min-h-0 lg:overflow-hidden">
            <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:p-5">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Cliente</p>
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-3 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm dark:border-white/10 dark:bg-black/30 dark:text-white" placeholder="Nombre" />
              <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm dark:border-white/10 dark:bg-black/30 dark:text-white" placeholder="Teléfono" />
            </section>
            <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:p-5 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Pedido</p>
                <button type="button" onClick={() => setCart([])} className="text-xs font-semibold text-slate-600 underline underline-offset-4 dark:text-zinc-300">Limpiar</button>
              </div>
              <div className="mt-4 space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                {cart.length ? cart.map((line) => {
                  const product = menuProductById.get(line.productId);
                  if (!product) return null;
                  const extras = modifierTotal(line.sauces) + modifierTotal(line.dressings);
                  const details = [line.sauces.length ? `Salsas: ${line.sauces.join(', ')}` : '', line.dressings.length ? `Aderezos: ${line.dressings.join(', ')}` : '', line.notes].filter(Boolean).join(' • ');
                  return (
                    <div key={line.id} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm dark:bg-white/[0.03]">
                      <p className="font-semibold leading-snug">{product.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-500">{stationLabel(product.station)}{details ? ` • ${details}` : ''}</p>
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <span className="mr-auto text-xs font-semibold">{formatMoney((product.price + extras) * line.quantity)}</span>
                        <button type="button" onClick={() => openProductModal(product.id, line.id)} className="h-9 w-9 rounded-xl border"><AppIcon icon={Pencil} className="mx-auto h-4 w-4" /></button>
                        <button type="button" onClick={() => setCart((current) => current.flatMap((item) => item.id !== line.id ? [item] : item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : []))} className="h-9 w-9 rounded-xl border">-</button>
                        <span className="w-6 text-center">{line.quantity}</span>
                        <button type="button" onClick={() => setCart((current) => current.map((item) => item.id === line.id ? { ...item, quantity: item.quantity + 1 } : item))} className="h-9 w-9 rounded-xl border">+</button>
                      </div>
                    </div>
                  );
                }) : <p className="text-sm text-slate-500 dark:text-zinc-500">Agrega productos desde el menú.</p>}
              </div>
              {error ? <p className="mt-4 rounded-[22px] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</p> : null}
              <div className="mt-4 flex items-center justify-between text-sm">
                <span>Total</span>
                <span className="font-semibold">{formatMoney(total)}</span>
              </div>
              <button type="button" disabled={!cart.length} onClick={() => { setError(null); setRegisteredPayments([]); setSelectedLineIds([]); setSplitMode('AMOUNT'); setAmountToPay(total.toFixed(2)); setReceivedAmount(''); setStep('PAY'); }} className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-900 disabled:opacity-50 dark:text-white sm:h-14">Continuar al cobro</button>
            </section>
          </aside>
        </main>
      ) : null}

      {step === 'PAY' ? (
        <main className="mt-3 grid min-h-0 w-full flex-1 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(22rem,32rem)]">
          <section className="min-h-0 overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Detalle de cuenta</p>
            <div className="mt-4 space-y-2">
              {cart.map((line) => {
                const product = menuProductById.get(line.productId);
                const paid = paidLineIds.has(line.id);
                const selected = selectedLineIds.includes(line.id);
                return (
                  <button
                    key={line.id}
                    type="button"
                    disabled={splitMode !== 'ITEMS' || paid || submitting}
                    onClick={() => {
                      const next = selected ? selectedLineIds.filter((id) => id !== line.id) : [...selectedLineIds, line.id];
                      const nextAmount = cart.filter((item) => next.includes(item.id)).reduce((sum, item) => sum + lineAmount(item), 0);
                      setSelectedLineIds(next);
                      setAmountToPay(nextAmount > 0 ? Math.min(nextAmount, pendingAmount).toFixed(2) : pendingAmount.toFixed(2));
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${paid ? 'border-emerald-300/40 bg-emerald-500/10' : selected ? 'border-amber-300 bg-amber-300/10' : 'border-slate-200'}`}
                  >
                    <span>
                      <span className="font-semibold">{line.quantity} x {product?.name}</span>
                      {paid ? <span className="ml-2 text-xs uppercase tracking-[0.16em] text-emerald-700">Pagado</span> : null}
                    </span>
                    <span>{formatMoney(lineAmount(line))}</span>
                  </button>
                );
              })}
            </div>
            {registeredPayments.length ? (
              <div className="mt-5 space-y-2">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Abonos</p>
                {registeredPayments.map((payment, index) => (
                  <p key={`${payment.method}-${index}`} className="flex justify-between text-sm">
                    <span>{payment.method === 'CASH' ? 'Efectivo' : payment.method === 'CARD' ? 'Tarjeta' : 'Transferencia'}</span>
                    <span className="font-semibold">{formatMoney(payment.amount)}</span>
                  </p>
                ))}
              </div>
            ) : null}
          </section>
          <section className="min-h-0 overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Formas de cobro</p>
            <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm dark:border-white/10 dark:bg-black/20">
              <p className="flex justify-between"><span>Total cuenta</span><span className="font-semibold">{formatMoney(total)}</span></p>
              <p className="flex justify-between"><span>Abonado</span><span className="font-semibold">{formatMoney(paidAmount)}</span></p>
              <p className="flex justify-between"><span>Pendiente</span><span className="font-semibold text-amber-700 dark:text-amber-200">{formatMoney(pendingAmount)}</span></p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setSplitMode('AMOUNT'); setSelectedLineIds([]); setAmountToPay(pendingAmount.toFixed(2)); }} className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-3 text-xs font-semibold ${splitMode === 'AMOUNT' ? 'border-amber-300 bg-amber-300/15' : 'border-slate-200'}`}><AppIcon icon={Split} className="h-4 w-4" />Por monto</button>
              <button type="button" onClick={() => { const people = Math.max(2, splitPeopleCount); setSplitMode('EQUAL'); setSplitPeopleCount(people); setSelectedLineIds([]); setAmountToPay((pendingAmount / people).toFixed(2)); }} className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-3 text-xs font-semibold ${splitMode === 'EQUAL' ? 'border-amber-300 bg-amber-300/15' : 'border-slate-200'}`}><AppIcon icon={Users} className="h-4 w-4" />Por personas</button>
              <button type="button" onClick={() => { setSplitMode('ITEMS'); setAmountToPay('0.00'); }} className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-3 text-xs font-semibold ${splitMode === 'ITEMS' ? 'border-amber-300 bg-amber-300/15' : 'border-slate-200'}`}><AppIcon icon={Receipt} className="h-4 w-4" />Por productos</button>
            </div>
            {splitMode === 'EQUAL' ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {[2, 3, 4, 5, 6].map((count) => (
                  <button key={count} type="button" onClick={() => { setSplitPeopleCount(count); setAmountToPay((pendingAmount / count).toFixed(2)); }} className={`h-9 rounded-2xl border px-3 text-xs font-semibold ${splitPeopleCount === count ? 'border-violet-300 bg-violet-500/10' : 'border-slate-200'}`}>{count} personas</button>
                ))}
              </div>
            ) : null}
            {splitMode === 'ITEMS' ? <p className="mt-3 text-xs text-slate-500">Elige los productos de este abono. El monto se calcula con esa selección.</p> : null}
            <label className="mt-4 block text-xs uppercase tracking-[0.35em] text-slate-500">Monto a cobrar
              <input value={amountToPay} onChange={(event) => setAmountToPay(event.target.value)} inputMode="decimal" className="mt-2 h-12 w-full rounded-2xl border px-4 text-sm normal-case tracking-normal dark:border-white/10 dark:bg-black/30" />
            </label>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {([
                { value: 'CASH' as const, label: 'Efectivo', icon: Banknote },
                { value: 'CARD' as const, label: 'Tarjeta', icon: CreditCard },
                { value: 'TRANSFER' as const, label: 'Transferencia', icon: Landmark },
              ]).map((option) => (
                <button key={option.value} type="button" onClick={() => setMethod(option.value)} className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold ${method === option.value ? 'border-amber-300 bg-amber-300/15' : 'border-slate-200'}`}>
                  <AppIcon icon={option.icon} className="h-4 w-4" />
                  {option.label}
                </button>
              ))}
            </div>
            {method === 'CASH' ? (
              <label className="mt-4 block text-xs uppercase tracking-[0.35em] text-slate-500">Monto recibido
                <input value={receivedAmount} onChange={(event) => setReceivedAmount(event.target.value)} inputMode="decimal" className="mt-2 h-12 w-full rounded-2xl border px-4 text-sm normal-case tracking-normal dark:border-white/10 dark:bg-black/30" />
              </label>
            ) : (
              <label className="mt-4 block text-xs uppercase tracking-[0.35em] text-slate-500">Número de referencia
                <input value={reference} onChange={(event) => setReference(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border px-4 text-sm normal-case tracking-normal dark:border-white/10 dark:bg-black/30" />
              </label>
            )}
            {method === 'CASH' && Number.isFinite(amountValue) ? <p className="mt-3 text-sm">Cambio: {formatMoney(Math.max(0, Number(receivedAmount || 0) - amountValue))}</p> : null}
            {method === 'TRANSFER' ? (
              <input type="file" accept="image/*" className="mt-4 block w-full text-sm" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setProofImage(typeof reader.result === 'string' ? reader.result : null);
                reader.readAsDataURL(file);
              }} />
            ) : null}
            {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
            <button type="button" disabled={submitting || pendingAmount <= 0} onClick={() => void registerSplitPayment()} className="mt-4 h-12 w-full rounded-2xl border border-emerald-300/30 bg-emerald-500/10 font-semibold text-emerald-900 disabled:opacity-50 dark:text-white">
              {submitting ? 'Procesando...' : Math.abs(amountValue - pendingAmount) < 0.01 ? 'Liquidar cuenta y enviar comanda' : 'Registrar abono'}
            </button>
            <button type="button" disabled={submitting || !cart.length} onClick={() => void printPreBill()} className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border font-semibold disabled:opacity-50">
              <AppIcon icon={Printer} className="h-4 w-4" />
              {pendingAmount > 0 ? 'Imprimir precuenta' : 'Imprimir liquidacion final'}
            </button>
            <button type="button" onClick={() => { if (registeredPayments.length && !window.confirm('Hay abonos de esta cuenta que todavía no se envían. Si vuelves al menú se descartan.')) return; setRegisteredPayments([]); setStep('ORDER'); }} className="mt-3 h-12 w-full rounded-2xl border font-semibold">Volver al menú</button>
          </section>
        </main>
      ) : null}

      {step === 'TABLE' && paidOrder ? (
        <main className="mt-4 w-full min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
            <p className="min-w-0 leading-snug">
              <span className="font-semibold">{paidOrder.code} cobrado.</span>
              {paidOrder.change > 0 ? ` Cambio ${formatMoney(paidOrder.change)}.` : ''} Asigna la mesa cuando el cliente se siente.
            </p>
            {paidOrder.lines?.length ? (
              <button type="button" onClick={() => void reprintPaidOrder()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-emerald-700/30 bg-white px-2.5 text-xs font-semibold text-emerald-950">
                <AppIcon icon={Printer} className="h-3.5 w-3.5" />
                Imprimir
              </button>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {areaTabs.map((area) => (
              <button key={area} type="button" onClick={() => setActiveArea(area)} className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold ${(activeArea || areaTabs[0]) === area ? 'border-amber-300 bg-amber-300/15' : 'border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]'}`}>
                <AppIcon icon={getAreaIcon(area)} className="h-4 w-4" />
                {area}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]">
            {visibleTables.map((table) => (
              <button key={table.id} type="button" disabled={submitting} onClick={() => void assignTable(table.id)} className="rounded-[24px] border border-slate-200 bg-white p-4 text-left dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{table.area}</p>
                <p className="mt-2 text-2xl font-semibold">{table.code}</p>
                <p className="mt-2 text-sm">Asignar esta mesa</p>
              </button>
            ))}
          </div>
          {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
          <button type="button" onClick={() => navigate('/cashier/mesas')} className="mt-4 h-11 rounded-2xl border px-4 text-sm font-semibold">Asignar la mesa después</button>
        </main>
      ) : null}

      {productPickerOpen && pickerCategory ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4 py-6 dark:bg-black/60">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#0b0b10] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500">{activeGroup?.name ?? 'Menú'}</p>
                <h2 className="mt-2 font-display text-3xl">{pickerCategory.name}</h2>
              </div>
              <button type="button" onClick={() => { setProductPickerOpen(false); setPickerCategoryId(null); }} className="h-10 w-10 rounded-2xl border">×</button>
            </div>
            {pickerChildCategories.length ? <div className="mt-4 flex flex-wrap gap-2">{pickerChildCategories.map((category) => <span key={category.id} className="rounded-2xl border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em]">{category.name}</span>)}</div> : null}
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {pickerProducts.map((product) => {
                  const productCategory = product.categoryId ? categoryById.get(product.categoryId) ?? null : null;
                  return (
                    <button key={product.id} type="button" onClick={() => openProductModal(product.id)} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 text-left dark:border-white/10 dark:bg-zinc-950/40">
                      {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-[4.5rem] w-[5.25rem] shrink-0 rounded-xl border object-cover" /> : (
                        <div className="flex h-[4.5rem] w-[5.25rem] shrink-0 items-center justify-center rounded-xl border bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/[0.03]">
                          <AppIcon icon={getCategoryIcon(productCategory ?? pickerCategory)} className="h-6 w-6" />
                        </div>
                      )}
                      <span className="min-w-0">
                        <p className="line-clamp-2 text-base font-semibold leading-snug">{product.name}</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">{formatMoney(product.price)}</p>
                        <p className="mt-0.5 truncate text-[11px] uppercase tracking-[0.16em] text-slate-500">{productCategory?.name ?? pickerCategory.name} • {stationLabel(product.station)}</p>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {productModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 dark:bg-black/60">
          <div className="flex max-h-[calc(100vh-4rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#0b0b10]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Detalle del item</p>
                <h2 className="mt-0.5 font-display text-xl leading-tight">{modalProduct?.name ?? 'Producto'}</h2>
              </div>
              <button type="button" onClick={() => setProductModalOpen(false)} className="h-8 w-8 rounded-lg border text-sm">×</button>
            </div>
            <div className="mt-2 flex-1 overflow-y-auto">
              {modalProduct?.imageUrl ? <img src={modalProduct.imageUrl} alt={modalProduct.name} className="aspect-[5/2] w-full rounded-xl border object-cover" /> : null}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {modalProductAllowsModifiers ? (
                  <>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Salsa</p>
                      <button type="button" onClick={() => { setModifierDialogSection('SAUCES'); setModifierDraftSelection(modalSauces); }} className="mt-1 flex min-h-9 w-full items-center justify-between rounded-xl border px-2.5 py-1.5 text-left text-sm">{modalSauces.length ? `${modalSauces.length} salsa(s)` : 'Seleccionar salsas'}</button>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Aderezo</p>
                      <button type="button" onClick={() => { setModifierDialogSection('DRESSINGS'); setModifierDraftSelection(modalDressings); }} className="mt-1 flex min-h-9 w-full items-center justify-between rounded-xl border px-2.5 py-1.5 text-left text-sm">{modalDressings.length ? `${modalDressings.length} aderezo(s)` : 'Seleccionar aderezos'}</button>
                    </div>
                  </>
                ) : <p className="rounded-xl border border-dashed px-2.5 py-2 text-sm text-slate-500 sm:col-span-2">Este producto no aplica para salsas o aderezos.</p>}
                <div className="sm:col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Observaciones</p>
                  <textarea value={modalNotes} onChange={(event) => setModalNotes(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border px-2.5 py-1.5 text-sm dark:border-white/10 dark:bg-black/30" />
                </div>
              </div>
            </div>
            <div className="mt-2 grid gap-2 border-t pt-2 sm:grid-cols-2">
              <button type="button" onClick={() => setProductModalOpen(false)} className="h-9 rounded-xl border text-sm font-semibold">Cancelar</button>
              <button type="button" onClick={confirmAddProduct} className="h-9 rounded-xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-900 dark:text-white">{editingLineId ? 'Guardar cambios' : 'Agregar'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {productModalOpen && modifierDialogSection ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 px-4 py-6">
          <div className="flex max-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#0b0b10]">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-xl leading-tight">{modifierDialogSection === 'SAUCES' ? 'Seleccionar salsa' : 'Seleccionar aderezo'}</h2>
              <button type="button" onClick={() => setModifierDialogSection(null)} className="h-8 w-8 shrink-0 rounded-lg border text-sm">×</button>
            </div>
            <div className="mt-2 grid min-h-0 flex-1 gap-2.5 overflow-auto sm:grid-cols-2">
              {activeModifierOptions.map((option) => {
                const selected = modifierDraftSelection.includes(option.label);
                return (
                  <button key={option.id} type="button" onClick={() => setModifierDraftSelection((current) => current.includes(option.label) ? current.filter((item) => item !== option.label) : [...current, option.label])} className={`flex items-center gap-3 rounded-2xl border p-2.5 text-left ${selected ? 'border-emerald-300 bg-emerald-500/10' : 'border-slate-200'}`}>
                    {option.imageUrl ? <img src={option.imageUrl} alt={option.label} className="h-[4.5rem] w-[5.25rem] shrink-0 rounded-xl object-cover" /> : <div className="flex h-[4.5rem] w-[5.25rem] shrink-0 items-center justify-center rounded-xl border"><AppIcon icon={modifierDialogSection === 'SAUCES' ? ChefHat : Salad} className="h-6 w-6" /></div>}
                    <span className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-base font-semibold leading-snug">{option.label}</p>
                      <p className="mt-1 text-sm text-slate-500">{option.price > 0 ? `Cobro adicional: ${formatMoney(option.price)}` : 'Sin costo adicional'}</p>
                    </span>
                    {selected ? <AppIcon icon={Check} className="h-4 w-4 shrink-0 text-emerald-700" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 grid gap-2 border-t pt-2 sm:grid-cols-2">
              <button type="button" onClick={() => setModifierDialogSection(null)} className="h-9 rounded-xl border text-sm font-semibold"><AppIcon icon={X} className="mr-1.5 inline h-3.5 w-3.5" />Cancelar</button>
              <button type="button" onClick={() => { if (modifierDialogSection === 'SAUCES') setModalSauces(modifierDraftSelection); else setModalDressings(modifierDraftSelection); setModifierDialogSection(null); }} className="h-9 rounded-xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold">Aplicar selección</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
