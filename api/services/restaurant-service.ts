import {
  CashMovementType as PrismaCashMovementType,
  InventoryItemType as PrismaInventoryItemType,
  InventoryMovementType as PrismaInventoryMovementType,
  OrderStatus as PrismaOrderStatus,
  OrderType as PrismaOrderType,
  PaymentMethod as PrismaPaymentMethod,
  Prisma,
  PreparationStation as PrismaPreparationStation,
  PreparationStatus as PrismaPreparationStatus,
  TableStatus as PrismaTableStatus,
  WasteReasonType as PrismaWasteReasonType,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  findUserByEmail as findMockUserByEmail,
  getMockProductRecipe,
  restaurantSnapshot,
  sanitizeUser as sanitizeMockUser,
  users as mockUsers,
} from '../data/mock-data.js';
import { defaultRoleProfiles, getDefaultRoleProfile, normalizePermissions, permissionCatalog, roleCodeOrder } from '../lib/permissions.js';
import { canUseDatabase, prisma } from '../lib/prisma.js';
import type {
  AuthUser,
  Branch,
  CashMovement,
  CashShiftControlItem,
  Customer,
  DashboardMetric,
  DeliveryOrder,
  InventoryItem,
  InventoryMovement,
  KitchenOrder,
  MenuCategory,
  MenuProduct,
  Order,
  PermissionCatalogItem,
  PurchaseReceiptSummary,
  ProductRecipe,
  RecipeIngredient,
  ReportPaymentMixItem,
  ReportsSummary,
  ReportUserOption,
  PreparationStation,
  ProductPerformance,
  RestaurantSnapshot,
  RestaurantTable,
  RoleCode,
  RoleProfileSummary,
  SalesPoint,
  SubRecipeFormula,
  UserSummary,
  WasteRecordSummary,
} from '../types.js';

type SanitizedAuthUser = Omit<AuthUser, 'passwordHash'>;

type CreateOrderPayload = {
  branchId?: number;
  tableId?: number;
  customerId?: number;
  customer?: {
    name: string;
    phone?: string;
  };
  type: 'DINE_IN' | 'TAKE_OUT' | 'DELIVERY';
  channel?: string;
  items: Array<{
    productId: number;
    quantity: number;
    notes?: string;
  }>;
};

function parseCustomPermissions(value: unknown): AuthUser['permissions'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return normalizePermissions(value.filter((item): item is AuthUser['permissions'][number] => typeof item === 'string'));
}

const permissionCatalogItems = [...permissionCatalog];
const mockRoleProfilesStore = new Map<number, RoleProfileSummary[]>();

function getSortedRoleProfiles(profiles: Iterable<RoleProfileSummary>) {
  return [...profiles].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return roleCodeOrder.indexOf(left.role) - roleCodeOrder.indexOf(right.role);
  });
}

function createRoleProfileMap(profiles: RoleProfileSummary[]) {
  const map = new Map<RoleCode, RoleProfileSummary>();

  for (const role of roleCodeOrder) {
    map.set(role, getDefaultRoleProfile(role));
  }

  for (const profile of profiles) {
    map.set(profile.role, {
      ...profile,
      permissions: normalizePermissions(profile.permissions),
    });
  }

  return map;
}

function getMockTenantRoleProfilesMap(tenantId: number) {
  const existingProfiles = mockRoleProfilesStore.get(tenantId);
  if (!existingProfiles) {
    const defaults = roleCodeOrder.map((role) => getDefaultRoleProfile(role));
    mockRoleProfilesStore.set(tenantId, defaults);
    return createRoleProfileMap(defaults);
  }

  return createRoleProfileMap(existingProfiles);
}

async function getTenantRoleProfilesMap(tenantId: number) {
  if (!(await canUseDatabase())) {
    return getMockTenantRoleProfilesMap(tenantId);
  }

  const existing = await prisma.roleProfile.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: 'asc' }, { role: 'asc' }],
  });

  const existingRoles = new Set(existing.map((profile) => profile.role as RoleCode));
  const missingRoles = roleCodeOrder.filter((role) => !existingRoles.has(role));

  if (missingRoles.length > 0) {
    await prisma.roleProfile.createMany({
      data: missingRoles.map((role) => {
        const profile = getDefaultRoleProfile(role);
        return {
          tenantId,
          role,
          name: profile.name,
          description: profile.description,
          sortOrder: profile.sortOrder,
          permissionsJson: profile.permissions,
        };
      }),
    });
  }

  const profiles = missingRoles.length > 0
    ? await prisma.roleProfile.findMany({
        where: { tenantId },
        orderBy: [{ sortOrder: 'asc' }, { role: 'asc' }],
      })
    : existing;

  return createRoleProfileMap(
    profiles.map((profile) => ({
      role: profile.role as RoleCode,
      name: profile.name,
      description: profile.description ?? '',
      sortOrder: profile.sortOrder,
      permissions: parseCustomPermissions(profile.permissionsJson),
    })),
  );
}

async function resolvePermissions(tenantId: number, role: AuthUser['role'], mode: unknown, permissionsJson: unknown) {
  const permissionMode = mode === 'CUSTOM' ? 'CUSTOM' : 'ROLE';
  const customPermissions = permissionMode === 'CUSTOM' ? parseCustomPermissions(permissionsJson) : [];
  const roleProfiles = await getTenantRoleProfilesMap(tenantId);
  const permissions = permissionMode === 'CUSTOM' ? customPermissions : [...(roleProfiles.get(role)?.permissions ?? defaultRoleProfiles[role].permissions)];
  return { permissionMode, permissions, customPermissions } as const;
}

export async function getRolesConfiguration(user: SanitizedAuthUser): Promise<{
  roles: RoleProfileSummary[];
  permissionCatalog: PermissionCatalogItem[];
}> {
  const roleProfiles = await getTenantRoleProfilesMap(user.tenantId);
  return {
    roles: getSortedRoleProfiles(roleProfiles.values()),
    permissionCatalog: permissionCatalogItems,
  };
}

export async function updateRoleProfileForUser(
  user: SanitizedAuthUser,
  payload: {
    role: RoleCode;
    name: string;
    description?: string;
    sortOrder: number;
    permissions: AuthUser['permissions'];
  },
): Promise<RoleProfileSummary> {
  const name = String(payload.name ?? '').trim();
  const description = String(payload.description ?? '').trim();
  const sortOrder = Math.max(0, Math.trunc(payload.sortOrder));
  const permissions = normalizePermissions(payload.permissions ?? []);

  if (name.length < 2 || name.length > 60) {
    throw new Error('El nombre del rol debe tener entre 2 y 60 caracteres.');
  }

  if (description.length > 180) {
    throw new Error('La descripción del rol no puede exceder 180 caracteres.');
  }

  if (!permissions.length) {
    throw new Error('Selecciona al menos un permiso para el rol.');
  }

  const nextProfile: RoleProfileSummary = {
    role: payload.role,
    name,
    description,
    sortOrder,
    permissions,
  };

  if (!(await canUseDatabase())) {
    const currentProfiles = getSortedRoleProfiles(getMockTenantRoleProfilesMap(user.tenantId).values());
    const nextProfiles = currentProfiles.map((profile) => (profile.role === payload.role ? nextProfile : profile));
    mockRoleProfilesStore.set(user.tenantId, nextProfiles);
    return nextProfile;
  }

  await prisma.roleProfile.upsert({
    where: {
      tenantId_role: {
        tenantId: user.tenantId,
        role: payload.role,
      },
    },
    update: {
      name,
      description: description || null,
      sortOrder,
      permissionsJson: permissions,
    },
    create: {
      tenantId: user.tenantId,
      role: payload.role,
      name,
      description: description || null,
      sortOrder,
      permissionsJson: permissions,
    },
  });

  return nextProfile;
}

function sanitizeAuthUser(user: AuthUser): SanitizedAuthUser {
  return {
    id: user.id,
    tenantId: user.tenantId,
    branchId: user.branchId,
    role: user.role,
    permissions: user.permissions,
    name: user.name,
    email: user.email,
  };
}

function assertCashControlAccess(user: SanitizedAuthUser) {
  if (user.role !== 'ADMIN' && user.role !== 'SUPERVISOR') {
    throw new Error('Solo administración y supervisión pueden gestionar cajas de otros usuarios.');
  }
}

function formatCurrency(amount: number, currencySymbol: string) {
  return `${currencySymbol} ${amount.toLocaleString('es-GT', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizePhoneNumber(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '');
}

function toDateLabel(date: Date) {
  return new Intl.DateTimeFormat('es-PE', { weekday: 'short' })
    .format(date)
    .replace('.', '')
    .replace(/^\w/, (value) => value.toUpperCase());
}

function toShortDateLabel(date: Date) {
  return new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: '2-digit' }).format(date);
}

function buildDateBuckets(dateFrom?: Date | null, dateTo?: Date | null) {
  const end = dateTo ? new Date(dateTo) : new Date();
  end.setHours(0, 0, 0, 0);

  const start = dateFrom ? new Date(dateFrom) : new Date(end);
  if (!dateFrom) {
    start.setDate(end.getDate() - 6);
  }
  start.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function buildSalesTrend(
  orders: Array<{ createdAt: Date; total: number }>,
  options?: {
    dateFrom?: Date | null;
    dateTo?: Date | null;
  },
): SalesPoint[] {
  const days = buildDateBuckets(options?.dateFrom, options?.dateTo);

  return days.map((date) => {
    const total = orders
      .filter((order) => {
        const current = new Date(order.createdAt);
        current.setHours(0, 0, 0, 0);
        return current.getTime() === date.getTime();
      })
      .reduce((sum, order) => sum + Number(order.total), 0);

    return {
      label: days.length <= 7 ? toDateLabel(date) : toShortDateLabel(date),
      total,
    };
  });
}

function formatReportPeriod(dateFrom?: string | null, dateTo?: string | null) {
  if (dateFrom && dateTo) {
    const start = new Date(`${dateFrom}T00:00:00`);
    const end = new Date(`${dateTo}T00:00:00`);
    return `${toShortDateLabel(start)} - ${toShortDateLabel(end)}`;
  }

  if (dateFrom) {
    const start = new Date(`${dateFrom}T00:00:00`);
    return `Desde ${toShortDateLabel(start)}`;
  }

  if (dateTo) {
    const end = new Date(`${dateTo}T00:00:00`);
    return `Hasta ${toShortDateLabel(end)}`;
  }

  return new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(new Date());
}

function buildPaymentMix(
  payments: Array<{ method: PrismaPaymentMethod; amount: number }>,
): ReportPaymentMixItem[] {
  const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const methods: PrismaPaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'MIXED'];

  return methods.map((method) => {
    const total = payments.filter((payment) => payment.method === method).reduce((sum, payment) => sum + payment.amount, 0);
    return {
      method,
      total,
      share: totalAmount > 0 ? Math.round((total / totalAmount) * 100) : 0,
    };
  });
}

function toInventoryMovementLabel(type: PrismaInventoryMovementType) {
  switch (type) {
    case PrismaInventoryMovementType.PURCHASE:
      return 'Compra';
    case PrismaInventoryMovementType.ADJUSTMENT_IN:
      return 'Ajuste +';
    case PrismaInventoryMovementType.ADJUSTMENT_OUT:
      return 'Ajuste -';
    case PrismaInventoryMovementType.RECIPE_CONSUMPTION:
      return 'Consumo por receta';
    case PrismaInventoryMovementType.SUBRECIPE_PRODUCTION:
      return 'Producción de subreceta';
    case PrismaInventoryMovementType.SUBRECIPE_CONSUMPTION:
      return 'Consumo para subreceta';
    case PrismaInventoryMovementType.WASTE:
      return 'Merma';
    default:
      return type;
  }
}

async function applyRecipeConsumption(
  tx: Prisma.TransactionClient,
  payload: {
    tenantId: number;
    branchId: number;
    createdById: number;
    orderId: number;
    items: Array<{ productId: number; quantity: number }>;
  },
) {
  const groupedItems = new Map<number, number>();
  for (const item of payload.items) {
    groupedItems.set(item.productId, (groupedItems.get(item.productId) ?? 0) + Number(item.quantity));
  }

  const productIds = [...groupedItems.keys()];
  if (!productIds.length) {
    return;
  }

  const recipes = await tx.recipe.findMany({
    where: {
      branchId: payload.branchId,
      productId: { in: productIds },
      product: { tenantId: payload.tenantId },
    },
    include: {
      product: { select: { id: true, name: true } },
      inventoryItem: { select: { id: true, name: true, stock: true, unitCost: true } },
    },
  });

  if (!recipes.length) {
    return;
  }

  const requiredByInventoryItem = new Map<
    number,
    {
      quantity: number;
      productName: string;
      inventoryName: string;
      unitCost: number;
      stock: number;
    }
  >();

  for (const recipe of recipes) {
    const orderedQuantity = groupedItems.get(recipe.productId) ?? 0;
    if (orderedQuantity <= 0) {
      continue;
    }

    const requiredQuantity = Number(recipe.quantity) * orderedQuantity;
    const current = requiredByInventoryItem.get(recipe.inventoryItemId);
    requiredByInventoryItem.set(recipe.inventoryItemId, {
      quantity: (current?.quantity ?? 0) + requiredQuantity,
      productName: recipe.product.name,
      inventoryName: recipe.inventoryItem.name,
      unitCost: Number(recipe.inventoryItem.unitCost),
      stock: Number(recipe.inventoryItem.stock),
    });
  }

  for (const [, requirement] of requiredByInventoryItem) {
    if (requirement.quantity > requirement.stock) {
      throw new Error(`Stock insuficiente para ${requirement.inventoryName}. Requiere ${requirement.quantity.toFixed(3)} y solo hay ${requirement.stock.toFixed(3)}.`);
    }
  }

  for (const [inventoryItemId, requirement] of requiredByInventoryItem) {
    const stockBefore = requirement.stock;
    const stockAfter = Number((stockBefore - requirement.quantity).toFixed(3));

    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { stock: stockAfter },
    });

    await tx.inventoryMovement.create({
      data: {
        branchId: payload.branchId,
        inventoryItemId,
        createdById: payload.createdById,
        orderId: payload.orderId,
        type: PrismaInventoryMovementType.RECIPE_CONSUMPTION,
        quantityChange: -requirement.quantity,
        stockBefore,
        stockAfter,
        unitCost: requirement.unitCost,
        totalCost: Number((requirement.quantity * requirement.unitCost).toFixed(4)),
        reference: `Consumo por pedido #${payload.orderId}`,
        notes: `Salida automática por receta`,
      },
    });
  }
}

