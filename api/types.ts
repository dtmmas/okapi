export type RoleCode =
  | 'ADMIN'
  | 'SUPERVISOR'
  | 'CASHIER'
  | 'WAITER'
  | 'KITCHEN'
  | 'BAR'
  | 'PASTRY'
  | 'DELIVERY';

export type PermissionCode =
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

export type OrderType = 'DINE_IN' | 'TAKE_OUT' | 'DELIVERY';
export type OrderStatus =
  | 'OPEN'
  | 'IN_PREPARATION'
  | 'READY'
  | 'SERVED'
  | 'PAID'
  | 'CANCELLED';

export type TableStatus = 'FREE' | 'OCCUPIED' | 'RESERVED';
export type KitchenStatus = 'PENDING' | 'IN_PREPARATION' | 'READY' | 'DELIVERED';
export type PreparationStation = 'KITCHEN' | 'BAR' | 'PASTRY';
export type DeliveryStatus = 'PENDING' | 'ASSIGNED' | 'ON_ROUTE' | 'DELIVERED';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED';
export type InventoryMovementType =
  | 'PURCHASE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'RECIPE_CONSUMPTION'
  | 'SUBRECIPE_PRODUCTION'
  | 'SUBRECIPE_CONSUMPTION'
  | 'WASTE';
export type InventoryItemType = 'RAW' | 'SUBRECIPE';
export type WasteReasonType = 'PRODUCTION' | 'KITCHEN' | 'EXPIRED' | 'DAMAGE' | 'OTHER';

export type MenuCategory = {
  id: number;
  parentId?: number | null;
  name: string;
  color?: string;
  showInPos?: boolean | null;
  station: PreparationStation;
};

export type MenuProduct = {
  id: number;
  categoryId: number | null;
  name: string;
  sku?: string | null;
  imageUrl?: string | null;
  price: number;
  isPrepared: boolean;
  station: PreparationStation;
};

export type RecipeIngredient = {
  inventoryItemId: number;
  name: string;
  itemType: InventoryItemType;
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

export type Branch = {
  id: number;
  tenantId: number;
  name: string;
  city: string;
  address: string;
  phone: string;
  isActive: boolean;
};

export type AuthUser = {
  id: number;
  tenantId: number;
  branchId: number;
  role: RoleCode;
  permissions: PermissionCode[];
  name: string;
  email: string;
  passwordHash: string;
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
  method: PaymentMethod;
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
  summary: ReportSummary;
  salesTrend: SalesPoint[];
  topProducts: ProductPerformance[];
  paymentMix: ReportPaymentMixItem[];
  orderCount: number;
  customerCount: number;
  availableUsers: ReportUserOption[];
  appliedFilters: Required<ReportFilters>;
};

export type RestaurantTable = {
  id: number;
  branchId?: number | null;
  code: string;
  capacity: number;
  area: string;
  status: TableStatus;
  currentOrder?: string;
};

export type OrderItem = {
  id: number;
  product: string;
  quantity: number;
  modifier?: string;
  notes?: string;
  paid?: boolean;
};

export type OrderPayment = {
  id: number;
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
  appliedItemIds?: number[];
  createdAt: string;
};

export type Order = {
  id: number;
  code: string;
  branchId: number;
  type: OrderType;
  status: OrderStatus;
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
  items: OrderItem[];
  payments: OrderPayment[];
};

export type KitchenOrder = {
  id: number;
  orderId: number;
  station: PreparationStation;
  tableCode?: string;
  code: string;
  customerName: string;
  area: string;
  status: KitchenStatus;
  startedAt: string;
  elapsedMinutes: number;
  priority: 'ALTA' | 'MEDIA' | 'BAJA';
  items: Array<{
    id: number;
    product: string;
    quantity: number;
    notes?: string;
    status: KitchenStatus;
  }>;
};

export type InventoryItem = {
  id: number;
  branchId: number;
  name: string;
  itemType: InventoryItemType;
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
  id: number;
  inventoryItemId: number;
  itemName: string;
  branchId: number;
  branchName: string;
  type: InventoryMovementType;
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
  reasonType: WasteReasonType;
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

export type DeliveryOrder = {
  id: number;
  code: string;
  customerName: string;
  district: string;
  eta: string;
  driver: string;
  status: DeliveryStatus;
  total: number;
};

export type ReportSummary = {
  period: string;
  sales: number;
  profit: number;
  averageTicket: number;
  bestBranch: string;
  bestSeller: string;
};

export type CashMovement = {
  id: number;
  type: 'OPENING' | 'SALE' | 'ENTRY' | 'EXPENSE' | 'WITHDRAWAL';
  reference: string;
  amount: number;
  method: PaymentMethod;
  createdAt: string;
  orderCode?: string;
  customerName?: string;
  tableCode?: string;
  paymentReference?: string | null;
  orderTotal?: number;
  orderPaidAmount?: number;
  orderPendingAmount?: number;
  orderItems?: Array<{
    quantity: number;
    product: string;
    notes?: string;
    lineTotal?: number | null;
  }>;
  orderPayments?: Array<{
    method: PaymentMethod;
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
    currencyCode: string;
    currencySymbol: string;
    logoData?: string | null;
  };
  branches: Branch[];
  menuCategories: MenuCategory[];
  menuProducts: MenuProduct[];
  dashboardMetrics: DashboardMetric[];
  salesTrend: SalesPoint[];
  topProducts: ProductPerformance[];
  activeOrders: Order[];
  tables: RestaurantTable[];
  kitchenOrders: KitchenOrder[];
  barOrders: KitchenOrder[];
  pastryOrders: KitchenOrder[];
  inventoryItems: InventoryItem[];
  inventoryMovements: InventoryMovement[];
  purchaseReceipts: PurchaseReceiptSummary[];
  wasteRecords: WasteRecordSummary[];
  customers: Customer[];
  deliveryOrders: DeliveryOrder[];
  reportSummary: ReportSummary;
  cashShift: CashShiftSummary | null;
  cashMovements: CashMovement[];
};
