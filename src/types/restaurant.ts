export type RoleCode =
  | 'KIOSK'
  | 'ADMIN'
  | 'SUPERVISOR'
  | 'CASHIER'
  | 'WAITER'
  | 'KITCHEN'
  | 'BAR'
  | 'PASTRY'
  | 'DELIVERY';

export type PermissionCode =
  | 'KIOSK_ONLY'
  | 'DASHBOARD_VIEW'
  | 'POS_USE'
  | 'TABLES_MANAGE'
  | 'KITCHEN_UPDATE'
  | 'CASH_MANAGE'
  | 'INVENTORY_MANAGE'
  | 'CUSTOMERS_MANAGE'
  | 'DELIVERY_MANAGE'
  | 'REPORTS_VIEW'
  | 'SETTINGS_MANAGE';

export type PermissionMode = 'ROLE' | 'CUSTOM';
export type PermissionCategoryCode = 'GENERAL' | 'OPERACION' | 'CAJA' | 'GESTION' | 'CONFIGURACION';

export type AuthUser = {
  id: number;
  tenantId: number;
  branchId: number;
  role: RoleCode;
  permissions: PermissionCode[];
  name: string;
  email: string;
};

export type UserSummary = {
  id: number;
  tenantId: number;
  branchId: number | null;
  role: RoleCode;
  permissions: PermissionCode[];
  permissionMode: PermissionMode;
  customPermissions: PermissionCode[];
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
};

export type RoleProfileSummary = {
  role: RoleCode;
  name: string;
  description: string;
  sortOrder: number;
  permissions: PermissionCode[];
};

export type PermissionCatalogItem = {
  code: PermissionCode;
  label: string;
  description: string;
  category: PermissionCategoryCode;
  categoryLabel: string;
  categoryOrder: number;
  itemOrder: number;
};

export type RolesConfiguration = {
  roles: RoleProfileSummary[];
  permissionCatalog: PermissionCatalogItem[];
};

export type DashboardMetric = {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
};

export type SalesPoint = {
  label: string;
  total: number;
};

export type ProductPerformance = {
  id: number;
  name: string;
  sold: number;
  revenue: number;
  margin: string;
};

export type ReportUserOption = {
  id: number;
  name: string;
  role: RoleCode;
};

export type ReportPaymentMixItem = {
  method: 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED';
  total: number;
  share: number;
};

export type ReportFilters = {
  dateFrom?: string | null;
  dateTo?: string | null;
  branchId?: number | null;
  userId?: number | null;
};

export type ReportsSummary = {
  activity: Array<{ id: number; branchId: number; actorName: string; actorRole: RoleCode; action: string; reference: string; createdAt: string }>;
  summary: RestaurantSnapshot['reportSummary'];
  salesTrend: SalesPoint[];
  topProducts: ProductPerformance[];
  paymentMix: ReportPaymentMixItem[];
  orderCount: number;
  customerCount: number;
  availableUsers: ReportUserOption[];
  appliedFilters: {
    dateFrom: string | null;
    dateTo: string | null;
    branchId: number | null;
    userId: number | null;
  };
};

export type RestaurantOrder = {
  openedByName?: string | null;
  id: number;
  code: string;
  branchId: number;
  type: string;
  status: string;
  billRequestedAt?: string | null;
  readyForPayment?: boolean;
  customerName: string;
  area: string;
  total: number;
  channel: string;
  tableCode?: string;
  assignedTo?: string;
  paidAmount: number;
  pendingAmount: number;
  paymentCount: number;
  items: Array<{
    id: number;
    product: string;
    quantity: number;
    modifier?: string;
    sentByName?: string | null;
    notes?: string;
    paid?: boolean;
  }>;
  payments: Array<{
    collectedByName?: string | null;
    id: number;
    method: 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED';
    amount: number;
    reference?: string | null;
    appliedItemIds?: number[];
    createdAt: string;
  }>;
};

export type TableArea = {
  id: number;
  name: string;
  sortOrder: number;
};

export type RestaurantTable = {
  id: number;
  branchId?: number | null;
  code: string;
  capacity: number;
  area: string;
  sortOrder?: number;
  status: 'FREE' | 'OCCUPIED' | 'RESERVED';
  currentOrder?: string;
  counterHold?: {
    orderId: number;
    code: string;
    customerName: string;
  };
  reservation?: import('../../shared/table-reservation').TableReservationInfo;
};

export type UnassignedCounterOrder = {
  id: number;
  code: string;
  branchId: number;
  customerName: string;
  total: number;
  createdAt: string;
};

export type KitchenOrder = {
  openedByName?: string | null;
  id: number;
  orderId: number;
  station: 'KITCHEN' | 'BAR' | 'PASTRY';
  tableCode?: string;
  code: string;
  customerName: string;
  area: string;
  status: 'PENDING' | 'IN_PREPARATION' | 'READY' | 'DELIVERED';
  startedAt: string;
  elapsedMinutes: number;
  priority: 'ALTA' | 'MEDIA' | 'BAJA';
  items: Array<{
    sentByName?: string | null;
    id: number;
    product: string;
    quantity: number;
    notes?: string;
    status: 'PENDING' | 'IN_PREPARATION' | 'READY' | 'DELIVERED';
  }>;
};

export type InventoryItem = {
  id: number;
  branchId: number;
  name: string;
  itemType: 'RAW' | 'SUBRECIPE';
  branch: string;
  stock: number;
  minStock: number;
  unit: string;
  unitCost: number;
  stockValue: number;
  supplier: string;
  status: 'OK' | 'LOW';
};

