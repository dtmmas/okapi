import { ArrowLeftRight, Beef, CakeSlice, Check, ChefHat, Coffee, CreditCard, Fish, GlassWater, IceCreamCone, LayoutDashboard, LogOut, Martini, Pencil, Pizza, ReceiptText, Salad, Sandwich, SendHorizontal, UserRound, UtensilsCrossed, WalletCards, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon, type IconComponent } from '@/components/AppIcon';
import { StatusBadge } from '@/components/StatusBadge';
import { isMenuSectionVisibleInPos } from '@/lib/menu-sections';
import { createOrUpdateOrder, moveTableAccount, requestOrderBill } from '@/services/api';
import { usePosWizardStore } from '@/store/usePosWizardStore';
import { useSessionStore } from '@/store/useSessionStore';
import type { MenuCategory } from '@/types/restaurant';

type MenuSection = 'DISHES' | 'BEVERAGES' | 'PRODUCTS' | 'EXTRAS' | 'SAUCES' | 'DRESSINGS';
type ModifierSection = 'SAUCES' | 'DRESSINGS';
type ModifierOption = {
  id: number;
  label: string;
  imageUrl?: string | null;
  section: ModifierSection;
  price: number;
};

function normalizeLabel(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getAccentBorderColor(category: MenuCategory | null | undefined, fallback: string) {
  return category?.color ?? fallback;
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

function productSupportsModifiers(product: { name: string; isPrepared: boolean; station: 'KITCHEN' | 'BAR' | 'PASTRY' }, category?: MenuCategory | null, section?: MenuSection | null) {
  const resolvedSection = section ?? (product.isPrepared ? 'DISHES' : 'PRODUCTS');
  if (resolvedSection !== 'DISHES') {
    return false;
  }

  if (product.station !== 'KITCHEN') {
    return false;
  }

  const blockedKeywords = [
    'bebida',
    'refresco',
    'soda',
    'jugo',
    'agua',
    'cafe',
    'te',
    'licor',
    'vino',
    'cerveza',
    'coctel',
    'cocktail',
    'batido',
    'smoothie',
    'postre',
    'helado',
    'pastel',
    'torta',
    'flan',
    'cheesecake',
  ];

  const haystack = [product.name, category?.name ?? ''].map((value) => normalizeLabel(value)).join(' ');
  return !blockedKeywords.some((keyword) => haystack.includes(keyword));
}

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
  const updateLine = usePosWizardStore((state) => state.updateLine);
  const incrementLine = usePosWizardStore((state) => state.incrementLine);
  const decrementLine = usePosWizardStore((state) => state.decrementLine);
  const removeLine = usePosWizardStore((state) => state.removeLine);
  const clearCart = usePosWizardStore((state) => state.clearCart);
  const reset = usePosWizardStore((state) => state.reset);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedLeafCategoryId, setSelectedLeafCategoryId] = useState<number | null>(null);
  const [moveToTableId, setMoveToTableId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [modalProductId, setModalProductId] = useState<number | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [modalNotes, setModalNotes] = useState('');
  const [modalSauces, setModalSauces] = useState<string[]>([]);
  const [modalDressings, setModalDressings] = useState<string[]>([]);
  const [modifierDialogSection, setModifierDialogSection] = useState<ModifierSection | null>(null);
  const [modifierDraftSelection, setModifierDraftSelection] = useState<string[]>([]);
  const [preBillOpen, setPreBillOpen] = useState(false);
  const [requestingBill, setRequestingBill] = useState(false);

  const tables = snapshot?.tables ?? [];
  const menuCategories = snapshot?.menuCategories ?? [];
  const menuProducts = snapshot?.menuProducts ?? [];
  const activeOrders = snapshot?.activeOrders ?? [];
  const menuProductById = useMemo(() => new Map(menuProducts.map((product) => [product.id, product])), [menuProducts]);
  const categoryById = useMemo(() => new Map(menuCategories.map((category) => [category.id, category])), [menuCategories]);

  const categorySectionById = useMemo(() => {
    function resolveCategorySection(category: MenuCategory, seen = new Set<number>()): MenuSection {
      if (seen.has(category.id)) {
        return category.station === 'BAR' ? 'PRODUCTS' : 'DISHES';
      }
      seen.add(category.id);

      const explicitSection = inferSectionFromName(category.name);
      if (explicitSection) {
        return explicitSection;
      }

      if (category.parentId) {
        const parent = categoryById.get(category.parentId);
        if (parent) {
          return resolveCategorySection(parent, seen);
        }
      }

      return category.station === 'BAR' ? 'PRODUCTS' : 'DISHES';
    }

    return new Map(menuCategories.map((category) => [category.id, resolveCategorySection(category)] as const));
  }, [categoryById, menuCategories]);

  function resolveSectionRootCategory(category: MenuCategory | null | undefined): MenuCategory | null {
    if (!category) {
      return null;
    }

    let current: MenuCategory | null = category;
    const seen = new Set<number>();

    while (current?.parentId) {
      if (seen.has(current.id)) {
        break;
      }
      seen.add(current.id);
      current = categoryById.get(current.parentId) ?? null;
    }

    return current;
  }

  function getSectionAccentColor(category: MenuCategory | null | undefined, fallback: string) {
    let current = category;
    const seen = new Set<number>();

    while (current) {
      if (current.color) {
        return current.color;
      }
      if (!current.parentId || seen.has(current.id)) {
        break;
      }
      seen.add(current.id);
      current = categoryById.get(current.parentId) ?? null;
    }

    const rootCategory = resolveSectionRootCategory(category);
    return rootCategory?.color ?? fallback;
  }

  const categoryGroups = useMemo(() => {
    const groupOrder = (category: MenuCategory) => {
      const normalized = normalizeLabel(category.name);
      if (normalized === 'platillos' || normalized === 'platillo') {
        return 0;
      }
      if (normalized === 'bebidas' || normalized === 'bebida') {
        return 1;
      }
      if (normalized === 'productos' || normalized === 'producto') {
        return 2;
      }
      if (normalized === 'postres' || normalized === 'postre') {
        return 3;
      }
      if (normalized === 'extras' || normalized === 'extra') {
        return 4;
      }
      return 5;
    };

    return menuCategories
      .filter((category) => !category.parentId && isMenuSectionVisibleInPos(category))
      .slice()
      .sort((a, b) => {
        const orderDiff = groupOrder(a) - groupOrder(b);
        if (orderDiff !== 0) {
          return orderDiff;
        }
        return a.name.localeCompare(b.name);
      });
  }, [categorySectionById, menuCategories]);

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
  const canRequestBill = Boolean(activeOrder && activeOrder.status === 'SERVED' && !activeOrder.readyForPayment && activeOrder.pendingAmount > 0);

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

  async function handleRequestBill() {
    if (!activeOrder) {
      return;
    }

    setRequestingBill(true);
    setError(null);
    try {
      await requestOrderBill(activeOrder.id);
      await refreshSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible solicitar cuenta.');
    } finally {
      setRequestingBill(false);
    }
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

  const leafCategories = useMemo(() => {
    if (!selectedCategory) {
      return [];
    }

    return menuCategories
      .filter((category) => category.parentId === selectedCategory.id)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [menuCategories, selectedCategory]);

  const activeLeafCategory = useMemo(() => {
    if (!leafCategories.length) {
      return null;
    }

    if (selectedLeafCategoryId) {
      return leafCategories.find((category) => category.id === selectedLeafCategoryId) ?? leafCategories[0];
    }

    return leafCategories[0];
  }, [leafCategories, selectedLeafCategoryId]);

  const productsForCategory = useMemo(() => {
    if (activeLeafCategory) {
      return menuProducts.filter((product) => product.categoryId === activeLeafCategory.id);
    }

    if (selectedCategory) {
      return menuProducts.filter((product) => product.categoryId === selectedCategory.id);
    }

    if (activeGroup) {
      return menuProducts.filter((product) => product.categoryId === activeGroup.id);
    }

    return [];
  }, [activeGroup, activeLeafCategory, menuProducts, selectedCategory]);

  const cartLines = useMemo(() => Object.values(cart), [cart]);

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

      const orderItems = cartLines.flatMap((line) => {
        const baseProduct = menuProductById.get(line.productId);
        const combinedNotes = [
          line.sauces.length ? `Salsas: ${line.sauces.join(', ')}` : '',
          line.dressings.length ? `Aderezos: ${line.dressings.join(', ')}` : '',
          line.notes,
        ]
          .map((part) => part.trim())
          .filter(Boolean)
          .join('\n');

        const billableModifiers = [...resolveModifierOptions(line.sauces), ...resolveModifierOptions(line.dressings)].filter((option) => option.price > 0);

        return [
          {
            productId: line.productId,
            quantity: line.quantity,
            ...(combinedNotes ? { notes: combinedNotes } : {}),
          },
          ...billableModifiers.map((option) => ({
            productId: option.id,
            quantity: line.quantity,
            notes: `Cobro adicional para ${baseProduct?.name ?? 'producto'}`,
          })),
        ];
      });

      await createOrUpdateOrder({
        tableId: selectedTable.id,
        ...(customerId ? { customerId } : {}),
        ...(customer ? { customer } : {}),
        type: 'DINE_IN',
        items: orderItems,
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

  const modifierOptions = useMemo(() => {
    const uniqueNames = new Map<string, ModifierOption>();

    menuProducts.forEach((product) => {
      if (!product.categoryId) {
        return;
      }

      const section = categorySectionById.get(product.categoryId);
      if (section !== 'SAUCES' && section !== 'DRESSINGS') {
        return;
      }

      const normalizedName = normalizeLabel(product.name);
      if (!normalizedName || uniqueNames.has(normalizedName)) {
        return;
      }

      uniqueNames.set(normalizedName, {
        id: product.id,
        label: product.name,
        imageUrl: product.imageUrl ?? null,
        section,
        price: Number(product.price ?? 0),
      });
    });

    return Array.from(uniqueNames.values()).sort((a, b) => {
      if (a.section !== b.section) {
        return a.section.localeCompare(b.section);
      }
      return a.label.localeCompare(b.label);
    });
  }, [categorySectionById, menuProducts]);

  const sauceOptions = useMemo(() => modifierOptions.filter((option) => option.section === 'SAUCES'), [modifierOptions]);
  const dressingOptions = useMemo(() => modifierOptions.filter((option) => option.section === 'DRESSINGS'), [modifierOptions]);
  const activeModifierOptions = modifierDialogSection === 'SAUCES' ? sauceOptions : dressingOptions;
  const modifierOptionByName = useMemo(
    () => new Map(modifierOptions.map((option) => [normalizeLabel(option.label), option] as const)),
    [modifierOptions],
  );

  function resolveModifierOptions(labels: string[]) {
    return labels
      .map((label) => modifierOptionByName.get(normalizeLabel(label)) ?? null)
      .filter((option): option is ModifierOption => option !== null);
  }

  function getBillableModifierTotal(labels: string[]) {
    return resolveModifierOptions(labels).reduce((sum, option) => sum + (option.price > 0 ? option.price : 0), 0);
  }

  const cartTotal = useMemo(() => {
    return cartLines.reduce((sum, line) => {
      const product = menuProductById.get(line.productId);
      const baseTotal = product ? product.price * line.quantity : 0;
      const modifierTotal = (getBillableModifierTotal(line.sauces) + getBillableModifierTotal(line.dressings)) * line.quantity;
      return sum + baseTotal + modifierTotal;
    }, 0);
  }, [cartLines, menuProductById, modifierOptionByName]);

  const modalProduct = useMemo(
    () => (modalProductId ? menuProducts.find((item) => item.id === modalProductId) ?? null : null),
    [menuProducts, modalProductId],
  );
  const modalProductCategory = useMemo(
    () => (modalProduct?.categoryId ? categoryById.get(modalProduct.categoryId) ?? null : null),
    [categoryById, modalProduct],
  );
  const modalProductSection = useMemo(
    () => (modalProduct?.categoryId ? categorySectionById.get(modalProduct.categoryId) ?? (modalProduct.isPrepared ? 'DISHES' : 'PRODUCTS') : null),
    [categorySectionById, modalProduct],
  );
  const modalProductAllowsModifiers = useMemo(
    () => (modalProduct ? productSupportsModifiers(modalProduct, modalProductCategory, modalProductSection) : false),
    [modalProduct, modalProductCategory, modalProductSection],
  );

  function openProductModal(productId: number, lineId?: string | null) {
    const existingLine = lineId ? cart[lineId] ?? null : null;
    setModalProductId(productId);
    setEditingLineId(existingLine?.id ?? null);
    setModalNotes(existingLine?.notes ?? '');
    setModalSauces(existingLine?.sauces ?? []);
    setModalDressings(existingLine?.dressings ?? []);
    setModifierDialogSection(null);
    setModifierDraftSelection([]);
    setProductModalOpen(true);
  }

  function closeProductModal() {
    setProductModalOpen(false);
    setModalProductId(null);
    setEditingLineId(null);
    setModalNotes('');
    setModalSauces([]);
    setModalDressings([]);
    setModifierDialogSection(null);
    setModifierDraftSelection([]);
  }

  function openModifierDialog(section: ModifierSection) {
    if (!modalProductAllowsModifiers) {
      return;
    }
    setModifierDialogSection(section);
    setModifierDraftSelection(section === 'SAUCES' ? modalSauces : modalDressings);
  }

  function closeModifierDialog() {
    setModifierDialogSection(null);
    setModifierDraftSelection([]);
  }

  function toggleModifier(optionLabel: string) {
    setModifierDraftSelection((current) =>
      current.includes(optionLabel) ? current.filter((item) => item !== optionLabel) : [...current, optionLabel].sort((a, b) => a.localeCompare(b)),
    );
  }

  function applyModifierSelection() {
    if (!modifierDialogSection) {
      return;
    }

    if (modifierDialogSection === 'SAUCES') {
      setModalSauces(modifierDraftSelection);
    } else {
      setModalDressings(modifierDraftSelection);
    }

    closeModifierDialog();
  }

  function confirmAddProduct() {
    if (!modalProductId) {
      return;
    }

    const payload = {
      productId: modalProductId,
      notes: modalNotes,
      sauces: modalProductAllowsModifiers ? modalSauces : [],
      dressings: modalProductAllowsModifiers ? modalDressings : [],
    };

    if (editingLineId) {
      updateLine(editingLineId, payload);
    } else {
      addToCart(payload);
    }
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
                  setSelectedLeafCategoryId(null);
                }}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition sm:px-5 sm:py-2.5 sm:text-base lg:text-lg ${
                  activeGroup?.id === group.id
                    ? 'border-amber-300/40 bg-amber-300/10 text-amber-950 dark:text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                }`}
                style={activeGroup?.id === group.id ? { borderColor: getSectionAccentColor(group, '#f59e0b') } : undefined}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${activeGroup?.id === group.id ? 'border-amber-300/20 bg-amber-300/10 text-amber-700 dark:text-amber-200' : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300'}`}
                    style={activeGroup?.id === group.id ? { borderColor: getSectionAccentColor(group, '#f59e0b'), color: getSectionAccentColor(group, '#f59e0b') } : undefined}
                  >
                    <AppIcon icon={getCategoryIcon(group)} className="h-4 w-4" />
                  </span>
                  <span>{group.name}</span>
                </span>
              </button>
            ))}
          </div>

          {activeGroup ? (
            <div className="mt-5 flex items-center gap-3">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">
                Categorias de {activeGroup.name}
              </span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {subcategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setSelectedCategoryId(category.id);
                  setSelectedLeafCategoryId(null);
                }}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition sm:text-base ${
                  selectedCategory?.id === category.id
                    ? 'border-emerald-300/40 bg-emerald-500/10 text-emerald-950 dark:text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                }`}
                style={selectedCategory?.id === category.id ? { borderColor: getSectionAccentColor(category, '#10b981') } : undefined}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${selectedCategory?.id === category.id ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200' : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300'}`}
                    style={selectedCategory?.id === category.id ? { borderColor: getSectionAccentColor(category, '#10b981'), color: getSectionAccentColor(category, '#10b981') } : undefined}
                  >
                    <AppIcon icon={getCategoryIcon(category)} className="h-4 w-4" />
                  </span>
                  <span>{category.name}</span>
                </span>
              </button>
            ))}
          </div>

          {leafCategories.length ? (
            <>
              <div className="mt-5 flex items-center gap-3">
                <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">
                  Subcategorias de {selectedCategory?.name ?? activeGroup?.name ?? 'la seccion'}
                </span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {leafCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedLeafCategoryId(category.id)}
                    className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition sm:text-base ${
                      activeLeafCategory?.id === category.id
                        ? 'border-sky-300/40 bg-sky-500/10 text-sky-950 dark:text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                    }`}
                    style={activeLeafCategory?.id === category.id ? { borderColor: getSectionAccentColor(category, '#0ea5e9') } : undefined}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${activeLeafCategory?.id === category.id ? 'border-sky-300/20 bg-sky-500/10 text-sky-700 dark:text-sky-200' : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-zinc-300'}`}
                        style={activeLeafCategory?.id === category.id ? { borderColor: getSectionAccentColor(category, '#0ea5e9'), color: getSectionAccentColor(category, '#0ea5e9') } : undefined}
                      >
                        <AppIcon icon={getCategoryIcon(category)} className="h-4 w-4" />
                      </span>
                      <span>{category.name}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

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
              {activeOrder?.readyForPayment ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-slate-500 dark:text-zinc-400">Cobro</span>
                  <StatusBadge value="BILL_REQUESTED" />
                </div>
              ) : null}
            </div>

            {activeOrder ? (
              <div className={`mt-4 grid gap-2 ${(canRequestBill || (canCharge && activeOrder.readyForPayment)) ? 'sm:grid-cols-2' : ''}`}>
                <button
                  type="button"
                  onClick={() => setPreBillOpen(true)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-sky-300/30 bg-sky-500/10 px-4 text-sm font-semibold text-sky-900 transition hover:bg-sky-500/15 dark:text-white sm:h-12 sm:text-base lg:h-14 lg:text-lg"
                >
                  <AppIcon icon={ReceiptText} className="h-4 w-4" />
                  Precuenta
                </button>
                {canRequestBill ? (
                  <button
                    type="button"
                    onClick={() => void handleRequestBill()}
                    disabled={requestingBill}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-violet-300/30 bg-violet-500/10 px-4 text-sm font-semibold text-violet-900 transition hover:bg-violet-500/15 disabled:opacity-50 dark:text-white sm:h-12 sm:text-base lg:h-14 lg:text-lg"
                  >
                    <AppIcon icon={WalletCards} className="h-4 w-4" />
                    {requestingBill ? 'Solicitando...' : 'Solicitar cuenta'}
                  </button>
                ) : null}
                {canCharge && activeOrder.readyForPayment && selectedTable ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/cashier/cobrar/${selectedTable.id}`)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-500/15 dark:text-white sm:h-12 sm:text-base lg:h-14 lg:text-lg"
                  >
                    <AppIcon icon={CreditCard} className="h-4 w-4" />
                    Cobrar
                  </button>
                ) : null}
              </div>
            ) : null}

            {activeOrder && !activeOrder.readyForPayment ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-zinc-500">
                {activeOrder.status === 'SERVED'
                  ? 'Cuando el cliente pida la cuenta, usa "Solicitar cuenta" para habilitar caja.'
                  : 'Caja se habilita después de entregar el pedido y solicitar la cuenta.'}
              </p>
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
                  const product = menuProductById.get(line.productId);
                  if (!product) {
                    return null;
                  }

                  const billableModifierTotal = getBillableModifierTotal(line.sauces) + getBillableModifierTotal(line.dressings);
                  const lineTotal = product.price * line.quantity + billableModifierTotal * line.quantity;
                  const details = [
                    line.sauces.length ? `Salsas: ${line.sauces.join(', ')}` : '',
                    line.dressings.length ? `Aderezos: ${line.dressings.join(', ')}` : '',
                    billableModifierTotal > 0 ? `Extras cobrables: ${formatMoney(billableModifierTotal)} por unidad` : '',
                    line.notes,
                  ]
                    .filter(Boolean)
                    .join(' • ');

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
                      <div className="flex items-center gap-3">
                        <div className="min-w-[76px] text-right text-xs font-semibold text-slate-600 dark:text-zinc-300">
                          {formatMoney(lineTotal)}
                        </div>
                        <button
                          type="button"
                          onClick={() => openProductModal(product.id, line.id)}
                          className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-100 dark:border-white/10 dark:bg-black/20 dark:text-white dark:hover:bg-white/[0.06] sm:h-11 sm:w-11"
                          title="Editar detalle"
                        >
                          <AppIcon icon={Pencil} className="mx-auto h-4 w-4" />
                        </button>
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
                <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                  {editingLineId ? 'Modifica el detalle para confirmar otra vez cómo lo quiere el cliente.' : 'Captura cómo lo quiere el cliente antes de agregarlo al pedido.'}
                </p>
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
              {modalProductAllowsModifiers ? (
                <>
                  <div className="space-y-3">
                    <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Salsa</label>
                    <button
                      type="button"
                      onClick={() => openModifierDialog('SAUCES')}
                      className="flex h-14 w-full items-center justify-between rounded-[22px] border border-slate-200 bg-white px-4 text-left text-sm text-slate-900 transition hover:bg-slate-50 dark:border-white/10 dark:bg-black/30 dark:text-white dark:hover:bg-white/[0.06] sm:text-base lg:h-16 lg:text-lg"
                    >
                      <span className="truncate">{modalSauces.length ? `${modalSauces.length} salsa(s) seleccionadas` : 'Seleccionar salsas'}</span>
                      <span className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-zinc-500">Ver</span>
                    </button>
                    {modalSauces.length ? (
                      <p className="text-xs text-slate-500 dark:text-zinc-500">{modalSauces.join(', ')}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setModalSauces([])}
                        disabled={!modalSauces.length}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                      >
                        <AppIcon icon={X} className="h-3.5 w-3.5" />
                        Quitar salsas
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Aderezo</label>
                    <button
                      type="button"
                      onClick={() => openModifierDialog('DRESSINGS')}
                      className="flex h-14 w-full items-center justify-between rounded-[22px] border border-slate-200 bg-white px-4 text-left text-sm text-slate-900 transition hover:bg-slate-50 dark:border-white/10 dark:bg-black/30 dark:text-white dark:hover:bg-white/[0.06] sm:text-base lg:h-16 lg:text-lg"
                    >
                      <span className="truncate">{modalDressings.length ? `${modalDressings.length} aderezo(s) seleccionados` : 'Seleccionar aderezos'}</span>
                      <span className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-zinc-500">Ver</span>
                    </button>
                    {modalDressings.length ? (
                      <p className="text-xs text-slate-500 dark:text-zinc-500">{modalDressings.join(', ')}</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setModalDressings([])}
                      disabled={!modalDressings.length}
                      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                    >
                      <AppIcon icon={X} className="h-3.5 w-3.5" />
                      Quitar aderezos
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500 sm:col-span-2">
                  Este producto no aplica para salsas o aderezos.
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Observaciones</label>
                <textarea
                  value={modalNotes}
                  onChange={(event) => setModalNotes(event.target.value)}
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
                {editingLineId ? 'Guardar cambios' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {productModalOpen && modifierDialogSection ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm dark:bg-black/70">
          <div className="w-full max-w-4xl rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b0b10] dark:text-white dark:shadow-none sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Complementos</p>
                <h2 className="mt-2 truncate font-display text-2xl text-slate-950 dark:text-white sm:text-3xl">
                  {modifierDialogSection === 'SAUCES' ? 'Seleccionar salsa' : 'Seleccionar aderezo'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModifierDialog}
                className="h-10 w-10 rounded-2xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid max-h-[60vh] gap-3 overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {activeModifierOptions.length ? (
                activeModifierOptions.map((option) => (
                  <button
                    key={`${option.section}-${option.id}`}
                    type="button"
                    onClick={() => toggleModifier(option.label)}
                    className={`rounded-[24px] border p-4 text-left shadow-sm transition dark:shadow-none ${
                      modifierDraftSelection.includes(option.label)
                        ? 'border-emerald-300/40 bg-emerald-500/10 hover:bg-emerald-500/15 dark:border-emerald-300/30 dark:bg-emerald-500/10'
                        : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-zinc-950/40 dark:hover:bg-zinc-950/55'
                    }`}
                  >
                    {option.imageUrl ? (
                      <img
                        src={option.imageUrl}
                        alt={option.label}
                        className="mb-4 aspect-[4/3] w-full rounded-[18px] border border-slate-200 object-cover dark:border-white/10"
                        loading="lazy"
                      />
                    ) : (
                      <div className="mb-4 flex aspect-[4/3] w-full items-center justify-center rounded-[18px] border border-slate-200 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-500">
                        <AppIcon icon={modifierDialogSection === 'SAUCES' ? ChefHat : Salad} className="h-7 w-7" />
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-950 dark:text-white">{option.label}</p>
                        {option.price > 0 ? (
                          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-200">Cobro adicional: {formatMoney(option.price)}</p>
                        ) : (
                          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">Sin costo adicional</p>
                        )}
                      </div>
                      {modifierDraftSelection.includes(option.label) ? (
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200">
                          <AppIcon icon={Check} className="h-4 w-4" />
                        </span>
                      ) : null}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500 sm:col-span-2 xl:col-span-3">
                  No hay {modifierDialogSection === 'SAUCES' ? 'salsas' : 'aderezos'} creados todavía en el catálogo.
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeModifierDialog}
                className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-14 sm:text-base"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={applyModifierSelection}
                className="h-12 rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white sm:h-14 sm:text-base"
              >
                Aplicar selección
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