function buildTopProducts(orders: Order[]): ProductPerformance[] {
  const accumulator = new Map<string, ProductPerformance>();

  for (const order of orders) {
    for (const item of order.items) {
      const current = accumulator.get(item.product) ?? {
        id: accumulator.size + 1,
        name: item.product,
        sold: 0,
        revenue: 0,
        margin: '32%',
      };

      current.sold += item.quantity;
      current.revenue += item.quantity * (order.total / Math.max(order.items.length, 1));
      accumulator.set(item.product, current);
    }
  }

  return [...accumulator.values()]
    .sort((left, right) => right.sold - left.sold)
    .slice(0, 4)
    .map((item, index) => ({
      ...item,
      id: index + 1,
      revenue: Math.round(item.revenue),
    }));
}

function buildDashboardMetrics(orders: Order[], branches: Branch[], currencySymbol: string): DashboardMetric[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayOrders = orders.filter((order) => {
    const current = new Date();
    return current >= today && order.status !== 'CANCELLED';
  });

  const totalSales = todayOrders.reduce((sum, order) => sum + order.total, 0);
  const activeOrders = orders.filter((order) => ['OPEN', 'IN_PREPARATION', 'READY', 'SERVED'].includes(order.status));
  const averageTicket = orders.length ? orders.reduce((sum, order) => sum + order.total, 0) / orders.length : 0;

  return [
    {
      label: 'Ventas del dia',
      value: formatCurrency(totalSales, currencySymbol),
      change: `${todayOrders.length} ordenes hoy`,
      trend: totalSales > 0 ? 'up' : 'neutral',
    },
    { label: 'Ordenes activas', value: String(activeOrders.length), change: `${activeOrders.filter((order) => order.type === 'DELIVERY').length} delivery`, trend: activeOrders.length ? 'up' : 'neutral' },
    {
      label: 'Ticket promedio',
      value: formatCurrency(Math.round(averageTicket), currencySymbol),
      change: `${branches.length} sucursales activas`,
      trend: averageTicket > 0 ? 'up' : 'neutral',
    },
    { label: 'Margen bruto', value: '32.0%', change: 'Estimado por receta', trend: 'neutral' },
  ];
}

function getStationPrefix(station: PreparationStation) {
  if (station === 'BAR') {
    return 'BAR';
  }

  if (station === 'PASTRY') {
    return 'PST';
  }

  return 'KDS';
}

function toKitchenStatus(status: PrismaPreparationStatus): KitchenOrder['status'] {
  if (String(status) === 'DELIVERED') {
    return 'DELIVERED';
  }

  if (status === PrismaPreparationStatus.IN_PREPARATION) {
    return 'IN_PREPARATION';
  }

  if (status === PrismaPreparationStatus.READY) {
    return 'READY';
  }

  return 'PENDING';
}

function deriveTicketStatus(statuses: Array<KitchenOrder['status']>): KitchenOrder['status'] {
  if (statuses.includes('PENDING')) {
    return 'PENDING';
  }

  if (statuses.includes('IN_PREPARATION')) {
    return 'IN_PREPARATION';
  }

  if (statuses.includes('READY')) {
    return 'READY';
  }

  return 'DELIVERED';
}

function toPriority(elapsedMinutes: number): KitchenOrder['priority'] {
  if (elapsedMinutes >= 20) {
    return 'ALTA';
  }

  if (elapsedMinutes >= 10) {
    return 'MEDIA';
  }

  return 'BAJA';
}

function buildStationOrders(orderRows: Array<any>, station: PreparationStation): KitchenOrder[] {
  const now = Date.now();

  return orderRows
    .filter((order) => !['PAID', 'CANCELLED'].includes(order.status))
    .map((order) => {
      const itemsForStation = order.items.filter((item: any) => item.station === station && toKitchenStatus(item.status) !== 'DELIVERED');

      if (!itemsForStation.length) {
        return null;
      }

      const statuses = itemsForStation.map((item: any) => toKitchenStatus(item.status));
      const ticketStatus = deriveTicketStatus(statuses);
      const startedAtDates = itemsForStation
        .map((item: any) => (item.startedAt ? new Date(item.startedAt) : null))
        .filter(Boolean) as Date[];
      const startedAtDate =
        startedAtDates.length > 0
          ? startedAtDates.reduce((earliest, current) => (current.getTime() < earliest.getTime() ? current : earliest))
          : itemsForStation.reduce((earliest: Date, item: any) => {
              const createdAt = item.createdAt ? new Date(item.createdAt) : new Date(order.createdAt);
              return createdAt.getTime() < earliest.getTime() ? createdAt : earliest;
            }, new Date(order.createdAt));
      const elapsedMinutes =
        ticketStatus === 'PENDING' ? 0 : Math.max(0, Math.round((now - startedAtDate.getTime()) / 60000));
      const prefix = getStationPrefix(station);
      const customerName = order.customer?.name ?? order.table?.code ?? 'Consumidor final';

      return {
        id: order.id,
        orderId: order.id,
        station,
        tableCode: order.table?.code ?? undefined,
        code: `${prefix}-${order.code}`,
        customerName,
        area:
          order.table?.area ??
          (order.type === 'DELIVERY' ? 'Delivery' : order.type === 'TAKE_OUT' ? 'Recojo' : order.branch?.name ?? 'Operacion'),
        status: ticketStatus,
        startedAt: startedAtDate.toISOString(),
        elapsedMinutes,
        priority: toPriority(elapsedMinutes),
        items: itemsForStation.map((item: any) => {
          const notes = typeof item.notes === 'string' ? item.notes.trim() : '';
          return `${item.product.name} x${Number(item.quantity)}${notes ? `\n${notes}` : ''}`;
        }),
      } satisfies KitchenOrder;
    })
    .filter(Boolean);
}

async function buildDatabaseSnapshot(tenantId: number, branchId: number | null): Promise<RestaurantSnapshot | null> {
  if (!(await canUseDatabase())) {
    return null;
  }

  const [tenantRow, branchRows, categoryRows, productRows, orderRowsRaw, tableRows, customerRows] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.branch.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    prisma.category.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    prisma.product.findMany({ where: { tenantId }, orderBy: { id: 'asc' }, include: { category: true } }),
    prisma.order.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        table: true,
        customer: true,
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
        payments: true,
      },
    }),
    prisma.restaurantTable.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    prisma.customer.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
  ]);

  if (!branchRows.length) {
    return null;
  }

  const resolvedBranchId = branchId ?? branchRows[0].id;
  const branchById = new Map(branchRows.map((branch) => [branch.id, branch]));
  const orderRows = orderRowsRaw.map((order) => ({ ...order, branch: branchById.get(order.branchId) ?? null }));
  const branchIds = branchRows.map((branch) => branch.id);
  const inventoryRowsRaw = await prisma.inventoryItem.findMany({
    where: { branchId: { in: branchIds } },
    orderBy: { id: 'asc' },
  });
  const inventoryRows = inventoryRowsRaw.map((item) => ({ ...item, branch: branchById.get(item.branchId) ?? null }));
  const inventoryMovementRows = await prisma.inventoryMovement.findMany({
    where: { branchId: { in: branchIds } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      inventoryItem: true,
      branch: true,
      product: true,
      order: true,
    },
  });
  const purchaseReceiptRows = await prisma.purchaseReceipt.findMany({
    where: { branchId: { in: branchIds } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      branch: true,
      lines: {
        include: {
          inventoryItem: true,
        },
      },
    },
  });
  const wasteRecordRows = await prisma.wasteRecord.findMany({
    where: { branchId: { in: branchIds } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      branch: true,
      inventoryItem: true,
    },
  });
  const cashShiftRow = await prisma.cashShift.findFirst({
    where: { tenantId, branchId: resolvedBranchId, closedAt: null },
    orderBy: { openedAt: 'desc' },
    include: { openedBy: true },
  });
  const cashShift = cashShiftRow
    ? {
        id: cashShiftRow.id,
        branchId: cashShiftRow.branchId,
        isOpen: true,
        openedAt: cashShiftRow.openedAt.toISOString(),
        openedBy: cashShiftRow.openedBy?.name ?? 'Caja',
        openingAmount: Number(cashShiftRow.openingAmount),
      }
    : null;
  const manualCashMovementRows = cashShiftRow
    ? await prisma.cashMovementRecord.findMany({
        where: { tenantId, cashShiftId: cashShiftRow.id },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const currencyCode = tenantRow?.currencyCode ?? restaurantSnapshot.brand.currencyCode ?? 'GTQ';
  const currencySymbol = tenantRow?.currencySymbol ?? restaurantSnapshot.brand.currencySymbol ?? 'Q';
  const brand = {
    name: tenantRow?.name ?? restaurantSnapshot.brand.name,
    slogan: restaurantSnapshot.brand.slogan,
    currencyCode,
    currencySymbol,
    logoData: tenantRow?.logoData ?? restaurantSnapshot.brand.logoData ?? null,
  } satisfies RestaurantSnapshot['brand'];

  const branches: Branch[] = branchRows.map((branch) => ({
    id: branch.id,
    tenantId: branch.tenantId,
    name: branch.name,
    city: branch.city,
    address: branch.address,
    phone: branch.phone,
    isActive: branch.isActive,
  }));

  const menuCategories: MenuCategory[] = categoryRows.map((category) => ({
    id: category.id,
    parentId: category.parentId ?? null,
    name: category.name,
    color: category.color ?? undefined,
    station: category.station,
  }));

  const menuProducts: MenuProduct[] = productRows.map((product) => ({
    id: product.id,
    categoryId: product.categoryId,
    name: product.name,
    sku: product.sku,
    imageUrl: product.imageUrl ?? null,
    price: Number(product.price),
    isPrepared: product.isPrepared,
    station: product.category?.station ?? 'KITCHEN',
  }));

  const orders: Order[] = orderRows.map((order) => ({
    id: order.id,
    code: order.code,
    branchId: order.branchId,
    type: order.type,
    status: order.status,
    customerName: order.customer?.name ?? order.table?.code ?? 'Consumidor final',
    area:
      order.table?.area ??
      (order.type === 'DELIVERY' ? 'Delivery' : order.type === 'TAKE_OUT' ? 'Recojo' : order.branch?.name ?? 'Operacion'),
    total: Number(order.total),
    channel: order.channel,
    tableCode: order.table?.code,
    assignedTo: order.type === 'DELIVERY' ? 'Asignacion pendiente' : undefined,
    paidAmount: order.payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    pendingAmount: Math.max(0, Number(order.total) - order.payments.reduce((sum, payment) => sum + Number(payment.amount), 0)),
    paymentCount: order.payments.length,
    items: order.items.map((item) => ({
      product: item.product.name,
      quantity: Number(item.quantity),
      notes: item.notes ?? undefined,
    })),
    payments: order.payments
      .slice()
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((payment) => ({
        id: payment.id,
        method: payment.method,
        amount: Number(payment.amount),
        reference: payment.reference ?? null,
        createdAt: payment.createdAt.toISOString(),
      })),
  }));

  const activeOrders = orders.filter((order) => ['OPEN', 'IN_PREPARATION', 'READY', 'SERVED'].includes(order.status));

  const tables: RestaurantTable[] = tableRows.map((table) => {
    const activeOrder = activeOrders.find((order) => order.tableCode === table.code);

    return {
      id: table.id,
      branchId: table.branchId,
      code: table.code,
      capacity: table.capacity,
      area: table.area,
      status: table.status === PrismaTableStatus.RESERVED ? PrismaTableStatus.RESERVED : activeOrder ? PrismaTableStatus.OCCUPIED : PrismaTableStatus.FREE,
      currentOrder: activeOrder?.code,
    };
  });

  const inventoryItems = inventoryRows.map((item): RestaurantSnapshot['inventoryItems'][number] => ({
    id: item.id,
    branchId: item.branchId,
    name: item.name,
    itemType: item.itemType,
    branch: item.branch?.name ?? 'Sin sucursal',
    stock: Number(item.stock),
    minStock: Number(item.minStock),
    unit: item.unit,
    unitCost: Number(item.unitCost),
    stockValue: Number(item.stock) * Number(item.unitCost),
    supplier: item.supplier,
    status: Number(item.stock) <= Number(item.minStock) ? 'LOW' : 'OK',
  }));

  const inventoryMovements: RestaurantSnapshot['inventoryMovements'] = inventoryMovementRows.map((movement) => ({
    id: movement.id,
    inventoryItemId: movement.inventoryItemId,
    itemName: movement.inventoryItem.name,
    branchId: movement.branchId,
    branchName: movement.branch.name,
    type: movement.type as InventoryMovement['type'],
    quantityChange: Number(movement.quantityChange),
    stockBefore: Number(movement.stockBefore),
    stockAfter: Number(movement.stockAfter),
    unitCost: Number(movement.unitCost),
    totalCost: Number(movement.totalCost),
    reference: movement.reference,
    notes: movement.notes ?? null,
    productName: movement.product?.name ?? null,
    orderCode: movement.order?.code ?? null,
    createdAt: movement.createdAt.toISOString(),
  }));

  const purchaseReceipts: RestaurantSnapshot['purchaseReceipts'] = purchaseReceiptRows.map((receipt) => ({
    id: receipt.id,
    branchId: receipt.branchId,
    branchName: receipt.branch.name,
    supplier: receipt.supplier,
    reference: receipt.reference,
    invoiceNo: receipt.invoiceNo ?? null,
    totalAmount: Number(receipt.totalAmount),
    createdAt: receipt.createdAt.toISOString(),
    lines: receipt.lines.map((line) => ({
      inventoryItemId: line.inventoryItemId,
      itemName: line.inventoryItem.name,
      quantity: Number(line.quantity),
      unitCost: Number(line.unitCost),
      totalCost: Number(line.totalCost),
    })),
  }));

  const wasteRecords: RestaurantSnapshot['wasteRecords'] = wasteRecordRows.map((record) => ({
    id: record.id,
    branchId: record.branchId,
    branchName: record.branch.name,
    inventoryItemId: record.inventoryItemId,
    itemName: record.inventoryItem.name,
    quantity: Number(record.quantity),
    reasonType: record.reasonType,
    reference: record.reference,
    notes: record.notes ?? null,
    createdAt: record.createdAt.toISOString(),
  }));

  const customers: Customer[] = customerRows.map((customer) => {
    const lastOrder = orderRows.find((order) => order.customerId === customer.id);
    return {
      id: customer.id,
      name: customer.name,
      segment: customer.points >= 1500 ? 'VIP' : customer.points >= 800 ? 'Frecuente' : 'Corporativo',
      points: customer.points,
      creditLimit: Number(customer.creditLimit),
      creditUsed: Number(customer.creditUsed),
      lastVisit: (lastOrder?.createdAt ?? customer.createdAt).toISOString().slice(0, 10),
      phone: customer.phone ?? null,
      email: customer.email ?? null,
    };
  });

  const salesTrend = buildSalesTrend(orderRows.map((order) => ({ createdAt: order.createdAt, total: Number(order.total) })));
  const topProducts = buildTopProducts(orders);

  const kitchenOrders = buildStationOrders(orderRows, 'KITCHEN');
  const barOrders = buildStationOrders(orderRows, 'BAR');
  const pastryOrders = buildStationOrders(orderRows, 'PASTRY');

  const deliveryOrders: DeliveryOrder[] = activeOrders
    .filter((order) => order.type === 'DELIVERY')
    .map((order, index) => ({
      id: order.id,
      code: `DLV-${order.id}`,
      customerName: order.customerName,
      district: branches.find((branch) => branch.id === order.branchId)?.city ?? 'Lima',
      eta: `${12 + index * 4} min`,
      driver: 'Asignacion pendiente',
      status: order.status === 'READY' ? 'ASSIGNED' : order.status === 'PAID' ? 'DELIVERED' : 'PENDING',
      total: order.total,
    }));

  const shiftOpenedAt = cashShiftRow?.openedAt ?? null;
  const cashSaleMovements: CashMovement[] = shiftOpenedAt
    ? orderRows
        .filter((order) => order.branchId === resolvedBranchId)
        .flatMap((order) =>
          order.payments
            .filter((payment) => payment.createdAt >= shiftOpenedAt)
            .map((payment) => ({
              id: payment.id,
              type: 'SALE' as const,
              reference: `Pago ${order.code}`,
              amount: Number(payment.amount),
              method: payment.method,
              createdAt: payment.createdAt.toISOString().slice(11, 16),
            })),
        )
    : [];

  const manualCashMovements: CashMovement[] = manualCashMovementRows.map((movement) => ({
    id: movement.id,
    type: movement.type as CashMovement['type'],
    reference: movement.reference,
    amount: Number(movement.amount),
    method: movement.method,
    createdAt: movement.createdAt.toISOString().slice(11, 16),
  }));

  const openingCashMovement: CashMovement[] = cashShiftRow
    ? [
        {
          id: cashShiftRow.id,
          type: 'OPENING',
          reference: 'Apertura de caja',
          amount: Number(cashShiftRow.openingAmount),
          method: 'CASH',
          createdAt: cashShiftRow.openedAt.toISOString().slice(11, 16),
        },
      ]
    : [];

  const cashMovements: CashMovement[] = [...manualCashMovements, ...cashSaleMovements, ...openingCashMovement]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 20);

  const totalSales = orderRows.reduce((sum, order) => sum + Number(order.total), 0);

  return {
    brand,
    branches,
    menuCategories,
    menuProducts,
    dashboardMetrics: buildDashboardMetrics(orders, branches, currencySymbol),
    salesTrend,
    topProducts,
    activeOrders,
    tables,
    kitchenOrders,
    barOrders,
    pastryOrders,
    inventoryItems,
    inventoryMovements,
    purchaseReceipts,
    wasteRecords,
    customers,
    deliveryOrders,
    reportSummary: {
      period: new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(new Date()),
      sales: Math.round(totalSales),
      profit: Math.round(totalSales * 0.32),
      averageTicket: orderRows.length ? Math.round(totalSales / orderRows.length) : 0,
      bestBranch: branches[0]?.name ?? restaurantSnapshot.reportSummary.bestBranch,
      bestSeller: topProducts[0]?.name ?? restaurantSnapshot.reportSummary.bestSeller,
    },
    cashShift,
    cashMovements,
  };
}

