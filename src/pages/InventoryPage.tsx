import { ChefHat, ClipboardList, CookingPot, Droplets, GlassWater, Package, Pencil, Plus, Salad, Save, Trash2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppIcon, type IconComponent } from '@/components/AppIcon';
import { Panel } from '@/components/Panel';
import {
  adjustInventoryItem,
  createInventoryItem,
  createPurchaseReceipt,
  createWasteRecord,
  getProductRecipe,
  getSubRecipeFormula,
  produceSubRecipe,
  saveProductRecipe,
  saveSubRecipeFormula,
  updateInventoryItem,
} from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';
import type {
  InventoryItem,
  InventoryMovement,
  MenuCategory,
  MenuProduct,
  ProductRecipe,
  SubRecipeFormula,
} from '@/types/restaurant';

type MenuSection = 'DISHES' | 'BEVERAGES' | 'PRODUCTS' | 'EXTRAS' | 'SAUCES' | 'DRESSINGS';
type InventoryWorkspaceSection = 'GUIDED' | 'CATALOG' | 'RECIPES' | 'SUBRECIPES' | 'PURCHASES' | 'AUDIT';

const inventoryWorkspaceQueryMap: Record<InventoryWorkspaceSection, string> = {
  GUIDED: 'guided',
  CATALOG: 'catalog',
  RECIPES: 'recipes',
  SUBRECIPES: 'subrecipes',
  PURCHASES: 'purchases',
  AUDIT: 'audit',
};

const menuSectionQueryMap: Record<MenuSection, string> = {
  DISHES: 'dishes',
  BEVERAGES: 'beverages',
  PRODUCTS: 'products',
  EXTRAS: 'extras',
  SAUCES: 'sauces',
  DRESSINGS: 'dressings',
};

function getInventoryWorkspaceFromQuery(value?: string | null): InventoryWorkspaceSection {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (normalized === 'guided') return 'GUIDED';
  if (normalized === 'recipes') return 'RECIPES';
  if (normalized === 'subrecipes') return 'SUBRECIPES';
  if (normalized === 'purchases') return 'PURCHASES';
  if (normalized === 'audit') return 'AUDIT';
  return 'CATALOG';
}

function getMenuSectionFromQuery(value?: string | null): MenuSection {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'beverages') return 'BEVERAGES';
  if (normalized === 'products') return 'PRODUCTS';
  if (normalized === 'extras') return 'EXTRAS';
  if (normalized === 'sauces') return 'SAUCES';
  if (normalized === 'dressings') return 'DRESSINGS';
  return 'DISHES';
}

type InventoryFormState = {
  branchId: string;
  name: string;
  itemType: 'RAW' | 'SUBRECIPE';
  unit: string;
  stock: string;
  minStock: string;
  unitCost: string;
  supplier: string;
};

type RecipeDraftLine = {
  inventoryItemId: string;
  quantity: string;
};

type AdjustmentFormState = {
  inventoryItemId: string;
  type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
  quantity: string;
  reference: string;
  notes: string;
};

type PurchaseLineDraft = {
  inventoryItemId: string;
  quantity: string;
  unitCost: string;
};

type PurchaseFormState = {
  branchId: string;
  supplier: string;
  reference: string;
  invoiceNo: string;
  notes: string;
  lines: PurchaseLineDraft[];
};

type WasteFormState = {
  inventoryItemId: string;
  reasonType: 'PRODUCTION' | 'KITCHEN' | 'EXPIRED' | 'DAMAGE' | 'OTHER';
  quantity: string;
  reference: string;
  notes: string;
};

type ProduceSubRecipeFormState = {
  outputQuantity: string;
  reference: string;
  notes: string;
};

const initialInventoryForm: InventoryFormState = {
  branchId: '',
  name: '',
  itemType: 'RAW',
  unit: 'unidad',
  stock: '0',
  minStock: '0',
  unitCost: '0',
  supplier: '',
};

const initialAdjustmentForm: AdjustmentFormState = {
  inventoryItemId: '',
  type: 'ADJUSTMENT_IN',
  quantity: '0',
  reference: '',
  notes: '',
};

const initialPurchaseForm: PurchaseFormState = {
  branchId: '',
  supplier: '',
  reference: '',
  invoiceNo: '',
  notes: '',
  lines: [{ inventoryItemId: '', quantity: '0', unitCost: '0' }],
};

const initialWasteForm: WasteFormState = {
  inventoryItemId: '',
  reasonType: 'KITCHEN',
  quantity: '0',
  reference: '',
  notes: '',
};

const initialProduceSubRecipeForm: ProduceSubRecipeFormState = {
  outputQuantity: '1',
  reference: '',
  notes: '',
};

const stationLabel = {
  KITCHEN: 'Cocina',
  BAR: 'Bar',
  PASTRY: 'Pastelería',
} as const;

const stationIcon = {
  KITCHEN: ChefHat,
  BAR: Package,
  PASTRY: Salad,
} as const;

const sectionConfig: Record<
  MenuSection,
  {
    label: string;
    description: string;
    icon: IconComponent;
    colorClass: string;
    categoryTitle: string;
    productTitle: string;
    defaultStation: 'KITCHEN' | 'BAR' | 'PASTRY';
    forcedPrepared: boolean;
  }
> = {
  DISHES: {
    label: 'Platillos',
    description: 'Administra platillos preparados del menú en una ventana independiente.',
    icon: ChefHat,
    colorClass: 'border-amber-300/35 bg-amber-300/10 text-amber-900 dark:text-white',
    categoryTitle: 'Categorías de platillos',
    productTitle: 'Ventana de platillos',
    defaultStation: 'KITCHEN',
    forcedPrepared: true,
  },
  BEVERAGES: {
    label: 'Bebidas',
    description: 'Mantén bebidas en una familia propia para sus recetas, costos y control operativo.',
    icon: GlassWater,
    colorClass: 'border-cyan-300/35 bg-cyan-500/10 text-cyan-900 dark:text-white',
    categoryTitle: 'Categorías de bebidas',
    productTitle: 'Ventana de bebidas',
    defaultStation: 'BAR',
    forcedPrepared: false,
  },
  PRODUCTS: {
    label: 'Productos',
    description: 'Separa extras, empaquetados o complementos comerciales en su propia ventana.',
    icon: Package,
    colorClass: 'border-sky-300/35 bg-sky-500/10 text-sky-900 dark:text-white',
    categoryTitle: 'Categorías de productos',
    productTitle: 'Ventana de productos',
    defaultStation: 'BAR',
    forcedPrepared: false,
  },
  EXTRAS: {
    label: 'Extras',
    description: 'Mantén extras y complementos cobrables como una familia propia para sus recetas y costos.',
    icon: Plus,
    colorClass: 'border-fuchsia-300/35 bg-fuchsia-500/10 text-fuchsia-900 dark:text-white',
    categoryTitle: 'Categorías de extras',
    productTitle: 'Ventana de extras',
    defaultStation: 'KITCHEN',
    forcedPrepared: false,
  },
  SAUCES: {
    label: 'Salsas',
    description: 'Gestiona las salsas en una ventana distinta para mantener mejor orden.',
    icon: Droplets,
    colorClass: 'border-rose-300/35 bg-rose-500/10 text-rose-900 dark:text-white',
    categoryTitle: 'Categorías de salsas',
    productTitle: 'Ventana de salsas',
    defaultStation: 'KITCHEN',
    forcedPrepared: false,
  },
  DRESSINGS: {
    label: 'Aderezos',
    description: 'Agrupa aderezos y complementos en una familia separada para control de recetas.',
    icon: Salad,
    colorClass: 'border-emerald-300/35 bg-emerald-500/10 text-emerald-900 dark:text-white',
    categoryTitle: 'Categorías de aderezos',
    productTitle: 'Ventana de aderezos',
    defaultStation: 'KITCHEN',
    forcedPrepared: false,
  },
};

const inventoryWorkspaceConfig: Record<
  InventoryWorkspaceSection,
  {
    label: string;
    description: string;
    icon: IconComponent;
    accentClass: string;
  }
