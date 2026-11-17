import bcrypt from 'bcryptjs';
import type {
  AuthUser,
  Branch,
  Customer,
  DashboardMetric,
  DeliveryOrder,
  KitchenOrder,
  Order,
  PermissionCode,
  ProductPerformance,
  ReportSummary,
  RestaurantSnapshot,
  RestaurantTable,
  RoleCode,
  SalesPoint,
  CashMovement,
  InventoryItem,
  InventoryMovement,
  PurchaseReceiptSummary,
  WasteRecordSummary,
} from '../types.js';

const rolePermissions: Record<RoleCode, PermissionCode[]> = {
  ADMIN: [
    'DASHBOARD_VIEW',
    'POS_USE',
    'TABLES_MANAGE',
    'KITCHEN_UPDATE',
    'CASH_MANAGE',
    'INVENTORY_MANAGE',
    'CUSTOMERS_MANAGE',
    'DELIVERY_MANAGE',
    'REPORTS_VIEW',
    'SETTINGS_MANAGE',
  ],
  SUPERVISOR: [
    'DASHBOARD_VIEW',
    'POS_USE',
    'TABLES_MANAGE',
    'KITCHEN_UPDATE',
    'CASH_MANAGE',
    'DELIVERY_MANAGE',
    'REPORTS_VIEW',
  ],
  CASHIER: ['DASHBOARD_VIEW', 'POS_USE', 'CASH_MANAGE', 'CUSTOMERS_MANAGE'],
  WAITER: ['POS_USE', 'TABLES_MANAGE', 'CUSTOMERS_MANAGE'],
  KITCHEN: ['KITCHEN_UPDATE'],
  BAR: ['KITCHEN_UPDATE'],
  PASTRY: ['KITCHEN_UPDATE'],
  DELIVERY: ['DELIVERY_MANAGE'],
};

export const branches: Branch[] = [
  { id: 1, tenantId: 1, name: 'Miraflores', city: 'Lima', address: 'Av. Larco 880', phone: '+51 999 201 111' },
  { id: 2, tenantId: 1, name: 'San Isidro', city: 'Lima', address: 'Calle Conquistadores 145', phone: '+51 999 202 222' },
  { id: 3, tenantId: 1, name: 'Barranco', city: 'Lima', address: 'Jiron Union 223', phone: '+51 999 203 333' },
];

export const users: AuthUser[] = [
  {
    id: 1,
    tenantId: 1,
    branchId: 1,
    role: 'ADMIN',
    permissions: rolePermissions.ADMIN,
    name: 'Camila Rojas',
    email: 'admin@restaurante.gt',
    passwordHash: bcrypt.hashSync('Admin123*', 8),
  },
  {
    id: 2,
    tenantId: 1,
    branchId: 1,
    role: 'SUPERVISOR',
    permissions: rolePermissions.SUPERVISOR,
    name: 'Diego Montalvo',
    email: 'supervisor@restaurante.gt',
    passwordHash: bcrypt.hashSync('Supervisor123*', 8),
  },
  {
    id: 3,
    tenantId: 1,
    branchId: 1,
    role: 'CASHIER',
    permissions: rolePermissions.CASHIER,
    name: 'Lucia Soto',
    email: 'cajero@restaurante.gt',
    passwordHash: bcrypt.hashSync('Caja123*', 8),
  },
  {
    id: 7,
    tenantId: 1,
    branchId: 1,
    role: 'WAITER',
    permissions: rolePermissions.WAITER,
    name: 'Mesero',
    email: 'mesero@restaurante.gt',
    passwordHash: bcrypt.hashSync('Mesero123*', 8),
  },
  {
    id: 4,
    tenantId: 1,
    branchId: 1,
    role: 'KITCHEN',
    permissions: rolePermissions.KITCHEN,
    name: 'Cocina',
    email: 'cocina@restaurante.gt',
    passwordHash: bcrypt.hashSync('Cocina123*', 8),
  },
  {
    id: 5,
    tenantId: 1,
    branchId: 1,
    role: 'BAR',
    permissions: rolePermissions.BAR,
    name: 'Bar',
    email: 'bar@restaurante.gt',
    passwordHash: bcrypt.hashSync('Bar123456*', 8),
  },
  {
    id: 6,
    tenantId: 1,
    branchId: 1,
    role: 'PASTRY',
    permissions: rolePermissions.PASTRY,
    name: 'Pastelería',
    email: 'pasteleria@restaurante.gt',
    passwordHash: bcrypt.hashSync('Pastel123*', 8),
  },
];