export async function getBootstrapSnapshot(user: SanitizedAuthUser) {
  return (await buildDatabaseSnapshot(user.tenantId, user.branchId)) ?? restaurantSnapshot;
}

export async function getPublicBrand(): Promise<RestaurantSnapshot['brand']> {
  if (await canUseDatabase()) {
    const tenant = await prisma.tenant.findFirst({ orderBy: { id: 'desc' } });
    if (tenant) {
      return {
        name: tenant.name,
        slogan: restaurantSnapshot.brand.slogan,
        currencyCode: tenant.currencyCode ?? restaurantSnapshot.brand.currencyCode,
        currencySymbol: tenant.currencySymbol ?? restaurantSnapshot.brand.currencySymbol,
        logoData: tenant.logoData ?? null,
      };
    }
  }

  return restaurantSnapshot.brand;
}

export async function getBrandForUser(user: SanitizedAuthUser): Promise<RestaurantSnapshot['brand']> {
  if (!(await canUseDatabase())) {
    return restaurantSnapshot.brand;
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
  if (!tenant) {
    return restaurantSnapshot.brand;
  }

  return {
    name: tenant.name,
    slogan: restaurantSnapshot.brand.slogan,
    currencyCode: tenant.currencyCode ?? restaurantSnapshot.brand.currencyCode,
    currencySymbol: tenant.currencySymbol ?? restaurantSnapshot.brand.currencySymbol,
    logoData: tenant.logoData ?? null,
  };
}

export async function updateBrandForUser(
  user: SanitizedAuthUser,
  payload: { name: string; currencyCode: string; currencySymbol: string; logoData?: string | null },
): Promise<RestaurantSnapshot['brand']> {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const name = String(payload.name ?? '').trim();
  const currencyCode = String(payload.currencyCode ?? '').trim().toUpperCase();
  const currencySymbol = String(payload.currencySymbol ?? '').trim();
  const logoData = typeof payload.logoData === 'string' ? payload.logoData.trim() : '';

  if (name.length < 2 || name.length > 70) {
    throw new Error('El nombre del restaurante es inválido.');
  }
  if (currencyCode.length < 3 || currencyCode.length > 10) {
    throw new Error('El código de moneda es inválido.');
  }
  if (currencySymbol.length < 1 || currencySymbol.length > 6) {
    throw new Error('El símbolo de moneda es inválido.');
  }
  if (logoData && !logoData.startsWith('data:image/')) {
    throw new Error('El logo debe ser una imagen válida.');
  }
  if (logoData && logoData.length > 2_500_000) {
    throw new Error('El logo es muy grande.');
  }

  const tenant = await prisma.tenant.update({
    where: { id: user.tenantId },
    data: {
      name,
      currencyCode,
      currencySymbol,
      logoData: logoData ? logoData : null,
    },
  });

  return {
    name: tenant.name,
    slogan: restaurantSnapshot.brand.slogan,
    currencyCode: tenant.currencyCode ?? restaurantSnapshot.brand.currencyCode,
    currencySymbol: tenant.currencySymbol ?? restaurantSnapshot.brand.currencySymbol,
    logoData: tenant.logoData ?? null,
  };
}

export async function findAuthUserByEmail(email: string): Promise<AuthUser | null> {
  if (await canUseDatabase()) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (user) {
      if (!user.isActive) {
        return null;
      }

      const resolved = await resolvePermissions(user.tenantId, user.role, (user as any).permissionMode, (user as any).permissionsJson);
      return {
        id: user.id,
        tenantId: user.tenantId,
        branchId: user.branchId ?? 1,
        role: user.role,
        permissions: resolved.permissions,
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
      };
    }

    return null;
  }

  const user = findMockUserByEmail(email) ?? null;
  if (!user) {
    return null;
  }
  if ((user as any).isActive === false) {
    return null;
  }
  return user;
}

export async function findAuthUserById(id: number): Promise<AuthUser | null> {
  if (await canUseDatabase()) {
    const user = await prisma.user.findUnique({ where: { id } });

    if (user) {
      if (!user.isActive) {
        return null;
      }

      const resolved = await resolvePermissions(user.tenantId, user.role, (user as any).permissionMode, (user as any).permissionsJson);
      return {
        id: user.id,
        tenantId: user.tenantId,
        branchId: user.branchId ?? 1,
        role: user.role,
        permissions: resolved.permissions,
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
      };
    }

    return null;
  }

  const user = mockUsers.find((candidate) => candidate.id === id) ?? null;
  if (!user) {
    return null;
  }
  if ((user as any).isActive === false) {
    return null;
  }
  return user;
}

export async function getSafeCurrentUser(id: number) {
  const user = await findAuthUserById(id);
  return user ? sanitizeAuthUser(user) : null;
}

export async function listUsers(user: SanitizedAuthUser) {
  if (await canUseDatabase()) {
    const users = await prisma.user.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(users.map(async (item) => {
      const resolved = await resolvePermissions(item.tenantId, item.role, (item as any).permissionMode, (item as any).permissionsJson);
      return {
        id: item.id,
        tenantId: item.tenantId,
        branchId: item.branchId ?? null,
        role: item.role,
        permissions: resolved.permissions,
        permissionMode: resolved.permissionMode,
        customPermissions: resolved.customPermissions,
        name: item.name,
        email: item.email,
        isActive: item.isActive,
        createdAt: item.createdAt.toISOString(),
      } satisfies UserSummary;
    })) satisfies Promise<UserSummary[]>;
  }

  return Promise.all(mockUsers.map(async (item) => {
    const resolved = await resolvePermissions(item.tenantId, item.role, (item as any).permissionMode, (item as any).permissionsJson);
    return {
      id: item.id,
      tenantId: item.tenantId,
      branchId: item.branchId ?? null,
      role: item.role,
      permissions: resolved.permissions,
      permissionMode: resolved.permissionMode,
      customPermissions: resolved.customPermissions,
      name: item.name,
      email: item.email,
      isActive: (item as any).isActive ?? true,
      createdAt: ((item as any).createdAt instanceof Date ? (item as any).createdAt : new Date()).toISOString(),
    } satisfies UserSummary;
  })) satisfies Promise<UserSummary[]>;
}

export async function createUser(
  user: SanitizedAuthUser,
  payload: {
    branchId?: number | null;
    role: AuthUser['role'];
    name: string;
    email: string;
    password: string;
    isActive?: boolean;
    permissionMode?: UserSummary['permissionMode'];
    customPermissions?: AuthUser['permissions'];
  },
) {
  if (await canUseDatabase()) {
    const resolved = await resolvePermissions(user.tenantId, payload.role, payload.permissionMode ?? 'ROLE', payload.customPermissions ?? []);
    const created = await prisma.user.create({
      data: {
        tenantId: user.tenantId,
        branchId: payload.branchId ?? null,
        role: payload.role,
        name: payload.name,
        email: payload.email,
        passwordHash: bcrypt.hashSync(payload.password, 8),
        isActive: payload.isActive ?? true,
        permissionMode: resolved.permissionMode,
        permissionsJson: resolved.permissionMode === 'CUSTOM' ? resolved.customPermissions : null,
      } as any,
    });

    const createdResolved = await resolvePermissions(created.tenantId, created.role, (created as any).permissionMode, (created as any).permissionsJson);
    return {
      id: created.id,
      tenantId: created.tenantId,
      branchId: created.branchId ?? null,
      role: created.role,
      permissions: createdResolved.permissions,
      permissionMode: createdResolved.permissionMode,
      customPermissions: createdResolved.customPermissions,
      name: created.name,
      email: created.email,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
    } satisfies UserSummary;
  }

  const id = Math.max(0, ...mockUsers.map((item) => item.id)) + 1;
  const resolved = await resolvePermissions(user.tenantId, payload.role, payload.permissionMode ?? 'ROLE', payload.customPermissions ?? []);
  const next = {
    id,
    tenantId: user.tenantId,
    branchId: payload.branchId ?? null,
    role: payload.role,
    permissions: resolved.permissions,
    name: payload.name,
    email: payload.email,
    passwordHash: bcrypt.hashSync(payload.password, 8),
  } satisfies AuthUser;
  (next as any).isActive = payload.isActive ?? true;
  (next as any).createdAt = new Date();
  (next as any).permissionMode = resolved.permissionMode;
  (next as any).permissionsJson = resolved.permissionMode === 'CUSTOM' ? resolved.customPermissions : null;
  mockUsers.push(next);

  return {
    id: next.id,
    tenantId: next.tenantId,
    branchId: next.branchId ?? null,
    role: next.role,
    permissions: next.permissions,
    permissionMode: (next as any).permissionMode ?? 'ROLE',
    customPermissions: (next as any).permissionMode === 'CUSTOM' ? parseCustomPermissions((next as any).permissionsJson) : [],
    name: next.name,
    email: next.email,
    isActive: (next as any).isActive ?? true,
    createdAt: ((next as any).createdAt instanceof Date ? (next as any).createdAt : new Date()).toISOString(),
  } satisfies UserSummary;
}

export async function updateUser(
  user: SanitizedAuthUser,
  payload: {
    id: number;
    branchId?: number | null;
    role?: AuthUser['role'];
    name?: string;
    isActive?: boolean;
    permissionMode?: UserSummary['permissionMode'];
    customPermissions?: AuthUser['permissions'];
  },
) {
  if (await canUseDatabase()) {
    const existing = await prisma.user.findFirst({
      where: { id: payload.id, tenantId: user.tenantId },
    });

    if (!existing) {
      throw new Error('Usuario no encontrado.');
    }

    const nextRole = payload.role ?? existing.role;
    const resolved = await resolvePermissions(
      existing.tenantId,
      nextRole,
      payload.permissionMode ?? (existing as any).permissionMode,
      payload.customPermissions ?? (existing as any).permissionsJson,
    );

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...(typeof payload.branchId === 'undefined' ? {} : { branchId: payload.branchId }),
        ...(payload.role ? { role: payload.role } : {}),
        ...(payload.name ? { name: payload.name } : {}),
        ...(typeof payload.isActive === 'undefined' ? {} : { isActive: payload.isActive }),
        ...(payload.permissionMode ? { permissionMode: resolved.permissionMode } : {}),
        ...(payload.permissionMode || payload.customPermissions
          ? { permissionsJson: resolved.permissionMode === 'CUSTOM' ? resolved.customPermissions : null }
          : {}),
      } as any,
    });

    const updatedResolved = await resolvePermissions(updated.tenantId, updated.role, (updated as any).permissionMode, (updated as any).permissionsJson);
    return {
      id: updated.id,
      tenantId: updated.tenantId,
      branchId: updated.branchId ?? null,
      role: updated.role,
      permissions: updatedResolved.permissions,
      permissionMode: updatedResolved.permissionMode,
      customPermissions: updatedResolved.customPermissions,
      name: updated.name,
      email: updated.email,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    } satisfies UserSummary;
  }

  const target = mockUsers.find((item) => item.id === payload.id && item.tenantId === user.tenantId);
  if (!target) {
    throw new Error('Usuario no encontrado.');
  }

  if (payload.role) {
    target.role = payload.role;
  }

  if (payload.name) {
    target.name = payload.name;
  }

  if (typeof payload.branchId !== 'undefined') {
    target.branchId = payload.branchId ?? null;
  }

  if (typeof payload.isActive !== 'undefined') {
    (target as any).isActive = payload.isActive;
  }

  if (payload.permissionMode) {
    (target as any).permissionMode = payload.permissionMode;
  }

  if (payload.customPermissions) {
    (target as any).permissionsJson = payload.customPermissions;
  }

  const resolved = await resolvePermissions(target.tenantId, target.role, (target as any).permissionMode, (target as any).permissionsJson);
  target.permissions = resolved.permissions;

  return {
    id: target.id,
    tenantId: target.tenantId,
    branchId: target.branchId ?? null,
    role: target.role,
    permissions: target.permissions,
    permissionMode: resolved.permissionMode,
    customPermissions: resolved.customPermissions,
    name: target.name,
    email: target.email,
    isActive: (target as any).isActive ?? true,
    createdAt: ((target as any).createdAt instanceof Date ? (target as any).createdAt : new Date()).toISOString(),
  } satisfies UserSummary;
}