> = {
  GUIDED: {
    label: '0. Proceso guiado',
    description: 'Lleva el control desde el alta del insumo, la receta y la salida final como producto vendible.',
    icon: ClipboardList,
    accentClass: 'border-violet-300/35 bg-violet-500/10 text-violet-900 dark:text-white',
  },
  CATALOG: {
    label: '1. Catálogo base',
    description: 'Aquí creas y ordenas insumos o preparados antes de usarlos en cualquier otro proceso.',
    icon: Package,
    accentClass: 'border-amber-300/35 bg-amber-300/10 text-amber-900 dark:text-white',
  },
  RECIPES: {
    label: '2. Recetas técnicas',
    description: 'Define qué insumos consume cada platillo o producto al momento de vender.',
    icon: ClipboardList,
    accentClass: 'border-emerald-300/35 bg-emerald-500/10 text-emerald-900 dark:text-white',
  },
  SUBRECIPES: {
    label: '3. Producción',
    description: 'Convierte insumos en salsas, bases o preparados internos con su propia fórmula.',
    icon: CookingPot,
    accentClass: 'border-violet-300/35 bg-violet-500/10 text-violet-900 dark:text-white',
  },
  PURCHASES: {
    label: '4. Compras y mermas',
    description: 'Registra entradas formales de inventario y mermas operativas por separado.',
    icon: TriangleAlert,
    accentClass: 'border-rose-300/35 bg-rose-500/10 text-rose-900 dark:text-white',
  },
  AUDIT: {
    label: '5. Ajustes y auditoría',
    description: 'Revisa movimientos y registra ajustes manuales con referencia para trazabilidad.',
    icon: Pencil,
    accentClass: 'border-sky-300/35 bg-sky-500/10 text-sky-900 dark:text-white',
  },
};

function normalizeLabel(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function inferSectionFromName(name?: string | null): MenuSection | null {
  const normalized = normalizeLabel(name);
  if (!normalized) {
    return null;
  }
  if (normalized.includes('salsa')) {
    return 'SAUCES';
  }
  if (normalized.includes('aderezo') || normalized.includes('aliño') || normalized.includes('dressing')) {
    return 'DRESSINGS';
  }
  if (normalized === 'extras' || normalized === 'extra') {
    return 'EXTRAS';
  }
  if (normalized === 'bebidas' || normalized === 'bebida') {
    return 'BEVERAGES';
  }
  if (normalized === 'platillos' || normalized === 'platillo') {
    return 'DISHES';
  }
  if (normalized === 'productos' || normalized === 'producto') {
    return 'PRODUCTS';
  }
  return null;
}

function isSectionRootCategory(category: MenuCategory) {
  if (category.parentId) {
    return false;
  }
  return inferSectionFromName(category.name) !== null;
}

function resolveCategorySection(category: MenuCategory, categoryById: Map<number, MenuCategory>, seen = new Set<number>()): MenuSection {
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
      return resolveCategorySection(parent, categoryById, seen);
    }
  }

  return category.station === 'BAR' ? 'PRODUCTS' : 'DISHES';
}

function resolveProductSection(product: MenuProduct, categoryById: Map<number, MenuCategory>): MenuSection {
  if (product.categoryId) {
    const category = categoryById.get(product.categoryId);
    if (category) {
      return resolveCategorySection(category, categoryById);
    }
  }

  return product.isPrepared ? 'DISHES' : 'PRODUCTS';
}

