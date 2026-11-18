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
  ProductRecipe,
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
  { id: 1, tenantId: 1, name: 'Jacaltenango', city: 'Jacaltenango', address: 'Centro de Jacaltenango, Huehuetenango', phone: '+502 5555 0101', isActive: true },
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
      { id: 1, product: 'Lomo saltado premium', quantity: 2, notes: '1 sin cebolla' },
      { id: 2, product: 'Chicha morada', quantity: 2 },
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
      { id: 3, product: 'Arroz con mariscos', quantity: 1 },
      { id: 4, product: 'Inka Kola 1.5L', quantity: 1 },
    ],
    payments: [],
  },
  {
    id: 503,
    code: 'ORD-503',
    branchId: 1,
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
      { id: 5, product: 'Hamburguesa parrillera', quantity: 2, modifier: 'extra queso' },
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
    items: [
      { id: 101, product: 'Lomo saltado premium', quantity: 2, status: 'IN_PREPARATION' },
      { id: 102, product: 'Papas nativas', quantity: 1, status: 'IN_PREPARATION' },
    ],
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
    items: [{ id: 103, product: 'Causa acevichada', quantity: 1, status: 'PENDING' }],
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
    items: [{ id: 201, product: 'Pisco sour autor', quantity: 2, status: 'READY' }],
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
    items: [{ id: 301, product: 'Cheesecake lucuma', quantity: 1, status: 'PENDING' }],
  },
];

const menuCategories: RestaurantSnapshot['menuCategories'] = [
  { id: 1, parentId: null, name: 'Platillos', color: '#fb7185', station: 'KITCHEN' },
  { id: 2, parentId: null, name: 'Bebidas', color: '#38bdf8', station: 'BAR' },
  { id: 3, parentId: null, name: 'Postres', color: '#fbbf24', station: 'PASTRY' },
  { id: 4, parentId: 1, name: 'Platos fuertes', color: '#fb7185', station: 'KITCHEN' },
  { id: 5, parentId: 2, name: 'Bebidas sin alcohol', color: '#38bdf8', station: 'BAR' },
  { id: 6, parentId: 3, name: 'Postres', color: '#fbbf24', station: 'PASTRY' },
];

const menuProducts: RestaurantSnapshot['menuProducts'] = [
  {
    id: 1,
    categoryId: 4,
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
    categoryId: 5,
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
    categoryId: 6,
    name: 'Cheesecake lucuma',
    sku: 'POS-001',
    imageUrl:
      'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20dessert%20photography%20of%20a%20lucuma%20cheesecake%20slice%20on%20a%20ceramic%20plate%2C%20soft%20lighting%2C%20crumb%20base%2C%20creamy%20texture%2C%20restaurant%20style%2C%20high%20detail&image_size=landscape_4_3',
    price: 25,
    isPrepared: true,
    station: 'PASTRY',
  },
  {
    id: 4,
    categoryId: 4,
    name: 'Causa acevichada',
    sku: 'ENT-001',
    imageUrl:
      'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20food%20photography%20of%20Peruvian%20causa%20acevichada%20served%20with%20ceviche%20topping%2C%20yellow%20potato%20layers%2C%20avocado%2C%20microgreens%2C%20restaurant%20lighting%2C%20high%20detail&image_size=landscape_4_3',
    price: 26,
    isPrepared: true,
    station: 'KITCHEN',
  },
  {
    id: 5,
    categoryId: 4,
    name: 'Pollo al limon parrillero',
    sku: 'POL-001',
    imageUrl:
      'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20food%20photography%20of%20grilled%20lemon%20chicken%20served%20with%20roasted%20potatoes%20and%20vegetables%2C%20restaurant%20plating%2C%20warm%20lighting%2C%20high%20detail&image_size=landscape_4_3',
    price: 34,
    isPrepared: true,
    station: 'KITCHEN',
  },
  {
    id: 6,
    categoryId: 4,
    name: 'Fettuccine Alfredo con pollo',
    sku: 'PAS-001',
    imageUrl:
      'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20food%20photography%20of%20fettuccine%20alfredo%20with%20grilled%20chicken%2C%20parmesan%20cheese%2C%20creamy%20sauce%2C%20restaurant%20plating%2C%20high%20detail&image_size=landscape_4_3',
    price: 38,
    isPrepared: true,
    station: 'KITCHEN',
  },
  {
    id: 7,
    categoryId: 5,
    name: 'Limonada con hierbabuena',
    sku: 'BEB-002',
    imageUrl:
      'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20beverage%20photography%20of%20mint%20lemonade%20with%20ice%2C%20fresh%20mint%20leaves%2C%20lemon%20slices%2C%20glass%20condensation%2C%20studio%20lighting%2C%20high%20detail&image_size=landscape_4_3',
    price: 10,
    isPrepared: true,
    station: 'BAR',
  },
  {
    id: 8,
    categoryId: 6,
    name: 'Brownie tibio con helado',
    sku: 'POS-002',
    imageUrl:
      'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20dessert%20photography%20of%20warm%20brownie%20with%20vanilla%20ice%20cream%2C%20chocolate%20sauce%2C%20restaurant%20plating%2C%20soft%20lighting%2C%20high%20detail&image_size=landscape_4_3',
    price: 21,
    isPrepared: true,
    station: 'PASTRY',
  },
];