export async function updateUserPassword(
  user: SanitizedAuthUser,
  payload: {
    id: number;
    password: string;
  },
) {
  if (await canUseDatabase()) {
    const existing = await prisma.user.findFirst({
      where: { id: payload.id, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new Error('Usuario no encontrado.');
    }

    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: bcrypt.hashSync(payload.password, 8) },
    });
    return { success: true };
  }

  const target = mockUsers.find((item) => item.id === payload.id && item.tenantId === user.tenantId);
  if (!target) {
    throw new Error('Usuario no encontrado.');
  }

  target.passwordHash = bcrypt.hashSync(payload.password, 8);
  return { success: true };
}

export async function listBranches(user: SanitizedAuthUser) {
  return (await getBootstrapSnapshot(user)).branches;
}

export async function createBranchForUser(
  user: SanitizedAuthUser,
  payload: {
    name: string;
    city: string;
    address: string;
    phone: string;
    isActive?: boolean;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const name = payload.name.trim();
  const city = payload.city.trim();
  const address = payload.address.trim();
  const phone = payload.phone.trim();

  if (!name) {
    throw new Error('El nombre de la sucursal es obligatorio.');
  }
  if (!city) {
    throw new Error('La ciudad es obligatoria.');
  }
  if (!address) {
    throw new Error('La dirección es obligatoria.');
  }
  if (!phone) {
    throw new Error('El teléfono es obligatorio.');
  }

  const duplicate = await prisma.branch.findMany({
    where: { tenantId: user.tenantId },
    select: { id: true, name: true },
  });

  if (duplicate.some((branch) => branch.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new Error('Ya existe una sucursal con ese nombre.');
  }

  return prisma.branch.create({
    data: {
      tenantId: user.tenantId,
      name,
      city,
      address,
      phone,
      isActive: payload.isActive ?? true,
    },
  });
}

export async function updateBranchForUser(
  user: SanitizedAuthUser,
  payload: {
    id: number;
    name: string;
    city: string;
    address: string;
    phone: string;
    isActive?: boolean;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const name = payload.name.trim();
  const city = payload.city.trim();
  const address = payload.address.trim();
  const phone = payload.phone.trim();

  if (!name) {
    throw new Error('El nombre de la sucursal es obligatorio.');
  }
  if (!city) {
    throw new Error('La ciudad es obligatoria.');
  }
  if (!address) {
    throw new Error('La dirección es obligatoria.');
  }
  if (!phone) {
    throw new Error('El teléfono es obligatorio.');
  }

  const existing = await prisma.branch.findFirst({
    where: { id: payload.id, tenantId: user.tenantId },
    select: { id: true },
  });

  if (!existing) {
    throw new Error('Sucursal no encontrada.');
  }

  const duplicate = await prisma.branch.findMany({
    where: {
      tenantId: user.tenantId,
      id: { not: payload.id },
    },
    select: { id: true, name: true },
  });

  if (duplicate.some((branch) => branch.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new Error('Ya existe otra sucursal con ese nombre.');
  }

  return prisma.branch.update({
    where: { id: payload.id },
    data: {
      name,
      city,
      address,
      phone,
      ...(typeof payload.isActive === 'boolean' ? { isActive: payload.isActive } : {}),
    },
  });
}

export async function deleteBranchForUser(user: SanitizedAuthUser, branchId: number) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId: user.tenantId },
    select: { id: true, name: true },
  });

  if (!branch) {
    throw new Error('Sucursal no encontrada.');
  }

  if (user.branchId === branchId) {
    throw new Error('No puedes eliminar la sucursal activa de tu usuario.');
  }

  const [userCount, tableCount, orderCount, inventoryCount, recipeCount, receiptCount, wasteCount, cashShiftCount] = await Promise.all([
    prisma.user.count({ where: { tenantId: user.tenantId, branchId } }),
    prisma.restaurantTable.count({ where: { tenantId: user.tenantId, branchId } }),
    prisma.order.count({ where: { tenantId: user.tenantId, branchId } }),
    prisma.inventoryItem.count({ where: { branch: { tenantId: user.tenantId }, branchId } }),
    prisma.recipe.count({ where: { branch: { tenantId: user.tenantId }, branchId } }),
    prisma.purchaseReceipt.count({ where: { branch: { tenantId: user.tenantId }, branchId } }),
    prisma.wasteRecord.count({ where: { branch: { tenantId: user.tenantId }, branchId } }),
    prisma.cashShift.count({ where: { tenantId: user.tenantId, branchId } }),
  ]);

  if (userCount + tableCount + orderCount + inventoryCount + recipeCount + receiptCount + wasteCount + cashShiftCount > 0) {
    throw new Error(`La sucursal ${branch.name} ya tiene operación registrada. Desactívala en lugar de eliminarla.`);
  }

  await prisma.branch.delete({ where: { id: branchId } });
  return { success: true as const };
}

export async function listOrders(user: SanitizedAuthUser, branchId?: number) {
  const snapshot = await getBootstrapSnapshot(user);
  return typeof branchId === 'number' ? snapshot.activeOrders.filter((order) => order.branchId === branchId) : snapshot.activeOrders;
}

export async function listTables(user: SanitizedAuthUser) {
  return (await getBootstrapSnapshot(user)).tables;
}

export async function createTableForUser(
  user: SanitizedAuthUser,
  payload: {
    branchId?: number | null;
    code: string;
    area: string;
    capacity: number;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const branchId = payload.branchId ?? user.branchId;
  const code = payload.code.trim().toUpperCase();
  const area = payload.area.trim();
  const capacity = Math.trunc(payload.capacity);

  if (!branchId) {
    throw new Error('Selecciona una sucursal para la mesa.');
  }
  if (!code) {
    throw new Error('El código de la mesa es obligatorio.');
  }
  if (!area) {
    throw new Error('El área es obligatoria.');
  }
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new Error('La capacidad debe ser mayor a 0.');
  }

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId: user.tenantId },
    select: { id: true },
  });

  if (!branch) {
    throw new Error('La sucursal seleccionada no existe.');
  }

  const duplicate = await prisma.restaurantTable.findFirst({
    where: { tenantId: user.tenantId, branchId, code },
    select: { id: true },
  });

  if (duplicate) {
    throw new Error('Ya existe una mesa con ese código en la sucursal seleccionada.');
  }

  return prisma.restaurantTable.create({
    data: {
      tenantId: user.tenantId,
      branchId,
      code,
      area,
      capacity,
      status: PrismaTableStatus.FREE,
    },
  });
}