export default function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useSessionStore((state) => state.user);
  const snapshot = useSessionStore((state) => state.snapshot);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const categories = snapshot?.menuCategories ?? [];
  const products = snapshot?.menuProducts ?? [];
  const inventoryItems = snapshot?.inventoryItems ?? [];
  const inventoryMovements = snapshot?.inventoryMovements ?? [];
  const purchaseReceipts = snapshot?.purchaseReceipts ?? [];
  const wasteRecords = snapshot?.wasteRecords ?? [];
  const branches = snapshot?.branches ?? [];
  const currencySymbol = snapshot?.brand.currencySymbol ?? 'Q';

  const [activeSection, setActiveSection] = useState<MenuSection>('DISHES');
  const [activeInventoryWorkspace, setActiveInventoryWorkspace] = useState<InventoryWorkspaceSection>('CATALOG');
  const [inventoryForm, setInventoryForm] = useState<InventoryFormState>(initialInventoryForm);
  const [editingInventoryId, setEditingInventoryId] = useState<number | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentFormState>(initialAdjustmentForm);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState>(initialPurchaseForm);
  const [wasteForm, setWasteForm] = useState<WasteFormState>(initialWasteForm);
  const [recipeBranchId, setRecipeBranchId] = useState<string>('');
  const [recipeProductId, setRecipeProductId] = useState<number | null>(null);
  const [recipeData, setRecipeData] = useState<ProductRecipe | null>(null);
  const [recipeLines, setRecipeLines] = useState<RecipeDraftLine[]>([]);
  const [subRecipeItemId, setSubRecipeItemId] = useState<number | null>(null);
  const [subRecipeData, setSubRecipeData] = useState<SubRecipeFormula | null>(null);
  const [subRecipeLines, setSubRecipeLines] = useState<RecipeDraftLine[]>([]);
  const [produceSubRecipeForm, setProduceSubRecipeForm] = useState<ProduceSubRecipeFormState>(initialProduceSubRecipeForm);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [submittingInventory, setSubmittingInventory] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [loadingSubRecipe, setLoadingSubRecipe] = useState(false);
  const [savingSubRecipe, setSavingSubRecipe] = useState(false);
  const [producingSubRecipe, setProducingSubRecipe] = useState(false);
  const [submittingPurchase, setSubmittingPurchase] = useState(false);
  const [submittingWaste, setSubmittingWaste] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const requestedInventoryWorkspace = getInventoryWorkspaceFromQuery(searchParams.get('view'));
  const requestedMenuSection = getMenuSectionFromQuery(searchParams.get('menuSection'));
  const requestedRecipeProductId = Number(searchParams.get('productId') || '0');

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  const categorySectionById = useMemo(() => {
    return new Map(categories.map((category) => [category.id, resolveCategorySection(category, categoryById)] as const));
  }, [categories, categoryById]);

  const visibleCategories = useMemo(() => {
    return categories.filter((category) => categorySectionById.get(category.id) === activeSection && !isSectionRootCategory(category));
  }, [activeSection, categories, categorySectionById]);

  const visibleProducts = useMemo(() => {
    return products.filter((product) => resolveProductSection(product, categoryById) === activeSection);
  }, [activeSection, categoryById, products]);

  const branchNameById = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);

  const sectionCounts = useMemo(() => {
    return (Object.keys(sectionConfig) as MenuSection[]).reduce(
      (accumulator, section) => {
        accumulator[section] = {
          categories: categories.filter((category) => categorySectionById.get(category.id) === section && !isSectionRootCategory(category)).length,
          products: products.filter((product) => resolveProductSection(product, categoryById) === section).length,
        };
        return accumulator;
      },
      {} as Record<MenuSection, { categories: number; products: number }>,
    );
  }, [categories, categoryById, categorySectionById, products]);

  const currentSection = sectionConfig[activeSection];
  const currentBranchId = recipeBranchId || String(user?.branchId ?? branches[0]?.id ?? '');

  const branchInventoryItems = useMemo(
    () => inventoryItems.filter((item) => !currentBranchId || String(item.branchId) === currentBranchId),
    [currentBranchId, inventoryItems],
  );
  const rawBranchInventoryItems = useMemo(
    () => branchInventoryItems.filter((item) => item.itemType === 'RAW'),
    [branchInventoryItems],
  );
  const subRecipeInventoryItems = useMemo(
    () => branchInventoryItems.filter((item) => item.itemType === 'SUBRECIPE'),
    [branchInventoryItems],
  );
  const validRecipeLineCount = useMemo(
    () =>
      recipeLines.filter(
        (line) =>
          Number.isInteger(Number(line.inventoryItemId)) &&
          Number(line.inventoryItemId) > 0 &&
          Number.isFinite(Number(line.quantity)) &&
          Number(line.quantity) > 0,
      ).length,
    [recipeLines],
  );
  const validSubRecipeLineCount = useMemo(
    () =>
      subRecipeLines.filter(
        (line) =>
          Number.isInteger(Number(line.inventoryItemId)) &&
          Number(line.inventoryItemId) > 0 &&
          Number.isFinite(Number(line.quantity)) &&
          Number(line.quantity) > 0,
      ).length,
    [subRecipeLines],
  );

  const recentInventoryMovements = useMemo(
    () => inventoryMovements.filter((movement) => !currentBranchId || String(movement.branchId) === currentBranchId).slice(0, 12),
    [currentBranchId, inventoryMovements],
  );

  const branchPurchaseReceipts = useMemo(
    () => purchaseReceipts.filter((receipt) => !currentBranchId || String(receipt.branchId) === currentBranchId).slice(0, 6),
    [currentBranchId, purchaseReceipts],
  );

  const branchWasteRecords = useMemo(
    () => wasteRecords.filter((record) => !currentBranchId || String(record.branchId) === currentBranchId).slice(0, 6),
    [currentBranchId, wasteRecords],
  );

  const inventoryWorkspaceCounts = useMemo(
    () => ({
      GUIDED:
        Number(rawBranchInventoryItems.length > 0) +
        Number(visibleProducts.length > 0) +
        Number(validRecipeLineCount > 0 || (recipeData?.ingredients.length ?? 0) > 0) +
        Number(subRecipeInventoryItems.length > 0) +
        Number(branchPurchaseReceipts.length > 0 || recentInventoryMovements.length > 0),
      CATALOG: branchInventoryItems.length,
      RECIPES: visibleProducts.length,
      SUBRECIPES: subRecipeInventoryItems.length,
      PURCHASES: branchPurchaseReceipts.length + branchWasteRecords.length,
      AUDIT: recentInventoryMovements.length,
    }),
    [
      branchInventoryItems.length,
      branchPurchaseReceipts.length,
      branchWasteRecords.length,
      rawBranchInventoryItems.length,
      recentInventoryMovements.length,
      recipeData?.ingredients.length,
      subRecipeInventoryItems.length,
      validRecipeLineCount,
      visibleProducts.length,
    ],
  );

  useEffect(() => {
    if (!recipeBranchId) {
      const nextBranchId = String(user?.branchId ?? branches[0]?.id ?? '');
      if (nextBranchId) {
        setRecipeBranchId(nextBranchId);
        setInventoryForm((current) => ({ ...current, branchId: nextBranchId }));
        setPurchaseForm((current) => ({ ...current, branchId: nextBranchId }));
      }
    }
  }, [branches, recipeBranchId, user?.branchId]);

  useEffect(() => {
    if (activeInventoryWorkspace !== requestedInventoryWorkspace) {
      setActiveInventoryWorkspace(requestedInventoryWorkspace);
    }
  }, [activeInventoryWorkspace, requestedInventoryWorkspace]);

  useEffect(() => {
    if (activeSection !== requestedMenuSection) {
      setActiveSection(requestedMenuSection);
    }
  }, [activeSection, requestedMenuSection]);

  function switchInventoryWorkspace(section: InventoryWorkspaceSection) {
    setActiveInventoryWorkspace(section);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('view', inventoryWorkspaceQueryMap[section]);
      return next;
    });
  }

  function prepareInventoryCreation(itemType: InventoryFormState['itemType']) {
    switchInventoryWorkspace('GUIDED');
    setEditingInventoryId(null);
    setInventoryForm({
      ...initialInventoryForm,
      branchId: currentBranchId,
      itemType,
    });
    setError(null);
    setSuccess(null);
  }

  function openGuidedRecipe(productId?: number | null) {
    const targetId = productId ?? recipeProductId ?? visibleProducts[0]?.id ?? null;
    if (!targetId) {
      setError('Primero crea un producto final para poder definir su receta.');
      setSuccess(null);
      return;
    }

    void loadRecipe(targetId, currentBranchId);
  }

  function openGuidedSubRecipe(inventoryItemId?: number | null) {
    const targetId = inventoryItemId ?? subRecipeItemId ?? subRecipeInventoryItems[0]?.id ?? null;
    if (!targetId) {
      setError('Primero crea un preparado tipo subreceta para poder definir su formula.');
      setSuccess(null);
      return;
    }

    void loadSubRecipe(targetId, currentBranchId);
  }

  function resetInventoryForm() {
    setEditingInventoryId(null);
    setInventoryForm({
      ...initialInventoryForm,
      branchId: currentBranchId,
    });
  }

  function resetAdjustmentForm() {
    setAdjustmentForm(initialAdjustmentForm);
  }

  function resetPurchaseForm() {
    setPurchaseForm({
      ...initialPurchaseForm,
      branchId: currentBranchId,
      lines: [{ inventoryItemId: '', quantity: '0', unitCost: '0' }],
    });
  }

  function resetWasteForm() {
    setWasteForm(initialWasteForm);
  }

  function resetSubRecipeForm() {
    setSubRecipeItemId(null);
    setSubRecipeData(null);
    setSubRecipeLines([]);
    setProduceSubRecipeForm(initialProduceSubRecipeForm);
  }

  async function loadRecipe(productId: number, branchId = currentBranchId) {
    switchInventoryWorkspace('RECIPES');
    setLoadingRecipe(true);
    setRecipeProductId(productId);
    setError(null);
    setSuccess(null);
    const selectedProduct = products.find((product) => product.id === productId);
    const selectedSection = selectedProduct ? resolveProductSection(selectedProduct, categoryById) : activeSection;
    setActiveSection(selectedSection);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('view', 'recipes');
      next.set('menuSection', menuSectionQueryMap[selectedSection]);
      next.set('productId', String(productId));
      return next;
    });

    try {
      const recipe = await getProductRecipe(productId, branchId ? Number(branchId) : null);
      setRecipeBranchId(String(recipe.branchId));
      setRecipeData(recipe);
      setRecipeLines(
        recipe.ingredients.length
          ? recipe.ingredients.map((ingredient) => ({
              inventoryItemId: String(ingredient.inventoryItemId),
              quantity: String(ingredient.quantity),
            }))
          : [{ inventoryItemId: '', quantity: '0' }],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar la receta.');
      setRecipeData(null);
      setRecipeLines([{ inventoryItemId: '', quantity: '0' }]);
    } finally {
      setLoadingRecipe(false);
    }
  }

  async function loadSubRecipe(inventoryItemId: number, branchId = currentBranchId) {
    switchInventoryWorkspace('SUBRECIPES');
    setLoadingSubRecipe(true);
    setSubRecipeItemId(inventoryItemId);
    setError(null);
    setSuccess(null);

    try {
      const formula = await getSubRecipeFormula(inventoryItemId, branchId ? Number(branchId) : null);
      setRecipeBranchId(String(formula.branchId));
      setSubRecipeData(formula);
      setSubRecipeLines(
        formula.components.length
          ? formula.components.map((component) => ({
              inventoryItemId: String(component.inventoryItemId),
              quantity: String(component.quantity),
            }))
          : [{ inventoryItemId: '', quantity: '0' }],
      );
      setProduceSubRecipeForm({
        ...initialProduceSubRecipeForm,
        reference: `Producción de ${formula.yieldName}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar la subreceta.');
      setSubRecipeData(null);
      setSubRecipeLines([{ inventoryItemId: '', quantity: '0' }]);
    } finally {
      setLoadingSubRecipe(false);
    }
  }

  function handleSectionChange(section: MenuSection) {
    setActiveSection(section);
    setError(null);
    setSuccess(null);
  }

  function startInventoryEdit(item: InventoryItem) {
    switchInventoryWorkspace('CATALOG');
    setEditingInventoryId(item.id);
    setInventoryForm({
      branchId: String(item.branchId),
      name: item.name,
      itemType: item.itemType,
      unit: item.unit,
      stock: String(item.stock),
      minStock: String(item.minStock),
      unitCost: String(item.unitCost),
      supplier: item.supplier ?? '',
    });
    setError(null);
    setSuccess(null);
  }

  function selectAdjustmentItem(item: InventoryItem) {
    switchInventoryWorkspace('AUDIT');
    setAdjustmentForm({
      ...initialAdjustmentForm,
      inventoryItemId: String(item.id),
      reference: `Ajuste de ${item.name}`,
    });
    setError(null);
    setSuccess(null);
  }

  async function handleInventorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingInventory(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        branchId: inventoryForm.branchId ? Number(inventoryForm.branchId) : null,
        name: inventoryForm.name,
        itemType: inventoryForm.itemType,
        unit: inventoryForm.unit,
        stock: Number(inventoryForm.stock || '0'),
        minStock: Number(inventoryForm.minStock || '0'),
        unitCost: Number(inventoryForm.unitCost || '0'),
        supplier: inventoryForm.supplier || null,
      };

      if (editingInventoryId) {
        await updateInventoryItem(editingInventoryId, {
          branchId: payload.branchId,
          name: payload.name,
          itemType: payload.itemType,
          unit: payload.unit,
          minStock: payload.minStock,
          unitCost: payload.unitCost,
          supplier: payload.supplier,
        });
        setSuccess('Insumo actualizado correctamente.');
      } else {
        await createInventoryItem(payload);
        setSuccess('Insumo creado correctamente.');
      }

      await refreshSnapshot();
      resetInventoryForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar el insumo.');
    } finally {
      setSubmittingInventory(false);
    }
  }

  async function handleAdjustmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingInventory(true);
    setError(null);
    setSuccess(null);

    try {
      await adjustInventoryItem(Number(adjustmentForm.inventoryItemId), {
        type: adjustmentForm.type,
        quantity: Number(adjustmentForm.quantity || '0'),
        reference: adjustmentForm.reference,
        notes: adjustmentForm.notes || null,
      });
      await refreshSnapshot();
      resetAdjustmentForm();
      setSuccess('Movimiento de inventario registrado correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible registrar el movimiento.');
    } finally {
      setSubmittingInventory(false);
    }
  }

  function addPurchaseLine() {
    setPurchaseForm((current) => ({
      ...current,
      lines: [...current.lines, { inventoryItemId: '', quantity: '0', unitCost: '0' }],
    }));
  }

  function updatePurchaseLine(index: number, patch: Partial<PurchaseLineDraft>) {
    setPurchaseForm((current) => ({
      ...current,
      lines: current.lines.map((line, currentIndex) => (currentIndex === index ? { ...line, ...patch } : line)),
    }));
  }

  function removePurchaseLine(index: number) {
    setPurchaseForm((current) => ({
      ...current,
      lines: current.lines.filter((_, currentIndex) => currentIndex !== index),
    }));
  }

  async function handlePurchaseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    switchInventoryWorkspace('PURCHASES');
    setSubmittingPurchase(true);
    setError(null);
    setSuccess(null);

    try {
      await createPurchaseReceipt({
        branchId: purchaseForm.branchId ? Number(purchaseForm.branchId) : null,
        supplier: purchaseForm.supplier,
        reference: purchaseForm.reference,
        invoiceNo: purchaseForm.invoiceNo || null,
        notes: purchaseForm.notes || null,
        lines: purchaseForm.lines
          .map((line) => ({
            inventoryItemId: Number(line.inventoryItemId),
            quantity: Number(line.quantity || '0'),
            unitCost: Number(line.unitCost || '0'),
          }))
          .filter((line) => Number.isInteger(line.inventoryItemId) && line.inventoryItemId > 0 && line.quantity > 0),
      });
      await refreshSnapshot();
      resetPurchaseForm();
      setSuccess('Compra formal registrada. El costo promedio quedó actualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible registrar la compra.');
    } finally {
      setSubmittingPurchase(false);
    }
  }

  async function handleWasteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    switchInventoryWorkspace('PURCHASES');
    setSubmittingWaste(true);
    setError(null);
    setSuccess(null);

    try {
      await createWasteRecord({
        inventoryItemId: Number(wasteForm.inventoryItemId),
        quantity: Number(wasteForm.quantity || '0'),
        reasonType: wasteForm.reasonType,
        reference: wasteForm.reference,
        notes: wasteForm.notes || null,
      });
      await refreshSnapshot();
      resetWasteForm();
      setSuccess('Merma registrada por separado del ajuste manual.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible registrar la merma.');
    } finally {
      setSubmittingWaste(false);
    }
  }

  function addSubRecipeLine() {
    setSubRecipeLines((current) => [...current, { inventoryItemId: '', quantity: '0' }]);
  }

  function updateSubRecipeLine(index: number, patch: Partial<RecipeDraftLine>) {
    setSubRecipeLines((current) => current.map((line, currentIndex) => (currentIndex === index ? { ...line, ...patch } : line)));
  }

  function removeSubRecipeLine(index: number) {
    setSubRecipeLines((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleSubRecipeSave() {
    if (!subRecipeItemId) {
      setError('Selecciona primero una subreceta.');
      return;
    }

    setSavingSubRecipe(true);
    setError(null);
    setSuccess(null);

    try {
      const formula = await saveSubRecipeFormula(subRecipeItemId, {
        branchId: currentBranchId ? Number(currentBranchId) : null,
        components: subRecipeLines
          .map((line) => ({
            inventoryItemId: Number(line.inventoryItemId),
            quantity: Number(line.quantity || '0'),
          }))
          .filter((line) => Number.isInteger(line.inventoryItemId) && line.inventoryItemId > 0 && Number.isFinite(line.quantity) && line.quantity > 0),
      });
      setSubRecipeData(formula);
      setSubRecipeLines(
        formula.components.length
          ? formula.components.map((component) => ({
              inventoryItemId: String(component.inventoryItemId),
              quantity: String(component.quantity),
            }))
          : [{ inventoryItemId: '', quantity: '0' }],
      );
      await refreshSnapshot();
      setSuccess('Subreceta guardada correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar la subreceta.');
    } finally {
      setSavingSubRecipe(false);
    }
  }

  async function handleSubRecipeProduce(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subRecipeItemId) {
      setError('Selecciona primero una subreceta.');
      return;
    }

    setProducingSubRecipe(true);
    setError(null);
    setSuccess(null);

    try {
      await produceSubRecipe(subRecipeItemId, {
        outputQuantity: Number(produceSubRecipeForm.outputQuantity || '0'),
        reference: produceSubRecipeForm.reference,
        notes: produceSubRecipeForm.notes || null,
      });
      await refreshSnapshot();
      await loadSubRecipe(subRecipeItemId, currentBranchId);
      setProduceSubRecipeForm((current) => ({ ...current, outputQuantity: '1', notes: '' }));
      setSuccess('Producción de subreceta registrada correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible producir la subreceta.');
    } finally {
      setProducingSubRecipe(false);
    }
  }

  function addRecipeLine() {
    setRecipeLines((current) => [...current, { inventoryItemId: '', quantity: '0' }]);
  }

  function updateRecipeLine(index: number, patch: Partial<RecipeDraftLine>) {
    setRecipeLines((current) => current.map((line, currentIndex) => (currentIndex === index ? { ...line, ...patch } : line)));
  }

  function removeRecipeLine(index: number) {
    setRecipeLines((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleRecipeSave() {
    if (!recipeProductId) {
      setError('Selecciona primero un platillo o producto para configurar la receta.');
      return;
    }

    setSavingRecipe(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        branchId: currentBranchId ? Number(currentBranchId) : null,
        ingredients: recipeLines
          .map((line) => ({
            inventoryItemId: Number(line.inventoryItemId),
            quantity: Number(line.quantity || '0'),
          }))
          .filter((line) => Number.isInteger(line.inventoryItemId) && line.inventoryItemId > 0 && Number.isFinite(line.quantity) && line.quantity > 0),
      };

      const recipe = await saveProductRecipe(recipeProductId, payload);
      setRecipeData(recipe);
      setRecipeLines(
        recipe.ingredients.length
          ? recipe.ingredients.map((ingredient) => ({
              inventoryItemId: String(ingredient.inventoryItemId),
              quantity: String(ingredient.quantity),
            }))
          : [{ inventoryItemId: '', quantity: '0' }],
      );
      await refreshSnapshot();
      setSuccess('Receta guardada correctamente. El consumo ya bajará inventario al vender.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar la receta.');
    } finally {
      setSavingRecipe(false);
    }
  }

  useEffect(() => {
    if (recipeProductId && currentBranchId) {
      void loadRecipe(recipeProductId, currentBranchId);
    }
  }, [currentBranchId, recipeProductId]);

  useEffect(() => {
    if (requestedInventoryWorkspace === 'RECIPES' && requestedRecipeProductId > 0 && recipeProductId !== requestedRecipeProductId) {
      void loadRecipe(requestedRecipeProductId, currentBranchId);
    }
  }, [currentBranchId, recipeProductId, requestedInventoryWorkspace, requestedRecipeProductId]);

  useEffect(() => {
    if (subRecipeItemId && currentBranchId) {
      void loadSubRecipe(subRecipeItemId, currentBranchId);
    }
  }, [currentBranchId, subRecipeItemId]);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/45">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">Inventario operativo</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">Recetas y consumo por tipo de producto</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-zinc-400">
              Aquí trabajas insumos, recetas, producción, compras y auditoría. Usa esta vista para decidir qué familia de productos vas a recetar y controlar.
            </p>
          </div>
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
            Familia activa: <strong>{currentSection.label}</strong>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {(Object.keys(sectionConfig) as MenuSection[]).map((section) => {
            const config = sectionConfig[section];
            const isActive = activeSection === section;
            return (
              <button
                key={section}
                type="button"
                onClick={() => handleSectionChange(section)}
                className={`rounded-[24px] border px-4 py-3 text-left transition sm:min-w-[220px] ${
                  isActive
                    ? config.colorClass
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-black/5 bg-white/70 dark:border-white/10 dark:bg-black/20">
                    <AppIcon icon={config.icon} className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold">{config.label}</p>
                    <p className="mt-1 text-xs opacity-80">
                      {sectionCounts[section].products} productos disponibles para recetar
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {error ? <div className="rounded-[20px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-[20px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">{success}</div> : null}

      <div className="space-y-6">
        <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/45">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">Procesos de inventario</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">Trabaja inventario por etapas y no todo mezclado</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-zinc-400">
                Primero crea el catálogo de insumos. Después define recetas, produce subrecetas, registra compras o mermas y por último audita movimientos.
              </p>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
              Sucursal activa para procesos: <strong>{branchNameById.get(Number(currentBranchId)) ?? 'No definida'}</strong>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-5">
            {(Object.keys(inventoryWorkspaceConfig) as InventoryWorkspaceSection[]).map((section) => {
              const config = inventoryWorkspaceConfig[section];
              const isActive = activeInventoryWorkspace === section;
              return (
                <button
                  key={section}
                  type="button"
                  onClick={() => switchInventoryWorkspace(section)}
                  className={`rounded-[24px] border px-4 py-4 text-left transition ${
                    isActive
                      ? `${config.accentClass} shadow-sm`
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-current/15 bg-white/50 dark:bg-black/20">
                        <AppIcon icon={config.icon} className="h-5 w-5" />
                      </div>
                      <p className="mt-3 text-sm font-semibold">{config.label}</p>
                      <p className="mt-1 text-xs opacity-80">{config.description}</p>
                    </div>
                    <span className="rounded-2xl border border-current/15 px-3 py-1 text-xs font-semibold">
                      {inventoryWorkspaceCounts[section]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <div className="rounded-[24px] border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-slate-700 dark:text-zinc-200">
              <strong>Paso 1:</strong> aquí das de alta los insumos y preparados que después usarás en recetas, compras, producción y ajustes.
            </div>

            <Panel title="Insumos e inventario" subtitle="Crea y edita insumos base o preparados por sucursal. Este es el punto de partida del proceso.">
          <form className="space-y-4" onSubmit={(event) => void handleInventorySubmit(event)}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Sucursal</span>
                <select
                  value={inventoryForm.branchId}
                  onChange={(event) => setInventoryForm((current) => ({ ...current, branchId: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Nombre del insumo</span>
                <input
                  value={inventoryForm.name}
                  onChange={(event) => setInventoryForm((current) => ({ ...current, name: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                  placeholder="Ej. Queso mozzarella"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Tipo</span>
                <select
                  value={inventoryForm.itemType}
                  onChange={(event) => setInventoryForm((current) => ({ ...current, itemType: event.target.value as InventoryFormState['itemType'] }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                >
                  <option value="RAW">Insumo base</option>
                  <option value="SUBRECIPE">Subreceta / preparado</option>
                </select>
              </label>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                {inventoryForm.itemType === 'SUBRECIPE'
                  ? 'Una subreceta se produce consumiendo otros insumos y luego se usa dentro de platillos.'
                  : 'El insumo base entra por compra y puede consumirse en recetas o subrecetas.'}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Unidad</span>
                <input
                  value={inventoryForm.unit}
                  onChange={(event) => setInventoryForm((current) => ({ ...current, unit: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                  placeholder="unidad"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Stock inicial</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={inventoryForm.stock}
                  onChange={(event) => setInventoryForm((current) => ({ ...current, stock: event.target.value }))}
                  disabled={editingInventoryId !== null}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none disabled:opacity-60 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Stock mínimo</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={inventoryForm.minStock}
                  onChange={(event) => setInventoryForm((current) => ({ ...current, minStock: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Costo unitario</span>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={inventoryForm.unitCost}
                  onChange={(event) => setInventoryForm((current) => ({ ...current, unitCost: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-sm text-slate-700 dark:text-zinc-300">Proveedor</span>
              <input
                value={inventoryForm.supplier}
                onChange={(event) => setInventoryForm((current) => ({ ...current, supplier: event.target.value }))}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                placeholder="Proveedor principal"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={submittingInventory}
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
              >
                <AppIcon icon={editingInventoryId ? Pencil : Plus} className="h-4 w-4" />
                {submittingInventory ? 'Guardando...' : editingInventoryId ? 'Actualizar insumo' : 'Crear insumo'}
              </button>
              {editingInventoryId ? (
                <button
                  type="button"
                  onClick={resetInventoryForm}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                >
                  <AppIcon icon={X} className="h-4 w-4" />
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>

          <div className="mt-6 space-y-3">
            {branchInventoryItems.length ? (
              branchInventoryItems.map((item) => (
                <article key={item.id} className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950 dark:text-white">{item.name}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                        {branchNameById.get(item.branchId) ?? item.branch} • {item.unit} • {item.itemType === 'SUBRECIPE' ? 'Subreceta' : 'Insumo'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.itemType === 'SUBRECIPE' ? (
                        <button
                          type="button"
                          onClick={() => void loadSubRecipe(item.id)}
                          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-3 text-sm text-emerald-800 dark:text-emerald-200"
                        >
                          <AppIcon icon={CookingPot} className="h-4 w-4" />
                          Subreceta
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => startInventoryEdit(item)}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                      >
                        <AppIcon icon={Pencil} className="h-4 w-4" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => selectAdjustmentItem(item)}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-sky-300/30 bg-sky-500/10 px-3 text-sm text-sky-800 dark:text-sky-200"
                      >
                        <AppIcon icon={Plus} className="h-4 w-4" />
                        Ajustar
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <div>
                      <p className="text-slate-500 dark:text-zinc-500">Stock</p>
                      <p className="mt-1 font-medium text-slate-950 dark:text-white">{item.stock.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-zinc-500">Mínimo</p>
                      <p className="mt-1 font-medium text-slate-950 dark:text-white">{item.minStock.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-zinc-500">Costo</p>
                      <p className="mt-1 font-medium text-slate-950 dark:text-white">{currencySymbol} {item.unitCost.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-zinc-500">Valor stock</p>
                      <p className="mt-1 font-medium text-slate-950 dark:text-white">{currencySymbol} {item.stockValue.toFixed(2)}</p>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500">
                No hay insumos cargados para esta sucursal.
              </div>
            )}
          </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <div className={`rounded-[24px] border px-4 py-3 text-sm ${inventoryWorkspaceConfig[activeInventoryWorkspace].accentClass}`}>
              <strong>{inventoryWorkspaceConfig[activeInventoryWorkspace].label}:</strong> {inventoryWorkspaceConfig[activeInventoryWorkspace].description}
            </div>

            {activeInventoryWorkspace === 'GUIDED' ? (
              <Panel title="Proceso guiado y controlado" subtitle="Sigue este orden para construir un producto con trazabilidad: insumo, preparado opcional, producto final, receta y movimiento operativo.">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[24px] border border-violet-300/25 bg-violet-500/10 p-4 text-sm text-slate-700 dark:text-zinc-200">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700 dark:text-violet-200">Avance del flujo</p>
                    <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">{inventoryWorkspaceCounts.GUIDED} / 5</p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                      Sucursal de trabajo: <strong>{branchNameById.get(Number(currentBranchId)) ?? 'No definida'}</strong>
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                    Orden sugerido: <strong>1)</strong> crea el insumo, <strong>2)</strong> selecciona el producto final, <strong>3)</strong> define la receta,{' '}
                    <strong>4)</strong> si aplica crea el preparado interno, <strong>5)</strong> registra compra, producción o ajuste.
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <article className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">Paso 1. Alta del insumo base</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                          Registra la materia prima que compraras o controlaras en inventario antes de usarla en recetas.
                        </p>
                      </div>
                      <span className="rounded-2xl border border-current/15 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                        {rawBranchInventoryItems.length ? `${rawBranchInventoryItems.length} insumos listos` : 'Pendiente'}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => prepareInventoryCreation('RAW')}
                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 dark:text-white"
                      >
                        <AppIcon icon={Plus} className="h-4 w-4" />
                        Preparar formulario de insumo
                      </button>
                      <button
                        type="button"
                        onClick={() => switchInventoryWorkspace('PURCHASES')}
                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                      >
                        <AppIcon icon={Save} className="h-4 w-4" />
                        Ir a compras formales
                      </button>
                    </div>
                  </article>

                  <article className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">Paso 2. Seleccionar el producto final</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                          Elige la familia y el producto final que llevara receta tecnica para consumir inventario al venderse.
                        </p>
                      </div>
                      <span className="rounded-2xl border border-current/15 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                        {visibleProducts.length ? `${visibleProducts.length} en ${currentSection.label}` : 'Pendiente'}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {(Object.keys(sectionConfig) as MenuSection[]).map((section) => (
                        <button
                          key={section}
                          type="button"
                          onClick={() => handleSectionChange(section)}
                          className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition ${
                            activeSection === section
                              ? sectionConfig[section].colorClass
                              : 'border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200'
                          }`}
                        >
                          <AppIcon icon={sectionConfig[section].icon} className="h-4 w-4" />
                          {sectionConfig[section].label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                      Usa esta selección para enfocar las recetas de <strong>{currentSection.label.toLowerCase()}</strong> sin mezclar otros tipos de productos.
                    </div>
                  </article>

                  <article className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">Paso 3. Definir la receta tecnica del producto</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                          Vincula los insumos o preparados que consumira el producto cuando se venda.
                        </p>
                      </div>
                      <span className="rounded-2xl border border-current/15 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                        {validRecipeLineCount || (recipeData?.ingredients.length ?? 0) ? 'En configuracion' : 'Pendiente'}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {visibleProducts.slice(0, 5).map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => openGuidedRecipe(product.id)}
                          className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-3 text-sm ${
                            recipeProductId === product.id
                              ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                              : 'border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200'
                          }`}
                        >
                          <AppIcon icon={ClipboardList} className="h-4 w-4" />
                          {product.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => openGuidedRecipe()}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                      >
                        <AppIcon icon={ChefHat} className="h-4 w-4" />
                        Abrir receta activa
                      </button>
                    </div>
                    {recipeProductId ? (
                      <div className="mt-4 rounded-[20px] border border-emerald-300/25 bg-emerald-500/5 px-4 py-3 text-sm text-slate-700 dark:text-zinc-200">
                        Producto seleccionado: <strong>{products.find((product) => product.id === recipeProductId)?.name ?? 'Producto'}</strong> • ingredientes cargados:{' '}
                        <strong>{validRecipeLineCount || recipeData?.ingredients.length || 0}</strong>
                      </div>
                    ) : null}
                  </article>

                  <article className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">Paso 4. Preparado interno o subreceta opcional</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                          Usa este paso para salsas base, masas o mezclas que primero se producen y luego entran a la receta final.
                        </p>
                      </div>
                      <span className="rounded-2xl border border-current/15 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                        {subRecipeInventoryItems.length ? `${subRecipeInventoryItems.length} preparados` : 'Opcional'}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => prepareInventoryCreation('SUBRECIPE')}
                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 dark:text-white"
                      >
                        <AppIcon icon={CookingPot} className="h-4 w-4" />
                        Crear preparado
                      </button>
                      <button
                        type="button"
                        onClick={() => openGuidedSubRecipe()}
                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                      >
                        <AppIcon icon={ClipboardList} className="h-4 w-4" />
                        Abrir formula de subreceta
                      </button>
                    </div>
                    {subRecipeItemId ? (
                      <div className="mt-4 rounded-[20px] border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-slate-700 dark:text-zinc-200">
                        Preparado seleccionado: <strong>{inventoryItems.find((item) => item.id === subRecipeItemId)?.name ?? 'Subreceta'}</strong> • componentes cargados:{' '}
                        <strong>{validSubRecipeLineCount || subRecipeData?.components.length || 0}</strong>
                      </div>
                    ) : null}
                  </article>

                  <article className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">Paso 5. Movimiento operativo final</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                          Registra la compra, la produccion o el ajuste para que el inventario quede listo antes de vender.
                        </p>
                      </div>
                      <span className="rounded-2xl border border-current/15 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                        {branchPurchaseReceipts.length || recentInventoryMovements.length ? 'Con movimientos' : 'Sin movimientos'}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => switchInventoryWorkspace('PURCHASES')}
                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                      >
                        <AppIcon icon={Save} className="h-4 w-4" />
                        Compras y mermas
                      </button>
                      <button
                        type="button"
                        onClick={() => switchInventoryWorkspace('AUDIT')}
                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                      >
                        <AppIcon icon={Plus} className="h-4 w-4" />
                        Ajustes y auditoria
                      </button>
                      {subRecipeItemId ? (
                        <button
                          type="button"
                          onClick={() => switchInventoryWorkspace('SUBRECIPES')}
                          className="inline-flex h-11 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 dark:text-white"
                        >
                          <AppIcon icon={CookingPot} className="h-4 w-4" />
                          Ir a produccion
                        </button>
                      ) : null}
                    </div>
                  </article>
                </div>
              </Panel>
            ) : null}

            {activeInventoryWorkspace === 'CATALOG' ? (
              <Panel title="Cómo usar inventario" subtitle="Guía rápida para entender qué hace cada opción antes de continuar con otro proceso.">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45">
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">Crear insumo base</p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                      Úsalo para ingredientes comprados directamente: carnes, verduras, lácteos, harinas o bebidas.
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45">
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">Crear subreceta / preparado</p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                      Úsalo para salsas, masas, fondos o mezclas internas que se producen con otros insumos.
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45">
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">Botón Editar</p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                      Cambia nombre, unidad, mínimo, costo o proveedor del insumo sin registrar un movimiento de stock.
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45">
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">Botón Ajustar</p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                      Registra correcciones manuales de inventario con referencia. Para compras reales usa el paso de compras.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-400">
                  Recomendación de orden: <strong>1)</strong> crea insumos, <strong>2)</strong> define recetas, <strong>3)</strong> registra compras o producción, <strong>4)</strong> revisa movimientos.
                </div>
              </Panel>
            ) : null}

            {activeInventoryWorkspace === 'RECIPES' ? (
              <Panel title="Receta técnica" subtitle="Vincula ingredientes al platillo y descuenta inventario automáticamente al vender.">
            <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Sucursal de receta</span>
                <select
                  value={currentBranchId}
                  onChange={(event) => setRecipeBranchId(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                {recipeProductId
                  ? `Producto seleccionado: ${products.find((product) => product.id === recipeProductId)?.name ?? 'Producto'}`
                  : 'Selecciona un producto con el botón Receta para definir ingredientes.'}
              </div>
            </div>

            {recipeProductId ? (
              <div className="mt-5 space-y-3">
                {recipeLines.map((line, index) => (
                  <div key={`${index}-${line.inventoryItemId}`} className="grid gap-3 md:grid-cols-[1.4fr_0.6fr_auto]">
                    <select
                      value={line.inventoryItemId}
                      onChange={(event) => updateRecipeLine(index, { inventoryItemId: event.target.value })}
                      className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                    >
                      <option value="">Selecciona insumo</option>
                      {branchInventoryItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.stock.toFixed(3)} {item.unit})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={line.quantity}
                      onChange={(event) => updateRecipeLine(index, { quantity: event.target.value })}
                      className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                      placeholder="Cantidad"
                    />
                    <button
                      type="button"
                      onClick={() => removeRecipeLine(index)}
                      className="inline-flex h-12 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 text-rose-700 dark:text-rose-200"
                    >
                      <AppIcon icon={Trash2} className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={addRecipeLine}
                    className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                  >
                    <AppIcon icon={Plus} className="h-4 w-4" />
                    Agregar ingrediente
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRecipeSave()}
                    disabled={savingRecipe || loadingRecipe}
                    className="inline-flex h-12 items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-800 disabled:opacity-50 dark:text-emerald-200"
                  >
                    <AppIcon icon={Save} className="h-4 w-4" />
                    {savingRecipe ? 'Guardando...' : 'Guardar receta'}
                  </button>
                </div>

                <div className="rounded-[20px] border border-emerald-300/25 bg-emerald-500/5 px-4 py-3 text-sm text-slate-700 dark:text-zinc-200">
                  Costo estimado actual: <strong>{currencySymbol} {(recipeData?.estimatedCost ?? 0).toFixed(2)}</strong>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500">
                Usa el botón <strong>Receta</strong> en cualquier platillo o producto para abrir su ficha técnica.
              </div>
            )}
              </Panel>
            ) : null}

            {activeInventoryWorkspace === 'SUBRECIPES' ? (
              <Panel title="Subrecetas y producción" subtitle="Define salsas base, masas o preparados y prodúcelos consumiendo insumos reales.">
            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
              {subRecipeItemId
                ? `Subreceta seleccionada: ${inventoryItems.find((item) => item.id === subRecipeItemId)?.name ?? 'Subreceta'}`
                : 'Selecciona un insumo tipo subreceta desde el listado para configurar su fórmula y producción.'}
            </div>

            {subRecipeItemId ? (
              <div className="mt-5 space-y-5">
                <div className="space-y-3">
                  {subRecipeLines.map((line, index) => (
                    <div key={`${index}-${line.inventoryItemId}`} className="grid gap-3 md:grid-cols-[1.4fr_0.6fr_auto]">
                      <select
                        value={line.inventoryItemId}
                        onChange={(event) => updateSubRecipeLine(index, { inventoryItemId: event.target.value })}
                        className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                      >
                        <option value="">Selecciona componente</option>
                        {branchInventoryItems
                          .filter((item) => item.id !== subRecipeItemId)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ({item.stock.toFixed(3)} {item.unit})
                            </option>
                          ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={line.quantity}
                        onChange={(event) => updateSubRecipeLine(index, { quantity: event.target.value })}
                        className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                        placeholder="Cantidad"
                      />
                      <button
                        type="button"
                        onClick={() => removeSubRecipeLine(index)}
                        className="inline-flex h-12 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 text-rose-700 dark:text-rose-200"
                      >
                        <AppIcon icon={Trash2} className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={addSubRecipeLine}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                    >
                      <AppIcon icon={Plus} className="h-4 w-4" />
                      Agregar componente
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSubRecipeSave()}
                      disabled={savingSubRecipe || loadingSubRecipe}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-800 disabled:opacity-50 dark:text-emerald-200"
                    >
                      <AppIcon icon={Save} className="h-4 w-4" />
                      {savingSubRecipe ? 'Guardando...' : 'Guardar subreceta'}
                    </button>
                    <button
                      type="button"
                      onClick={resetSubRecipeForm}
                      className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                    >
                      <AppIcon icon={X} className="h-4 w-4" />
                      Cerrar
                    </button>
                  </div>
                </div>

                <div className="rounded-[20px] border border-emerald-300/25 bg-emerald-500/5 px-4 py-3 text-sm text-slate-700 dark:text-zinc-200">
                  Costo estimado de la subreceta: <strong>{currencySymbol} {(subRecipeData?.estimatedCost ?? 0).toFixed(2)}</strong>
                </div>

                <form className="space-y-4 rounded-[24px] border border-slate-200/80 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]" onSubmit={(event) => void handleSubRecipeProduce(event)}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm text-slate-700 dark:text-zinc-300">Cantidad a producir</span>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={produceSubRecipeForm.outputQuantity}
                        onChange={(event) => setProduceSubRecipeForm((current) => ({ ...current, outputQuantity: event.target.value }))}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-slate-700 dark:text-zinc-300">Referencia</span>
                      <input
                        value={produceSubRecipeForm.reference}
                        onChange={(event) => setProduceSubRecipeForm((current) => ({ ...current, reference: event.target.value }))}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                      />
                    </label>
                  </div>
                  <label className="space-y-2">
                    <span className="text-sm text-slate-700 dark:text-zinc-300">Notas</span>
                    <input
                      value={produceSubRecipeForm.notes}
                      onChange={(event) => setProduceSubRecipeForm((current) => ({ ...current, notes: event.target.value }))}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                      placeholder="Lote de cocina o producción"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={producingSubRecipe}
                    className="inline-flex h-12 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 disabled:opacity-50 dark:text-white"
                  >
                    <AppIcon icon={CookingPot} className="h-4 w-4" />
                    {producingSubRecipe ? 'Produciendo...' : 'Producir subreceta'}
                  </button>
                </form>
              </div>
            ) : (
              <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500">
                Marca un insumo como <strong>Subreceta / preparado</strong> y luego usa el botón <strong>Subreceta</strong> para definir su fórmula.
              </div>
            )}
              </Panel>
            ) : null}

            {activeInventoryWorkspace === 'PURCHASES' ? (
              <Panel title="Compras formales y mermas" subtitle="Registra compras por líneas con costo promedio y mermas operativas separadas del ajuste manual.">
            <form className="space-y-4 rounded-[24px] border border-slate-200/80 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]" onSubmit={(event) => void handlePurchaseSubmit(event)}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Sucursal de compra</span>
                  <select
                    value={purchaseForm.branchId}
                    onChange={(event) => setPurchaseForm((current) => ({ ...current, branchId: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                  >
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Proveedor</span>
                  <input
                    value={purchaseForm.supplier}
                    onChange={(event) => setPurchaseForm((current) => ({ ...current, supplier: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Referencia</span>
                  <input
                    value={purchaseForm.reference}
                    onChange={(event) => setPurchaseForm((current) => ({ ...current, reference: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Factura</span>
                  <input
                    value={purchaseForm.invoiceNo}
                    onChange={(event) => setPurchaseForm((current) => ({ ...current, invoiceNo: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </label>
              </div>

              {purchaseForm.lines.map((line, index) => (
                <div key={`${index}-${line.inventoryItemId}`} className="grid gap-3 md:grid-cols-[1.2fr_0.5fr_0.5fr_auto]">
                  <select
                    value={line.inventoryItemId}
                    onChange={(event) => updatePurchaseLine(index, { inventoryItemId: event.target.value })}
                    className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                  >
                    <option value="">Selecciona insumo</option>
                    {inventoryItems
                      .filter((item) => !purchaseForm.branchId || String(item.branchId) === purchaseForm.branchId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={line.quantity}
                    onChange={(event) => updatePurchaseLine(index, { quantity: event.target.value })}
                    className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                    placeholder="Cantidad"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={line.unitCost}
                    onChange={(event) => updatePurchaseLine(index, { unitCost: event.target.value })}
                    className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                    placeholder="Costo"
                  />
                  <button
                    type="button"
                    onClick={() => removePurchaseLine(index)}
                    className="inline-flex h-12 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 text-rose-700 dark:text-rose-200"
                  >
                    <AppIcon icon={Trash2} className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Notas</span>
                <input
                  value={purchaseForm.notes}
                  onChange={(event) => setPurchaseForm((current) => ({ ...current, notes: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={addPurchaseLine}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                >
                  <AppIcon icon={Plus} className="h-4 w-4" />
                  Agregar línea
                </button>
                <button
                  type="submit"
                  disabled={submittingPurchase}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-800 disabled:opacity-50 dark:text-emerald-200"
                >
                  <AppIcon icon={Save} className="h-4 w-4" />
                  {submittingPurchase ? 'Registrando...' : 'Registrar compra'}
                </button>
                <button
                  type="button"
                  onClick={resetPurchaseForm}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                >
                  <AppIcon icon={X} className="h-4 w-4" />
                  Limpiar
                </button>
              </div>
            </form>

            <form className="mt-5 space-y-4 rounded-[24px] border border-rose-300/20 bg-rose-500/5 p-4 dark:border-rose-400/15" onSubmit={(event) => void handleWasteSubmit(event)}>
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-200">
                <AppIcon icon={TriangleAlert} className="h-4 w-4" />
                Merma operativa separada del ajuste manual
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Insumo</span>
                  <select
                    value={wasteForm.inventoryItemId}
                    onChange={(event) => setWasteForm((current) => ({ ...current, inventoryItemId: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                  >
                    <option value="">Selecciona insumo</option>
                    {branchInventoryItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Motivo</span>
                  <select
                    value={wasteForm.reasonType}
                    onChange={(event) => setWasteForm((current) => ({ ...current, reasonType: event.target.value as WasteFormState['reasonType'] }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                  >
                    <option value="PRODUCTION">Producción</option>
                    <option value="KITCHEN">Cocina</option>
                    <option value="EXPIRED">Vencido</option>
                    <option value="DAMAGE">Daño</option>
                    <option value="OTHER">Otro</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Cantidad</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={wasteForm.quantity}
                    onChange={(event) => setWasteForm((current) => ({ ...current, quantity: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Referencia</span>
                  <input
                    value={wasteForm.reference}
                    onChange={(event) => setWasteForm((current) => ({ ...current, reference: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </label>
              </div>
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Notas</span>
                <input
                  value={wasteForm.notes}
                  onChange={(event) => setWasteForm((current) => ({ ...current, notes: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={submittingWaste}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-5 text-sm font-semibold text-rose-700 disabled:opacity-50 dark:text-rose-200"
                >
                  <AppIcon icon={TriangleAlert} className="h-4 w-4" />
                  {submittingWaste ? 'Registrando...' : 'Registrar merma'}
                </button>
                <button
                  type="button"
                  onClick={resetWasteForm}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                >
                  <AppIcon icon={X} className="h-4 w-4" />
                  Limpiar
                </button>
              </div>
            </form>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45">
                <p className="text-sm font-semibold text-slate-950 dark:text-white">Compras recientes</p>
                <div className="mt-3 space-y-3">
                  {branchPurchaseReceipts.length ? (
                    branchPurchaseReceipts.map((receipt) => (
                      <div key={receipt.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
                        <p className="font-medium text-slate-900 dark:text-white">{receipt.supplier}</p>
                        <p className="mt-1 text-slate-500 dark:text-zinc-500">{receipt.reference}</p>
                        <p className="mt-1 text-slate-900 dark:text-white">{currencySymbol} {receipt.totalAmount.toFixed(2)}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-zinc-500">Sin compras recientes.</p>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45">
                <p className="text-sm font-semibold text-slate-950 dark:text-white">Mermas recientes</p>
                <div className="mt-3 space-y-3">
                  {branchWasteRecords.length ? (
                    branchWasteRecords.map((record) => (
                      <div key={record.id} className="rounded-2xl border border-rose-300/20 bg-rose-500/5 px-3 py-3 text-sm dark:border-rose-400/15">
                        <p className="font-medium text-slate-900 dark:text-white">{record.itemName}</p>
                        <p className="mt-1 text-slate-500 dark:text-zinc-500">{record.reasonType} • {record.reference}</p>
                        <p className="mt-1 text-rose-700 dark:text-rose-200">-{record.quantity.toFixed(3)}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-zinc-500">Sin mermas recientes.</p>
                  )}
                </div>
              </div>
            </div>
              </Panel>
            ) : null}

            {activeInventoryWorkspace === 'AUDIT' ? (
              <Panel title="Movimientos de inventario" subtitle="Historial reciente para auditar compras, ajustes, mermas y consumo por receta.">
            {adjustmentForm.inventoryItemId ? (
              <form className="mb-5 space-y-4 rounded-[24px] border border-slate-200/80 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]" onSubmit={(event) => void handleAdjustmentSubmit(event)}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm text-slate-700 dark:text-zinc-300">Tipo de movimiento</span>
                    <select
                      value={adjustmentForm.type}
                      onChange={(event) => setAdjustmentForm((current) => ({ ...current, type: event.target.value as AdjustmentFormState['type'] }))}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                    >
                      <option value="ADJUSTMENT_IN">Ajuste de entrada</option>
                      <option value="ADJUSTMENT_OUT">Ajuste de salida</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm text-slate-700 dark:text-zinc-300">Cantidad</span>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={adjustmentForm.quantity}
                      onChange={(event) => setAdjustmentForm((current) => ({ ...current, quantity: event.target.value }))}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                    />
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Referencia</span>
                  <input
                    value={adjustmentForm.reference}
                    onChange={(event) => setAdjustmentForm((current) => ({ ...current, reference: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Notas</span>
                  <input
                    value={adjustmentForm.notes}
                    onChange={(event) => setAdjustmentForm((current) => ({ ...current, notes: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none dark:border-white/10 dark:bg-black/30 dark:text-white"
                    placeholder="Detalle opcional"
                  />
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={submittingInventory}
                    className="inline-flex h-12 items-center gap-2 rounded-2xl border border-sky-300/30 bg-sky-500/10 px-5 text-sm font-semibold text-sky-800 disabled:opacity-50 dark:text-sky-200"
                  >
                    <AppIcon icon={Save} className="h-4 w-4" />
                    Registrar movimiento
                  </button>
                  <button
                    type="button"
                    onClick={resetAdjustmentForm}
                    className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                  >
                    <AppIcon icon={X} className="h-4 w-4" />
                    Cancelar
                  </button>
                </div>
              </form>
            ) : null}

            <div className="space-y-3">
              {recentInventoryMovements.length ? (
                recentInventoryMovements.map((movement) => (
                  <article key={movement.id} className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950 dark:text-white">{movement.itemName}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                          {movement.reference} • {new Date(movement.createdAt).toLocaleString('es-GT')} • {movement.actorName ?? 'Sin registrar'}
                        </p>
                      </div>
                      <div className={`rounded-2xl px-3 py-1 text-sm font-semibold ${movement.quantityChange >= 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-200' : 'bg-rose-500/10 text-rose-700 dark:text-rose-200'}`}>
                        {movement.quantityChange >= 0 ? '+' : ''}
                        {movement.quantityChange.toFixed(3)}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                      <div>
                        <p className="text-slate-500 dark:text-zinc-500">Tipo</p>
                        <p className="mt-1 text-slate-950 dark:text-white">{movement.type}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-zinc-500">Stock antes</p>
                        <p className="mt-1 text-slate-950 dark:text-white">{movement.stockBefore.toFixed(3)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-zinc-500">Stock después</p>
                        <p className="mt-1 text-slate-950 dark:text-white">{movement.stockAfter.toFixed(3)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-zinc-500">Costo impacto</p>
                        <p className="mt-1 text-slate-950 dark:text-white">{currencySymbol} {movement.totalCost.toFixed(2)}</p>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500">
                  Aún no hay movimientos registrados para esta sucursal.
                </div>
              )}
            </div>
              </Panel>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