const inventoryItems: InventoryItem[] = [
  { id: 1, branchId: 1, itemType: 'RAW', name: 'Lomo fino', branch: 'Jacaltenango', stock: 18, minStock: 12, unit: 'kg', unitCost: 62, stockValue: 1116, supplier: 'Carnes del Pacifico', status: 'OK' },
  { id: 2, branchId: 1, itemType: 'RAW', name: 'Papa amarilla', branch: 'Jacaltenango', stock: 35, minStock: 14, unit: 'kg', unitCost: 9, stockValue: 315, supplier: 'Agro Andino', status: 'OK' },
  { id: 3, branchId: 1, itemType: 'RAW', name: 'Cebolla roja', branch: 'Jacaltenango', stock: 12, minStock: 5, unit: 'kg', unitCost: 6.5, stockValue: 78, supplier: 'Huerta Central', status: 'OK' },
  { id: 4, branchId: 1, itemType: 'RAW', name: 'Tomate roma', branch: 'Jacaltenango', stock: 10, minStock: 5, unit: 'kg', unitCost: 7.2, stockValue: 72, supplier: 'Huerta Central', status: 'OK' },
  { id: 5, branchId: 1, itemType: 'RAW', name: 'Salsa de soya', branch: 'Jacaltenango', stock: 8, minStock: 3, unit: 'lt', unitCost: 18, stockValue: 144, supplier: 'Distribuidora Oriente', status: 'OK' },
  { id: 6, branchId: 1, itemType: 'RAW', name: 'Culantro fresco', branch: 'Jacaltenango', stock: 2.5, minStock: 1, unit: 'kg', unitCost: 14, stockValue: 35, supplier: 'Huerta Central', status: 'OK' },
  { id: 7, branchId: 1, itemType: 'RAW', name: 'Limon persa', branch: 'Jacaltenango', stock: 8, minStock: 4, unit: 'kg', unitCost: 11, stockValue: 88, supplier: 'Frutas Selectas', status: 'OK' },
  { id: 8, branchId: 1, itemType: 'RAW', name: 'Aji amarillo pasta', branch: 'Jacaltenango', stock: 5, minStock: 2, unit: 'kg', unitCost: 24, stockValue: 120, supplier: 'Andes Food Service', status: 'OK' },
  { id: 9, branchId: 1, itemType: 'RAW', name: 'Pechuga de pollo', branch: 'Jacaltenango', stock: 16, minStock: 8, unit: 'kg', unitCost: 31, stockValue: 496, supplier: 'Avicola La Granja', status: 'OK' },
  { id: 10, branchId: 1, itemType: 'RAW', name: 'Fettuccine', branch: 'Jacaltenango', stock: 9, minStock: 3, unit: 'kg', unitCost: 19, stockValue: 171, supplier: 'Pastas del Chef', status: 'OK' },
  { id: 11, branchId: 1, itemType: 'RAW', name: 'Crema fresca', branch: 'Jacaltenango', stock: 6, minStock: 2, unit: 'lt', unitCost: 22, stockValue: 132, supplier: 'Lacteos Sierra', status: 'OK' },
  { id: 12, branchId: 1, itemType: 'RAW', name: 'Queso parmesano', branch: 'Jacaltenango', stock: 4, minStock: 1.5, unit: 'kg', unitCost: 52, stockValue: 208, supplier: 'Lacteos Sierra', status: 'OK' },
  { id: 13, branchId: 1, itemType: 'RAW', name: 'Harina', branch: 'Jacaltenango', stock: 14, minStock: 5, unit: 'kg', unitCost: 5.2, stockValue: 72.8, supplier: 'Molinos Premium', status: 'OK' },
  { id: 14, branchId: 1, itemType: 'RAW', name: 'Huevo', branch: 'Jacaltenango', stock: 96, minStock: 36, unit: 'unidad', unitCost: 0.45, stockValue: 43.2, supplier: 'Avicola La Granja', status: 'OK' },
  { id: 15, branchId: 1, itemType: 'RAW', name: 'Azucar', branch: 'Jacaltenango', stock: 18, minStock: 6, unit: 'kg', unitCost: 6.8, stockValue: 122.4, supplier: 'Central Mayorista', status: 'OK' },
  { id: 16, branchId: 1, itemType: 'RAW', name: 'Queso crema', branch: 'Jacaltenango', stock: 7, minStock: 3, unit: 'kg', unitCost: 41, stockValue: 287, supplier: 'Lacteos Sierra', status: 'OK' },
  { id: 17, branchId: 1, itemType: 'RAW', name: 'Galleta vainilla', branch: 'Jacaltenango', stock: 11, minStock: 4, unit: 'kg', unitCost: 12, stockValue: 132, supplier: 'Reposteria Supply', status: 'OK' },
  { id: 18, branchId: 1, itemType: 'RAW', name: 'Pulpa de lucuma', branch: 'Jacaltenango', stock: 5, minStock: 2, unit: 'kg', unitCost: 28, stockValue: 140, supplier: 'Frutas Selectas', status: 'OK' },
  { id: 19, branchId: 1, itemType: 'RAW', name: 'Maiz morado', branch: 'Jacaltenango', stock: 8, minStock: 3, unit: 'kg', unitCost: 13, stockValue: 104, supplier: 'Andes Food Service', status: 'OK' },
  { id: 20, branchId: 1, itemType: 'RAW', name: 'Piña golden', branch: 'Jacaltenango', stock: 14, minStock: 6, unit: 'kg', unitCost: 8.5, stockValue: 119, supplier: 'Frutas Selectas', status: 'OK' },
  { id: 21, branchId: 1, itemType: 'RAW', name: 'Canela en raja', branch: 'Jacaltenango', stock: 1.2, minStock: 0.4, unit: 'kg', unitCost: 36, stockValue: 43.2, supplier: 'Especias del Sol', status: 'OK' },
  { id: 22, branchId: 1, itemType: 'SUBRECIPE', name: 'Salsa huancaina base', branch: 'Jacaltenango', stock: 4, minStock: 1.5, unit: 'lt', unitCost: 24, stockValue: 96, supplier: 'Produccion interna', status: 'OK' },
  { id: 23, branchId: 1, itemType: 'RAW', name: 'Papa amarilla', branch: 'Jacaltenango', stock: 26, minStock: 14, unit: 'kg', unitCost: 9.4, stockValue: 244.4, supplier: 'Agro Andino', status: 'OK' },
  { id: 24, branchId: 1, itemType: 'RAW', name: 'Pisco quebranta', branch: 'Jacaltenango', stock: 6, minStock: 10, unit: 'botellas', unitCost: 85, stockValue: 510, supplier: 'Destileria Sur', status: 'LOW' },
];