export async function updateTableForUser(
  user: SanitizedAuthUser,
  payload: {
    tableId: number;
    branchId?: number | null;
    code: string;
    area: string;
    capacity: number;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const branchId = payload.branchId ?? user.branchId;
  const code = payload.code.trim().toUpperCase();
  const area = payload.area.trim();
  const capacity = Math.trunc(payload.capacity);

  if (!branchId) {
    throw new Error('Selecciona una sucursal para la mesa.');
  }
  if (!code) {
    throw new Error('El código de la mesa es obligatorio.');
  }
  if (!area) {
    throw new Error('El área es obligatoria.');
  }
  if (!Number.isFinite(capacity) || capacity <= 0) {
    throw new Error('La capacidad debe ser mayor a 0.');
  }

  return prisma.$transaction(async (tx) => {
    const table = await tx.restaurantTable.findFirst({
      where: { id: payload.tableId, tenantId: user.tenantId },
      select: { id: true, branchId: true },
    });

    if (!table) {
      throw new Error('Mesa no encontrada.');
    }

    const branch = await tx.branch.findFirst({
      where: { id: branchId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!branch) {
      throw new Error('La sucursal seleccionada no existe.');
    }

    const hasActiveOrder = await tx.order.findFirst({
      where: {
        tenantId: user.tenantId,
        tableId: table.id,
        status: { in: [PrismaOrderStatus.OPEN, PrismaOrderStatus.IN_PREPARATION, PrismaOrderStatus.READY, PrismaOrderStatus.SERVED] },
      },
      select: { id: true },
    });

    if (hasActiveOrder && table.branchId !== branchId) {
      throw new Error('No puedes mover una mesa de sucursal mientras tenga una cuenta activa.');
    }

    const duplicate = await tx.restaurantTable.findFirst({
      where: { tenantId: user.tenantId, branchId, code, id: { not: table.id } },
      select: { id: true },
    });

    if (duplicate) {
      throw new Error('Ya existe una mesa con ese código en la sucursal seleccionada.');
    }

    return tx.restaurantTable.update({
      where: { id: table.id },
      data: { branchId, code, area, capacity },
    });
  });
}

export async function deleteTableForUser(user: SanitizedAuthUser, tableId: number) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  return prisma.$transaction(async (tx) => {
    const table = await tx.restaurantTable.findFirst({
      where: { id: tableId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!table) {
      throw new Error('Mesa no encontrada.');
    }

    const hasOrders = await tx.order.findFirst({
      where: { tenantId: user.tenantId, tableId },
      select: { id: true },
    });

    if (hasOrders) {
      throw new Error('No se puede eliminar una mesa con historial de pedidos.');
    }

    await tx.restaurantTable.delete({ where: { id: tableId } });
    return { success: true };
  });
}

export async function updateTableStatusForUser(
  user: SanitizedAuthUser,
  payload: {
    tableId: number;
    status: 'FREE' | 'RESERVED';
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const status = payload.status === 'RESERVED' ? PrismaTableStatus.RESERVED : PrismaTableStatus.FREE;

  return prisma.$transaction(async (tx) => {
    const table = await tx.restaurantTable.findFirst({
      where: { id: payload.tableId, tenantId: user.tenantId },
      select: { id: true, status: true, branchId: true },
    });

    if (!table) {
      throw new Error('Mesa no encontrada.');
    }

    const hasActiveOrder = await tx.order.findFirst({
      where: {
        tenantId: user.tenantId,
        tableId: table.id,
        status: { in: [PrismaOrderStatus.OPEN, PrismaOrderStatus.IN_PREPARATION, PrismaOrderStatus.READY, PrismaOrderStatus.SERVED] },
      },
      select: { id: true },
    });

    if (hasActiveOrder) {
      throw new Error('No se puede cambiar el estado de una mesa con cuenta activa.');
    }

    await tx.restaurantTable.update({
      where: { id: table.id },
      data: { status },
    });

    return { success: true };
  });
}

export async function listKitchenOrders(user: SanitizedAuthUser) {
  return (await getBootstrapSnapshot(user)).kitchenOrders;
}

export async function listBarOrders(user: SanitizedAuthUser) {
  return (await getBootstrapSnapshot(user)).barOrders;
}

export async function listPastryOrders(user: SanitizedAuthUser) {
  return (await getBootstrapSnapshot(user)).pastryOrders;
}

export async function getMenu(user: SanitizedAuthUser) {
  const snapshot = await getBootstrapSnapshot(user);
  return {
    categories: snapshot.menuCategories,
    products: snapshot.menuProducts,
  };
}

export async function createCategoryForUser(
  user: SanitizedAuthUser,
  payload: {
    parentId?: number | null;
    name: string;
    color?: string | null;
    station: 'KITCHEN' | 'BAR' | 'PASTRY';
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const name = payload.name.trim();
  const color = payload.color?.trim() || null;

  if (!name) {
    throw new Error('El nombre de la categoría es obligatorio.');
  }

  if (payload.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: payload.parentId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!parent) {
      throw new Error('La categoría padre no existe.');
    }
  }

  return prisma.category.create({
    data: {
      tenantId: user.tenantId,
      parentId: payload.parentId ?? null,
      name,
      color,
      station: payload.station as PrismaPreparationStation,
    },
  });
}

export async function updateCategoryForUser(
  user: SanitizedAuthUser,
  payload: {
    categoryId: number;
    parentId?: number | null;
    name: string;
    color?: string | null;
    station: 'KITCHEN' | 'BAR' | 'PASTRY';
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const name = payload.name.trim();
  const color = payload.color?.trim() || null;

  if (!name) {
    throw new Error('El nombre de la categoría es obligatorio.');
  }

  return prisma.$transaction(async (tx) => {
    const category = await tx.category.findFirst({
      where: { id: payload.categoryId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!category) {
      throw new Error('La categoría no existe.');
    }

    if (payload.parentId) {
      if (payload.parentId === payload.categoryId) {
        throw new Error('Una categoría no puede ser padre de sí misma.');
      }

      const parent = await tx.category.findFirst({
        where: { id: payload.parentId, tenantId: user.tenantId },
        select: { id: true },
      });

      if (!parent) {
        throw new Error('La categoría padre no existe.');
      }
    }

    return tx.category.update({
      where: { id: payload.categoryId },
      data: {
        parentId: payload.parentId ?? null,
        name,
        color,
        station: payload.station as PrismaPreparationStation,
      },
    });
  });
}

export async function deleteCategoryForUser(user: SanitizedAuthUser, categoryId: number) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  return prisma.$transaction(async (tx) => {
    const category = await tx.category.findFirst({
      where: { id: categoryId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!category) {
      throw new Error('La categoría no existe.');
    }

    const [children, products] = await Promise.all([
      tx.category.findFirst({ where: { tenantId: user.tenantId, parentId: categoryId }, select: { id: true } }),
      tx.product.findFirst({ where: { tenantId: user.tenantId, categoryId }, select: { id: true } }),
    ]);

    if (children || products) {
      throw new Error('No se puede eliminar una categoría que todavía tiene subcategorías o productos.');
    }

    await tx.category.delete({ where: { id: categoryId } });
    return { success: true };
  });
}

export async function createProductForUser(
  user: SanitizedAuthUser,
  payload: {
    categoryId?: number | null;
    name: string;
    sku?: string | null;
    imageUrl?: string | null;
    price: number;
    isPrepared: boolean;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const name = payload.name.trim();
  const sku = payload.sku?.trim() || null;
  const imageUrl = payload.imageUrl?.trim() || null;

  if (!name) {
    throw new Error('El nombre del producto es obligatorio.');
  }
  if (!Number.isFinite(payload.price) || payload.price < 0) {
    throw new Error('El precio es inválido.');
  }

  if (payload.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: payload.categoryId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!category) {
      throw new Error('La categoría seleccionada no existe.');
    }
  }

  return prisma.product.create({
    data: {
      tenantId: user.tenantId,
      categoryId: payload.categoryId ?? null,
      name,
      sku,
      imageUrl,
      price: payload.price,
      isPrepared: payload.isPrepared,
    },
  });
}

export async function updateProductForUser(
  user: SanitizedAuthUser,
  payload: {
    productId: number;
    categoryId?: number | null;
    name: string;
    sku?: string | null;
    imageUrl?: string | null;
    price: number;
    isPrepared: boolean;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const name = payload.name.trim();
  const sku = payload.sku?.trim() || null;
  const imageUrl = payload.imageUrl?.trim() || null;

  if (!name) {
    throw new Error('El nombre del producto es obligatorio.');
  }
  if (!Number.isFinite(payload.price) || payload.price < 0) {
    throw new Error('El precio es inválido.');
  }

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: payload.productId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!product) {
      throw new Error('El producto no existe.');
    }

    if (payload.categoryId) {
      const category = await tx.category.findFirst({
        where: { id: payload.categoryId, tenantId: user.tenantId },
        select: { id: true },
      });

      if (!category) {
        throw new Error('La categoría seleccionada no existe.');
      }
    }

    return tx.product.update({
      where: { id: payload.productId },
      data: {
        categoryId: payload.categoryId ?? null,
        name,
        sku,
        imageUrl,
        price: payload.price,
        isPrepared: payload.isPrepared,
      },
    });
  });
}

export async function deleteProductForUser(user: SanitizedAuthUser, productId: number) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!product) {
      throw new Error('El producto no existe.');
    }

    const [usedInOrders, usedInRecipes] = await Promise.all([
      tx.orderItem.findFirst({ where: { productId }, select: { id: true } }),
      tx.recipe.findFirst({ where: { productId }, select: { id: true } }),
    ]);

    if (usedInOrders || usedInRecipes) {
      throw new Error('No se puede eliminar un producto con historial o recetas asociadas.');
    }

    await tx.product.delete({ where: { id: productId } });
    return { success: true };
  });
}

export async function listCashMovements(user: SanitizedAuthUser) {
  return (await getBootstrapSnapshot(user)).cashMovements;
}

export async function openCashShift(user: SanitizedAuthUser, payload: { openingAmount: number }) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const existing = await prisma.cashShift.findFirst({
    where: { tenantId: user.tenantId, branchId: user.branchId, closedAt: null },
    orderBy: { openedAt: 'desc' },
  });

  if (existing) {
    throw new Error('Ya existe una caja abierta en esta sucursal.');
  }

  const created = await prisma.cashShift.create({
    data: {
      tenantId: user.tenantId,
      branchId: user.branchId,
      openedById: user.id,
      openingAmount: payload.openingAmount,
    },
  });

  return {
    id: created.id,
    branchId: created.branchId,
    isOpen: true,
    openedAt: created.openedAt.toISOString(),
    openedBy: user.name,
    openingAmount: Number(created.openingAmount),
  };
}

export async function closeCashShift(user: SanitizedAuthUser, payload: { closingAmount: number }) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const existing = await prisma.cashShift.findFirst({
    where: { tenantId: user.tenantId, branchId: user.branchId, closedAt: null },
    orderBy: { openedAt: 'desc' },
  });

  if (!existing) {
    throw new Error('No hay una caja abierta para cerrar.');
  }

  const updated = await prisma.cashShift.update({
    where: { id: existing.id },
    data: { closedAt: new Date(), closingAmount: payload.closingAmount },
  });

  return {
    id: updated.id,
    branchId: updated.branchId,
    isOpen: false,
    openedAt: updated.openedAt.toISOString(),
    openedBy: user.name,
    openingAmount: Number(updated.openingAmount),
  };
}

export async function listCashShiftsForControl(
  user: SanitizedAuthUser,
  filters?: {
    branchId?: number | null;
    openOnly?: boolean;
    dateFrom?: Date | null;
    dateTo?: Date | null;
  },
): Promise<CashShiftControlItem[]> {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  assertCashControlAccess(user);

  const where: {
    tenantId: number;
    branchId?: number;
    closedAt?: null;
    openedAt?: { gte?: Date; lte?: Date };
  } = { tenantId: user.tenantId };

  if (filters?.branchId) {
    where.branchId = filters.branchId;
  }

  if (filters?.openOnly) {
    where.closedAt = null;
  }

  if (filters?.dateFrom || filters?.dateTo) {
    where.openedAt = {};
    if (filters?.dateFrom) {
      where.openedAt.gte = filters.dateFrom;
    }
    if (filters?.dateTo) {
      where.openedAt.lte = filters.dateTo;
    }
  }

  const shifts = await prisma.cashShift.findMany({
    where,
    orderBy: { openedAt: 'desc' },
    include: {
      branch: true,
      openedBy: true,
      movements: true,
    },
    take: 100,
  });

  return shifts.map((shift) => ({
    id: shift.id,
    branchId: shift.branchId,
    branchName: shift.branch?.name ?? 'Sucursal',
    openedBy: shift.openedBy?.name ?? 'Caja',
    openedByRole: shift.openedBy?.role ?? 'CASHIER',
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
    openingAmount: Number(shift.openingAmount),
    closingAmount: shift.closingAmount === null ? null : Number(shift.closingAmount),
    movementCount: shift.movements.length,
    isOpen: shift.closedAt === null,
  }));
}

export async function closeCashShiftForControl(
  user: SanitizedAuthUser,
  payload: { cashShiftId: number; closingAmount: number },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  assertCashControlAccess(user);

  const existing = await prisma.cashShift.findFirst({
    where: { id: payload.cashShiftId, tenantId: user.tenantId },
    include: {
      branch: true,
      openedBy: true,
    },
  });

  if (!existing) {
    throw new Error('La caja indicada no existe.');
  }

  if (existing.closedAt) {
    throw new Error('La caja seleccionada ya está cerrada.');
  }

  const updated = await prisma.cashShift.update({
    where: { id: existing.id },
    data: { closedAt: new Date(), closingAmount: payload.closingAmount },
  });

  return {
    id: updated.id,
    branchId: updated.branchId,
    branchName: existing.branch?.name ?? 'Sucursal',
    openedBy: existing.openedBy?.name ?? 'Caja',
    isOpen: false,
    openedAt: updated.openedAt.toISOString(),
    closingAmount: Number(updated.closingAmount ?? 0),
  };
}

export async function createCashMovementForUser(
  user: SanitizedAuthUser,
  payload: {
    type: 'ENTRY' | 'EXPENSE' | 'WITHDRAWAL';
    amount: number;
    reference: string;
    notes?: string | null;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    throw new Error('El monto debe ser mayor a 0.');
  }

  const reference = payload.reference.trim();
  if (!reference) {
    throw new Error('El concepto o referencia es obligatorio.');
  }

  const existing = await prisma.cashShift.findFirst({
    where: { tenantId: user.tenantId, branchId: user.branchId, closedAt: null },
    orderBy: { openedAt: 'desc' },
  });

  if (!existing) {
    throw new Error('Debes abrir una caja antes de registrar entradas o salidas.');
  }

  const type =
    payload.type === 'EXPENSE'
      ? PrismaCashMovementType.EXPENSE
      : payload.type === 'WITHDRAWAL'
        ? PrismaCashMovementType.WITHDRAWAL
        : PrismaCashMovementType.ENTRY;

  return prisma.cashMovementRecord.create({
    data: {
      tenantId: user.tenantId,
      branchId: existing.branchId,
      cashShiftId: existing.id,
      createdById: user.id,
      type,
      method: PrismaPaymentMethod.CASH,
      reference,
      amount: payload.amount,
      notes: payload.notes?.trim() || null,
    },
  });
}

export async function payOrderForUser(
  user: SanitizedAuthUser,
  payload: {
    orderId: number;
    method: 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED';
    amount: number;
    receivedAmount?: number | null;
    reference?: string | null;
    proofImage?: string | null;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    throw new Error('El monto es inválido.');
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: payload.orderId, tenantId: user.tenantId },
      include: { table: true, payments: true },
    });

    if (!order) {
      throw new Error('Pedido no encontrado.');
    }

    if (order.status === PrismaOrderStatus.PAID || order.status === PrismaOrderStatus.CANCELLED) {
      throw new Error('La cuenta ya está cerrada.');
    }

    const total = Number(order.total);
    const paidAmount = order.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const remainingBeforePayment = Math.max(0, total - paidAmount);
    const reference = typeof payload.reference === 'string' ? payload.reference.trim() : '';
    const receivedAmount =
      typeof payload.receivedAmount === 'number' && Number.isFinite(payload.receivedAmount) ? payload.receivedAmount : null;
    const proofImage = typeof payload.proofImage === 'string' ? payload.proofImage.trim() : '';
    const amountToRegister = Number(payload.amount);

    if (amountToRegister > remainingBeforePayment) {
      throw new Error('El monto supera el saldo pendiente de la cuenta.');
    }

    if (payload.method === 'CASH') {
      if (receivedAmount === null) {
        throw new Error('El monto recibido es obligatorio para efectivo.');
      }
      if (receivedAmount < amountToRegister) {
        throw new Error('El monto recibido es menor al monto a cobrar.');
      }
    } else if (payload.method === 'CARD' || payload.method === 'TRANSFER') {
      if (!reference) {
        throw new Error('La referencia es obligatoria para tarjeta/transferencia.');
      }
    }

    if (payload.method === 'TRANSFER') {
      if (!proofImage) {
        throw new Error('La imagen del comprobante es obligatoria para transferencia/depósito.');
      }
      if (!proofImage.startsWith('data:image/')) {
        throw new Error('El comprobante debe ser una imagen válida.');
      }
      if (proofImage.length > 2_500_000) {
        throw new Error('La imagen del comprobante es muy grande.');
      }
    }

    await tx.payment.create({
      data: {
        orderId: order.id,
        method: payload.method as any,
        amount: amountToRegister as any,
        reference: reference ? reference : null,
        proofImage: proofImage ? proofImage : null,
      },
    });
    const remainingAfterPayment = Math.max(0, Number((remainingBeforePayment - amountToRegister).toFixed(2)));
    const isCompleted = remainingAfterPayment <= 0;

    if (isCompleted) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: PrismaOrderStatus.PAID, closedAt: new Date() },
      });

      if (order.tableId) {
        await tx.restaurantTable.update({
          where: { id: order.tableId },
          data: { status: PrismaTableStatus.FREE },
        });
      }
    }

    return {
      success: true,
      completed: isCompleted,
      paidAmount: Number((paidAmount + amountToRegister).toFixed(2)),
      remainingAmount: remainingAfterPayment,
      registeredAmount: amountToRegister,
    };
  });
}

export async function listInventoryItems(user: SanitizedAuthUser) {
  return (await getBootstrapSnapshot(user)).inventoryItems;
}

export async function createInventoryItemForUser(
  user: SanitizedAuthUser,
  payload: {
    branchId?: number | null;
    name: string;
    itemType?: 'RAW' | 'SUBRECIPE';
    unit: string;
    stock?: number;
    minStock?: number;
    unitCost?: number;
    supplier?: string | null;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const branchId = payload.branchId ?? user.branchId;
  const name = String(payload.name ?? '').trim();
  const itemType = payload.itemType === 'SUBRECIPE' ? PrismaInventoryItemType.SUBRECIPE : PrismaInventoryItemType.RAW;
  const unit = String(payload.unit ?? '').trim();
  const supplier = String(payload.supplier ?? '').trim();
  const stock = Number(payload.stock ?? 0);
  const minStock = Number(payload.minStock ?? 0);
  const unitCost = Number(payload.unitCost ?? 0);

  if (!name) {
    throw new Error('El nombre del insumo es obligatorio.');
  }
  if (!unit) {
    throw new Error('La unidad del insumo es obligatoria.');
  }
  if (!Number.isFinite(stock) || stock < 0) {
    throw new Error('El stock inicial es inválido.');
  }
  if (!Number.isFinite(minStock) || minStock < 0) {
    throw new Error('El stock mínimo es inválido.');
  }
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    throw new Error('El costo unitario es inválido.');
  }

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId: user.tenantId },
    select: { id: true, name: true },
  });

  if (!branch) {
    throw new Error('La sucursal seleccionada no existe.');
  }

  const created = await prisma.inventoryItem.create({
    data: {
      branchId,
      name,
      itemType,
      unit,
      stock,
      minStock,
      unitCost,
      supplier,
    },
  });

  if (stock > 0) {
    await prisma.inventoryMovement.create({
      data: {
        branchId,
        inventoryItemId: created.id,
        createdById: user.id,
        type: PrismaInventoryMovementType.PURCHASE,
        quantityChange: stock,
        stockBefore: 0,
        stockAfter: stock,
        unitCost,
        totalCost: Number((stock * unitCost).toFixed(4)),
        reference: `Alta de insumo: ${name}`,
        notes: 'Stock inicial',
      },
    });
  }

  return {
    id: created.id,
    branchId,
    name: created.name,
    itemType: created.itemType,
    branch: branch.name,
    stock: Number(created.stock),
    minStock: Number(created.minStock),
    unit: created.unit,
    unitCost: Number(created.unitCost),
    stockValue: Number(created.stock) * Number(created.unitCost),
    supplier: created.supplier,
    status: Number(created.stock) <= Number(created.minStock) ? 'LOW' : 'OK',
  } satisfies InventoryItem;
}

export async function updateInventoryItemForUser(
  user: SanitizedAuthUser,
  payload: {
    inventoryItemId: number;
    branchId?: number | null;
    name: string;
    itemType?: 'RAW' | 'SUBRECIPE';
    unit: string;
    minStock?: number;
    unitCost?: number;
    supplier?: string | null;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const branchId = payload.branchId ?? user.branchId;
  const name = String(payload.name ?? '').trim();
  const itemType = payload.itemType === 'SUBRECIPE' ? PrismaInventoryItemType.SUBRECIPE : PrismaInventoryItemType.RAW;
  const unit = String(payload.unit ?? '').trim();
  const supplier = String(payload.supplier ?? '').trim();
  const minStock = Number(payload.minStock ?? 0);
  const unitCost = Number(payload.unitCost ?? 0);

  if (!name) {
    throw new Error('El nombre del insumo es obligatorio.');
  }
  if (!unit) {
    throw new Error('La unidad del insumo es obligatoria.');
  }
  if (!Number.isFinite(minStock) || minStock < 0) {
    throw new Error('El stock mínimo es inválido.');
  }
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    throw new Error('El costo unitario es inválido.');
  }

  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({
      where: { id: payload.inventoryItemId, branch: { tenantId: user.tenantId } },
      include: { branch: true },
    });

    if (!item) {
      throw new Error('El insumo no existe.');
    }

    const branch = await tx.branch.findFirst({
      where: { id: branchId, tenantId: user.tenantId },
      select: { id: true, name: true },
    });

    if (!branch) {
      throw new Error('La sucursal seleccionada no existe.');
    }

    const updated = await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        branchId,
        name,
        itemType,
        unit,
        minStock,
        unitCost,
        supplier,
      },
    });

    return {
      id: updated.id,
      branchId,
      name: updated.name,
      itemType: updated.itemType,
      branch: branch.name,
      stock: Number(updated.stock),
      minStock: Number(updated.minStock),
      unit: updated.unit,
      unitCost: Number(updated.unitCost),
      stockValue: Number(updated.stock) * Number(updated.unitCost),
      supplier: updated.supplier,
      status: Number(updated.stock) <= Number(updated.minStock) ? 'LOW' : 'OK',
    } satisfies InventoryItem;
  });
}