const dashboardMetrics: DashboardMetric[] = [
  { label: 'Ventas del dia', value: 'Q 18,420', change: '+12.8%', trend: 'up' },
  { label: 'Ordenes activas', value: '46', change: '+7 en 1h', trend: 'up' },
  { label: 'Ticket promedio', value: 'Q 78', change: '+4.1%', trend: 'up' },
  { label: 'Margen bruto', value: '31.4%', change: '-0.8%', trend: 'down' },
];

const salesTrend: SalesPoint[] = [
  { label: 'Lun', total: 11400 },
  { label: 'Mar', total: 13200 },
  { label: 'Mie', total: 12600 },
  { label: 'Jue', total: 14800 },
  { label: 'Vie', total: 17500 },
  { label: 'Sab', total: 20100 },
  { label: 'Dom', total: 18420 },
];

const topProducts: ProductPerformance[] = [
  { id: 1, name: 'Lomo saltado premium', sold: 92, revenue: 4048, margin: '34%' },
  { id: 2, name: 'Causa acevichada', sold: 77, revenue: 2233, margin: '38%' },
  { id: 3, name: 'Pisco sour autor', sold: 65, revenue: 1820, margin: '43%' },
  { id: 4, name: 'Cheesecake lucuma', sold: 49, revenue: 1225, margin: '47%' },
];

const activeOrders: Order[] = [
  {
    id: 501,
    code: 'ORD-501',
    branchId: 1,
    type: 'DINE_IN',
    status: 'IN_PREPARATION',
    customerName: 'Mesa 08',
    area: 'Salon principal',
    total: 182,
    channel: 'Salon',
    tableCode: 'M08',
    paidAmount: 0,
    pendingAmount: 182,
    paymentCount: 0,
    items: [
      { product: 'Lomo saltado premium', quantity: 2, notes: '1 sin cebolla' },
      { product: 'Chicha morada', quantity: 2 },
    ],
    payments: [],
  },
  {
    id: 502,
    code: 'ORD-502',
    branchId: 1,
    type: 'DELIVERY',
    status: 'READY',
    customerName: 'Andrea Paredes',
    area: 'Delivery',
    total: 96,
    channel: 'Rappi / directo',
    assignedTo: 'Miguel Solis',
    paidAmount: 0,
    pendingAmount: 96,
    paymentCount: 0,
    items: [
      { product: 'Arroz con mariscos', quantity: 1 },
      { product: 'Inka Kola 1.5L', quantity: 1 },
    ],
    payments: [],
  },
  {
    id: 503,
    code: 'ORD-503',
    branchId: 2,
    type: 'TAKE_OUT',
    status: 'OPEN',
    customerName: 'Carlos Vera',
    area: 'Recojo',
    total: 58,
    channel: 'Web / recojo',
    paidAmount: 0,
    pendingAmount: 58,
    paymentCount: 0,
    items: [
      { product: 'Hamburguesa parrillera', quantity: 2, modifier: 'extra queso' },
    ],
    payments: [],
  },
];

const tables: RestaurantTable[] = [
  { id: 1, code: 'M01', capacity: 4, area: 'Terraza', status: 'FREE' },
  { id: 2, code: 'M04', capacity: 6, area: 'Salon principal', status: 'OCCUPIED', currentOrder: 'ORD-488' },
  { id: 3, code: 'M08', capacity: 4, area: 'Salon principal', status: 'OCCUPIED', currentOrder: 'ORD-501' },
  { id: 4, code: 'M11', capacity: 2, area: 'Barra', status: 'RESERVED' },
  { id: 5, code: 'M14', capacity: 8, area: 'VIP', status: 'FREE' },
];

const kitchenOrders: KitchenOrder[] = [
  {
    id: 1,
    orderId: 1,
    station: 'KITCHEN',
    tableCode: 'M08',
    code: 'KDS-501',
    customerName: 'Consumidor final',
    area: 'Cocina caliente',
    status: 'IN_PREPARATION',
    startedAt: new Date(Date.now() - 9 * 60000).toISOString(),
    elapsedMinutes: 9,
    priority: 'ALTA',
    items: ['Lomo saltado premium x2', 'Papas nativas'],
  },
  {
    id: 3,
    orderId: 3,
    station: 'KITCHEN',
    tableCode: 'M01',
    code: 'KDS-503',
    customerName: 'Consumidor final',
    area: 'Cocina fria',
    status: 'PENDING',
    startedAt: new Date(Date.now() - 2 * 60000).toISOString(),
    elapsedMinutes: 2,
    priority: 'BAJA',
    items: ['Causa acevichada x1'],
  },
];

const barOrders: KitchenOrder[] = [
  {
    id: 2,
    orderId: 2,
    station: 'BAR',
    tableCode: 'M04',
    code: 'BAR-502',
    customerName: 'Consumidor final',
    area: 'Barra',
    status: 'READY',
    startedAt: new Date(Date.now() - 4 * 60000).toISOString(),
    elapsedMinutes: 4,
    priority: 'MEDIA',
    items: ['Pisco sour autor x2'],
  },
];

