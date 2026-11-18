import { ChefHat, ClipboardList, Droplets, GlassWater, Package, Pencil, Plus, Salad, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppIcon, type IconComponent } from '@/components/AppIcon';
import { Panel } from '@/components/Panel';
import {
  buildMenuSectionRoots,
  findMenuSectionRootByQueryValue,
  getDefaultPreparedForMenuSection,
  getMenuSectionDescription,
  getMenuSectionKind,
  isMenuSectionVisibleInPos,
  normalizeMenuSectionLabel,
  resolveCategorySectionRoot,
  resolveProductSectionRoot,
} from '@/lib/menu-sections';
import { createCategory, createProduct, deleteCategory, deleteProduct, updateCategory, updateProduct, uploadMenuImage } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';
import type { MenuCategory, MenuProduct } from '@/types/restaurant';

type MenuWorkspaceView = 'SECTIONS' | 'CATEGORIES' | 'ITEMS';

type CategoryFormState = {
  parentId: string;
  name: string;
  color: string;
  useSectionColor: boolean;
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

type DialogMode = 'CREATE' | 'EDIT' | 'VIEW';
type SectionFormState = {
  name: string;
  color: string;
  showInPos: boolean;
  station: 'KITCHEN' | 'BAR' | 'PASTRY';
};

const menuWorkspaceQueryMap: Record<MenuWorkspaceView, string> = {
  SECTIONS: 'sections',
  CATEGORIES: 'categories',
  ITEMS: 'items',
};

function getMenuWorkspaceFromQuery(value?: string | null): MenuWorkspaceView {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'sections') return 'SECTIONS';
  if (normalized === 'categories') return 'CATEGORIES';
  return 'ITEMS';
}