export async function adjustInventoryStockForUser(
  user: SanitizedAuthUser,
  payload: {
    inventoryItemId: number;
    type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
    quantity: number;
    reference: string;
    notes?: string | null;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const quantity = Number(payload.quantity ?? 0);
  const reference = String(payload.reference ?? '').trim();
  const notes = String(payload.notes ?? '').trim();

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('La cantidad es inválida.');
  }
  if (!reference) {
    throw new Error('La referencia es obligatoria.');
  }

  const movementType =
    payload.type === 'ADJUSTMENT_IN' ? PrismaInventoryMovementType.ADJUSTMENT_IN : PrismaInventoryMovementType.ADJUSTMENT_OUT;

  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({
      where: { id: payload.inventoryItemId, branch: { tenantId: user.tenantId } },
      include: { branch: true },
    });

    if (!item) {
      throw new Error('El insumo no existe.');
    }

    const isPositive = movementType === PrismaInventoryMovementType.ADJUSTMENT_IN;
    const stockBefore = Number(item.stock);
    const stockAfter = Number((stockBefore + (isPositive ? quantity : -quantity)).toFixed(3));

    if (stockAfter < 0) {
      throw new Error('El ajuste deja el stock en negativo.');
    }

    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { stock: stockAfter },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        branchId: item.branchId,
        inventoryItemId: item.id,
        createdById: user.id,
        type: movementType,
        quantityChange: isPositive ? quantity : -quantity,
        stockBefore,
        stockAfter,
        unitCost: Number(item.unitCost),
        totalCost: Number((quantity * Number(item.unitCost)).toFixed(4)),
        reference,
        notes: notes || null,
      },
      include: {
        inventoryItem: true,
        branch: true,
      },
    });

    return {
      id: movement.id,
      inventoryItemId: movement.inventoryItemId,
      itemName: movement.inventoryItem.name,
      branchId: movement.branchId,
      branchName: movement.branch.name,
      type: movement.type as InventoryMovement['type'],
      quantityChange: Number(movement.quantityChange),
      stockBefore: Number(movement.stockBefore),
      stockAfter: Number(movement.stockAfter),
      unitCost: Number(movement.unitCost),
      totalCost: Number(movement.totalCost),
      reference: movement.reference,
      notes: movement.notes ?? null,
      productName: null,
      orderCode: null,
      createdAt: movement.createdAt.toISOString(),
    } satisfies InventoryMovement;
  });
}

export async function getProductRecipeForUser(
  user: SanitizedAuthUser,
  payload: {
    productId: number;
    branchId?: number | null;
  },
) {
  if (!(await canUseDatabase())) {
    return getMockProductRecipe(payload.productId, payload.branchId ?? user.branchId);
  }

  const branchId = payload.branchId ?? user.branchId;
  const product = await prisma.product.findFirst({
    where: { id: payload.productId, tenantId: user.tenantId },
    select: { id: true },
  });

  if (!product) {
    throw new Error('El producto no existe.');
  }

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId: user.tenantId },
    select: { id: true },
  });

  if (!branch) {
    throw new Error('La sucursal seleccionada no existe.');
  }

  const rows = await prisma.recipe.findMany({
    where: { branchId, productId: payload.productId },
    include: {
      inventoryItem: true,
    },
    orderBy: { id: 'asc' },
  });

  const ingredients: RecipeIngredient[] = rows.map((row) => ({
    inventoryItemId: row.inventoryItemId,
    name: row.inventoryItem.name,
    itemType: row.inventoryItem.itemType,
    unit: row.inventoryItem.unit,
    quantity: Number(row.quantity),
    stock: Number(row.inventoryItem.stock),
    unitCost: Number(row.inventoryItem.unitCost),
  }));

  return {
    productId: payload.productId,
    branchId,
    estimatedCost: Number(
      ingredients.reduce((sum, item) => sum + item.quantity * item.unitCost, 0).toFixed(4),
    ),
    ingredients,
  } satisfies ProductRecipe;
}

export async function saveProductRecipeForUser(
  user: SanitizedAuthUser,
  payload: {
    productId: number;
    branchId?: number | null;
    ingredients: Array<{ inventoryItemId: number; quantity: number }>;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const branchId = payload.branchId ?? user.branchId;
  const normalizedIngredients = payload.ingredients
    .map((item) => ({
      inventoryItemId: item.inventoryItemId,
      quantity: Number(item.quantity),
    }))
    .filter((item) => Number.isInteger(item.inventoryItemId) && item.inventoryItemId > 0 && Number.isFinite(item.quantity) && item.quantity > 0);

  const product = await prisma.product.findFirst({
    where: { id: payload.productId, tenantId: user.tenantId },
    select: { id: true },
  });

  if (!product) {
    throw new Error('El producto no existe.');
  }

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId: user.tenantId },
    select: { id: true },
  });

  if (!branch) {
    throw new Error('La sucursal seleccionada no existe.');
  }

  const inventoryIds = normalizedIngredients.map((item) => item.inventoryItemId);
  const items = inventoryIds.length
    ? await prisma.inventoryItem.findMany({
        where: {
          id: { in: inventoryIds },
          branchId,
        },
      })
    : [];

  if (items.length !== inventoryIds.length && inventoryIds.length > 0) {
    throw new Error('Uno o varios insumos no pertenecen a la sucursal seleccionada.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.recipe.deleteMany({
      where: { productId: payload.productId, branchId },
    });

    if (normalizedIngredients.length > 0) {
      await tx.recipe.createMany({
        data: normalizedIngredients.map((item) => ({
          branchId,
          productId: payload.productId,
          inventoryItemId: item.inventoryItemId,
          quantity: item.quantity,
        })),
      });
    }
  });

  return getProductRecipeForUser(user, { productId: payload.productId, branchId });
}

export async function getSubRecipeFormulaForUser(
  user: SanitizedAuthUser,
  payload: {
    inventoryItemId: number;
    branchId?: number | null;
  },
) {
  if (!(await canUseDatabase())) {
    return {
      inventoryItemId: payload.inventoryItemId,
      branchId: payload.branchId ?? user.branchId,
      yieldName: 'Subreceta',
      estimatedCost: 0,
      components: [],
    } satisfies SubRecipeFormula;
  }

  const branchId = payload.branchId ?? user.branchId;
  const item = await prisma.inventoryItem.findFirst({
    where: { id: payload.inventoryItemId, branchId, branch: { tenantId: user.tenantId } },
    select: { id: true, name: true, itemType: true },
  });

  if (!item) {
    throw new Error('La subreceta no existe.');
  }
  if (item.itemType !== PrismaInventoryItemType.SUBRECIPE) {
    throw new Error('El insumo seleccionado no está marcado como subreceta.');
  }

  const rows = await prisma.subRecipeComponent.findMany({
    where: { branchId, parentInventoryItemId: payload.inventoryItemId },
    include: {
      componentItem: true,
    },
    orderBy: { id: 'asc' },
  });

  const components: RecipeIngredient[] = rows.map((row) => ({
    inventoryItemId: row.componentInventoryItemId,
    name: row.componentItem.name,
    itemType: row.componentItem.itemType,
    unit: row.componentItem.unit,
    quantity: Number(row.quantity),
    stock: Number(row.componentItem.stock),
    unitCost: Number(row.componentItem.unitCost),
  }));

  return {
    inventoryItemId: payload.inventoryItemId,
    branchId,
    yieldName: item.name,
    estimatedCost: Number(components.reduce((sum, component) => sum + component.quantity * component.unitCost, 0).toFixed(4)),
    components,
  } satisfies SubRecipeFormula;
}

export async function saveSubRecipeFormulaForUser(
  user: SanitizedAuthUser,
  payload: {
    inventoryItemId: number;
    branchId?: number | null;
    components: Array<{ inventoryItemId: number; quantity: number }>;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const branchId = payload.branchId ?? user.branchId;
  const normalizedComponents = payload.components
    .map((item) => ({
      inventoryItemId: item.inventoryItemId,
      quantity: Number(item.quantity),
    }))
    .filter((item) => Number.isInteger(item.inventoryItemId) && item.inventoryItemId > 0 && Number.isFinite(item.quantity) && item.quantity > 0);

  const parentItem = await prisma.inventoryItem.findFirst({
    where: { id: payload.inventoryItemId, branchId, branch: { tenantId: user.tenantId } },
    select: { id: true, itemType: true },
  });

  if (!parentItem) {
    throw new Error('La subreceta no existe.');
  }
  if (parentItem.itemType !== PrismaInventoryItemType.SUBRECIPE) {
    throw new Error('El insumo seleccionado no está marcado como subreceta.');
  }

  const componentIds = normalizedComponents.map((item) => item.inventoryItemId);
  const components = componentIds.length
    ? await prisma.inventoryItem.findMany({
        where: { id: { in: componentIds }, branchId },
        select: { id: true },
      })
    : [];

  if (components.length !== componentIds.length && componentIds.length > 0) {
    throw new Error('Uno o varios componentes no pertenecen a la sucursal seleccionada.');
  }

  if (normalizedComponents.some((item) => item.inventoryItemId === payload.inventoryItemId)) {
    throw new Error('Una subreceta no puede consumirse a sí misma.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.subRecipeComponent.deleteMany({
      where: { branchId, parentInventoryItemId: payload.inventoryItemId },
    });

    if (normalizedComponents.length > 0) {
      await tx.subRecipeComponent.createMany({
        data: normalizedComponents.map((item) => ({
          branchId,
          parentInventoryItemId: payload.inventoryItemId,
          componentInventoryItemId: item.inventoryItemId,
          quantity: item.quantity,
        })),
      });
    }
  });

  return getSubRecipeFormulaForUser(user, { inventoryItemId: payload.inventoryItemId, branchId });
}

export async function produceSubRecipeForUser(
  user: SanitizedAuthUser,
  payload: {
    inventoryItemId: number;
    outputQuantity: number;
    reference: string;
    notes?: string | null;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const outputQuantity = Number(payload.outputQuantity ?? 0);
  const reference = String(payload.reference ?? '').trim();
  const notes = String(payload.notes ?? '').trim();

  if (!Number.isFinite(outputQuantity) || outputQuantity <= 0) {
    throw new Error('La cantidad producida es inválida.');
  }
  if (!reference) {
    throw new Error('La referencia de producción es obligatoria.');
  }

  return prisma.$transaction(async (tx) => {
    const parentItem = await tx.inventoryItem.findFirst({
      where: { id: payload.inventoryItemId, branch: { tenantId: user.tenantId } },
      include: { branch: true },
    });

    if (!parentItem) {
      throw new Error('La subreceta no existe.');
    }
    if (parentItem.itemType !== PrismaInventoryItemType.SUBRECIPE) {
      throw new Error('El insumo seleccionado no está marcado como subreceta.');
    }

    const components = await tx.subRecipeComponent.findMany({
      where: { branchId: parentItem.branchId, parentInventoryItemId: parentItem.id },
      include: {
        componentItem: true,
      },
    });

    if (!components.length) {
      throw new Error('La subreceta no tiene componentes configurados.');
    }

    for (const component of components) {
      const requiredQuantity = Number(component.quantity) * outputQuantity;
      if (requiredQuantity > Number(component.componentItem.stock)) {
        throw new Error(`Stock insuficiente para ${component.componentItem.name}.`);
      }
    }

    let batchTotalCost = 0;

    for (const component of components) {
      const requiredQuantity = Number(component.quantity) * outputQuantity;
      const stockBefore = Number(component.componentItem.stock);
      const stockAfter = Number((stockBefore - requiredQuantity).toFixed(3));
      const totalCost = Number((requiredQuantity * Number(component.componentItem.unitCost)).toFixed(4));
      batchTotalCost += totalCost;

      await tx.inventoryItem.update({
        where: { id: component.componentItem.id },
        data: { stock: stockAfter },
      });

      await tx.inventoryMovement.create({
        data: {
          branchId: parentItem.branchId,
          inventoryItemId: component.componentItem.id,
          createdById: user.id,
          type: PrismaInventoryMovementType.SUBRECIPE_CONSUMPTION,
          quantityChange: -requiredQuantity,
          stockBefore,
          stockAfter,
          unitCost: Number(component.componentItem.unitCost),
          totalCost,
          reference,
          notes: notes || `Consumo para producir ${parentItem.name}`,
        },
      });
    }

    const stockBefore = Number(parentItem.stock);
    const stockAfter = Number((stockBefore + outputQuantity).toFixed(3));
    const nextUnitCost = stockAfter > 0 ? Number((((stockBefore * Number(parentItem.unitCost)) + batchTotalCost) / stockAfter).toFixed(4)) : 0;

    await tx.inventoryItem.update({
      where: { id: parentItem.id },
      data: {
        stock: stockAfter,
        unitCost: nextUnitCost,
      },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        branchId: parentItem.branchId,
        inventoryItemId: parentItem.id,
        createdById: user.id,
        type: PrismaInventoryMovementType.SUBRECIPE_PRODUCTION,
        quantityChange: outputQuantity,
        stockBefore,
        stockAfter,
        unitCost: outputQuantity > 0 ? Number((batchTotalCost / outputQuantity).toFixed(4)) : 0,
        totalCost: Number(batchTotalCost.toFixed(4)),
        reference,
        notes: notes || null,
      },
      include: {
        inventoryItem: true,
        branch: true,
      },
    });

    return {
      id: movement.id,
      inventoryItemId: movement.inventoryItemId,
      itemName: movement.inventoryItem.name,
      branchId: movement.branchId,
      branchName: movement.branch.name,
      type: movement.type as InventoryMovement['type'],
      quantityChange: Number(movement.quantityChange),
      stockBefore: Number(movement.stockBefore),
      stockAfter: Number(movement.stockAfter),
      unitCost: Number(movement.unitCost),
      totalCost: Number(movement.totalCost),
      reference: movement.reference,
      notes: movement.notes ?? null,
      productName: null,
      orderCode: null,
      createdAt: movement.createdAt.toISOString(),
    } satisfies InventoryMovement;
  });
}

