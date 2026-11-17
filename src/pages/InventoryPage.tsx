import { ChefHat, ClipboardList, CookingPot, Droplets, Package, Pencil, Plus, Salad, Save, Trash2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AppIcon, type IconComponent } from '@/components/AppIcon';
import { Panel } from '@/components/Panel';
import {
  adjustInventoryItem,
  createCategory,
  createInventoryItem,
  createPurchaseReceipt,
  createProduct,
  createWasteRecord,
  deleteCategory,
  deleteProduct,
  getProductRecipe,
  getSubRecipeFormula,
  produceSubRecipe,
  saveProductRecipe,
  saveSubRecipeFormula,
  updateCategory,
  updateInventoryItem,
  updateProduct,
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

type MenuSection = 'DISHES' | 'PRODUCTS' | 'SAUCES' | 'DRESSINGS';

type CategoryFormState = {
  parentId: string;
  name: string;
  color: string;
  station: 'KITCHEN' | 'BAR' | 'PASTRY';
};

type ProductFormState = {
  categoryId: string;
  name: string;
  sku: string;
  imageUrl: string;
  price: string;
  isPrepared: boolean;
};

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

const initialCategoryForm: CategoryFormState = {
  parentId: '',
  name: '',
  color: '#f59e0b',
  station: 'KITCHEN',
};

const initialProductForm: ProductFormState = {
  categoryId: '',
  name: '',
  sku: '',
  imageUrl: '',
  price: '0',
  isPrepared: true,
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
  PRODUCTS: {
    label: 'Productos',
    description: 'Separa productos rápidos, empaquetados o no preparados en su propia ventana.',
    icon: Package,
    colorClass: 'border-sky-300/35 bg-sky-500/10 text-sky-900 dark:text-white',
    categoryTitle: 'Categorías de productos',
    productTitle: 'Ventana de productos',
    defaultStation: 'BAR',
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
    description: 'Agrupa aderezos y complementos en una ventana separada dentro de Menús.',
    icon: Salad,
    colorClass: 'border-emerald-300/35 bg-emerald-500/10 text-emerald-900 dark:text-white',
    categoryTitle: 'Categorías de aderezos',
    productTitle: 'Ventana de aderezos',
    defaultStation: 'KITCHEN',
    forcedPrepared: false,
  },
};

function normalizeLabel(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getSectionRootName(section: MenuSection) {
  return sectionConfig[section].label;
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

function getPreparedValueForSection(section: MenuSection) {
  return sectionConfig[section].forcedPrepared;
}

export default function InventoryPage() {
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
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(initialCategoryForm);
  const [productForm, setProductForm] = useState<ProductFormState>(initialProductForm);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
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
  const [submittingCategory, setSubmittingCategory] = useState(false);
  const [submittingProduct, setSubmittingProduct] = useState(false);
  const [submittingInventory, setSubmittingInventory] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [loadingSubRecipe, setLoadingSubRecipe] = useState(false);
  const [savingSubRecipe, setSavingSubRecipe] = useState(false);
  const [producingSubRecipe, setProducingSubRecipe] = useState(false);
  const [submittingPurchase, setSubmittingPurchase] = useState(false);
  const [submittingWaste, setSubmittingWaste] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const sectionRoots = useMemo(() => {
    const roots = new Map<MenuSection, MenuCategory | null>();
    (Object.keys(sectionConfig) as MenuSection[]).forEach((section) => {
      roots.set(
        section,
        categories.find(
          (category) => !category.parentId && normalizeLabel(category.name) === normalizeLabel(getSectionRootName(section)),
        ) ?? null,
      );
    });
    return roots;
  }, [categories]);

  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
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
  const currentRoot = sectionRoots.get(activeSection) ?? null;
  const currentBranchId = recipeBranchId || String(user?.branchId ?? branches[0]?.id ?? '');

  const branchInventoryItems = useMemo(
    () => inventoryItems.filter((item) => !currentBranchId || String(item.branchId) === currentBranchId),
    [currentBranchId, inventoryItems],
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

  const parentOptions = useMemo(() => {
    return visibleCategories.filter((category) => category.id !== editingCategoryId);
  }, [editingCategoryId, visibleCategories]);

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

  function resetCategoryForm(section: MenuSection = activeSection) {
    setEditingCategoryId(null);
    setCategoryForm({
      ...initialCategoryForm,
      station: sectionConfig[section].defaultStation,
    });
  }

  function resetProductForm(section: MenuSection = activeSection) {
    setEditingProductId(null);
    setProductForm({
      ...initialProductForm,
      isPrepared: getPreparedValueForSection(section),
    });
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
    setLoadingRecipe(true);
    setRecipeProductId(productId);
    setError(null);
    setSuccess(null);

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
    resetCategoryForm(section);
    resetProductForm(section);
  }

  function startCategoryEdit(categoryId: number) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) {
      return;
    }

    const section = categorySectionById.get(category.id) ?? 'DISHES';
    const parentCategory = category.parentId ? categoryById.get(category.parentId) ?? null : null;
    const parentId = parentCategory && !isSectionRootCategory(parentCategory) ? String(parentCategory.id) : '';

    setActiveSection(section);
    setEditingCategoryId(category.id);
    setCategoryForm({
      parentId,
      name: category.name,
      color: category.color ?? '#f59e0b',
      station: category.station,
    });
    setError(null);
    setSuccess(null);
  }

  function startProductEdit(productId: number) {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      return;
    }

    const section = resolveProductSection(product, categoryById);
    const category = product.categoryId ? categoryById.get(product.categoryId) ?? null : null;
    const categoryId = category && !isSectionRootCategory(category) ? String(category.id) : '';

    setActiveSection(section);
    setEditingProductId(product.id);
    setProductForm({
      categoryId,
      name: product.name,
      sku: product.sku ?? '',
      imageUrl: product.imageUrl ?? '',
      price: String(product.price),
      isPrepared: getPreparedValueForSection(section),
    });
    setError(null);
    setSuccess(null);
  }

  async function ensureSectionRootCategory(section: MenuSection, station: CategoryFormState['station']) {
    const existingRoot = sectionRoots.get(section);
    if (existingRoot) {
      return existingRoot.id;
    }

    const created = (await createCategory({
      name: getSectionRootName(section),
      parentId: null,
      color: null,
      station,
    })) as { id: number };

    return created.id;
  }

  async function handleCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingCategory(true);
    setError(null);
    setSuccess(null);

    try {
      const rootId = await ensureSectionRootCategory(activeSection, categoryForm.station);
      const resolvedParentId = categoryForm.parentId ? Number(categoryForm.parentId) : rootId;
      const payload = {
        parentId: resolvedParentId,
        name: categoryForm.name,
        color: categoryForm.color || null,
        station: categoryForm.station,
      };

      if (editingCategoryId) {
        await updateCategory(editingCategoryId, payload);
        setSuccess(`Categoría de ${currentSection.label.toLowerCase()} actualizada correctamente.`);
      } else {
        await createCategory(payload);
        setSuccess(`Categoría de ${currentSection.label.toLowerCase()} creada correctamente.`);
      }

      await refreshSnapshot();
      resetCategoryForm(activeSection);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar la categoría.');
    } finally {
      setSubmittingCategory(false);
    }
  }

  async function handleProductSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingProduct(true);
    setError(null);
    setSuccess(null);

    try {
      const rootId = await ensureSectionRootCategory(activeSection, currentSection.defaultStation);
      const payload = {
        categoryId: productForm.categoryId ? Number(productForm.categoryId) : rootId,
        name: productForm.name,
        sku: productForm.sku || null,
        imageUrl: productForm.imageUrl || null,
        price: Number(productForm.price || '0'),
        isPrepared: getPreparedValueForSection(activeSection),
      };

      if (editingProductId) {
        await updateProduct(editingProductId, payload);
        setSuccess(`${currentSection.label.slice(0, -1)} actualizado correctamente.`);
      } else {
        await createProduct(payload);
        setSuccess(`${currentSection.label.slice(0, -1)} creado correctamente.`);
      }

      await refreshSnapshot();
      resetProductForm(activeSection);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar el producto.');
    } finally {
      setSubmittingProduct(false);
    }
  }

  async function handleDeleteCategory(categoryId: number) {
    setSubmittingCategory(true);
    setError(null);
    setSuccess(null);

    try {
      await deleteCategory(categoryId);
      await refreshSnapshot();
      if (editingCategoryId === categoryId) {
        resetCategoryForm(activeSection);
      }
      setSuccess('Categoría eliminada correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible eliminar la categoría.');
    } finally {
      setSubmittingCategory(false);
    }
  }

  async function handleDeleteProduct(productId: number) {
    setSubmittingProduct(true);
    setError(null);
    setSuccess(null);

    try {
      await deleteProduct(productId);
      await refreshSnapshot();
      if (editingProductId === productId) {
        resetProductForm(activeSection);
      }
      setSuccess('Elemento eliminado correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible eliminar el elemento.');
    } finally {
      setSubmittingProduct(false);
    }
  }

  function startInventoryEdit(item: InventoryItem) {
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
    if (subRecipeItemId && currentBranchId) {
      void loadSubRecipe(subRecipeItemId, currentBranchId);
    }
  }, [currentBranchId, subRecipeItemId]);

  return (
    <div className="space-y-6">
      <Panel title="Menús" subtitle="Ahora el módulo maneja submenús separados para trabajar platillos, productos, salsas y aderezos en ventanas diferentes.">
        <div className="flex flex-wrap gap-3">
          {(Object.keys(sectionConfig) as MenuSection[]).map((section) => {
            const config = sectionConfig[section];
            const isActive = activeSection === section;
            return (
              <button
                key={section}
                type="button"
                onClick={() => handleSectionChange(section)}
                className={`rounded-[24px] border px-4 py-3 text-left transition sm:min-w-[220px] ${isActive ? config.colorClass : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-black/5 bg-white/70 dark:border-white/10 dark:bg-black/20">
                    <AppIcon icon={config.icon} className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold">{config.label}</p>
                    <p className="mt-1 text-xs opacity-80">
                      {sectionCounts[section].categories} categorías • {sectionCounts[section].products} elementos
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      {error ? <div className="rounded-[20px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-[20px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">{success}</div> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title={currentSection.categoryTitle} subtitle={currentSection.description}>
          <form className="space-y-4" onSubmit={(event) => void handleCategorySubmit(event)}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Nombre de categoría</span>
                <input
                  value={categoryForm.name}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  placeholder={`Ej. ${activeSection === 'SAUCES' ? 'Picantes' : activeSection === 'DRESSINGS' ? 'Cremosos' : activeSection === 'PRODUCTS' ? 'Bebidas embotelladas' : 'Entradas'}`}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Categoría padre</span>
                <select
                  value={categoryForm.parentId}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, parentId: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                >
                  <option value="">{currentRoot ? `Directo en ${currentSection.label}` : `Crear directo en ${currentSection.label}`}</option>
                  {parentOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Área de preparación</span>
                <select
                  value={categoryForm.station}
                  onChange={(event) =>
                    setCategoryForm((current) => ({ ...current, station: event.target.value as CategoryFormState['station'] }))
                  }
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                >
                  <option value="KITCHEN">Cocina</option>
                  <option value="BAR">Bar</option>
                  <option value="PASTRY">Pastelería</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Color</span>
                <input
                  type="color"
                  value={categoryForm.color}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, color: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </label>
            </div>

            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
              Si no eliges categoría padre, el sistema la coloca dentro del submenú <strong>{currentSection.label}</strong> automáticamente.
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={submittingCategory}
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
              >
                <AppIcon icon={editingCategoryId ? Pencil : Plus} className="h-4 w-4" />
                {submittingCategory ? 'Guardando...' : editingCategoryId ? 'Actualizar categoría' : `Crear categoría en ${currentSection.label}`}
              </button>
              {editingCategoryId ? (
                <button
                  type="button"
                  onClick={() => resetCategoryForm(activeSection)}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                >
                  <AppIcon icon={X} className="h-4 w-4" />
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>

          <div className="mt-6 space-y-3">
            {visibleCategories.length ? (
              visibleCategories.map((category) => {
                const Icon = stationIcon[category.station];
                const parentCategory = category.parentId ? categoryById.get(category.parentId) ?? null : null;
                const parentLabel = parentCategory && !isSectionRootCategory(parentCategory) ? categoryNameById.get(parentCategory.id) : 'Principal';

                return (
                  <article key={category.id} className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-2xl"
                          style={{ backgroundColor: `${category.color ?? '#f59e0b'}22`, color: category.color ?? '#f59e0b' }}
                        >
                          <AppIcon icon={Icon} className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-950 dark:text-white">{category.name}</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                            {stationLabel[category.station]} • {parentLabel}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startCategoryEdit(category.id)}
                          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                        >
                          <AppIcon icon={Pencil} className="h-4 w-4" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCategory(category.id)}
                          disabled={submittingCategory}
                          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 text-sm text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-50"
                        >
                          <AppIcon icon={Trash2} className="h-4 w-4" />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500">
                Aún no hay categorías creadas para {currentSection.label.toLowerCase()}.
              </div>
            )}
          </div>
        </Panel>

        <Panel title={currentSection.productTitle} subtitle={`Cada submenú mantiene sus elementos en una ventana distinta dentro de Menús. ${currentSection.description}`}>
          <form className="space-y-4" onSubmit={(event) => void handleProductSubmit(event)}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Nombre</span>
                <input
                  value={productForm.name}
                  onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  placeholder={`Ej. ${activeSection === 'SAUCES' ? 'Salsa barbacoa' : activeSection === 'DRESSINGS' ? 'Aderezo ranch' : activeSection === 'PRODUCTS' ? 'Agua pura 600ml' : 'Hamburguesa doble'}`}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Categoría</span>
                <select
                  value={productForm.categoryId}
                  onChange={(event) => setProductForm((current) => ({ ...current, categoryId: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                >
                  <option value="">{currentRoot ? `Sin subcategoría visible (queda dentro de ${currentSection.label})` : `Usar raíz de ${currentSection.label}`}</option>
                  {visibleCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">SKU</span>
                <input
                  value={productForm.sku}
                  onChange={(event) => setProductForm((current) => ({ ...current, sku: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  placeholder="SKU opcional"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Precio</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.price}
                  onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </label>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">Tipo</p>
                <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
                  {getPreparedValueForSection(activeSection) ? 'Requiere preparación' : 'No requiere preparación'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">Este valor se controla automáticamente por la ventana activa.</p>
              </div>
            </div>

            <label className="space-y-2">
              <span className="text-sm text-slate-700 dark:text-zinc-300">Imagen</span>
              <input
                value={productForm.imageUrl}
                onChange={(event) => setProductForm((current) => ({ ...current, imageUrl: event.target.value }))}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                placeholder="https://..."
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={submittingProduct}
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
              >
                <AppIcon icon={editingProductId ? Pencil : Plus} className="h-4 w-4" />
                {submittingProduct ? 'Guardando...' : editingProductId ? 'Actualizar elemento' : `Crear en ${currentSection.label}`}
              </button>
              {editingProductId ? (
                <button
                  type="button"
                  onClick={() => resetProductForm(activeSection)}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                >
                  <AppIcon icon={X} className="h-4 w-4" />
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>

          <div className="mt-6 space-y-3">
            {visibleProducts.length ? (
              visibleProducts.map((product) => {
                const category = product.categoryId ? categoryById.get(product.categoryId) ?? null : null;
                return (
                  <article key={product.id} className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950 dark:text-white">{product.name}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                          {category && !isSectionRootCategory(category) ? category.name : currentSection.label} • {stationLabel[product.station]}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void loadRecipe(product.id)}
                          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-3 text-sm text-emerald-800 transition hover:bg-emerald-500/15 dark:text-emerald-200"
                        >
                          <AppIcon icon={ClipboardList} className="h-4 w-4" />
                          Receta
                        </button>
                        <button
                          type="button"
                          onClick={() => startProductEdit(product.id)}
                          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                        >
                          <AppIcon icon={Pencil} className="h-4 w-4" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteProduct(product.id)}
                          disabled={submittingProduct}
                          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 text-sm text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-50"
                        >
                          <AppIcon icon={Trash2} className="h-4 w-4" />
                          Eliminar
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600 dark:text-zinc-300 md:grid-cols-4">
                      <div>
                        <p className="text-slate-500 dark:text-zinc-500">Precio</p>
                        <p className="mt-1 text-slate-950 dark:text-white">
                          {currencySymbol} {product.price}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-zinc-500">SKU</p>
                        <p className="mt-1 text-slate-950 dark:text-white">{product.sku || 'No definido'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-zinc-500">Preparación</p>
                        <p className="mt-1 text-slate-950 dark:text-white">{product.isPrepared ? 'Sí' : 'No'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-zinc-500">Imagen</p>
                        <p className="mt-1 truncate text-slate-950 dark:text-white">{product.imageUrl || 'Sin imagen'}</p>
                      </div>
                    </div>

                    {recipeProductId === product.id && recipeData ? (
                      <div className="mt-4 rounded-[20px] border border-emerald-300/25 bg-emerald-500/5 px-4 py-3 text-sm text-slate-700 dark:text-zinc-200">
                        Costo estimado por receta en {branchNameById.get(recipeData.branchId) ?? 'sucursal'}: <strong>{currencySymbol} {recipeData.estimatedCost.toFixed(2)}</strong>
                      </div>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500">
                Aún no hay elementos creados en la ventana de {currentSection.label.toLowerCase()}.
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel title="Insumos e inventario" subtitle="Controla ingredientes, costo y stock por sucursal.">
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

        <div className="space-y-6">
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
                          {movement.reference} • {new Date(movement.createdAt).toLocaleString('es-GT')}
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
        </div>
      </div>
    </div>
  );
}