const inventoryItemById = new Map(inventoryItems.map((item) => [item.id, item]));

function buildMockRecipe(
  productId: number,
  branchId: number,
  ingredients: Array<{ inventoryItemId: number; quantity: number }>,
): ProductRecipe {
  const recipeIngredients = ingredients.map(({ inventoryItemId, quantity }) => {
    const item = inventoryItemById.get(inventoryItemId);

    if (!item) {
      throw new Error(`No existe el insumo demo ${inventoryItemId}.`);
    }

    return {
      inventoryItemId,
      name: item.name,
      itemType: item.itemType,
      unit: item.unit,
      quantity,
      stock: item.stock,
      unitCost: item.unitCost,
    };
  });

  return {
    productId,
    branchId,
    estimatedCost: Number(
      recipeIngredients.reduce((sum, item) => sum + item.quantity * item.unitCost, 0).toFixed(4),
    ),
    ingredients: recipeIngredients,
  };
}

const mockProductRecipes: ProductRecipe[] = [
  buildMockRecipe(1, 1, [
    { inventoryItemId: 1, quantity: 0.25 },
    { inventoryItemId: 2, quantity: 0.3 },
    { inventoryItemId: 3, quantity: 0.08 },
    { inventoryItemId: 4, quantity: 0.1 },
    { inventoryItemId: 5, quantity: 0.03 },
    { inventoryItemId: 6, quantity: 0.01 },
  ]),
  buildMockRecipe(2, 1, [
    { inventoryItemId: 19, quantity: 0.12 },
    { inventoryItemId: 20, quantity: 0.1 },
    { inventoryItemId: 21, quantity: 0.005 },
    { inventoryItemId: 15, quantity: 0.08 },
  ]),
  buildMockRecipe(3, 1, [
    { inventoryItemId: 16, quantity: 0.12 },
    { inventoryItemId: 17, quantity: 0.08 },
    { inventoryItemId: 18, quantity: 0.09 },
    { inventoryItemId: 14, quantity: 1 },
    { inventoryItemId: 15, quantity: 0.03 },
  ]),
  buildMockRecipe(4, 1, [
    { inventoryItemId: 2, quantity: 0.25 },
    { inventoryItemId: 8, quantity: 0.035 },
    { inventoryItemId: 7, quantity: 0.03 },
    { inventoryItemId: 22, quantity: 0.04 },
    { inventoryItemId: 6, quantity: 0.005 },
  ]),
  buildMockRecipe(5, 1, [
    { inventoryItemId: 9, quantity: 0.25 },
    { inventoryItemId: 7, quantity: 0.04 },
    { inventoryItemId: 2, quantity: 0.18 },
    { inventoryItemId: 6, quantity: 0.005 },
  ]),
  buildMockRecipe(6, 1, [
    { inventoryItemId: 9, quantity: 0.18 },
    { inventoryItemId: 10, quantity: 0.14 },
    { inventoryItemId: 11, quantity: 0.1 },
    { inventoryItemId: 12, quantity: 0.035 },
  ]),
  buildMockRecipe(7, 1, [
    { inventoryItemId: 7, quantity: 0.12 },
    { inventoryItemId: 15, quantity: 0.03 },
    { inventoryItemId: 6, quantity: 0.003 },
  ]),
  buildMockRecipe(8, 1, [
    { inventoryItemId: 13, quantity: 0.06 },
    { inventoryItemId: 14, quantity: 1 },
    { inventoryItemId: 15, quantity: 0.04 },
  ]),
];