export async function createPurchaseReceiptForUser(
  user: SanitizedAuthUser,
  payload: {
    branchId?: number | null;
    supplier: string;
    reference: string;
    invoiceNo?: string | null;
    notes?: string | null;
    lines: Array<{ inventoryItemId: number; quantity: number; unitCost: number }>;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const branchId = payload.branchId ?? user.branchId;
  const supplier = String(payload.supplier ?? '').trim();
  const reference = String(payload.reference ?? '').trim();
  const invoiceNo = String(payload.invoiceNo ?? '').trim();
  const notes = String(payload.notes ?? '').trim();
  const lines = payload.lines
    .map((line) => ({
      inventoryItemId: line.inventoryItemId,
      quantity: Number(line.quantity),
      unitCost: Number(line.unitCost),
    }))
    .filter((line) => Number.isInteger(line.inventoryItemId) && line.inventoryItemId > 0 && Number.isFinite(line.quantity) && line.quantity > 0 && Number.isFinite(line.unitCost) && line.unitCost >= 0);

  if (!supplier) {
    throw new Error('El proveedor es obligatorio.');
  }
  if (!reference) {
    throw new Error('La referencia de compra es obligatoria.');
  }
  if (!lines.length) {
    throw new Error('La compra debe incluir al menos una línea.');
  }

  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({
      where: { id: branchId, tenantId: user.tenantId },
      select: { id: true, name: true },
    });
    if (!branch) {
      throw new Error('La sucursal seleccionada no existe.');
    }

    const inventoryIds = lines.map((line) => line.inventoryItemId);
    const items = await tx.inventoryItem.findMany({
      where: { id: { in: inventoryIds }, branchId },
    });
    if (items.length !== inventoryIds.length) {
      throw new Error('Uno o varios insumos no pertenecen a la sucursal seleccionada.');
    }

    const itemById = new Map(items.map((item) => [item.id, item]));
    const totalAmount = Number(lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0).toFixed(4));

    const receipt = await tx.purchaseReceipt.create({
      data: {
        branchId,
        createdById: user.id,
        supplier,
        reference,
        invoiceNo: invoiceNo || null,
        notes: notes || null,
        totalAmount,
      },
    });

    for (const line of lines) {
      const item = itemById.get(line.inventoryItemId);
      if (!item) {
        throw new Error('Insumo de compra no encontrado.');
      }

      const stockBefore = Number(item.stock);
      const stockAfter = Number((stockBefore + line.quantity).toFixed(3));
      const lineTotal = Number((line.quantity * line.unitCost).toFixed(4));
      const nextUnitCost = stockAfter > 0 ? Number((((stockBefore * Number(item.unitCost)) + lineTotal) / stockAfter).toFixed(4)) : 0;

      await tx.purchaseReceiptLine.create({
        data: {
          purchaseReceiptId: receipt.id,
          inventoryItemId: item.id,
          quantity: line.quantity,
          unitCost: line.unitCost,
          totalCost: lineTotal,
        },
      });

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          stock: stockAfter,
          unitCost: nextUnitCost,
          supplier,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          branchId,
          inventoryItemId: item.id,
          createdById: user.id,
          type: PrismaInventoryMovementType.PURCHASE,
          quantityChange: line.quantity,
          stockBefore,
          stockAfter,
          unitCost: line.unitCost,
          totalCost: lineTotal,
          reference,
          notes: notes || `Compra formal ${supplier}`,
        },
      });
    }

    const created = await tx.purchaseReceipt.findUniqueOrThrow({
      where: { id: receipt.id },
      include: {
        branch: true,
        lines: {
          include: {
            inventoryItem: true,
          },
        },
      },
    });

    return {
      id: created.id,
      branchId: created.branchId,
      branchName: created.branch.name,
      supplier: created.supplier,
      reference: created.reference,
      invoiceNo: created.invoiceNo ?? null,
      totalAmount: Number(created.totalAmount),
      createdAt: created.createdAt.toISOString(),
      lines: created.lines.map((line) => ({
        inventoryItemId: line.inventoryItemId,
        itemName: line.inventoryItem.name,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost),
        totalCost: Number(line.totalCost),
      })),
    } satisfies PurchaseReceiptSummary;
  });
}

export async function createWasteRecordForUser(
  user: SanitizedAuthUser,
  payload: {
    inventoryItemId: number;
    quantity: number;
    reasonType: 'PRODUCTION' | 'KITCHEN' | 'EXPIRED' | 'DAMAGE' | 'OTHER';
    reference: string;
    notes?: string | null;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const quantity = Number(payload.quantity ?? 0);
  const reference = String(payload.reference ?? '').trim();
  const notes = String(payload.notes ?? '').trim();

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('La cantidad de merma es inválida.');
  }
  if (!reference) {
    throw new Error('La referencia de merma es obligatoria.');
  }

  const reasonType =
    payload.reasonType === 'PRODUCTION'
      ? PrismaWasteReasonType.PRODUCTION
      : payload.reasonType === 'KITCHEN'
        ? PrismaWasteReasonType.KITCHEN
        : payload.reasonType === 'EXPIRED'
          ? PrismaWasteReasonType.EXPIRED
          : payload.reasonType === 'DAMAGE'
            ? PrismaWasteReasonType.DAMAGE
            : PrismaWasteReasonType.OTHER;

  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({
      where: { id: payload.inventoryItemId, branch: { tenantId: user.tenantId } },
      include: { branch: true },
    });

    if (!item) {
      throw new Error('El insumo no existe.');
    }

    const stockBefore = Number(item.stock);
    const stockAfter = Number((stockBefore - quantity).toFixed(3));
    if (stockAfter < 0) {
      throw new Error('La merma deja el stock en negativo.');
    }

    const record = await tx.wasteRecord.create({
      data: {
        branchId: item.branchId,
        inventoryItemId: item.id,
        createdById: user.id,
        quantity,
        reasonType,
        reference,
        notes: notes || null,
      },
      include: {
        branch: true,
        inventoryItem: true,
      },
    });

    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { stock: stockAfter },
    });

    await tx.inventoryMovement.create({
      data: {
        branchId: item.branchId,
        inventoryItemId: item.id,
        createdById: user.id,
        type: PrismaInventoryMovementType.WASTE,
        quantityChange: -quantity,
        stockBefore,
        stockAfter,
        unitCost: Number(item.unitCost),
        totalCost: Number((quantity * Number(item.unitCost)).toFixed(4)),
        reference,
        notes: notes || `Merma ${reasonType}`,
      },
    });

    return {
      id: record.id,
      branchId: record.branchId,
      branchName: record.branch.name,
      inventoryItemId: record.inventoryItemId,
      itemName: record.inventoryItem.name,
      quantity: Number(record.quantity),
      reasonType: record.reasonType,
      reference: record.reference,
      notes: record.notes ?? null,
      createdAt: record.createdAt.toISOString(),
    } satisfies WasteRecordSummary;
  });
}

export async function listInventoryMovementsForUser(
  user: SanitizedAuthUser,
  payload?: {
    branchId?: number | null;
  },
) {
  if (!(await canUseDatabase())) {
    return restaurantSnapshot.inventoryMovements;
  }

  const branchId = payload?.branchId ?? null;
  const rows = await prisma.inventoryMovement.findMany({
    where: {
      branch: {
        tenantId: user.tenantId,
      },
      ...(branchId ? { branchId } : {}),
    },
    include: {
      inventoryItem: true,
      branch: true,
      product: true,
      order: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });

  return rows.map((movement) => ({
    id: movement.id,
    inventoryItemId: movement.inventoryItemId,
    itemName: movement.inventoryItem.name,
    branchId: movement.branchId,
    branchName: movement.branch.name,
    type: movement.type as InventoryMovement['type'],
    quantityChange: Number(movement.quantityChange),
    stockBefore: Number(movement.stockBefore),
    stockAfter: Number(movement.stockAfter),
    unitCost: Number(movement.unitCost),
    totalCost: Number(movement.totalCost),
    reference: movement.reference,
    notes: movement.notes ?? null,
    productName: movement.product?.name ?? null,
    orderCode: movement.order?.code ?? null,
    createdAt: movement.createdAt.toISOString(),
  })) satisfies InventoryMovement[];
}

export async function listCustomers(user: SanitizedAuthUser) {
  return (await getBootstrapSnapshot(user)).customers;
}

export async function createCustomerForUser(
  user: SanitizedAuthUser,
  payload: {
    name: string;
    phone?: string | null;
    email?: string | null;
    points?: number;
    creditLimit?: number;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const name = payload.name.trim();
  const phone = payload.phone?.trim() || null;
  const email = payload.email?.trim() || null;
  const points = Math.max(0, Math.trunc(payload.points ?? 0));
  const creditLimit = Number(payload.creditLimit ?? 0);

  if (!name) {
    throw new Error('El nombre del cliente es obligatorio.');
  }
  if (!Number.isFinite(creditLimit) || creditLimit < 0) {
    throw new Error('El límite de crédito es inválido.');
  }

  return prisma.customer.create({
    data: {
      tenantId: user.tenantId,
      name,
      phone,
      email,
      points,
      creditLimit,
    },
  });
}

export async function updateCustomerForUser(
  user: SanitizedAuthUser,
  payload: {
    customerId: number;
    name: string;
    phone?: string | null;
    email?: string | null;
    points?: number;
    creditLimit?: number;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const name = payload.name.trim();
  const phone = payload.phone?.trim() || null;
  const email = payload.email?.trim() || null;
  const points = Math.max(0, Math.trunc(payload.points ?? 0));
  const creditLimit = Number(payload.creditLimit ?? 0);

  if (!name) {
    throw new Error('El nombre del cliente es obligatorio.');
  }
  if (!Number.isFinite(creditLimit) || creditLimit < 0) {
    throw new Error('El límite de crédito es inválido.');
  }

  const customer = await prisma.customer.findFirst({
    where: { id: payload.customerId, tenantId: user.tenantId },
    select: { id: true },
  });

  if (!customer) {
    throw new Error('El cliente no existe.');
  }

  return prisma.customer.update({
    where: { id: payload.customerId },
    data: {
      name,
      phone,
      email,
      points,
      creditLimit,
    },
  });
}

export async function deleteCustomerForUser(user: SanitizedAuthUser, customerId: number) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, tenantId: user.tenantId },
      select: { id: true },
    });

    if (!customer) {
      throw new Error('El cliente no existe.');
    }

    const hasOrders = await tx.order.findFirst({
      where: { tenantId: user.tenantId, customerId },
      select: { id: true },
    });

    if (hasOrders) {
      throw new Error('No se puede eliminar un cliente con historial de pedidos.');
    }

    await tx.customer.delete({ where: { id: customerId } });
    return { success: true };
  });
}

export async function listDeliveryOrders(user: SanitizedAuthUser) {
  return (await getBootstrapSnapshot(user)).deliveryOrders;
}

async function ensureOrdersCreatedBy(tenantId: number) {
  if (!(await canUseDatabase())) {
    return;
  }

  const pendingOrders = await prisma.order.findMany({
    where: { tenantId, createdById: null },
    select: { id: true, branchId: true },
  });

  if (!pendingOrders.length) {
    return;
  }

  const users = await prisma.user.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ branchId: 'asc' }, { id: 'asc' }],
    select: { id: true, branchId: true },
  });

  if (!users.length) {
    return;
  }

  const tenantFallbackUserId = users[0].id;
  const branchUserMap = new Map<number, number>();
  for (const candidate of users) {
    if (candidate.branchId && !branchUserMap.has(candidate.branchId)) {
      branchUserMap.set(candidate.branchId, candidate.id);
    }
  }

  await prisma.$transaction(
    pendingOrders.map((order) =>
      prisma.order.update({
        where: { id: order.id },
        data: { createdById: branchUserMap.get(order.branchId) ?? tenantFallbackUserId },
      }),
    ),
  );
}

export async function getReportsSummary(
  user: SanitizedAuthUser,
  filters?: {
    dateFrom?: Date | null;
    dateTo?: Date | null;
    branchId?: number | null;
    userId?: number | null;
  },
): Promise<ReportsSummary> {
  if (!(await canUseDatabase())) {
    const snapshot = await getBootstrapSnapshot(user);
    return {
      summary: snapshot.reportSummary,
      salesTrend: snapshot.salesTrend,
      topProducts: snapshot.topProducts,
      paymentMix: buildPaymentMix(snapshot.cashMovements.filter((movement) => movement.type === 'SALE').map((movement) => ({
        method: movement.method as PrismaPaymentMethod,
        amount: movement.amount,
      }))),
      orderCount: snapshot.activeOrders.length,
      customerCount: snapshot.customers.length,
      availableUsers: mockUsers
        .filter((item) => item.tenantId === user.tenantId)
        .map((item) => ({ id: item.id, name: item.name, role: item.role })) satisfies ReportUserOption[],
      appliedFilters: {
        dateFrom: filters?.dateFrom ? filters.dateFrom.toISOString().slice(0, 10) : null,
        dateTo: filters?.dateTo ? filters.dateTo.toISOString().slice(0, 10) : null,
        branchId: filters?.branchId ?? null,
        userId: filters?.userId ?? null,
      },
    };
  }

  await ensureOrdersCreatedBy(user.tenantId);

  const where: {
    tenantId: number;
    status: { not: PrismaOrderStatus };
    branchId?: number;
    createdById?: number;
    createdAt?: { gte?: Date; lte?: Date };
  } = {
    tenantId: user.tenantId,
    status: { not: PrismaOrderStatus.CANCELLED },
  };

  if (filters?.branchId) {
    where.branchId = filters.branchId;
  }

  if (filters?.userId) {
    where.createdById = filters.userId;
  }

  if (filters?.dateFrom || filters?.dateTo) {
    where.createdAt = {};
    if (filters?.dateFrom) {
      where.createdAt.gte = filters.dateFrom;
    }
    if (filters?.dateTo) {
      where.createdAt.lte = filters.dateTo;
    }
  }

  const [orderRows, users] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        branch: true,
        customer: true,
        items: {
          include: {
            product: true,
          },
        },
        payments: true,
      },
    }),
    prisma.user.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      orderBy: [{ name: 'asc' }],
      select: { id: true, name: true, role: true },
    }),
  ]);

  const reportOrders: Order[] = orderRows.map((order) => ({
    id: order.id,
    code: order.code,
    branchId: order.branchId,
    type: order.type as Order['type'],
    status: order.status as Order['status'],
    customerName: order.customer?.name ?? (order.tableId ? `Mesa ${order.tableId}` : 'Consumidor final'),
    area: order.branch?.name ?? 'Operación',
    total: Number(order.total),
    channel: order.channel,
    tableCode: undefined,
    assignedTo: undefined,
    paidAmount: order.payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    pendingAmount: Math.max(0, Number(order.total) - order.payments.reduce((sum, payment) => sum + Number(payment.amount), 0)),
    paymentCount: order.payments.length,
    items: order.items.map((item) => ({
      product: item.product.name,
      quantity: Number(item.quantity),
      notes: item.notes ?? undefined,
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      method: payment.method as Order['payments'][number]['method'],
      amount: Number(payment.amount),
      reference: payment.reference ?? null,
      createdAt: payment.createdAt.toISOString(),
    })),
  }));

  const totalSales = reportOrders.reduce((sum, order) => sum + order.total, 0);
  const topProducts = buildTopProducts(reportOrders);
  const branchTotals = new Map<string, number>();
  orderRows.forEach((order) => {
    const branchName = order.branch?.name ?? 'Sin sucursal';
    branchTotals.set(branchName, (branchTotals.get(branchName) ?? 0) + Number(order.total));
  });

  const bestBranch = [...branchTotals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'Sin datos';
  const customerCount = new Set(orderRows.map((order) => order.customerId).filter((value): value is number => Boolean(value))).size;

  return {
    summary: {
      period: formatReportPeriod(
        filters?.dateFrom ? filters.dateFrom.toISOString().slice(0, 10) : null,
        filters?.dateTo ? filters.dateTo.toISOString().slice(0, 10) : null,
      ),
      sales: Math.round(totalSales),
      profit: Math.round(totalSales * 0.32),
      averageTicket: orderRows.length ? Math.round(totalSales / orderRows.length) : 0,
      bestBranch,
      bestSeller: topProducts[0]?.name ?? 'Sin datos',
    },
    salesTrend: buildSalesTrend(
      orderRows.map((order) => ({ createdAt: order.createdAt, total: Number(order.total) })),
      { dateFrom: filters?.dateFrom, dateTo: filters?.dateTo },
    ),
    topProducts,
    paymentMix: buildPaymentMix(
      orderRows.flatMap((order) =>
        order.payments.map((payment) => ({
          method: payment.method,
          amount: Number(payment.amount),
        })),
      ),
    ),
    orderCount: orderRows.length,
    customerCount,
    availableUsers: users.map((item) => ({ id: item.id, name: item.name, role: item.role as RoleCode })),
    appliedFilters: {
      dateFrom: filters?.dateFrom ? filters.dateFrom.toISOString().slice(0, 10) : null,
      dateTo: filters?.dateTo ? filters.dateTo.toISOString().slice(0, 10) : null,
      branchId: filters?.branchId ?? null,
      userId: filters?.userId ?? null,
    },
  };
}

