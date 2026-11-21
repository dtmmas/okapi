export function normalizeAreaName(area?: string | null) {
  const value = area?.trim();
  return value && value.length > 0 ? value : 'Sin área';
}

type AreaSortMeta = {
  name: string;
  sortOrder?: number | null;
};

export function sortAreaNames(
  areas: Array<string | null | undefined>,
  tableAreas?: AreaSortMeta[] | null,
) {
  const unique = Array.from(new Set(areas.map((area) => normalizeAreaName(area)).filter(Boolean)));
  if (!tableAreas?.length) {
    return unique.sort((left, right) => left.localeCompare(right, 'es'));
  }

  const orderByName = new Map(tableAreas.map((area) => [normalizeAreaName(area.name), area.sortOrder ?? 0]));
  return unique.sort((left, right) => {
    const orderLeft = orderByName.get(left) ?? Number.MAX_SAFE_INTEGER;
    const orderRight = orderByName.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (orderLeft !== orderRight) {
      return orderLeft - orderRight;
    }
    return left.localeCompare(right, 'es');
  });
}

export function getSortedAreas(
  areas: Array<string | null | undefined>,
  tableAreas?: AreaSortMeta[] | null,
) {
  return sortAreaNames(areas, tableAreas);
}

export function sortTablesInArea<T extends { sortOrder?: number; code?: string | null }>(tables: T[]) {
  return [...tables].sort((left, right) => {
    const orderLeft = left.sortOrder ?? 0;
    const orderRight = right.sortOrder ?? 0;
    if (orderLeft !== orderRight) {
      return orderLeft - orderRight;
    }
    return (left.code ?? '').localeCompare(right.code ?? '', 'es');
  });
}

function sanitizeArea(area: string) {
  return area
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .trim();
}

function getAreaPrefix(area: string) {
  const normalized = sanitizeArea(area);
  if (!normalized) {
    return 'M';
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }

  const initials = words.map((word) => word[0]).join('').slice(0, 3).toUpperCase();
  return initials || normalized.slice(0, 3).toUpperCase();
}

export function getNextTableCode(
  area: string,
  tables: Array<{
    area?: string | null;
    code?: string | null;
    id?: number;
  }>,
  excludeTableId?: number | null,
) {
  const normalizedArea = normalizeAreaName(area);
  const usedNumbers = tables
    .filter((table) => (excludeTableId ? table.id !== excludeTableId : true))
    .filter((table) => normalizeAreaName(table.area) === normalizedArea)
    .map((table) => {
      const match = table.code?.match(/(\d+)(?!.*\d)/);
      return match ? Number(match[1]) : null;
    })
    .filter((value): value is number => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  let nextNumber = 1;
  for (const usedNumber of usedNumbers) {
    if (usedNumber !== nextNumber) {
      break;
    }
    nextNumber += 1;
  }

  return `${getAreaPrefix(normalizedArea)}-${String(nextNumber).padStart(2, '0')}`;
}