const initialCategoryForm: CategoryFormState = {
  parentId: '',
  name: '',
  color: '#f59e0b',
  useSectionColor: true,
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

const initialSectionForm: SectionFormState = {
  name: '',
  color: '#f59e0b',
  showInPos: true,
  station: 'KITCHEN',
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

function normalizeLabel(value?: string | null) {
  return normalizeMenuSectionLabel(value);
}

function isSectionRootCategory(category: MenuCategory) {
  return !category.parentId;
}

function getSectionIcon(section: MenuCategory | null): IconComponent {
  const kind = getMenuSectionKind(section?.name);

  if (kind === 'BEVERAGES') return GlassWater;
  if (kind === 'PRODUCTS') return Package;
  if (kind === 'EXTRAS') return Plus;
  if (kind === 'SAUCES') return Droplets;
  if (kind === 'DRESSINGS') return Salad;

  if (section?.station === 'BAR') {
    return GlassWater;
  }
  if (section?.station === 'PASTRY') {
    return Salad;
  }

  return ChefHat;
}

function getEffectiveCategoryColor(category: MenuCategory, categoryById: Map<number, MenuCategory>, fallback = '#f59e0b') {
  let current: MenuCategory | undefined = category;
  const seen = new Set<number>();

  while (current) {
    if (current.color) {
      return current.color;
    }
    if (!current.parentId || seen.has(current.id)) {
      break;
    }
    seen.add(current.id);
    current = categoryById.get(current.parentId);
  }

  return resolveCategorySectionRoot(category, categoryById).color ?? fallback;
}

export default function MenuPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const snapshot = useSessionStore((state) => state.snapshot);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const categories = snapshot?.menuCategories ?? [];
  const products = snapshot?.menuProducts ?? [];
  const requestedWorkspace = getMenuWorkspaceFromQuery(searchParams.get('view'));
  const rootSections = useMemo(() => buildMenuSectionRoots(categories), [categories]);
  const requestedSection = useMemo(
    () => findMenuSectionRootByQueryValue(searchParams.get('sectionId') ?? searchParams.get('section'), rootSections),
    [rootSections, searchParams],
  );
  const currentRoot = requestedSection ?? rootSections[0] ?? null;
  const activeWorkspace = requestedWorkspace;
  const currentSection = useMemo(
    () =>
      currentRoot
        ? {
            label: currentRoot.name,
            description: getMenuSectionDescription(currentRoot),
            icon: getSectionIcon(currentRoot),
            categoryTitle: `Categorías de ${currentRoot.name.toLowerCase()}`,
            productTitle: `Elementos de ${currentRoot.name.toLowerCase()}`,
            defaultStation: currentRoot.station,
            forcedPrepared: getDefaultPreparedForMenuSection(currentRoot),
          }
        : {
            label: 'Menú',
            description: 'Administra las secciones y el catálogo comercial.',
            icon: ChefHat,
            categoryTitle: 'Categorías',
            productTitle: 'Elementos',
            defaultStation: 'KITCHEN' as const,
            forcedPrepared: true,
          },
    [currentRoot],
  );

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [categoryDialogMode, setCategoryDialogMode] = useState<DialogMode>('CREATE');
  const [productDialogMode, setProductDialogMode] = useState<DialogMode>('CREATE');
  const [sectionDialogMode, setSectionDialogMode] = useState<DialogMode>('CREATE');
  const [sectionDialogTargetId, setSectionDialogTargetId] = useState<number | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(initialCategoryForm);
  const [productForm, setProductForm] = useState<ProductFormState>(initialProductForm);
  const [sectionForm, setSectionForm] = useState<SectionFormState>(initialSectionForm);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [submittingCategory, setSubmittingCategory] = useState(false);
  const [submittingProduct, setSubmittingProduct] = useState(false);
  const [submittingSection, setSubmittingSection] = useState(false);
  const [uploadingProductImage, setUploadingProductImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('');
  const productImageInputRef = useRef<HTMLInputElement | null>(null);

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const sectionDialogTarget = useMemo(
    () => (sectionDialogTargetId ? categoryById.get(sectionDialogTargetId) ?? null : null),
    [categoryById, sectionDialogTargetId],
  );

  const categorySectionById = useMemo(
    () => new Map(categories.map((category) => [category.id, resolveCategorySectionRoot(category, categoryById)] as const)),
    [categories, categoryById],
  );

  const visibleCategories = useMemo(
    () =>
      currentRoot
        ? categories.filter((category) => categorySectionById.get(category.id)?.id === currentRoot.id && category.id !== currentRoot.id)
        : [],
    [categories, categorySectionById, currentRoot],
  );

  const visibleProducts = useMemo(
    () =>
      currentRoot
        ? products.filter((product) => resolveProductSectionRoot(product, categoryById)?.id === currentRoot.id)
        : [],
    [categoryById, currentRoot, products],
  );

  const filteredVisibleCategories = useMemo(() => {
    const search = normalizeLabel(categorySearchTerm);
    if (!search) return visibleCategories;

    return visibleCategories.filter((category) => {
      const parentCategory = category.parentId ? categoryById.get(category.parentId) ?? null : null;
      const haystack = [category.name, parentCategory?.name ?? '', stationLabel[category.station]].map((value) => normalizeLabel(value)).join(' ');
      return haystack.includes(search);
    });
  }, [categoryById, categorySearchTerm, visibleCategories]);

  const filteredVisibleProducts = useMemo(() => {
    const categoryFilteredProducts = (() => {
      if (!productCategoryFilter) return visibleProducts;
      if (productCategoryFilter === 'ROOT') {
        return visibleProducts.filter((product) => {
          const category = product.categoryId ? categoryById.get(product.categoryId) ?? null : null;
          return !category || category.id === currentRoot?.id;
        });
      }

      return visibleProducts.filter((product) => String(product.categoryId ?? '') === productCategoryFilter);
    })();

    const search = normalizeLabel(productSearchTerm);
    if (!search) return categoryFilteredProducts;

    return categoryFilteredProducts.filter((product) => {
        const category = product.categoryId ? categoryById.get(product.categoryId) ?? null : null;
        const haystack = [product.name, product.sku ?? '', category?.name ?? '', stationLabel[product.station]].map((value) => normalizeLabel(value)).join(' ');
        return haystack.includes(search);
      });
  }, [categoryById, productCategoryFilter, productSearchTerm, visibleProducts]);
  const parentOptions = useMemo(() => visibleCategories.filter((category) => category.id !== editingCategoryId), [editingCategoryId, visibleCategories]);
  const currentSectionRoot = sectionDialogTarget;

  useEffect(() => {
    setCategorySearchTerm('');
    setProductSearchTerm('');
    setProductCategoryFilter('');
  }, [currentRoot?.id]);

  const isViewingCategory = categoryDialogMode === 'VIEW';
  const isViewingProduct = productDialogMode === 'VIEW';

  function syncSection(sectionId: number | null) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (sectionId) {
        next.set('sectionId', String(sectionId));
      } else {
        next.delete('sectionId');
      }
      next.delete('section');
      next.delete('view');
      return next;
    });
  }

  function syncWorkspace(workspace: MenuWorkspaceView, sectionId: number | null = currentRoot?.id ?? null) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (sectionId) {
        next.set('sectionId', String(sectionId));
      } else {
        next.delete('sectionId');
      }
      next.delete('section');
      if (workspace === 'ITEMS') {
        next.delete('view');
      } else {
        next.set('view', menuWorkspaceQueryMap[workspace]);
      }
      return next;
    });
  }

  function resetCategoryForm(section: MenuCategory | null = currentRoot) {
    setEditingCategoryId(null);
    setCategoryForm({
      ...initialCategoryForm,
      color: section?.color ?? initialCategoryForm.color,
      station: section?.station ?? 'KITCHEN',
    });
  }

  function resetProductForm(section: MenuCategory | null = currentRoot) {
    setEditingProductId(null);
    setProductForm({ ...initialProductForm, isPrepared: getDefaultPreparedForMenuSection(section) });
  }

  function resetSectionForm(section: MenuCategory | null = sectionDialogTarget ?? currentRoot) {
    setSectionForm({
      name: section?.name ?? '',
      color: section?.color ?? '#f59e0b',
      showInPos: section ? isMenuSectionVisibleInPos(section) : true,
      station: section?.station ?? 'KITCHEN',
    });
  }

  function closeCategoryDialog(section: MenuCategory | null = currentRoot) {
    setCategoryDialogOpen(false);
    setCategoryDialogMode('CREATE');
    resetCategoryForm(section);
  }

  function closeProductDialog(section: MenuCategory | null = currentRoot) {
    setProductDialogOpen(false);
    setProductDialogMode('CREATE');
    resetProductForm(section);
  }

  function closeSectionDialog() {
    setSectionDialogOpen(false);
    setSectionDialogMode('CREATE');
    setSectionDialogTargetId(null);
    resetSectionForm(currentRoot);
  }

  function openCreateCategoryDialog() {
    if (!currentRoot) return;
    resetCategoryForm(currentRoot);
    setCategoryDialogMode('CREATE');
    setError(null);
    setSuccess(null);
    setCategoryDialogOpen(true);
  }

  function openCreateProductDialog() {
    if (!currentRoot) return;
    resetProductForm(currentRoot);
    setProductDialogMode('CREATE');
    setError(null);
    setSuccess(null);
    setProductDialogOpen(true);
  }

  function openCreateSectionDialog() {
    setSectionDialogTargetId(null);
    setSectionDialogMode('CREATE');
    setSectionForm({ ...initialSectionForm, station: currentRoot?.station ?? 'KITCHEN' });
    setError(null);
    setSuccess(null);
    setSectionDialogOpen(true);
  }

  function openSectionDialog(section: MenuCategory, mode: DialogMode) {
    setSectionDialogTargetId(section.id);
    setSectionDialogMode(mode);
    setSectionForm({
      name: section.name,
      color: section.color ?? '#f59e0b',
      showInPos: isMenuSectionVisibleInPos(section),
      station: section.station,
    });
    setError(null);
    setSuccess(null);
    setSectionDialogOpen(true);
  }

  async function handleProductImageFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setUploadingProductImage(true);
    setError(null);
    setSuccess(null);

    try {
      const uploaded = await uploadMenuImage(file);
      setProductForm((current) => ({ ...current, imageUrl: uploaded.url }));
      setSuccess('Imagen cargada correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible subir la imagen.');
    } finally {
      setUploadingProductImage(false);
    }
  }

  function startCategoryEdit(categoryId: number) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;

    const section = categorySectionById.get(category.id) ?? null;
    const parentCategory = category.parentId ? categoryById.get(category.parentId) ?? null : null;
    const parentId = parentCategory && !isSectionRootCategory(parentCategory) ? String(parentCategory.id) : '';

    syncWorkspace('CATEGORIES', section?.id ?? null);
    setCategoryDialogMode('EDIT');
    setEditingCategoryId(category.id);
    setCategoryForm({
      parentId,
      name: category.name,
      color: category.color ?? section?.color ?? '#f59e0b',
      useSectionColor: !category.color,
      station: category.station,
    });
    setError(null);
    setSuccess(null);
    setCategoryDialogOpen(true);
  }

  function startCategoryView(categoryId: number) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;

    const section = categorySectionById.get(category.id) ?? null;
    const parentCategory = category.parentId ? categoryById.get(category.parentId) ?? null : null;
    const parentId = parentCategory && !isSectionRootCategory(parentCategory) ? String(parentCategory.id) : '';

    syncWorkspace('CATEGORIES', section?.id ?? null);
    setCategoryDialogMode('VIEW');
    setEditingCategoryId(category.id);
    setCategoryForm({
      parentId,
      name: category.name,
      color: category.color ?? section?.color ?? '#f59e0b',
      useSectionColor: !category.color,
      station: category.station,
    });
    setError(null);
    setSuccess(null);
    setCategoryDialogOpen(true);
  }

  function startProductEdit(productId: number) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    const section = resolveProductSectionRoot(product, categoryById);
    const category = product.categoryId ? categoryById.get(product.categoryId) ?? null : null;
    const categoryId = category && !isSectionRootCategory(category) ? String(category.id) : '';

    syncWorkspace('ITEMS', section?.id ?? null);
    setProductDialogMode('EDIT');
    setEditingProductId(product.id);
    setProductForm({
      categoryId,
      name: product.name,
      sku: product.sku ?? '',
      imageUrl: product.imageUrl ?? '',
      price: String(product.price),
      isPrepared: getDefaultPreparedForMenuSection(section),
    });
    setError(null);
    setSuccess(null);
    setProductDialogOpen(true);
  }

  function startProductView(productId: number) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    const section = resolveProductSectionRoot(product, categoryById);
    const category = product.categoryId ? categoryById.get(product.categoryId) ?? null : null;
    const categoryId = category && !isSectionRootCategory(category) ? String(category.id) : '';

    syncWorkspace('ITEMS', section?.id ?? null);
    setProductDialogMode('VIEW');
    setEditingProductId(product.id);
    setProductForm({
      categoryId,
      name: product.name,
      sku: product.sku ?? '',
      imageUrl: product.imageUrl ?? '',
      price: String(product.price),
      isPrepared: getDefaultPreparedForMenuSection(section),
    });
    setError(null);
    setSuccess(null);
    setProductDialogOpen(true);
  }

  async function handleCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingCategory(true);
    setError(null);
    setSuccess(null);

    try {
      if (!currentRoot) {
        throw new Error('Primero crea una sección para poder agregar categorías.');
      }

      const payload = {
        parentId: categoryForm.parentId ? Number(categoryForm.parentId) : currentRoot.id,
        name: categoryForm.name,
        color: categoryForm.useSectionColor ? null : categoryForm.color || null,
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
      closeCategoryDialog(currentRoot);
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
      if (!currentRoot) {
        throw new Error('Primero crea una sección para poder agregar elementos.');
      }

      const payload = {
        categoryId: productForm.categoryId ? Number(productForm.categoryId) : currentRoot.id,
        name: productForm.name,
        sku: productForm.sku || null,
        imageUrl: productForm.imageUrl || null,
        price: Number(productForm.price || '0'),
        isPrepared: productForm.isPrepared,
      };

      if (editingProductId) {
        await updateProduct(editingProductId, payload);
        setSuccess('Elemento actualizado correctamente.');
      } else {
        await createProduct(payload);
        setSuccess('Elemento creado correctamente.');
      }

      await refreshSnapshot();
      closeProductDialog(currentRoot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar el producto.');
    } finally {
      setSubmittingProduct(false);
    }
  }

  async function handleSectionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingSection(true);
    setError(null);
    setSuccess(null);

    try {
      const preservedSectionId = currentRoot?.id ?? null;
      const name = sectionForm.name.trim();
      if (!name) {
        throw new Error('Ingresa un nombre para la sección.');
      }

      const payload = {
        name,
        parentId: null,
        color: sectionForm.color || null,
        showInPos: sectionForm.showInPos,
        station: sectionForm.station,
      };

      let nextSectionId = sectionDialogTarget?.id ?? null;

      if (sectionDialogTarget) {
        await updateCategory(sectionDialogTarget.id, payload);
        setSuccess(`Sección ${name.toLowerCase()} actualizada correctamente.`);
      } else {
        const created = (await createCategory(payload)) as { id: number };
        nextSectionId = created.id;
        setSuccess(`Sección ${name.toLowerCase()} creada correctamente.`);
      }

      await refreshSnapshot();
      closeSectionDialog();
      syncWorkspace('SECTIONS', preservedSectionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar la sección.');
    } finally {
      setSubmittingSection(false);
    }
  }

  async function handleDeleteCategory(categoryId: number) {
    setSubmittingCategory(true);
    setError(null);
    setSuccess(null);

    try {
      await deleteCategory(categoryId);
      await refreshSnapshot();
      if (editingCategoryId === categoryId) closeCategoryDialog(currentRoot);
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
      if (editingProductId === productId) closeProductDialog(currentRoot);
      setSuccess('Elemento eliminado correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible eliminar el elemento.');
    } finally {
      setSubmittingProduct(false);
    }
  }

  function openRecipeInInventory(product: MenuProduct) {
    navigate(`/inventario?view=recipes&productId=${product.id}`);
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-[20px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</div> : null}
      {success ? <div className="rounded-[20px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-rose-200">{success}</div> : null}

      <Panel
        title={activeWorkspace === 'SECTIONS' ? 'Gestión de secciones' : `${currentSection.label} por procesos`}
        subtitle={
          activeWorkspace === 'SECTIONS'
            ? 'Administra las familias base del módulo Menú sin entrar a una sección específica.'
            : 'Trabaja una sola tarea a la vez: primero categorías y luego los elementos del menú.'
        }
      >
        {activeWorkspace === 'SECTIONS' ? null : (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => syncWorkspace('CATEGORIES')}
              className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition ${
                activeWorkspace === 'CATEGORIES'
                  ? 'border-amber-300/30 bg-amber-300/10 text-amber-900 dark:text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]'
              }`}
            >
              <AppIcon icon={ClipboardList} className="h-4 w-4" />
              Gestión de categorías
            </button>
            <button
              type="button"
              onClick={() => syncWorkspace('ITEMS')}
              className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition ${
                activeWorkspace === 'ITEMS'
                  ? 'border-amber-300/30 bg-amber-300/10 text-amber-900 dark:text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]'
              }`}
            >
              <AppIcon icon={currentSection.icon} className="h-4 w-4" />
              Gestión de {currentSection.label.toLowerCase()}
            </button>
          </div>
        )}

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">Vista actual</p>
            <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
              {activeWorkspace === 'SECTIONS'
                ? 'Secciones base del menú'
                : activeWorkspace === 'CATEGORIES'
                  ? currentSection.categoryTitle
                  : currentSection.productTitle}
            </p>
          </div>
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">
              {activeWorkspace === 'SECTIONS' ? 'Secciones activas' : 'Categorías'}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
              {activeWorkspace === 'SECTIONS'
                ? `${rootSections.length} disponibles`
                : `${filteredVisibleCategories.length}${filteredVisibleCategories.length !== visibleCategories.length ? ` de ${visibleCategories.length}` : ''} registradas`}
            </p>
          </div>
          <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">
              {activeWorkspace === 'SECTIONS' ? 'Elementos totales' : currentSection.label}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
              {activeWorkspace === 'SECTIONS'
                ? `${products.length} registrados`
                : `${filteredVisibleProducts.length}${filteredVisibleProducts.length !== visibleProducts.length ? ` de ${visibleProducts.length}` : ''} registrados`}
            </p>
          </div>
        </div>
      </Panel>

      {activeWorkspace === 'SECTIONS' ? (
        <Panel title="Secciones del menú" subtitle="Crea o actualiza las categorías raíz que estructuran el módulo Menú y su navegación.">
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={openCreateSectionDialog}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white"
            >
              <AppIcon icon={Plus} className="h-4 w-4" />
              Crear sección
            </button>
          </div>
          {rootSections.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rootSections.map((section) => {
                const icon = getSectionIcon(section);
                const sectionCategories = categories.filter((category) => categorySectionById.get(category.id)?.id === section.id && category.id !== section.id);
                const sectionProducts = products.filter((product) => resolveProductSectionRoot(product, categoryById)?.id === section.id);

                return (
                  <article key={section.id} className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-2xl border"
                        style={{
                          borderColor: `${section.color ?? '#f59e0b'}55`,
                          backgroundColor: `${section.color ?? '#f59e0b'}22`,
                          color: section.color ?? '#f59e0b',
                        }}
                      >
                        <AppIcon icon={icon} className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-950 dark:text-white">{section.name}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">{`Activa en ${stationLabel[section.station]}`}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                      Disponible
                    </span>
                  </div>

                  <p className="mt-4 text-sm text-slate-600 dark:text-zinc-400">{getMenuSectionDescription(section)}</p>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600 dark:text-zinc-300">
                    <div>
                      <p className="text-slate-500 dark:text-zinc-500">Categorías</p>
                      <p className="mt-1 text-slate-950 dark:text-white">
                        {sectionCategories.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-zinc-500">Elementos</p>
                      <p className="mt-1 text-slate-950 dark:text-white">
                        {sectionProducts.length}
                      </p>
                    </div>
                  <div>
                    <p className="text-slate-500 dark:text-zinc-500">Menú mesero</p>
                    <p className="mt-1 text-slate-950 dark:text-white">
                      {isMenuSectionVisibleInPos(section) ? 'Visible' : 'Oculta'}
                    </p>
                  </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => syncSection(section.id)}
                      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-sky-300/30 bg-sky-500/10 px-3 text-sm text-sky-800 transition hover:bg-sky-500/15 dark:text-sky-200"
                    >
                      <AppIcon icon={icon} className="h-4 w-4" />
                      Abrir
                    </button>
                    <button
                      type="button"
                      onClick={() => openSectionDialog(section, 'EDIT')}
                      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 text-sm text-amber-900 transition hover:bg-amber-300/15 dark:text-white"
                    >
                      <AppIcon icon={Pencil} className="h-4 w-4" />
                      Editar sección
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCategory(section.id)}
                      disabled={submittingCategory}
                      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 text-sm text-rose-700 transition hover:bg-rose-500/15 disabled:opacity-50 dark:text-rose-200"
                    >
                      <AppIcon icon={Trash2} className="h-4 w-4" />
                      Eliminar sección
                    </button>
                  </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500">
              Aún no hay secciones creadas. Usa el botón <strong>Crear sección</strong> para registrar la primera.
            </div>
          )}
        </Panel>
      ) : activeWorkspace === 'CATEGORIES' ? (
        <Panel title={currentSection.categoryTitle} subtitle={`${currentSection.description} Deja la captura en un diálogo y usa esta vista solo para revisar y accionar.`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                Aquí solo ves la lista. Para crear o editar, usa el diálogo de gestión.
              </div>
              <label className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                <span className="uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">Buscar</span>
                <input
                  value={categorySearchTerm}
                  onChange={(event) => setCategorySearchTerm(event.target.value)}
                  className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  placeholder="Nombre o padre"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={openCreateCategoryDialog}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white"
            >
              <AppIcon icon={Plus} className="h-4 w-4" />
              Crear categoría
            </button>
          </div>
          <div className="mt-6 space-y-3">
            {filteredVisibleCategories.length ? (
              filteredVisibleCategories.map((category) => {
                const Icon = stationIcon[category.station];
                const parentCategory = category.parentId ? categoryById.get(category.parentId) ?? null : null;
                const parentLabel = parentCategory && !isSectionRootCategory(parentCategory) ? categoryNameById.get(parentCategory.id) : 'Principal';

                return (
                  <article key={category.id} className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-2xl"
                          style={{
                            backgroundColor: `${getEffectiveCategoryColor(category, categoryById)}22`,
                            color: getEffectiveCategoryColor(category, categoryById),
                          }}
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
                        <button type="button" onClick={() => startCategoryView(category.id)} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-sky-300/30 bg-sky-500/10 px-3 text-sm text-sky-800 transition hover:bg-sky-500/15 dark:text-sky-200">
                          <AppIcon icon={currentSection.icon} className="h-4 w-4" />
                          Visualizar
                        </button>
                        <button type="button" onClick={() => startCategoryEdit(category.id)} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]">
                          <AppIcon icon={Pencil} className="h-4 w-4" />
                          Editar
                        </button>
                        <button type="button" onClick={() => void handleDeleteCategory(category.id)} disabled={submittingCategory} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 text-sm text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-50">
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
                {visibleCategories.length
                  ? `No hay categorías de ${currentSection.label.toLowerCase()} con esa búsqueda.`
                  : `Aún no hay categorías creadas para ${currentSection.label.toLowerCase()}.`}
              </div>
            )}
          </div>
        </Panel>
      ) : (
        <Panel title={currentSection.productTitle} subtitle={`Aquí ves solo la lista de ${currentSection.label.toLowerCase()}. El alta y edición se hacen en un diálogo controlado.`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                La receta se define después en inventario. Aquí solo administras el catálogo comercial.
              </div>
              <label className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                <span className="uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">Filtrar categoría</span>
                <select
                  value={productCategoryFilter}
                  onChange={(event) => setProductCategoryFilter(event.target.value)}
                  className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                >
                  <option value="">Todas</option>
                  <option value="ROOT">Directo en {currentSection.label}</option>
                  {visibleCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                <span className="uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">Buscar</span>
                <input
                  value={productSearchTerm}
                  onChange={(event) => setProductSearchTerm(event.target.value)}
                  className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  placeholder="Nombre o SKU"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={openCreateProductDialog}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white"
            >
              <AppIcon icon={Plus} className="h-4 w-4" />
              Crear {currentSection.label.slice(0, -1).toLowerCase()}
            </button>
          </div>
          <div className="mt-6 space-y-3">
            {filteredVisibleProducts.length ? (
              filteredVisibleProducts.map((product) => {
                const category = product.categoryId ? categoryById.get(product.categoryId) ?? null : null;
                return (
                  <article key={product.id} className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <AppIcon icon={currentSection.icon} className="h-5 w-5 text-slate-400 dark:text-zinc-500" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-950 dark:text-white">{product.name}</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                            {category && !isSectionRootCategory(category) ? category.name : currentSection.label} • {stationLabel[product.station]}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => startProductView(product.id)} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-sky-300/30 bg-sky-500/10 px-3 text-sm text-sky-800 transition hover:bg-sky-500/15 dark:text-sky-200">
                          <AppIcon icon={currentSection.icon} className="h-4 w-4" />
                          Visualizar
                        </button>
                        <button type="button" onClick={() => openRecipeInInventory(product)} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-3 text-sm text-emerald-800 transition hover:bg-emerald-500/15 dark:text-emerald-200">
                          <AppIcon icon={ClipboardList} className="h-4 w-4" />
                          Receta en inventario
                        </button>
                        <button type="button" onClick={() => startProductEdit(product.id)} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]">
                          <AppIcon icon={Pencil} className="h-4 w-4" />
                          Editar
                        </button>
                        <button type="button" onClick={() => void handleDeleteProduct(product.id)} disabled={submittingProduct} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 text-sm text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-50">
                          <AppIcon icon={Trash2} className="h-4 w-4" />
                          Eliminar
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600 dark:text-zinc-300 md:grid-cols-4">
                      <div>
                        <p className="text-slate-500 dark:text-zinc-500">Precio</p>
                        <p className="mt-1 text-slate-950 dark:text-white">{product.price}</p>
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
                        <p className="mt-1 truncate text-slate-950 dark:text-white">{product.imageUrl ? 'Imagen cargada' : 'Sin imagen'}</p>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500">
                {visibleProducts.length
                  ? `No hay ${currentSection.label.toLowerCase()} que coincidan con los filtros actuales.`
                  : `Aún no hay elementos creados en la ventana de ${currentSection.label.toLowerCase()}.`}
              </div>
            )}
          </div>
        </Panel>
      )}

      {sectionDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm dark:bg-black/60">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b0b10] dark:text-white dark:shadow-none sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Sección del menú</p>
                <h2 className="mt-2 truncate font-display text-2xl text-slate-950 dark:text-white sm:text-3xl">
                  {sectionDialogTarget ? `Editar ${sectionDialogTarget.name}` : 'Crear nueva sección'}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                  Esta configuración crea o actualiza una categoría raíz para que aparezca en Menú y en el menú lateral.
                </p>
              </div>
              <button
                type="button"
                onClick={closeSectionDialog}
                className="h-10 w-10 rounded-2xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
              >
                ×
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={(event) => void handleSectionSubmit(event)}>
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Nombre de la sección</span>
                <input
                  value={sectionForm.name}
                  onChange={(event) => setSectionForm((current) => ({ ...current, name: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  placeholder="Ej. Combos, Desayunos, Promociones"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Área principal</span>
                  <select
                    value={sectionForm.station}
                    onChange={(event) => setSectionForm((current) => ({ ...current, station: event.target.value as SectionFormState['station'] }))}
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
                    value={sectionForm.color}
                    onChange={(event) => setSectionForm((current) => ({ ...current, color: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={sectionForm.showInPos}
                  onChange={(event) => setSectionForm((current) => ({ ...current, showInPos: event.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-300/40 dark:border-white/10 dark:bg-black/30"
                />
                <span>
                  <strong>Mostrar en menú de mesero</strong>
                  <br />
                  Esta opción solo controla si la sección aparece en el menú del mesero. En la barra lateral administrativa seguirá visible.
                </span>
              </label>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                {currentSectionRoot
                  ? 'La sección ya existe como categoría raíz y se actualizará sin tocar sus categorías hijas ni sus elementos.'
                  : 'Se creará una categoría raíz nueva y luego podrás colgar categorías y elementos debajo de ella.'}
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeSectionDialog}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                >
                  <AppIcon icon={X} className="h-4 w-4" />
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingSection}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
                >
                  <AppIcon icon={currentSectionRoot ? Pencil : Plus} className="h-4 w-4" />
                  {submittingSection ? 'Guardando...' : currentSectionRoot ? 'Actualizar sección' : 'Crear sección'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {categoryDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm dark:bg-black/60">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b0b10] dark:text-white dark:shadow-none sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">{currentSection.label}</p>
                <h2 className="mt-2 truncate font-display text-2xl text-slate-950 dark:text-white sm:text-3xl">
                  {isViewingCategory
                    ? `Visualizar categoría: ${categoryForm.name}`
                    : editingCategoryId
                      ? `Editar categoría: ${categoryForm.name}`
                      : `Nueva categoría de ${currentSection.label.toLowerCase()}`}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                  {isViewingCategory
                    ? `Consulta los datos de la categoría dentro del catálogo de ${currentSection.label.toLowerCase()}.`
                    : `Define la categoría y su ubicación dentro del catálogo de ${currentSection.label.toLowerCase()}.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => closeCategoryDialog(currentRoot)}
                className="h-10 w-10 rounded-2xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
              >
                ×
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={(event) => void handleCategorySubmit(event)}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Nombre de categoría</span>
                  <input
                    value={categoryForm.name}
                    onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                    disabled={isViewingCategory}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                    placeholder="Ej. Entradas, Cafés, Cremosos, Quesos extra"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Categoría padre dentro de {currentSection.label.toLowerCase()}</span>
                  <select
                    value={categoryForm.parentId}
                    onChange={(event) => setCategoryForm((current) => ({ ...current, parentId: event.target.value }))}
                    disabled={isViewingCategory}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  >
                    <option value="">{currentRoot ? `Directo en ${currentSection.label}` : `Crear directo en ${currentSection.label}`}</option>
                    {!parentOptions.length ? (
                      <option value="" disabled>
                        No hay categorías padre disponibles en esta ventana
                      </option>
                    ) : null}
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
                    onChange={(event) => setCategoryForm((current) => ({ ...current, station: event.target.value as CategoryFormState['station'] }))}
                    disabled={isViewingCategory}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  >
                    <option value="KITCHEN">Cocina</option>
                    <option value="BAR">Bar</option>
                    <option value="PASTRY">Pastelería</option>
                  </select>
                </label>
                <label className="flex items-start gap-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={categoryForm.useSectionColor}
                    onChange={(event) =>
                      setCategoryForm((current) => ({
                        ...current,
                        useSectionColor: event.target.checked,
                        color: event.target.checked ? currentRoot?.color ?? current.color : current.color,
                      }))
                    }
                    disabled={isViewingCategory}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-300/40 dark:border-white/10 dark:bg-black/30"
                  />
                  <span>
                    <strong>Usar color de la sección raíz</strong>
                    <br />
                    La categoría heredará el color de <strong>{currentSection.label}</strong> en lugar de usar uno propio.
                  </span>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Color</span>
                  <input
                    type="color"
                    value={categoryForm.color}
                    onChange={(event) => setCategoryForm((current) => ({ ...current, color: event.target.value }))}
                    disabled={isViewingCategory || categoryForm.useSectionColor}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </label>
                <div className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Color efectivo</span>
                  <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 dark:border-white/10 dark:bg-black/30 dark:text-zinc-200">
                    <span
                      className="h-6 w-6 rounded-full border border-slate-200 dark:border-white/10"
                      style={{ backgroundColor: categoryForm.useSectionColor ? currentRoot?.color ?? categoryForm.color : categoryForm.color }}
                    />
                    <span>
                      {categoryForm.useSectionColor
                        ? `Usará el color de ${currentSection.label}`
                        : 'Usará el color propio de la categoría'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                Solo aparecen categorías padre de esta misma ventana. Si quieres colgar una categoría dentro de <strong>{currentSection.label}</strong>, debes crearla o editarla dentro de esta misma ventana para que ambos queden en la misma familia.
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => closeCategoryDialog(currentRoot)}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                >
                  <AppIcon icon={X} className="h-4 w-4" />
                  {isViewingCategory ? 'Cerrar' : 'Cancelar'}
                </button>
                {!isViewingCategory ? (
                  <button
                    type="submit"
                    disabled={submittingCategory}
                    className="inline-flex h-12 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
                  >
                    <AppIcon icon={editingCategoryId ? Pencil : Plus} className="h-4 w-4" />
                    {submittingCategory ? 'Guardando...' : editingCategoryId ? 'Actualizar categoría' : 'Crear categoría'}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {productDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm dark:bg-black/60">
          <div className="w-full max-w-3xl rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b0b10] dark:text-white dark:shadow-none sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">{currentSection.label}</p>
                <h2 className="mt-2 truncate font-display text-2xl text-slate-950 dark:text-white sm:text-3xl">
                  {isViewingProduct ? `Visualizar elemento: ${productForm.name}` : editingProductId ? `Editar elemento: ${productForm.name}` : 'Nuevo elemento'}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                  {isViewingProduct
                    ? 'Consulta los datos comerciales del elemento y su clasificación actual.'
                    : 'Registra los datos comerciales y luego conecta la receta desde inventario.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => closeProductDialog(currentRoot)}
                className="h-10 w-10 rounded-2xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
              >
                ×
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={(event) => void handleProductSubmit(event)}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Nombre</span>
                  <input
                    value={productForm.name}
                    onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))}
                    disabled={isViewingProduct}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                    placeholder="Ej. Hamburguesa doble, Café americano, Combo familiar"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Categoría</span>
                  <select
                    value={productForm.categoryId}
                    onChange={(event) => setProductForm((current) => ({ ...current, categoryId: event.target.value }))}
                    disabled={isViewingProduct}
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
                    disabled={isViewingProduct}
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
                    disabled={isViewingProduct}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </label>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">Tipo</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">{productForm.isPrepared ? 'Requiere preparación' : 'No requiere preparación'}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">La receta se define después en el módulo de inventario.</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1.35fr_0.65fr]">
                <div className="space-y-2">
                  <label htmlFor="menu-product-image-url" className="text-sm text-slate-700 dark:text-zinc-300">
                    Imagen del elemento
                  </label>
                  <input
                    id="menu-product-image-url"
                    value={productForm.imageUrl}
                    onChange={(event) => setProductForm((current) => ({ ...current, imageUrl: event.target.value }))}
                    disabled={isViewingProduct}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                    placeholder="https://..."
                  />
                  <p className="text-xs text-slate-500 dark:text-zinc-500">
                    Aplica para {currentSection.label.toLowerCase()}. Puedes pegar una URL o subir una imagen desde tu equipo.
                  </p>
                  <input
                    ref={productImageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => void handleProductImageFileChange(event)}
                    className="hidden"
                  />
                  <div className="flex flex-wrap gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => productImageInputRef.current?.click()}
                      disabled={uploadingProductImage || isViewingProduct}
                      className="inline-flex h-11 items-center gap-2 rounded-2xl border border-sky-300/30 bg-sky-500/10 px-4 text-sm font-semibold text-sky-800 transition hover:bg-sky-500/15 disabled:opacity-50 dark:text-sky-200"
                    >
                      <AppIcon icon={Upload} className="h-4 w-4" />
                      {uploadingProductImage ? 'Subiendo imagen...' : 'Subir desde archivo'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductForm((current) => ({ ...current, imageUrl: '' }))}
                      disabled={uploadingProductImage || isViewingProduct || !productForm.imageUrl}
                      className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                    >
                      <AppIcon icon={X} className="h-4 w-4" />
                      Quitar imagen
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-500">
                    Formatos permitidos: JPG, PNG, WEBP o GIF. Tamaño máximo: 5 MB.
                  </p>
                </div>
                <div className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Vista previa</span>
                  <div className="flex h-32 items-center justify-center overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-black/20">
                    {productForm.imageUrl ? (
                      <img
                        src={productForm.imageUrl}
                        alt={productForm.name || currentSection.label}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-zinc-500">
                        <AppIcon icon={currentSection.icon} className="h-6 w-6" />
                        <span className="text-xs">Sin imagen cargada</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => closeProductDialog(currentRoot)}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                >
                  <AppIcon icon={X} className="h-4 w-4" />
                  {isViewingProduct ? 'Cerrar' : 'Cancelar'}
                </button>
                {!isViewingProduct ? (
                  <button
                    type="submit"
                    disabled={submittingProduct || uploadingProductImage}
                    className="inline-flex h-12 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
                  >
                    <AppIcon icon={editingProductId ? Pencil : Plus} className="h-4 w-4" />
                    {submittingProduct ? 'Guardando...' : editingProductId ? 'Actualizar elemento' : 'Crear elemento'}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