export async function getDashboardSummary(user: SanitizedAuthUser) {
  const snapshot = await getBootstrapSnapshot(user);
  return {
    metrics: snapshot.dashboardMetrics,
    salesTrend: snapshot.salesTrend,
    topProducts: snapshot.topProducts,
  };
}

export async function moveOpenOrderToTable(
  user: SanitizedAuthUser,
  payload: {
    fromTableId: number;
    toTableId: number;
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  if (payload.fromTableId === payload.toTableId) {
    throw new Error('Selecciona una mesa destino diferente.');
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: {
        tenantId: user.tenantId,
        tableId: payload.fromTableId,
        status: { in: [PrismaOrderStatus.OPEN, PrismaOrderStatus.IN_PREPARATION, PrismaOrderStatus.READY, PrismaOrderStatus.SERVED] },
      },
      orderBy: { createdAt: 'desc' },
      include: { table: true },
    });

    if (!order) {
      throw new Error('No hay una cuenta abierta en la mesa origen.');
    }

    const originTable = await tx.restaurantTable.findFirst({
      where: { id: payload.fromTableId, tenantId: user.tenantId },
      select: { id: true, tenantId: true, branchId: true, status: true },
    });

    if (!originTable) {
      throw new Error('Mesa origen no encontrada.');
    }

    const destinationTable = await tx.restaurantTable.findFirst({
      where: { id: payload.toTableId, tenantId: user.tenantId },
      select: { id: true, tenantId: true, branchId: true, status: true },
    });

    if (!destinationTable) {
      throw new Error('Mesa destino no existe.');
    }

    if (order.table?.branchId && destinationTable.branchId !== order.table.branchId) {
      throw new Error('No se puede mover la cuenta a una mesa de otra sucursal.');
    }

    if (destinationTable.status === PrismaTableStatus.RESERVED) {
      throw new Error('La mesa destino está reservada.');
    }

    const destinationOccupied = await tx.order.findFirst({
      where: {
        tenantId: user.tenantId,
        tableId: payload.toTableId,
        status: { in: [PrismaOrderStatus.OPEN, PrismaOrderStatus.IN_PREPARATION, PrismaOrderStatus.READY, PrismaOrderStatus.SERVED] },
      },
      select: { id: true },
    });

    if (destinationOccupied) {
      throw new Error('La mesa destino ya tiene una cuenta activa.');
    }

    await tx.order.update({
      where: { id: order.id },
      data: { tableId: payload.toTableId },
    });

    await tx.restaurantTable.update({
      where: { id: originTable.id },
      data: { status: PrismaTableStatus.FREE },
    });

    await tx.restaurantTable.update({
      where: { id: destinationTable.id },
      data: { status: PrismaTableStatus.OCCUPIED },
    });

    return { success: true };
  });
}

export async function updateStationOrderStatus(
  user: SanitizedAuthUser,
  payload: {
    station: PreparationStation;
    orderId: number;
    status: 'PENDING' | 'IN_PREPARATION' | 'READY' | 'DELIVERED';
  },
) {
  if (!(await canUseDatabase())) {
    throw new Error('Base de datos no disponible.');
  }

  const status =
    payload.status === 'DELIVERED'
      ? ('DELIVERED' as unknown as PrismaPreparationStatus)
      : payload.status === 'READY'
        ? PrismaPreparationStatus.READY
        : payload.status === 'IN_PREPARATION'
          ? PrismaPreparationStatus.IN_PREPARATION
          : PrismaPreparationStatus.PENDING;

  const station =
    payload.station === 'BAR'
      ? PrismaPreparationStation.BAR
      : payload.station === 'PASTRY'
        ? PrismaPreparationStation.PASTRY
        : PrismaPreparationStation.KITCHEN;

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: payload.orderId, tenantId: user.tenantId },
      select: { id: true, status: true },
    });

    if (!order) {
      throw new Error('Pedido no encontrado.');
    }

    const activeItemsWhere = {
      orderId: payload.orderId,
      station,
      status: { in: [PrismaPreparationStatus.PENDING, PrismaPreparationStatus.IN_PREPARATION, PrismaPreparationStatus.READY] },
    };

    const now = new Date();
    if (payload.status === 'IN_PREPARATION' || payload.status === 'READY') {
      await tx.orderItem.updateMany({
        where: { ...activeItemsWhere, startedAt: null } as any,
        data: { startedAt: now } as any,
      });
    }

    if (payload.status === 'DELIVERED') {
      await tx.orderItem.updateMany({
        where: { ...activeItemsWhere, deliveredAt: null } as any,
        data: { deliveredAt: now } as any,
      });
    }

    const updated = await tx.orderItem.updateMany({
      where: activeItemsWhere,
      data: { status } as any,
    });

    if (updated.count === 0) {
      throw new Error('No hay items activos para actualizar en esta estación.');
    }

    const pendingCount = await tx.orderItem.count({
      where: {
        orderId: payload.orderId,
        status: { in: [PrismaPreparationStatus.PENDING, PrismaPreparationStatus.IN_PREPARATION] },
      },
    });

    const activeCount = await tx.orderItem.count({ where: { orderId: payload.orderId, status: { in: [PrismaPreparationStatus.PENDING, PrismaPreparationStatus.IN_PREPARATION, PrismaPreparationStatus.READY] } } });

    const nextOrderStatus =
      activeCount === 0 ? PrismaOrderStatus.SERVED : pendingCount === 0 ? PrismaOrderStatus.READY : PrismaOrderStatus.IN_PREPARATION;

    if (order.status !== PrismaOrderStatus.PAID && order.status !== PrismaOrderStatus.CANCELLED) {
      await tx.order.update({
        where: { id: payload.orderId },
        data: { status: nextOrderStatus },
      });
    }

    return { success: true };
  });
}

export async function createOrderForUser(user: SanitizedAuthUser, payload: CreateOrderPayload) {
  if (!(await canUseDatabase())) {
    return {
      id: Date.now(),
      code: `ORD-${String(Date.now()).slice(-4)}`,
      branchId: payload.branchId ?? user.branchId,
      ...payload,
    };
  }

  if (!payload.items.length) {
    throw new Error('El pedido debe incluir al menos un item.');
  }

  const branchId = payload.branchId ?? user.branchId;
  const productIds = payload.items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
    },
    include: {
      category: true,
    },
  });

  if (products.length !== productIds.length) {
    throw new Error('Uno o varios productos no existen.');
  }

  const priceMap = new Map<number, number>(products.map((product) => [product.id, Number(product.price)] as [number, number]));
  const stationMap = new Map<number, PrismaPreparationStation>(
    products.map((product) => [product.id, product.category?.station ?? PrismaPreparationStation.KITCHEN] as [number, PrismaPreparationStation]),
  );
  const addedTotal = payload.items.reduce((sum, item) => {
    const price = Number(priceMap.get(item.productId) ?? 0);
    return sum + Number(item.quantity) * price;
  }, 0);
  const code = `ORD-${String(Date.now()).slice(-6)}`;

  const order = await prisma.$transaction(async (tx) => {
    let customerId = payload.customerId ?? null;

    if (!customerId && payload.customer?.phone) {
      const normalizedPhone = normalizePhoneNumber(payload.customer.phone);
      if (normalizedPhone) {
        const existingCustomers = await tx.customer.findMany({
          where: {
            tenantId: user.tenantId,
            phone: {
              not: null,
            },
          },
          select: {
            id: true,
            phone: true,
          },
        });

        const matchedCustomer = existingCustomers.find((customer) => normalizePhoneNumber(customer.phone) === normalizedPhone);
        if (matchedCustomer) {
          customerId = matchedCustomer.id;
        }
      }
    }

    if (!customerId && payload.customer?.name) {
      const customer = await tx.customer.create({
        data: {
          tenantId: user.tenantId,
          name: payload.customer.name,
          phone: payload.customer.phone ?? null,
        },
      });
      customerId = customer.id;
    }

    if (payload.tableId) {
      const openOrder = await tx.order.findFirst({
        where: {
          tenantId: user.tenantId,
          tableId: payload.tableId,
          status: { in: [PrismaOrderStatus.OPEN, PrismaOrderStatus.IN_PREPARATION, PrismaOrderStatus.READY, PrismaOrderStatus.SERVED] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (openOrder) {
        if (!openOrder.customerId && customerId) {
          await tx.order.update({ where: { id: openOrder.id }, data: { customerId } });
        }

        await tx.orderItem.createMany({
          data: payload.items.map((item) => ({
            orderId: openOrder.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: priceMap.get(item.productId) ?? 0,
            notes: item.notes,
            station: stationMap.get(item.productId) ?? PrismaPreparationStation.KITCHEN,
            status: PrismaPreparationStatus.PENDING,
          })),
        });

        await tx.order.update({
          where: { id: openOrder.id },
          data: { total: Number(openOrder.total) + addedTotal, status: PrismaOrderStatus.IN_PREPARATION },
        });

        await applyRecipeConsumption(tx, {
          tenantId: user.tenantId,
          branchId,
          createdById: user.id,
          orderId: openOrder.id,
          items: payload.items.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity),
          })),
        });

        await tx.restaurantTable.update({
          where: { id: payload.tableId },
          data: { status: PrismaTableStatus.OCCUPIED },
        });

        return tx.order.findUniqueOrThrow({
          where: { id: openOrder.id },
          include: {
            items: { include: { product: true } },
            table: true,
            customer: true,
          },
        });
      }
    }

    const created = await tx.order.create({
      data: {
        tenantId: user.tenantId,
        branchId,
        tableId: payload.tableId,
        customerId,
        createdById: user.id,
        code,
        type: payload.type as PrismaOrderType,
        status: PrismaOrderStatus.IN_PREPARATION,
        total: addedTotal,
        channel:
          payload.channel ??
          (payload.type === 'DELIVERY' ? 'Delivery web' : payload.type === 'TAKE_OUT' ? 'Recojo' : 'Salon'),
        items: {
          create: payload.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: priceMap.get(item.productId) ?? 0,
            notes: item.notes,
            station: stationMap.get(item.productId) ?? PrismaPreparationStation.KITCHEN,
            status: PrismaPreparationStatus.PENDING,
          })),
        },
      },
      include: {
        items: { include: { product: true } },
        table: true,
        customer: true,
      },
    });

    await applyRecipeConsumption(tx, {
      tenantId: user.tenantId,
      branchId,
      createdById: user.id,
      orderId: created.id,
      items: payload.items.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
      })),
    });

    if (payload.tableId) {
      await tx.restaurantTable.update({
        where: { id: payload.tableId },
        data: { status: PrismaTableStatus.OCCUPIED },
      });
    }

    return created;
  });

  return {
    id: order.id,
    code: order.code,
    branchId: order.branchId,
    type: order.type,
    status: order.status,
    customerName: order.customer?.name ?? order.table?.code ?? 'Consumidor final',
    area: order.table?.area ?? 'Operacion',
    total: Number(order.total),
    channel: order.channel,
    tableCode: order.table?.code ?? undefined,
    items: order.items.map((item) => ({
      product: item.product.name,
      quantity: Number(item.quantity),
      notes: item.notes ?? undefined,
    })),
  };
}

export function getDemoAccounts() {
  return [
    { role: 'Administrador', email: 'admin@restaurante.gt', password: 'Admin123*' },
    { role: 'Supervisor', email: 'supervisor@restaurante.gt', password: 'Supervisor123*' },
    { role: 'Cajero', email: 'cajero@restaurante.gt', password: 'Caja123*' },
    { role: 'Mesero', email: 'mesero@restaurante.gt', password: 'Mesero123*' },
    { role: 'Cocina', email: 'cocina@restaurante.gt', password: 'Cocina123*' },
    { role: 'Bar', email: 'bar@restaurante.gt', password: 'Bar123456*' },
    { role: 'Pastelería', email: 'pasteleria@restaurante.gt', password: 'Pastel123*' },
  ];
}

export function sanitizeSessionUser(user: AuthUser) {
  if (mockUsers.some((item) => item.id === user.id)) {
    return sanitizeMockUser(user);
  }

  return sanitizeAuthUser(user);
}