const pastryOrders: KitchenOrder[] = [
  {
    id: 4,
    orderId: 4,
    station: 'PASTRY',
    tableCode: 'M11',
    code: 'PST-504',
    customerName: 'Consumidor final',
    area: 'Pasteleria',
    status: 'PENDING',
    startedAt: new Date(Date.now() - 6 * 60000).toISOString(),
    elapsedMinutes: 6,
    priority: 'MEDIA',
    items: ['Cheesecake lucuma x1'],
  },
];

const menuCategories: RestaurantSnapshot['menuCategories'] = [
  { id: 1, parentId: null, name: 'Comidas', color: '#fb7185', station: 'KITCHEN' },
  { id: 2, parentId: null, name: 'Bebidas', color: '#38bdf8', station: 'BAR' },
  { id: 3, parentId: null, name: 'Postres', color: '#fbbf24', station: 'PASTRY' },
  { id: 4, parentId: 1, name: 'Platos fuertes', color: '#fb7185', station: 'KITCHEN' },
  { id: 5, parentId: 2, name: 'Bebidas sin alcohol', color: '#38bdf8', station: 'BAR' },
  { id: 6, parentId: 3, name: 'Postres', color: '#fbbf24', station: 'PASTRY' },
];

const menuProducts: RestaurantSnapshot['menuProducts'] = [
  {
    id: 1,
    categoryId: 1,
    name: 'Lomo saltado premium',
    sku: 'LOMO-001',
    imageUrl:
      'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20food%20photography%20of%20Peruvian%20lomo%20saltado%20served%20on%20a%20white%20plate%2C%20golden%20french%20fries%2C%20glossy%20sauce%2C%20restaurant%20lighting%2C%20shallow%20depth%20of%20field%2C%20high%20detail&image_size=landscape_4_3',
    price: 44,
    isPrepared: true,
    station: 'KITCHEN',
  },
  {
    id: 2,
    categoryId: 2,
    name: 'Chicha morada',
    sku: 'BEB-001',
    imageUrl:
      'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20beverage%20photography%20of%20a%20glass%20of%20chicha%20morada%20with%20ice%20and%20a%20slice%20of%20pineapple%2C%20condensation%20droplets%2C%20dark%20background%2C%20studio%20lighting%2C%20high%20detail&image_size=landscape_4_3',
    price: 8,
    isPrepared: false,
    station: 'BAR',
  },
  {
    id: 3,
    categoryId: 3,
    name: 'Cheesecake lucuma',
    sku: 'POS-001',
    imageUrl:
      'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20dessert%20photography%20of%20a%20lucuma%20cheesecake%20slice%20on%20a%20ceramic%20plate%2C%20soft%20lighting%2C%20crumb%20base%2C%20creamy%20texture%2C%20restaurant%20style%2C%20high%20detail&image_size=landscape_4_3',
    price: 25,
    isPrepared: true,
    station: 'PASTRY',
  },
];

const inventoryItems: InventoryItem[] = [
  { id: 1, branchId: 1, itemType: 'RAW', name: 'Lomo fino', branch: 'Miraflores', stock: 18, minStock: 12, unit: 'kg', unitCost: 62, stockValue: 1116, supplier: 'Carnes del Pacifico', status: 'OK' },
  { id: 2, branchId: 1, itemType: 'RAW', name: 'Queso mozzarella', branch: 'Miraflores', stock: 4, minStock: 8, unit: 'kg', unitCost: 38, stockValue: 152, supplier: 'Lacteos Sierra', status: 'LOW' },
  { id: 3, branchId: 2, itemType: 'RAW', name: 'Papa amarilla', branch: 'San Isidro', stock: 26, minStock: 14, unit: 'kg', unitCost: 9, stockValue: 234, supplier: 'Agro Andino', status: 'OK' },
  { id: 4, branchId: 3, itemType: 'RAW', name: 'Pisco quebranta', branch: 'Barranco', stock: 6, minStock: 10, unit: 'botellas', unitCost: 85, stockValue: 510, supplier: 'Destileria Sur', status: 'LOW' },
  { id: 5, branchId: 1, itemType: 'SUBRECIPE', name: 'Salsa BBQ base', branch: 'Miraflores', stock: 3, minStock: 1, unit: 'lt', unitCost: 24, stockValue: 72, supplier: 'Producción interna', status: 'OK' },
];

