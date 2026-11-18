import type { MenuCategory, MenuProduct } from '@/types/restaurant';

export type MenuSectionKind = 'DISHES' | 'BEVERAGES' | 'PRODUCTS' | 'EXTRAS' | 'SAUCES' | 'DRESSINGS' | 'CUSTOM';

export function normalizeMenuSectionLabel(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function getMenuSectionKind(name?: string | null): MenuSectionKind {
  const normalized = normalizeMenuSectionLabel(name);
  if (!normalized) return 'CUSTOM';
  if (normalized.includes('salsa')) return 'SAUCES';
  if (normalized.includes('aderezo') || normalized.includes('alino') || normalized.includes('dressing')) return 'DRESSINGS';
  if (normalized === 'extras' || normalized === 'extra') return 'EXTRAS';
  if (normalized === 'bebidas' || normalized === 'bebida') return 'BEVERAGES';
  if (normalized === 'platillos' || normalized === 'platillo') return 'DISHES';
  if (normalized === 'productos' || normalized === 'producto') return 'PRODUCTS';
  return 'CUSTOM';
}

export function isMenuSectionRoot(category: MenuCategory) {
  return !category.parentId;
}

function getMenuSectionPriority(category: MenuCategory) {
  const normalized = normalizeMenuSectionLabel(category.name);
  const kind = getMenuSectionKind(category.name);

  if (kind === 'DISHES') return 0;
  if (kind === 'BEVERAGES') return 1;
  if (kind === 'PRODUCTS') return 2;
  if (kind === 'EXTRAS') return 3;
  if (normalized === 'postres' || normalized === 'postre') return 4;
  if (kind === 'CUSTOM') return 10;
  if (kind === 'SAUCES') return 90;
  if (kind === 'DRESSINGS') return 91;
  return 50;
}

export function buildMenuSectionRoots(categories: MenuCategory[]) {
  return categories
    .filter(isMenuSectionRoot)
    .slice()
    .sort((a, b) => {
      const priorityDiff = getMenuSectionPriority(a) - getMenuSectionPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      return a.name.localeCompare(b.name);
    });
}

export function resolveCategorySectionRoot(
  category: MenuCategory,
  categoryById: Map<number, MenuCategory>,
  seen = new Set<number>(),
): MenuCategory {
  if (seen.has(category.id) || !category.parentId) {
    return category;
  }

  seen.add(category.id);
  const parent = categoryById.get(category.parentId);
  if (!parent) {
    return category;
  }

  return resolveCategorySectionRoot(parent, categoryById, seen);
}

export function resolveProductSectionRoot(product: MenuProduct, categoryById: Map<number, MenuCategory>) {
  if (!product.categoryId) return null;
  const category = categoryById.get(product.categoryId);
  if (!category) return null;
  return resolveCategorySectionRoot(category, categoryById);
}

export function getMenuSectionDescription(category: MenuCategory) {
  const kind = getMenuSectionKind(category.name);

  if (kind === 'DISHES') {
    return 'Administra platillos preparados del menú en una ventana independiente.';
  }
  if (kind === 'BEVERAGES') {
    return 'Agrupa bebidas en una ventana independiente con sus propias categorías y submenús.';
  }
  if (kind === 'PRODUCTS') {
    return 'Separa productos rápidos, empaquetados o complementos en su propia ventana.';
  }
  if (kind === 'EXTRAS') {
    return 'Administra extras y complementos cobrables en una ventana separada.';
  }
  if (kind === 'SAUCES') {
    return 'Gestiona las salsas en una ventana distinta para mantener mejor orden.';
  }
  if (kind === 'DRESSINGS') {
    return 'Agrupa aderezos y complementos en una ventana separada.';
  }

  return `Organiza ${category.name.toLowerCase()} como una sección independiente dentro del módulo Menú.`;
}

export function getDefaultPreparedForMenuSection(category: MenuCategory | null) {
  if (!category) return true;
  const kind = getMenuSectionKind(category.name);
  return !['BEVERAGES', 'PRODUCTS', 'EXTRAS', 'SAUCES', 'DRESSINGS'].includes(kind);
}

export function isModifierMenuSection(category: MenuCategory | null) {
  if (!category) return false;
  const kind = getMenuSectionKind(category.name);
  return kind === 'SAUCES' || kind === 'DRESSINGS';
}

export function isMenuSectionVisibleInPos(category: MenuCategory | null) {
  if (!category) return false;
  if (typeof category.showInPos === 'boolean') {
    return category.showInPos;
  }
  return true;
}

export function findMenuSectionRootByQueryValue(value: string | null | undefined, roots: MenuCategory[]) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const byId = Number(raw);
  if (Number.isInteger(byId) && byId > 0) {
    return roots.find((root) => root.id === byId) ?? null;
  }

  const normalized = normalizeMenuSectionLabel(raw);
  return roots.find((root) => normalizeMenuSectionLabel(root.name) === normalized) ?? null;
}