const inventoryMovements: InventoryMovement[] = [
  {
    id: 1,
    inventoryItemId: 1,
    itemName: 'Lomo fino',
    branchId: 1,
    branchName: 'Jacaltenango',
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
    branchName: 'Jacaltenango',
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
    branchName: 'Jacaltenango',
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
    branchName: 'Jacaltenango',
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
  { id: 1, code: 'DLV-9001', customerName: 'Andrea Paredes', district: 'Jacaltenango', eta: '14 min', driver: 'Miguel Solis', status: 'ON_ROUTE', total: 96 },
  { id: 2, code: 'DLV-9002', customerName: 'Paola Valencia', district: 'San Borja', eta: 'Pendiente', driver: 'Sin asignar', status: 'PENDING', total: 74 },
  { id: 3, code: 'DLV-9003', customerName: 'Jose Ponce', district: 'Jacaltenango', eta: '6 min', driver: 'Kevin Rivas', status: 'ASSIGNED', total: 132 },
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
  bestBranch: 'Jacaltenango',
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

export function getMockProductRecipe(productId: number, branchId: number) {
  const recipe = mockProductRecipes.find((item) => item.productId === productId) ?? null;

  if (!recipe) {
    return {
      productId,
      branchId,
      estimatedCost: 0,
      ingredients: [],
    } satisfies ProductRecipe;
  }

  return {
    ...recipe,
    branchId,
  } satisfies ProductRecipe;
}