export type SubRecipeFormula = {
  inventoryItemId: number;
  branchId: number;
  yieldName: string;
  estimatedCost: number;
  components: RecipeIngredient[];
};

export type InventoryMovement = {
  actorName?: string;
  id: number;
  inventoryItemId: number;
  itemName: string;
  branchId: number;
  branchName: string;
  type: 'PURCHASE' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'RECIPE_CONSUMPTION' | 'WASTE';
  quantityChange: number;
  stockBefore: number;
  stockAfter: number;
  unitCost: number;
  totalCost: number;
  reference: string;
  notes?: string | null;
  productName?: string | null;
  orderCode?: string | null;
  createdAt: string;
};

export type PurchaseReceiptSummary = {
  id: number;
  branchId: number;
  branchName: string;
  supplier: string;
  reference: string;
  invoiceNo?: string | null;
  totalAmount: number;
  createdAt: string;
  lines: Array<{
    inventoryItemId: number;
    itemName: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
};

export type WasteRecordSummary = {
  id: number;
  branchId: number;
  branchName: string;
  inventoryItemId: number;
  itemName: string;
  quantity: number;
  reasonType: 'PRODUCTION' | 'KITCHEN' | 'EXPIRED' | 'DAMAGE' | 'OTHER';
  reference: string;
  notes?: string | null;
  createdAt: string;
};

export type Customer = {
  id: number;
  name: string;
  segment: string;
  points: number;
  creditLimit: number;
  creditUsed: number;
  lastVisit: string;
  phone?: string | null;
  email?: string | null;
};

export type MenuCategory = {
  id: number;
  parentId?: number | null;
  name: string;
  color?: string;
  showInPos?: boolean | null;
  station: 'KITCHEN' | 'BAR' | 'PASTRY';
};

export type MenuProduct = {
  id: number;
  categoryId: number | null;
  name: string;
  sku?: string | null;
  imageUrl?: string | null;
  price: number;
  isPrepared: boolean;
  station: 'KITCHEN' | 'BAR' | 'PASTRY';
};

export type RecipeIngredient = {
  inventoryItemId: number;
  name: string;
  itemType: 'RAW' | 'SUBRECIPE';
  unit: string;
  quantity: number;
  stock: number;
  unitCost: number;
};

export type ProductRecipe = {
  productId: number;
  branchId: number;
  estimatedCost: number;
  ingredients: RecipeIngredient[];
};

export type DeliveryOrder = {
  id: number;
  code: string;
  customerName: string;
  district: string;
  eta: string;
  driver: string;
  status: 'PENDING' | 'ASSIGNED' | 'ON_ROUTE' | 'DELIVERED';
  total: number;
};

export type CashMovement = {
  actorName?: string | null;
  openedByName?: string | null;
  id: number;
  type: 'OPENING' | 'SALE' | 'ENTRY' | 'EXPENSE' | 'WITHDRAWAL';
  reference: string;
  amount: number;
  method: 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED';
  createdAt: string;
  orderCode?: string;
  customerName?: string;
  tableCode?: string;
  orderChannel?: string;
  paymentReference?: string | null;
  orderTotal?: number;
  orderPaidAmount?: number;
  orderPendingAmount?: number;
  orderItems?: Array<{
    sentByName?: string | null;
    quantity: number;
    product: string;
    notes?: string;
    lineTotal?: number | null;
  }>;
  orderPayments?: Array<{
    collectedByName?: string | null;
    method: 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED';
    amount: number;
    reference?: string | null;
    createdAt: string;
  }>;
};

export type CashShiftSummary = {
  id: number;
  branchId: number;
  isOpen: boolean;
  openedAt: string;
  openedBy: string;
  openingAmount: number;
};

export type CashShiftControlItem = {
  id: number;
  branchId: number;
  branchName: string;
  openedBy: string;
  openedByRole: string;
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  closingAmount: number | null;
  movementCount: number;
  isOpen: boolean;
};

export type RestaurantSnapshot = {
  brand: {
    name: string;
    slogan: string;
    stationLayout?: string;
    address?: string;
    phone?: string;
    currencyCode: string;
    currencySymbol: string;
    logoData?: string | null;
  };
  branches: Array<{
    id: number;
    name: string;
    city: string;
    address: string;
    phone: string;
    isActive: boolean;
  }>;
  menuCategories: MenuCategory[];
  menuProducts: MenuProduct[];
  dashboardMetrics: DashboardMetric[];
  salesTrend: SalesPoint[];
  topProducts: ProductPerformance[];
  activeOrders: RestaurantOrder[];
  unassignedCounterOrders: UnassignedCounterOrder[];
  tables: RestaurantTable[];
  tableAreas?: TableArea[];
  kitchenOrders: KitchenOrder[];
  barOrders: KitchenOrder[];
  pastryOrders: KitchenOrder[];
  inventoryItems: InventoryItem[];
  inventoryMovements: InventoryMovement[];
  purchaseReceipts: PurchaseReceiptSummary[];
  wasteRecords: WasteRecordSummary[];
  customers: Customer[];
  deliveryOrders: DeliveryOrder[];
  reportSummary: {
    period: string;
    sales: number;
    profit: number;
    averageTicket: number;
    bestBranch: string;
    bestSeller: string;
  };
  cashShift: CashShiftSummary | null;
  cashMovements: CashMovement[];
};