const inventoryMovements: InventoryMovement[] = [
  {
    id: 1,
    inventoryItemId: 1,
    itemName: 'Lomo fino',
    branchId: 1,
    branchName: 'Miraflores',
    type: 'PURCHASE',
    quantityChange: 6,
    stockBefore: 12,
    stockAfter: 18,
    unitCost: 62,
    totalCost: 372,
    reference: 'Compra semanal de carnes',
    notes: 'Proveedor habitual',
    productName: null,
    orderCode: null,
    createdAt: new Date(Date.now() - 6 * 3600000).toISOString(),
  },
  {
    id: 2,
    inventoryItemId: 2,
    itemName: 'Queso mozzarella',
    branchId: 1,
    branchName: 'Miraflores',
    type: 'RECIPE_CONSUMPTION',
    quantityChange: -1.5,
    stockBefore: 5.5,
    stockAfter: 4,
    unitCost: 38,
    totalCost: 57,
    reference: 'Consumo por pedido #501',
    notes: 'Salida automática por receta',
    productName: 'Pizza familiar',
    orderCode: 'ORD-501',
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
];

const purchaseReceipts: PurchaseReceiptSummary[] = [
  {
    id: 1,
    branchId: 1,
    branchName: 'Miraflores',
    supplier: 'Carnes del Pacifico',
    reference: 'COMP-2401',
    invoiceNo: 'A-102',
    totalAmount: 372,
    createdAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    lines: [{ inventoryItemId: 1, itemName: 'Lomo fino', quantity: 6, unitCost: 62, totalCost: 372 }],
  },
];

const wasteRecords: WasteRecordSummary[] = [
  {
    id: 1,
    branchId: 1,
    branchName: 'Miraflores',
    inventoryItemId: 2,
    itemName: 'Queso mozzarella',
    quantity: 0.25,
    reasonType: 'KITCHEN',
    reference: 'Merma por corte',
    notes: 'Producción de pizza',
    createdAt: new Date(Date.now() - 4 * 3600000).toISOString(),
  },
];

const customers: Customer[] = [
  { id: 1, name: 'Andrea Paredes', segment: 'Frecuente', points: 1240, creditLimit: 300, creditUsed: 80, lastVisit: '2026-07-21', phone: '+51 999 401 100' },
  { id: 2, name: 'Carlos Vera', segment: 'Corporativo', points: 860, creditLimit: 800, creditUsed: 320, lastVisit: '2026-07-20', phone: '+51 999 401 101' },
  { id: 3, name: 'Valeria Huaman', segment: 'VIP', points: 1920, creditLimit: 1200, creditUsed: 210, lastVisit: '2026-07-19', phone: '+51 999 401 102' },
];

const deliveryOrders: DeliveryOrder[] = [
  { id: 1, code: 'DLV-9001', customerName: 'Andrea Paredes', district: 'Miraflores', eta: '14 min', driver: 'Miguel Solis', status: 'ON_ROUTE', total: 96 },
  { id: 2, code: 'DLV-9002', customerName: 'Paola Valencia', district: 'San Borja', eta: 'Pendiente', driver: 'Sin asignar', status: 'PENDING', total: 74 },
  { id: 3, code: 'DLV-9003', customerName: 'Jose Ponce', district: 'Barranco', eta: '6 min', driver: 'Kevin Rivas', status: 'ASSIGNED', total: 132 },
];

const cashMovements: CashMovement[] = [
  { id: 1, type: 'OPENING', reference: 'Apertura turno manana', amount: 500, method: 'CASH', createdAt: '08:00' },
  { id: 2, type: 'SALE', reference: 'Pago mixto ORD-480', amount: 148, method: 'MIXED', createdAt: '12:11' },
  { id: 3, type: 'EXPENSE', reference: 'Compra urgente de hielo', amount: 42, method: 'CASH', createdAt: '15:24' },
  { id: 4, type: 'WITHDRAWAL', reference: 'Retiro de seguridad', amount: 700, method: 'CASH', createdAt: '18:10' },
];

const reportSummary: ReportSummary = {
  period: 'Julio 2026',
  sales: 438200,
  profit: 132640,
  averageTicket: 81,
  bestBranch: 'Miraflores',
  bestSeller: 'Lomo saltado premium',
};

export const restaurantSnapshot: RestaurantSnapshot = {
  brand: {
    name: 'Restaurante',
    slogan: 'Operacion centralizada para restaurantes exigentes',
    currencyCode: 'GTQ',
    currencySymbol: 'Q',
  },
  branches,
  menuCategories,
  menuProducts,
  dashboardMetrics,
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
  reportSummary,
  cashShift: {
    id: 1,
    branchId: branches[0]?.id ?? 1,
    isOpen: true,
    openedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    openedBy: 'Cajero',
    openingAmount: 500,
  },
  cashMovements,
};

export function sanitizeUser(user: AuthUser) {
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

export function findUserByEmail(email: string) {
  return users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}
