import {
  ArrowLeft,
  Check,
  ChefHat,
  Coffee,
  Lock,
  MonitorSmartphone,
  Pencil,
  ReceiptText,
  Salad,
  SendHorizontal,
  ShoppingCart,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '@/components/AppIcon';
import { ActiveUserLabel } from '@/components/ActiveUserLabel';
import { TableCapacity } from '@/components/TableCapacity';
import { TableCardMark } from '@/components/TableCardMark';
import { getCategoryIcon } from '@/lib/menu-category-icon';
import { isMenuSectionVisibleInPos } from '@/lib/menu-sections';
import { buildCustomerDisplayFromCartLines, useSunmiCustomerDisplaySync } from '@/lib/sunmi/customer-display';
import { createOrUpdateOrder, loginRequest, releaseTableReservationKeepalive, updateTableReservation } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';
import type { MenuCategory, MenuProduct } from '@/types/restaurant';

type MenuSection = 'DISHES' | 'BEVERAGES' | 'PRODUCTS' | 'EXTRAS' | 'SAUCES' | 'DRESSINGS';
type ModifierSection = 'SAUCES' | 'DRESSINGS';
type CartLine = {
  id: string;
  productId: number;
  quantity: number;
  notes: string;
  sauces: string[];
  dressings: string[];
};

type ModifierOption = {
  id: number;
  label: string;
  imageUrl?: string | null;
  section: ModifierSection;
  price: number;
};

const KIOSK_RESERVED_TABLE_KEY = 'restaurant-gt-kiosk-reserved-table-id';
const KIOSK_RESERVATION_KEY = 'restaurant-gt-kiosk-reservation-key';
function reservationKey() {
  let key = sessionStorage.getItem(KIOSK_RESERVATION_KEY);
  if (!key) {
    key = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(KIOSK_RESERVATION_KEY, key);
  }
  return key;
}
const categoryButton = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-center font-semibold transition portrait:min-h-20 portrait:flex-col portrait:flex-[0_1_10rem] portrait:text-base portrait:[&_svg]:h-7 portrait:[&_svg]:w-7';

function normalizeLabel(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
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

function productSupportsModifiers(product: MenuProduct, category?: MenuCategory | null, section?: MenuSection | null) {
  const resolvedSection = section ?? (product.isPrepared ? 'DISHES' : 'PRODUCTS');
  if (resolvedSection !== 'DISHES' || product.station !== 'KITCHEN') {
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

function stationLabel(station: 'KITCHEN' | 'BAR' | 'PASTRY') {
  if (station === 'BAR') return 'Bar';
  if (station === 'PASTRY') return 'Pasteleria';
  return 'Cocina';
}

export default function KioskPage() {
  const navigate = useNavigate();
  const user = useSessionStore((state) => state.user);
  const kioskOnly = user?.permissions.includes('KIOSK_ONLY');
  const logout = useSessionStore((state) => state.logout);
  const snapshot = useSessionStore((state) => state.snapshot);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const [serviceType, setServiceType] = useState<'DINE_IN' | 'TAKE_OUT'>('TAKE_OUT');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedLeafCategoryId, setSelectedLeafCategoryId] = useState<number | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [reservedTableId, setReservedTableId] = useState<number | null>(() => {
    const storedValue = Number(sessionStorage.getItem(KIOSK_RESERVED_TABLE_KEY) ?? '');
    return Number.isInteger(storedValue) && storedValue > 0 ? storedValue : null;
  });
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [welcomeScreen, setWelcomeScreen] = useState(true);
  const [orderModeDialogOpen, setOrderModeDialogOpen] = useState(false);
  const [orderModeStep, setOrderModeStep] = useState<'TYPE' | 'CONTACT' | 'AREA' | 'TABLE'>('TYPE');
  const [cartVisible, setCartVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reservingTable, setReservingTable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<{ code: string; type: 'DINE_IN' | 'TAKE_OUT' } | null>(null);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [modalProductId, setModalProductId] = useState<number | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [modalNotes, setModalNotes] = useState('');
  const [modalSauces, setModalSauces] = useState<string[]>([]);
  const [modalDressings, setModalDressings] = useState<string[]>([]);
  const [modifierDialogSection, setModifierDialogSection] = useState<ModifierSection | null>(null);
  const [modifierDraftSelection, setModifierDraftSelection] = useState<string[]>([]);
  const staleReservationHandledRef = useRef(false);

  const currencySymbol = snapshot?.brand.currencySymbol ?? 'Q';
  const tables = snapshot?.tables ?? [];
  const menuCategories = snapshot?.menuCategories ?? [];
  const menuProducts = snapshot?.menuProducts ?? [];
  const availableTables = useMemo(
    () =>
      tables.filter(
        (table) =>
          table.status !== 'OCCUPIED' && (table.status !== 'RESERVED' || table.id === reservedTableId || table.id === selectedTableId),
      ),
    [reservedTableId, selectedTableId, tables],
  );
  const availableTablesByArea = useMemo(() => {
    const areaMap = new Map<string, typeof availableTables>();

    availableTables.forEach((table) => {
      const area = table.area?.trim() || 'General';
      const current = areaMap.get(area) ?? [];
      current.push(table);
      areaMap.set(area, current);
    });

    return Array.from(areaMap.entries())
      .map(([area, areaTables]) => ({
        area,
        tables: areaTables.slice().sort((left, right) => left.code.localeCompare(right.code)),
      }))
      .sort((left, right) => left.area.localeCompare(right.area));
  }, [availableTables]);
  const selectedAreaGroup = useMemo(
    () => availableTablesByArea.find((group) => group.area === selectedArea) ?? null,
    [availableTablesByArea, selectedArea],
  );
  const tablesForSelectedArea = selectedAreaGroup?.tables ?? [];
  const selectedTable = useMemo(() => availableTables.find((table) => table.id === selectedTableId) ?? null, [availableTables, selectedTableId]);
  const menuProductById = useMemo(() => new Map(menuProducts.map((product) => [product.id, product])), [menuProducts]);
  const categoryById = useMemo(() => new Map(menuCategories.map((category) => [category.id, category])), [menuCategories]);
  const cartLines = useMemo(() => Object.values(cart), [cart]);

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
      .sort((a, b) => {
        const orderDiff = groupOrder(a) - groupOrder(b);
        if (orderDiff !== 0) {
          return orderDiff;
        }
        return a.name.localeCompare(b.name);
      });
  }, [menuCategories]);

  const activeGroup = useMemo(() => {
    if (!categoryGroups.length) return null;
    if (selectedGroupId) {
      return categoryGroups.find((group) => group.id === selectedGroupId) ?? categoryGroups[0];
    }
    return categoryGroups[0];
  }, [categoryGroups, selectedGroupId]);

  const subcategories = useMemo(() => {
    if (!activeGroup) return [];
    return menuCategories
      .filter((category) => category.parentId === activeGroup.id)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeGroup, menuCategories]);

  const selectedCategory = useMemo(() => {
    if (!subcategories.length) return null;
    return subcategories.find((category) => category.id === selectedCategoryId) ?? null;
  }, [selectedCategoryId, subcategories]);

  const leafCategories = useMemo(() => {
    if (!selectedCategory) return [];
    return menuCategories
      .filter((category) => category.parentId === selectedCategory.id)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [menuCategories, selectedCategory]);

  const activeLeafCategory = useMemo(() => {
    if (!leafCategories.length) return null;
    return leafCategories.find((category) => category.id === selectedLeafCategoryId) ?? null;
  }, [leafCategories, selectedLeafCategoryId]);

  const productsForCategory = useMemo(() => {
    if (activeLeafCategory) {
      return menuProducts.filter((product) => product.categoryId === activeLeafCategory.id);
    }
    if (selectedCategory) {
      const ids = new Set([selectedCategory.id, ...leafCategories.map(category => category.id)]);
      return menuProducts.filter((product) => product.categoryId != null && ids.has(product.categoryId));
    }
    if (activeGroup) {
      return menuProducts.filter((product) => product.categoryId === activeGroup.id);
    }
    return [];
  }, [activeGroup, activeLeafCategory, leafCategories, menuProducts, selectedCategory]);

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

    return Array.from(uniqueNames.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [categorySectionById, menuProducts]);

  const sauceOptions = useMemo(() => modifierOptions.filter((option) => option.section === 'SAUCES'), [modifierOptions]);
  const dressingOptions = useMemo(() => modifierOptions.filter((option) => option.section === 'DRESSINGS'), [modifierOptions]);
  const activeModifierOptions = modifierDialogSection === 'SAUCES' ? sauceOptions : dressingOptions;
  const modifierOptionByName = useMemo(
    () => new Map(modifierOptions.map((option) => [normalizeLabel(option.label), option] as const)),
    [modifierOptions],
  );

  const modalProduct = useMemo(
    () => (modalProductId ? menuProducts.find((item) => item.id === modalProductId) ?? null : null),
    [menuProducts, modalProductId],
  );
  const modalProductCategory = useMemo(
    () => (modalProduct?.categoryId ? categoryById.get(modalProduct.categoryId) ?? null : null),
    [categoryById, modalProduct],
  );
  const modalProductSection = useMemo(
    () =>
      modalProduct?.categoryId
        ? categorySectionById.get(modalProduct.categoryId) ?? (modalProduct.isPrepared ? 'DISHES' : 'PRODUCTS')
        : null,
    [categorySectionById, modalProduct],
  );
  const modalProductAllowsModifiers = useMemo(
    () => (modalProduct ? productSupportsModifiers(modalProduct, modalProductCategory, modalProductSection) : false),
    [modalProduct, modalProductCategory, modalProductSection],
  );

  useEffect(() => {
    if (reservedTableId) {
      sessionStorage.setItem(KIOSK_RESERVED_TABLE_KEY, String(reservedTableId));
      return;
    }

    sessionStorage.removeItem(KIOSK_RESERVED_TABLE_KEY);
  }, [reservedTableId]);

  useEffect(() => {
    if (!reservedTableId) {
      return;
    }

    const handlePageExit = () => {
      releaseTableReservationKeepalive(reservedTableId, reservationKey());
    };

    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);

    return () => {
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
    };
  }, [reservedTableId]);

  useEffect(() => {
    if (staleReservationHandledRef.current || !snapshot) {
      return;
    }

    staleReservationHandledRef.current = true;

    if (!reservedTableId) {
      return;
    }

    const reservedTable = tables.find((table) => table.id === reservedTableId) ?? null;
    if (!reservedTable || reservedTable.status !== 'RESERVED') {
      setReservedTableId(null);
      return;
    }

    void (async () => {
      let released = false;
      try {
        await updateTableReservation({ tableId: reservedTableId, status: 'FREE', kioskKey: reservationKey() });
        released = true;
      } catch {
        return;
      } finally {
        if (released) {
          setSelectedTableId(null);
          setSelectedArea(null);
          setReservedTableId(null);
          await refreshSnapshot();
        }
      }
    })();
  }, [refreshSnapshot, reservedTableId, snapshot, tables]);

  function restoreReservedTableSelection() {
    const currentReservedTable = tables.find((table) => table.id === reservedTableId) ?? null;
    setSelectedTableId(reservedTableId);
    setSelectedArea(currentReservedTable?.area?.trim() || null);
  }

  function closeOrderModeDialog() {
    restoreReservedTableSelection();
    setError(null);
    setOrderModeStep('TYPE');
    setOrderModeDialogOpen(false);
  }

  async function syncTableReservation(nextTableId: number | null) {
    const kioskKey = reservationKey();
    if (nextTableId) {
      await updateTableReservation({ tableId: nextTableId, status: 'RESERVED', kioskKey,
        reservation: {
          name: customerName.trim(),
          address: '',
          guests: 1,
          ...(customerPhone.trim() ? { phone: customerPhone.trim() } : {}),
        },
      });
    }

    if (reservedTableId && reservedTableId !== nextTableId) {
      try {
        await updateTableReservation({ tableId: reservedTableId, status: 'FREE', kioskKey });
      } catch (error) {
        if (nextTableId) await updateTableReservation({ tableId: nextTableId, status: 'FREE', kioskKey });
        throw error;
      }
    }

    setReservedTableId(nextTableId);
    await refreshSnapshot();
  }

  function formatMoney(amount: number) {
    return `${currencySymbol} ${amount.toFixed(2)}`;
  }

  function resolveModifierOptions(labels: string[]) {
    return labels
      .map((label) => modifierOptionByName.get(normalizeLabel(label)) ?? null)
      .filter((option): option is ModifierOption => option !== null);
  }

  function getBillableModifierTotal(labels: string[]) {
    return resolveModifierOptions(labels).reduce((sum, option) => sum + (option.price > 0 ? option.price : 0), 0);
  }

  function upsertCartLine(lineId: string | null, payload: { productId: number; notes?: string; sauces?: string[]; dressings?: string[] }) {
    setCart((current) => {
      const normalizedNotes = (payload.notes ?? '').trim();
      const sauces = [...new Set((payload.sauces ?? []).map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      const dressings = [...new Set((payload.dressings ?? []).map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      const existingLine = lineId ? current[lineId] ?? null : null;

      const matchingLine = Object.values(current).find(
        (line) =>
          line.id !== lineId &&
          line.productId === payload.productId &&
          line.notes === normalizedNotes &&
          line.sauces.join('||') === sauces.join('||') &&
          line.dressings.join('||') === dressings.join('||'),
      );

      if (matchingLine && existingLine) {
        const next = { ...current };
        next[matchingLine.id] = {
          ...matchingLine,
          quantity: matchingLine.quantity + existingLine.quantity,
        };
        delete next[lineId];
        return next;
      }

      if (existingLine) {
        return {
          ...current,
          [existingLine.id]: {
            ...existingLine,
            productId: payload.productId,
            notes: normalizedNotes,
            sauces,
            dressings,
          },
        };
      }

      const newLine = Object.values(current).find(
        (line) =>
          line.productId === payload.productId &&
          line.notes === normalizedNotes &&
          line.sauces.join('||') === sauces.join('||') &&
          line.dressings.join('||') === dressings.join('||'),
      );

      if (newLine) {
        return {
          ...current,
          [newLine.id]: {
            ...newLine,
            quantity: newLine.quantity + 1,
          },
        };
      }

      const id = `K${Date.now()}${Math.random().toString(16).slice(2)}`;
      return {
        ...current,
        [id]: {
          id,
          productId: payload.productId,
          quantity: 1,
          notes: normalizedNotes,
          sauces,
          dressings,
        },
      };
    });
  }

  function incrementLine(lineId: string) {
    setCart((current) => {
      const existing = current[lineId];
      if (!existing) {
        return current;
      }
      return {
        ...current,
        [lineId]: {
          ...existing,
          quantity: existing.quantity + 1,
        },
      };
    });
  }

  function decrementLine(lineId: string) {
    setCart((current) => {
      const existing = current[lineId];
      if (!existing) {
        return current;
      }

      if (existing.quantity <= 1) {
        const next = { ...current };
        delete next[lineId];
        return next;
      }

      return {
        ...current,
        [lineId]: {
          ...existing,
          quantity: existing.quantity - 1,
        },
      };
    });
  }

  function removeLine(lineId: string) {
    setCart((current) => {
      const next = { ...current };
      delete next[lineId];
      return next;
    });
  }

  async function resetKioskOrder() {
    if (reservedTableId) {
      try {
        await syncTableReservation(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No fue posible liberar la mesa del kiosko.');
        return;
      }
    }

    returnToWelcome();
  }

  function returnToWelcome() {
    setSelectedArea(null);
    setCustomerName('');
    sessionStorage.removeItem(KIOSK_RESERVATION_KEY);
    setCustomerPhone('');
    setSelectedTableId(null);
    setReservedTableId(null);
    setCart({});
    setError(null);
    setSuccessOrder(null);
    setSelectedGroupId(null);
    setSelectedCategoryId(null);
    setSelectedLeafCategoryId(null);
    setCategoryDialogOpen(false);
    setWelcomeScreen(true);
    setOrderModeDialogOpen(false);
    setOrderModeStep('TYPE');
    setCartVisible(false);
  }

  function beginOrderFlow() {
    setSuccessOrder(null);
    setError(null);
    restoreReservedTableSelection();
    setOrderModeStep('TYPE');
    setOrderModeDialogOpen(true);
  }

  async function confirmOrderMode(type: 'DINE_IN' | 'TAKE_OUT') {
    setServiceType(type);
    if (type === 'TAKE_OUT') {
      if (reservedTableId) {
        try {
          setReservingTable(true);
          await syncTableReservation(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No fue posible liberar la mesa.');
          return;
        } finally {
          setReservingTable(false);
        }
      }
      setSelectedArea(null);
      setSelectedTableId(null);
    } else {
      setSelectedTableId(null);
    }
    setOrderModeStep('CONTACT');
  }

  function confirmCustomerContact() {
    if (!customerName.trim()) {
      setError('Ingresa el nombre completo para continuar.');
      return;
    }

    setError(null);
    if (serviceType === 'TAKE_OUT') {
      setWelcomeScreen(false);
      setOrderModeDialogOpen(false);
      setCartVisible(false);
      return;
    }
    setOrderModeStep('AREA');
  }

  function confirmSelectedArea() {
    if (!selectedArea) {
      setError('Selecciona un area para continuar.');
      return;
    }

    setError(null);
    setSelectedTableId(null);
    setOrderModeStep('TABLE');
  }

  async function confirmSelectedTable() {
    if (!selectedTableId) {
      setError('Selecciona una mesa para continuar.');
      return;
    }

    setError(null);
    setReservingTable(true);
    try {
      await syncTableReservation(selectedTableId);
      setOrderModeStep('TYPE');
      setWelcomeScreen(false);
      setOrderModeDialogOpen(false);
      setCartVisible(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible reservar la mesa seleccionada.');
    } finally {
      setReservingTable(false);
    }
  }

  function openAdminDialog() {
    setAdminDialogOpen(true);
    setAdminPassword('');
    setUnlockError(null);
  }

  function closeAdminDialog() {
    if (unlocking) {
      return;
    }
    setAdminDialogOpen(false);
    setAdminPassword('');
    setUnlockError(null);
  }

  async function validateAdminAccess() {
    if (!user?.email) {
      throw new Error('No hay un usuario activo para desbloquear el kiosko.');
    }
    if (!adminPassword.trim()) {
      throw new Error('Ingresa la contrasena del usuario administrador del kiosko.');
    }

    await loginRequest(user.email, adminPassword);
  }

  async function handleAdminAction(action: 'panel' | 'logout') {
    if (unlocking || (kioskOnly && action !== 'logout')) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      await validateAdminAccess();
      if (reservedTableId) {
        await syncTableReservation(null);
      }
      setAdminDialogOpen(false);
      setAdminPassword('');
      if (action === 'logout') {
        logout();
        return;
      }
      navigate('/dashboard');
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'No fue posible desbloquear el kiosko.');
    } finally {
      setUnlocking(false);
    }
  }

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

    upsertCartLine(editingLineId, {
      productId: modalProductId,
      notes: modalNotes,
      sauces: modalProductAllowsModifiers ? modalSauces : [],
      dressings: modalProductAllowsModifiers ? modalDressings : [],
    });
    closeProductModal();
  }

  const cartTotal = useMemo(() => {
    return cartLines.reduce((sum, line) => {
      const product = menuProductById.get(line.productId);
      if (!product) {
        return sum;
      }
      const baseTotal = product.price * line.quantity;
      const modifierTotal = (getBillableModifierTotal(line.sauces) + getBillableModifierTotal(line.dressings)) * line.quantity;
      return sum + baseTotal + modifierTotal;
    }, 0);
  }, [cartLines, menuProductById, modifierOptionByName]);

  const customerDisplayPayload = useMemo(
    () =>
      buildCustomerDisplayFromCartLines({
        brandName: snapshot?.brand?.name ?? 'Restaurante',
        currencySymbol,
        lines: cartLines,
        getProductName: (productId) => menuProductById.get(productId)?.name,
        getUnitPrice: (productId) => menuProductById.get(productId)?.price ?? 0,
        getModifierUnitTotal: (line) =>
          getBillableModifierTotal(line.sauces) + getBillableModifierTotal(line.dressings),
      }),
    [snapshot?.brand?.name, currencySymbol, cartLines, menuProductById, modifierOptionByName],
  );
  useSunmiCustomerDisplaySync(customerDisplayPayload);

  async function handleSendOrder() {
    setError(null);
    setSuccessOrder(null);

    if (serviceType === 'DINE_IN' && !selectedTableId) {
      setError('Selecciona una mesa para enviar el pedido a salon.');
      return;
    }

    if (!cartLines.length) {
      setError('Agrega al menos un producto al pedido.');
      return;
    }

    if (!customerName.trim()) {
      setError('Ingresa el nombre completo del cliente.');
      beginOrderFlow();
      setOrderModeStep('CONTACT');
      return;
    }

    setSubmitting(true);
    try {
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

      const response = await createOrUpdateOrder({
        ...(serviceType === 'DINE_IN' && selectedTableId ? { tableId: selectedTableId, kioskKey: reservationKey() } : {}),
        ...(customerName.trim()
          ? {
              customer: {
                name: customerName.trim(),
                ...(customerPhone.trim() ? { phone: customerPhone.trim() } : {}),
              },
            }
          : {}),
        type: serviceType,
        channel: 'Kiosko autoservicio',
        items: orderItems,
      });

      returnToWelcome();
      setSuccessOrder({
        code: typeof (response as { code?: unknown })?.code === 'string' ? (response as { code: string }).code : 'ORDEN REGISTRADA',
        type: serviceType,
      });
      void refreshSnapshot().catch(() => { /* La comanda ya fue registrada. */ });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible registrar el pedido del kiosko.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#07070a] dark:text-white portrait:[&_button]:min-h-12 portrait:[&_button]:min-w-12 portrait:[&_button]:touch-manipulation portrait:[&>div.fixed>div]:max-h-full portrait:[&>div.fixed>div]:overflow-y-auto">
      {welcomeScreen ? (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(249,115,22,0.10),_transparent_24%)]" />
          <div className="relative w-full max-w-5xl rounded-[42px] border border-slate-200 bg-white/95 px-8 py-12 text-center shadow-[0_30px_120px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:px-12 sm:py-16 lg:px-16 lg:py-20">
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
              <ActiveUserLabel />
            <button
              type="button"
              onClick={openAdminDialog}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition ${kioskOnly ? 'session-exit' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]'}`}
              aria-label={kioskOnly ? 'Salir del kiosco' : 'Acceso admin'}
              title={kioskOnly ? 'Salir del kiosco' : 'Acceso admin'}
              style={kioskOnly ? { width: 'auto', paddingInline: 12, gap: 6 } : undefined}
            >
              <AppIcon icon={Lock} className="h-4 w-4" />
              {kioskOnly && 'Salir'}
            </button>
            </div>
            {snapshot?.brand.logoData ? (
              <div className="mx-auto mt-8 flex h-40 w-full max-w-xs items-center justify-center rounded-[28px] border border-amber-300/30 bg-white p-3 shadow-sm dark:bg-white/[0.03] dark:shadow-none sm:mt-0 sm:h-52 sm:max-w-sm portrait:sm:h-64 portrait:sm:max-w-md">
                <img src={snapshot.brand.logoData} alt={snapshot.brand.name ?? 'Logo'} className="h-full w-full object-contain" />
              </div>
            ) : (
              <div className="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-[28px] border border-amber-300/30 bg-amber-300/10 text-amber-700 dark:text-amber-200">
                <AppIcon icon={MonitorSmartphone} className="h-10 w-10" />
              </div>
            )}
            <p className="mt-6 text-xs uppercase tracking-[0.45em] text-slate-500 dark:text-zinc-500">Kiosko de autoservicio</p>
            {successOrder && (
              <p role="status" className="mt-4 font-semibold text-emerald-700 dark:text-emerald-200">
                Pedido recibido: {successOrder.code}. {successOrder.type === 'TAKE_OUT' ? 'Pasa a caja para completar el pago.' : 'La cocina preparará tu pedido.'}
              </p>
            )}
            <h1 className="mt-4 font-display text-5xl text-slate-950 dark:text-white sm:text-6xl lg:text-7xl">
              Haz tu pedido
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-slate-600 dark:text-zinc-400 sm:text-lg lg:text-xl">
              Toca «Iniciar pedido» y elige si vas a comer aquí o si lo quieres para llevar.
            </p>
            <button
              type="button"
              onClick={beginOrderFlow}
              className="mt-10 inline-flex h-16 items-center gap-3 rounded-[28px] border border-amber-300/30 bg-amber-300/10 px-8 text-lg font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white sm:h-20 sm:px-12 sm:text-2xl"
            >
              <AppIcon icon={ShoppingCart} className="h-6 w-6 sm:h-7 sm:w-7" />
              Iniciar pedido
            </button>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex min-h-screen w-full max-w-[1880px] flex-col px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6 portrait:!pb-[calc(6rem+env(safe-area-inset-bottom))]">
          <header className="mb-4 flex items-center justify-between gap-3 rounded-[28px] border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:px-5 portrait:flex-wrap">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              {snapshot?.brand.logoData ? (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-white/[0.03]">
                  <img src={snapshot.brand.logoData} alt={snapshot.brand.name ?? 'Logo'} className="h-full w-full object-cover" />
                </div>
              ) : null}
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Kiosko</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h1 className="truncate font-display text-2xl text-slate-950 dark:text-white sm:text-3xl">{snapshot?.brand.name ?? 'Restaurante'}</h1>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-8 items-center rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 text-xs font-semibold uppercase tracking-[0.22em] text-amber-900 dark:text-white">
                  {serviceType === 'DINE_IN' ? 'Comer aqui' : 'Para llevar'}
                </span>
                {serviceType === 'DINE_IN' && selectedTableId ? (
                  <span className="inline-flex h-8 items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-200">
                    Mesa {selectedTable?.code ?? selectedTableId}
                  </span>
                ) : null}
                {serviceType === 'DINE_IN' && selectedArea ? (
                  <span className="inline-flex h-8 items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-200">
                    Area {selectedArea}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  restoreReservedTableSelection();
                  setError(null);
                  setOrderModeStep('TYPE');
                  setOrderModeDialogOpen(true);
                }}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
              >
                <AppIcon icon={UtensilsCrossed} className="h-4 w-4" />
                Cambiar modo
              </button>
              <button
                type="button"
                onClick={() => setCartVisible((current) => !current)}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white portrait:hidden"
              >
                <AppIcon icon={ShoppingCart} className="h-4 w-4" />
                Pedido ({cartLines.reduce((sum, line) => sum + line.quantity, 0)})
              </button>
              <ActiveUserLabel />
              <button
                type="button"
                onClick={openAdminDialog}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition ${kioskOnly ? 'session-exit' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]'}`}
                aria-label={kioskOnly ? 'Salir del kiosco' : 'Acceso admin'}
                title={kioskOnly ? 'Salir del kiosco' : 'Acceso admin'}
                style={kioskOnly ? { width: 'auto', paddingInline: 12, gap: 6 } : undefined}
              >
                <AppIcon icon={Lock} className="h-4 w-4" />
                {kioskOnly && 'Salir'}
              </button>
            </div>
          </header>

          <div className="relative flex-1 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
            <div className="flex h-full flex-col">
              <div className="border-b border-slate-200 px-4 py-4 dark:border-white/10 sm:px-5">
                <h2 className="mb-5 hidden text-center font-display text-3xl portrait:block">Elige un menú</h2>
                <div className="flex flex-wrap justify-center gap-2">
                  {categoryGroups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => {
                        setSelectedGroupId(group.id);
                        setSelectedCategoryId(null);
                        setSelectedLeafCategoryId(null);
                        if (!menuCategories.some(category => category.parentId === group.id)) setCategoryDialogOpen(true);
                      }}
                      className={`${categoryButton} text-sm sm:text-base ${
                        activeGroup?.id === group.id
                          ? 'border-amber-300/40 bg-amber-300/10 text-amber-950 dark:text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      <AppIcon icon={getCategoryIcon(group)} className="h-5 w-5 shrink-0" />
                      {group.name}
                    </button>
                  ))}
                </div>
                {subcategories.length ? (
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {activeGroup && menuProducts.some(product => product.categoryId === activeGroup.id) && (
                      <button type="button" className={categoryButton} onClick={() => {
                        setSelectedCategoryId(null);
                        setSelectedLeafCategoryId(null);
                        setCategoryDialogOpen(true);
                      }}><AppIcon icon={getCategoryIcon(activeGroup)} className="h-5 w-5 shrink-0" />Platillos de {activeGroup.name}</button>
                    )}
                    {subcategories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategoryId(category.id);
                          setSelectedLeafCategoryId(null);
                          setCategoryDialogOpen(true);
                        }}
                        className={`${categoryButton} text-sm ${
                          selectedCategory?.id === category.id
                            ? 'border-sky-300/40 bg-sky-500/10 text-sky-950 dark:text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                        }`}
                      >
                        <AppIcon icon={getCategoryIcon(category)} className="h-5 w-5 shrink-0" />
                        {category.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {categoryDialogOpen && (
                  <dialog
                    ref={node => { if (node && !node.open) node.showModal(); }}
                    onClose={() => setCategoryDialogOpen(false)}
                    aria-labelledby="kiosk-category-title"
                    className="m-auto max-h-[88vh] w-[94vw] max-w-5xl overflow-auto rounded-[28px] bg-white p-5 text-slate-900 backdrop:bg-black/60 dark:bg-zinc-950 dark:text-white"
                  >
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white py-2 dark:bg-zinc-950">
                      <h2 id="kiosk-category-title" className="font-display text-2xl">{selectedCategory?.name ?? activeGroup?.name}</h2>
                      <button type="button" autoFocus onClick={() => setCategoryDialogOpen(false)} className="min-h-11 rounded-2xl border px-4 font-semibold">Volver a categorías</button>
                    </div>
                {leafCategories.length ? (
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <button type="button" aria-pressed={!activeLeafCategory} onClick={() => setSelectedLeafCategoryId(null)} className={`${categoryButton} aria-pressed:bg-amber-300/20`}><AppIcon icon={UtensilsCrossed} className="h-5 w-5 shrink-0" />Todos</button>
                    {leafCategories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => setSelectedLeafCategoryId(category.id)}
                        className={`${categoryButton} text-sm ${
                          activeLeafCategory?.id === category.id
                            ? 'border-violet-300/40 bg-violet-500/10 text-violet-950 dark:text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                        }`}
                      >
                        <AppIcon icon={getCategoryIcon(category)} className="h-5 w-5 shrink-0" />
                        {category.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              <div className="flex-1 overflow-auto px-4 py-4 sm:px-5">
                {!productsForCategory.length && <p>No hay platillos en esta categoría.</p>}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {productsForCategory.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => openProductModal(product.id)}
                      className="rounded-[24px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-zinc-950/40 dark:shadow-none dark:hover:bg-zinc-950/55"
                    >
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="mb-4 aspect-[4/3] w-full rounded-[18px] border border-slate-200 object-cover dark:border-white/10"
                          loading="lazy"
                        />
                      ) : (
                        <div className="mb-4 flex aspect-[4/3] w-full items-center justify-center rounded-[18px] border border-slate-200 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-500">
                          <AppIcon icon={product.station === 'BAR' ? Coffee : product.station === 'PASTRY' ? ReceiptText : ChefHat} className="h-8 w-8" />
                        </div>
                      )}
                      <p className="font-semibold text-slate-950 dark:text-white sm:text-lg">{product.name}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-700 dark:text-zinc-200">{formatMoney(product.price)}</p>
                    </button>
                  ))}
                </div>
              </div>
                  </dialog>
                )}
              </div>
            </div>

            <aside aria-label="Tu pedido"
              className={`absolute inset-y-0 right-0 z-20 w-full max-w-[430px] flex-col border-l border-slate-200 bg-white p-4 shadow-[-16px_0_48px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-[#0b0b10] dark:shadow-none sm:p-5 portrait:fixed portrait:inset-0 portrait:max-w-none portrait:overflow-y-auto portrait:overscroll-contain portrait:pb-[max(1rem,env(safe-area-inset-bottom))] ${
                cartVisible ? 'flex' : 'hidden'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Pedido</p>
                  <h2 className="mt-2 font-display text-2xl text-slate-950 dark:text-white">Tu pedido</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setCartVisible(false)}
                  aria-label="Volver al menú"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
                >
                  <AppIcon icon={X} className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-8 items-center rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 text-xs font-semibold uppercase tracking-[0.22em] text-amber-900 dark:text-white">
                    {serviceType === 'DINE_IN' ? 'Comer aqui' : 'Para llevar'}
                  </span>
                  {serviceType === 'DINE_IN' && selectedArea ? (
                    <span className="inline-flex h-8 items-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200">
                      Area {selectedArea}
                    </span>
                  ) : null}
                  {serviceType === 'DINE_IN' && selectedTable ? (
                    <span className="inline-flex h-8 items-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200">
                      Mesa <span className="table-code ms-1">{selectedTable.code}</span>
                    </span>
                  ) : null}
                </div>
                {serviceType === 'DINE_IN' ? (
                  <p className="mt-2 text-xs text-slate-500 dark:text-zinc-500">
                    La mesa ya fue elegida en el flujo guiado del kiosko.
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500 dark:text-zinc-500">
                    Pedido para llevar.
                  </p>
                )}
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Cliente</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-zinc-400">Nombre</span>
                    <span className="font-semibold text-slate-950 dark:text-white">{customerName.trim() || 'No registrado'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-zinc-400">Telefono</span>
                    <span className="font-semibold text-slate-950 dark:text-white">{customerPhone.trim() || 'No registrado'}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-zinc-500">
                  Los datos del cliente se capturan en el flujo guiado y aquí solo se muestran como referencia.
                </p>
              </div>

              <div className="mt-4 flex-1 overflow-auto space-y-2 pr-1 portrait:flex-none portrait:overflow-visible">
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
                      line.notes,
                    ]
                      .filter(Boolean)
                      .join(' • ');

                    return (
                      <div key={line.id} className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3 dark:border-white/10 dark:bg-black/20">
                        <div className="flex items-start gap-3">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="h-14 w-14 shrink-0 rounded-2xl border border-slate-200 object-cover dark:border-white/10"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-500">
                              <AppIcon icon={product.station === 'BAR' ? Coffee : product.station === 'PASTRY' ? ReceiptText : ChefHat} className="h-5 w-5" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="line-clamp-2 font-semibold text-slate-950 dark:text-white">{product.name}</p>
                                {details ? <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500 dark:text-zinc-400">{details}</p> : null}
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="font-semibold text-slate-950 dark:text-white">{formatMoney(lineTotal)}</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">x{line.quantity}</p>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => openProductModal(product.id, line.id)}
                                className="inline-flex h-8 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
                              >
                                <AppIcon icon={Pencil} className="h-3.5 w-3.5" />
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => decrementLine(line.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
                              >
                                -
                              </button>
                              <button
                                type="button"
                                onClick={() => incrementLine(line.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => removeLine(line.id)}
                                className="inline-flex h-8 items-center gap-2 rounded-2xl border border-rose-300/30 bg-rose-500/10 px-3 text-xs font-semibold text-rose-900 transition hover:bg-rose-500/15 dark:text-white"
                              >
                                <AppIcon icon={X} className="h-3.5 w-3.5" />
                                Quitar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500">
                    Tu pedido está vacío.
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                <div className="flex items-center justify-between gap-3 text-sm text-slate-600 dark:text-zinc-400">
                  <span>Total</span>
                  <span className="font-semibold text-slate-950 dark:text-white">{formatMoney(cartTotal)}</span>
                </div>
              </div>

              {error ? (
                <div className="mt-4 rounded-[22px] border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
                  {error}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void handleSendOrder()}
                disabled={submitting || !cartLines.length}
                className="mt-4 inline-flex h-14 w-full items-center justify-center gap-2 rounded-[24px] border border-amber-300/30 bg-amber-300/10 text-base font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
              >
                <AppIcon icon={SendHorizontal} className="h-5 w-5" />
                {submitting ? 'Enviando pedido...' : 'Enviar pedido'}
              </button>
            </aside>
          </div>
          {!cartVisible && (
            <footer className="fixed inset-x-0 bottom-0 z-10 hidden border-t border-slate-200 bg-white px-4 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] dark:border-white/10 dark:bg-zinc-950 portrait:block">
              <button type="button" onClick={() => setCartVisible(true)}
                className="mx-auto flex min-h-14 w-full max-w-3xl items-center justify-between gap-3 rounded-2xl bg-amber-400 px-5 text-lg font-bold text-zinc-950">
                <span className="inline-flex items-center gap-2"><AppIcon icon={ShoppingCart} className="h-6 w-6" />Ver pedido ({cartLines.reduce((sum, line) => sum + line.quantity, 0)})</span>
                <span>{formatMoney(cartTotal)}</span>
              </button>
            </footer>
          )}
        </div>
      )}

      {orderModeDialogOpen ? (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm dark:bg-black/75">
          <div className="w-full max-w-2xl rounded-[32px] border border-slate-200 bg-white p-6 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b0b10] dark:text-white dark:shadow-none sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">
                  {orderModeStep === 'TYPE'
                    ? 'Como deseas ordenar'
                    : orderModeStep === 'CONTACT'
                      ? 'Ingresa tus datos'
                      : orderModeStep === 'AREA'
                        ? 'Selecciona el area'
                        : 'Selecciona tu mesa'}
                </p>
                <h2 className="mt-2 font-display text-3xl text-slate-950 dark:text-white">
                  {orderModeStep === 'TYPE'
                    ? 'Selecciona una opcion'
                    : orderModeStep === 'CONTACT'
                      ? 'Datos del cliente'
                      : orderModeStep === 'AREA'
                        ? 'Elige el area'
                        : 'Elige la mesa'}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                  {orderModeStep === 'TYPE'
                    ? 'Al confirmar, el menú aparecerá a pantalla completa y podrás ver tu pedido al costado.'
                    : orderModeStep === 'CONTACT'
                      ? serviceType === 'TAKE_OUT'
                        ? 'Indica el nombre completo. El telefono es opcional.'
                        : 'Antes de elegir la mesa, registra el nombre completo. El telefono es opcional.'
                    : orderModeStep === 'AREA'
                      ? 'Primero selecciona el area donde estás ubicado y luego verás las mesas disponibles.'
                      : 'Cuando confirmes la mesa, continuarás al menú para seleccionar los platillos.'}
                </p>
              </div>
              {!welcomeScreen ? (
                <button
                  type="button"
                  onClick={closeOrderModeDialog}
                  className="h-10 w-10 rounded-2xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
                >
                  ×
                </button>
              ) : null}
            </div>

            {orderModeStep === 'TYPE' ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void confirmOrderMode('TAKE_OUT')}
                  className="rounded-[28px] border border-emerald-300/40 bg-emerald-500/10 p-6 text-left transition hover:bg-emerald-500/15"
                >
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-[22px] border border-emerald-300/25 bg-white/60 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                    <AppIcon icon={ShoppingCart} className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 font-display text-2xl text-slate-950 dark:text-white">Para llevar</h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">Haces el pedido aquí y luego pasas a caja.</p>
                </button>
                <button
                  type="button"
                  onClick={() => void confirmOrderMode('DINE_IN')}
                  className="rounded-[28px] border border-amber-300/40 bg-amber-300/10 p-6 text-left transition hover:bg-amber-300/15"
                >
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-[22px] border border-amber-300/25 bg-white/60 text-amber-700 dark:bg-amber-300/10 dark:text-amber-200">
                    <AppIcon icon={UtensilsCrossed} className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 font-display text-2xl text-slate-950 dark:text-white">Comer aqui</h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-zinc-300">Primero seleccionas tu mesa y luego continúas al menú.</p>
                </button>
                <button
                  type="button"
                  disabled={reservingTable}
                  onClick={() => void resetKioskOrder()}
                  className="min-h-12 rounded-2xl border border-rose-300/50 px-5 font-semibold text-rose-700 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-200 sm:col-span-2"
                >
                  Cancelar pedido
                </button>
              </div>
            ) : orderModeStep === 'CONTACT' ? (
              <div className="mt-6">
                <div className="grid gap-4">
                  <div>
                    <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Nombre completo</label>
                    <input
                      value={customerName}
                      maxLength={150}
                      required
                      onChange={(event) => setCustomerName(event.target.value)}
                      placeholder="Nombre y apellidos"
                      className="mt-3 h-14 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white dark:placeholder:text-zinc-500 sm:text-base"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Telefono (opcional)</label>
                    <input
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                      placeholder="Opcional"
                      className="mt-3 h-14 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white dark:placeholder:text-zinc-500 sm:text-base"
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setOrderModeStep('TYPE')}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-14 sm:text-base"
                  >
                    <AppIcon icon={ArrowLeft} className="h-4 w-4" />
                    Volver
                  </button>
                  <button
                    type="button"
                    onClick={confirmCustomerContact}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white sm:h-14 sm:text-base"
                  >
                    <AppIcon icon={Check} className="h-4 w-4" />
                    {serviceType === 'TAKE_OUT' ? 'Continuar al menu' : 'Continuar a areas'}
                  </button>
                </div>
              </div>
            ) : orderModeStep === 'AREA' ? (
              <div className="mt-6">
                <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Areas disponibles</label>
                <div className="mt-3 grid max-h-[42vh] grid-cols-2 gap-3 overflow-auto pr-1 sm:grid-cols-3">
                  {availableTablesByArea.map((areaGroup) => (
                    <button
                      key={areaGroup.area}
                      type="button"
                      onClick={() => {
                        setSelectedArea(areaGroup.area);
                        setSelectedTableId(null);
                      }}
                      className={`rounded-[24px] border px-4 py-4 text-left transition ${
                        selectedArea === areaGroup.area
                          ? 'border-amber-300/40 bg-amber-300/10 text-amber-950 dark:text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      <p className="font-display text-2xl text-slate-950 dark:text-white">{areaGroup.area}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-zinc-500">
                        {areaGroup.tables.length} mesa{areaGroup.tables.length === 1 ? '' : 's'}
                      </p>
                    </button>
                  ))}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setOrderModeStep('CONTACT')}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-14 sm:text-base"
                  >
                    <AppIcon icon={ArrowLeft} className="h-4 w-4" />
                    Volver a datos
                  </button>
                  <button
                    type="button"
                    onClick={confirmSelectedArea}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white sm:h-14 sm:text-base"
                  >
                    <AppIcon icon={Check} className="h-4 w-4" />
                    Continuar a mesas
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Mesa disponible</label>
                {selectedArea ? (
                  <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-zinc-300">Area seleccionada: {selectedArea}</p>
                ) : null}
                <div className="mt-3 grid max-h-[42vh] grid-cols-2 gap-x-2 gap-y-3 overflow-auto pr-1 sm:grid-cols-3">
                  {tablesForSelectedArea.map((table) => (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => setSelectedTableId(table.id)}
                      data-table-status={table.status}
                      aria-pressed={selectedTableId === table.id}
                      className={`rounded-[24px] border px-4 py-4 text-left transition ${selectedTableId === table.id ? 'ring-2 ring-inset ring-slate-700 dark:ring-white' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <TableCardMark status={table.status} size="sm" />
                        <div className="min-w-0">
                          <p className="table-code text-2xl text-slate-950 dark:text-white">{table.code}</p>
                          <div className="mt-2">
                            <TableCapacity capacity={table.capacity} />
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setOrderModeStep('AREA')}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-14 sm:text-base"
                  >
                    <AppIcon icon={ArrowLeft} className="h-4 w-4" />
                    Volver a areas
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmSelectedTable()}
                    disabled={reservingTable}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-60 dark:text-white sm:h-14 sm:text-base"
                  >
                    <AppIcon icon={Check} className="h-4 w-4" />
                    {reservingTable ? 'Reservando mesa...' : 'Continuar al menu'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {adminDialogOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm dark:bg-black/75">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b0b10] dark:text-white dark:shadow-none sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Acceso administrativo</p>
                <h2 className="mt-2 font-display text-2xl text-slate-950 dark:text-white">{kioskOnly ? 'Salir del kiosco' : 'Desbloquear kiosko'}</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                  Ingresa la contrasena del usuario actual para salir del modo kiosko bloqueado.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAdminDialog}
                className="h-10 w-10 rounded-2xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
              >
                ×
              </button>
            </div>

            <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-200">
              <p className="flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-zinc-400">Usuario</span>
                <span className="font-semibold text-slate-950 dark:text-white">{user?.email ?? 'No disponible'}</span>
              </p>
            </div>

            <div className="mt-4">
              <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Contrasena</label>
              <input
                type="password"
                autoComplete="off"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="Ingresa la contrasena"
                className="mt-3 h-14 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white dark:placeholder:text-zinc-500 sm:text-base"
              />
            </div>

            {unlockError ? (
              <div className="mt-4 rounded-[22px] border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
                {unlockError}
              </div>
            ) : null}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {!kioskOnly && <button
                type="button"
                onClick={() => void handleAdminAction('panel')}
                disabled={unlocking}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white sm:h-14 sm:text-base"
              >
                <AppIcon icon={ArrowLeft} className="h-4 w-4" />
                {unlocking ? 'Validando...' : 'Ir al panel'}
              </button>}
              <button
                type="button"
                onClick={() => void handleAdminAction('logout')}
                disabled={unlocking}
                className="session-exit inline-flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold transition disabled:opacity-50 sm:h-14 sm:text-base"
              >
                <AppIcon icon={Lock} className="h-4 w-4" />
                {unlocking ? 'Validando...' : 'Cerrar sesion'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {productModalOpen ? (
        <dialog ref={node => { if (node && !node.open) node.showModal(); }} onClose={closeProductModal}
          aria-label={modalProduct?.name ?? 'Detalle del producto'}
          className="m-auto max-h-[90vh] w-[94vw] max-w-2xl overflow-y-auto rounded-[28px] bg-transparent backdrop:bg-black/60">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b0b10] dark:text-white dark:shadow-none sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Detalle del producto</p>
                <h2 className="mt-2 truncate font-display text-2xl text-slate-950 dark:text-white sm:text-3xl">{modalProduct?.name ?? 'Producto'}</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                  Agrega observaciones y selecciona extras si este producto los necesita.
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
                    <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Salsas</label>
                    <button
                      type="button"
                      onClick={() => openModifierDialog('SAUCES')}
                      className="flex h-14 w-full items-center justify-between rounded-[22px] border border-slate-200 bg-white px-4 text-left text-sm text-slate-900 transition hover:bg-slate-50 dark:border-white/10 dark:bg-black/30 dark:text-white dark:hover:bg-white/[0.06] sm:text-base"
                    >
                      <span className="truncate">{modalSauces.length ? `${modalSauces.length} seleccionadas` : 'Seleccionar salsas'}</span>
                      <span className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-zinc-500">Ver</span>
                    </button>
                    {modalSauces.length ? <p className="text-xs text-slate-500 dark:text-zinc-500">{modalSauces.join(', ')}</p> : null}
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Aderezos</label>
                    <button
                      type="button"
                      onClick={() => openModifierDialog('DRESSINGS')}
                      className="flex h-14 w-full items-center justify-between rounded-[22px] border border-slate-200 bg-white px-4 text-left text-sm text-slate-900 transition hover:bg-slate-50 dark:border-white/10 dark:bg-black/30 dark:text-white dark:hover:bg-white/[0.06] sm:text-base"
                    >
                      <span className="truncate">{modalDressings.length ? `${modalDressings.length} seleccionados` : 'Seleccionar aderezos'}</span>
                      <span className="text-xs uppercase tracking-[0.22em] text-slate-500 dark:text-zinc-500">Ver</span>
                    </button>
                    {modalDressings.length ? <p className="text-xs text-slate-500 dark:text-zinc-500">{modalDressings.join(', ')}</p> : null}
                  </div>
                </>
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500 sm:col-span-2">
                  Este producto no necesita salsas ni aderezos.
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Observaciones</label>
                <textarea
                  value={modalNotes}
                  onChange={(event) => setModalNotes(event.target.value)}
                  rows={4}
                  className="mt-3 w-full resize-none rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:text-base"
                />
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeProductModal}
                className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-14 sm:text-base"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmAddProduct}
                className="h-12 rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white sm:h-14 sm:text-base"
              >
                {editingLineId ? 'Guardar cambios' : 'Agregar al pedido'}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}

      {productModalOpen && modifierDialogSection ? (
        <dialog ref={node => { if (node && !node.open) node.showModal(); }} onClose={closeModifierDialog}
          aria-label={modifierDialogSection === 'SAUCES' ? 'Seleccionar salsas' : 'Seleccionar aderezos'}
          className="m-auto max-h-[90vh] w-[94vw] max-w-4xl overflow-y-auto rounded-[28px] bg-transparent backdrop:bg-black/60">
          <div className="w-full max-w-4xl rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b0b10] dark:text-white dark:shadow-none sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Complementos</p>
                <h2 className="mt-2 truncate font-display text-2xl text-slate-950 dark:text-white sm:text-3xl">
                  {modifierDialogSection === 'SAUCES' ? 'Seleccionar salsas' : 'Seleccionar aderezos'}
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
                  No hay opciones disponibles todavia para esta seleccion.
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
                Aplicar seleccion
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
