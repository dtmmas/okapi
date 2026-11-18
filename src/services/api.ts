import type {
  AuthUser,
  CashShiftControlItem,
  InventoryItem,
  InventoryMovement,
  PurchaseReceiptSummary,
  ProductRecipe,
  ReportFilters,
  ReportsSummary,
  RestaurantSnapshot,
  RoleProfileSummary,
  RolesConfiguration,
  SubRecipeFormula,
  UserSummary,
  WasteRecordSummary,
} from '@/types/restaurant';

const AUTH_TOKEN_KEY = 'restaurant-gt-token';

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data: T;
};

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const headers = new Headers(options?.headers);
  const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;

  if (!headers.has('Content-Type') && options?.body && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const rawBody = await response.text();
  const payload = (rawBody ? (JSON.parse(rawBody) as ApiEnvelope<T> & { errors?: unknown }) : null) as
    | (ApiEnvelope<T> & { errors?: unknown })
    | null;

  if (!response.ok || !payload?.success) {
    const message =
      payload?.message ||
      (rawBody ? `La solicitud falló (${response.status}).` : `La solicitud falló (${response.status}) sin respuesta del servidor.`);
    throw new Error(message);
  }

  return payload.data;
}

export const authTokenKey = AUTH_TOKEN_KEY;

export function loginRequest(email: string, password: string) {
  return apiRequest<{ accessToken: string; user: AuthUser }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
  );
}

export function getCurrentUser() {
  return apiRequest<AuthUser>('/api/auth/me');
}

export function getBootstrapSnapshot() {
  return apiRequest<RestaurantSnapshot>('/api/v1/bootstrap');
}

export function getReportsSummary(filters?: ReportFilters) {
  const params = new URLSearchParams();
  if (filters?.branchId) {
    params.set('branchId', String(filters.branchId));
  }
  if (filters?.userId) {
    params.set('userId', String(filters.userId));
  }
  if (filters?.dateFrom) {
    params.set('dateFrom', filters.dateFrom);
  }
  if (filters?.dateTo) {
    params.set('dateTo', filters.dateTo);
  }

  const query = params.toString();
  return apiRequest<ReportsSummary>(`/api/v1/reports/sales${query ? `?${query}` : ''}`);
}

export function getPublicBrand() {
  return apiRequest<RestaurantSnapshot['brand']>('/api/v1/public/brand');
}

export function getBrandSettings() {
  return apiRequest<RestaurantSnapshot['brand']>('/api/v1/settings/brand');
}

export function updateBrandSettings(payload: RestaurantSnapshot['brand']) {
  return apiRequest<RestaurantSnapshot['brand']>('/api/v1/settings/brand', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function createBranch(payload: {
  name: string;
  city: string;
  address: string;
  phone: string;
  isActive?: boolean;
}) {
  return apiRequest<RestaurantSnapshot['branches'][number]>('/api/v1/branches', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateBranch(
  branchId: number,
  payload: {
    name: string;
    city: string;
    address: string;
    phone: string;
    isActive?: boolean;
  },
) {
  return apiRequest<RestaurantSnapshot['branches'][number]>(`/api/v1/branches/${branchId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteBranch(branchId: number) {
  return apiRequest<{ success: true }>(`/api/v1/branches/${branchId}`, {
    method: 'DELETE',
  });
}

export function openCashShift(payload: { openingAmount: number }) {
  return apiRequest<{ success: true }>('/api/v1/cash/open', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function closeCashShift(payload: { closingAmount: number }) {
  return apiRequest<{ success: true }>('/api/v1/cash/close', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listAdminCashShifts(filters?: {
  branchId?: number | null;
  openOnly?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  const params = new URLSearchParams();

  if (filters?.branchId) {
    params.set('branchId', String(filters.branchId));
  }
  if (filters?.openOnly) {
    params.set('openOnly', 'true');
  }
  if (filters?.dateFrom) {
    params.set('dateFrom', filters.dateFrom);
  }
  if (filters?.dateTo) {
    params.set('dateTo', filters.dateTo);
  }

  const query = params.toString();
  return apiRequest<CashShiftControlItem[]>(`/api/v1/cash/shifts${query ? `?${query}` : ''}`);
}

export function closeAdminCashShift(cashShiftId: number, payload: { closingAmount: number }) {
  return apiRequest<{ success: true }>(`/api/v1/cash/shifts/${cashShiftId}/close`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createCashMovement(payload: {
  type: 'ENTRY' | 'EXPENSE' | 'WITHDRAWAL';
  amount: number;
  reference: string;
  notes?: string | null;
}) {
  return apiRequest<{ success: true }>('/api/v1/cash/movements', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function payOrder(payload: {
  orderId: number;
  method: 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED';
  amount: number;
  receivedAmount?: number | null;
  reference?: string | null;
  proofImage?: string | null;
  appliedItemIds?: number[] | null;
}) {
  return apiRequest<{ success: true; completed: boolean; paidAmount: number; remainingAmount: number; registeredAmount: number }>(
    `/api/v1/orders/${payload.orderId}/pay`,
    {
    method: 'POST',
    body: JSON.stringify({
      method: payload.method,
      amount: payload.amount,
      receivedAmount: payload.receivedAmount ?? null,
      reference: payload.reference ?? null,
      proofImage: payload.proofImage ?? null,
      appliedItemIds: payload.appliedItemIds ?? null,
      }),
    },
  );
}

export function createOrUpdateOrder(payload: {
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
}) {
  return apiRequest('/api/v1/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function requestOrderBill(orderId: number) {
  return apiRequest<{ success: true; billRequestedAt: string }>(`/api/v1/orders/${orderId}/request-bill`, {
    method: 'POST',
  });
}

export function moveTableAccount(payload: { fromTableId: number; toTableId: number }) {
  return apiRequest('/api/v1/tables/move', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateTableStatus(payload: { tableId: number; status: 'FREE' | 'RESERVED' }) {
  return apiRequest<{ success: true }>(`/api/v1/tables/${payload.tableId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: payload.status }),
  });
}

export function updateTableReservation(payload: { tableId: number; status: 'FREE' | 'RESERVED' }) {
  return apiRequest<{ success: true }>(`/api/v1/tables/${payload.tableId}/reservation`, {
    method: 'PUT',
    body: JSON.stringify({ status: payload.status }),
  });
}

export function releaseTableReservationKeepalive(tableId: number) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token || !Number.isInteger(tableId) || tableId <= 0) {
    return;
  }

  void fetch(`/api/v1/tables/${tableId}/reservation`, {
    method: 'PUT',
    keepalive: true,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'FREE' }),
  }).catch(() => undefined);
}

export function createTable(payload: {
  branchId?: number | null;
  code: string;
  area: string;
  capacity: number;
}) {
  return apiRequest('/api/v1/tables', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateTable(
  tableId: number,
  payload: {
    branchId?: number | null;
    code: string;
    area: string;
    capacity: number;
  },
) {
  return apiRequest(`/api/v1/tables/${tableId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteTable(tableId: number) {
  return apiRequest<{ success: true }>(`/api/v1/tables/${tableId}`, {
    method: 'DELETE',
  });
}

export function updateStationStatus(payload: {
  station: 'KITCHEN' | 'BAR' | 'PASTRY';
  orderId: number;
  status: 'PENDING' | 'IN_PREPARATION' | 'READY' | 'DELIVERED';
}) {
  return apiRequest(`/api/v1/stations/${payload.station}/orders/${payload.orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: payload.status }),
  });
}

export function updateStationItemStatus(payload: {
  station: 'KITCHEN' | 'BAR' | 'PASTRY';
  orderItemId: number;
  status: 'PENDING' | 'IN_PREPARATION' | 'READY' | 'DELIVERED';
}) {
  return apiRequest(`/api/v1/stations/${payload.station}/items/${payload.orderItemId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: payload.status }),
  });
}

export function listUsers() {
  return apiRequest<UserSummary[]>('/api/v1/users');
}

export function getRolesConfiguration() {
  return apiRequest<RolesConfiguration>('/api/v1/roles');
}

export function updateRoleProfile(
  role: RoleProfileSummary['role'],
  payload: {
    name: string;
    description?: string;
    sortOrder: number;
    permissions: string[];
  },
) {
  return apiRequest<RoleProfileSummary>(`/api/v1/roles/${role}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function createUser(payload: {
  name: string;
  email: string;
  password: string;
  role: UserSummary['role'];
  branchId?: number | null;
  isActive?: boolean;
  permissionMode?: 'ROLE' | 'CUSTOM';
  customPermissions?: string[];
}) {
  return apiRequest<UserSummary>('/api/v1/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateUser(
  userId: number,
  payload: {
    name?: string;
    role?: UserSummary['role'];
    branchId?: number | null;
    isActive?: boolean;
    permissionMode?: 'ROLE' | 'CUSTOM';
    customPermissions?: string[];
  },
) {
  return apiRequest<UserSummary>(`/api/v1/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateUserPassword(userId: number, payload: { password: string }) {
  return apiRequest<{ success: true }>(`/api/v1/users/${userId}/password`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function createCategory(payload: {
  parentId?: number | null;
  name: string;
  color?: string | null;
  showInPos?: boolean | null;
  station: 'KITCHEN' | 'BAR' | 'PASTRY';
}) {
  return apiRequest('/api/v1/menu/categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateCategory(
  categoryId: number,
  payload: {
    parentId?: number | null;
    name: string;
    color?: string | null;
    showInPos?: boolean | null;
    station: 'KITCHEN' | 'BAR' | 'PASTRY';
  },
) {
  return apiRequest(`/api/v1/menu/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteCategory(categoryId: number) {
  return apiRequest<{ success: true }>(`/api/v1/menu/categories/${categoryId}`, {
    method: 'DELETE',
  });
}

export function createProduct(payload: {
  categoryId?: number | null;
  name: string;
  sku?: string | null;
  imageUrl?: string | null;
  price: number;
  isPrepared: boolean;
}) {
  return apiRequest('/api/v1/menu/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateProduct(
  productId: number,
  payload: {
    categoryId?: number | null;
    name: string;
    sku?: string | null;
    imageUrl?: string | null;
    price: number;
    isPrepared: boolean;
  },
) {
  return apiRequest(`/api/v1/menu/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteProduct(productId: number) {
  return apiRequest<{ success: true }>(`/api/v1/menu/products/${productId}`, {
    method: 'DELETE',
  });
}

export function uploadMenuImage(file: File) {
  const formData = new FormData();
  formData.append('image', file);

  return apiRequest<{ url: string; fileName: string }>('/api/v1/uploads/menu-image', {
    method: 'POST',
    body: formData,
  });
}

export function createInventoryItem(payload: {
  branchId?: number | null;
  name: string;
  itemType?: 'RAW' | 'SUBRECIPE';
  unit: string;
  stock?: number;
  minStock?: number;
  unitCost?: number;
  supplier?: string | null;
}) {
  return apiRequest<InventoryItem>('/api/v1/inventory/items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateInventoryItem(
  inventoryItemId: number,
  payload: {
    branchId?: number | null;
    name: string;
    itemType?: 'RAW' | 'SUBRECIPE';
    unit: string;
    minStock?: number;
    unitCost?: number;
    supplier?: string | null;
  },
) {
  return apiRequest<InventoryItem>(`/api/v1/inventory/items/${inventoryItemId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function adjustInventoryItem(
  inventoryItemId: number,
  payload: {
    type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
    quantity: number;
    reference: string;
    notes?: string | null;
  },
) {
  return apiRequest<InventoryMovement>(`/api/v1/inventory/items/${inventoryItemId}/adjust`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getInventoryMovements(branchId?: number | null) {
  const params = new URLSearchParams();
  if (branchId) {
    params.set('branchId', String(branchId));
  }

  return apiRequest<InventoryMovement[]>(`/api/v1/inventory/movements${params.toString() ? `?${params.toString()}` : ''}`);
}

export function getProductRecipe(productId: number, branchId?: number | null) {
  const params = new URLSearchParams();
  if (branchId) {
    params.set('branchId', String(branchId));
  }

  return apiRequest<ProductRecipe>(`/api/v1/menu/products/${productId}/recipe${params.toString() ? `?${params.toString()}` : ''}`);
}

export function saveProductRecipe(
  productId: number,
  payload: {
    branchId?: number | null;
    ingredients: Array<{ inventoryItemId: number; quantity: number }>;
  },
) {
  return apiRequest<ProductRecipe>(`/api/v1/menu/products/${productId}/recipe`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function getSubRecipeFormula(inventoryItemId: number, branchId?: number | null) {
  const params = new URLSearchParams();
  if (branchId) {
    params.set('branchId', String(branchId));
  }

  return apiRequest<SubRecipeFormula>(`/api/v1/inventory/items/${inventoryItemId}/subrecipe${params.toString() ? `?${params.toString()}` : ''}`);
}

export function saveSubRecipeFormula(
  inventoryItemId: number,
  payload: {
    branchId?: number | null;
    components: Array<{ inventoryItemId: number; quantity: number }>;
  },
) {
  return apiRequest<SubRecipeFormula>(`/api/v1/inventory/items/${inventoryItemId}/subrecipe`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function produceSubRecipe(
  inventoryItemId: number,
  payload: {
    outputQuantity: number;
    reference: string;
    notes?: string | null;
  },
) {
  return apiRequest<InventoryMovement>(`/api/v1/inventory/items/${inventoryItemId}/produce`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createPurchaseReceipt(payload: {
  branchId?: number | null;
  supplier: string;
  reference: string;
  invoiceNo?: string | null;
  notes?: string | null;
  lines: Array<{ inventoryItemId: number; quantity: number; unitCost: number }>;
}) {
  return apiRequest<PurchaseReceiptSummary>('/api/v1/inventory/purchases', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createWasteRecord(payload: {
  inventoryItemId: number;
  quantity: number;
  reasonType: 'PRODUCTION' | 'KITCHEN' | 'EXPIRED' | 'DAMAGE' | 'OTHER';
  reference: string;
  notes?: string | null;
}) {
  return apiRequest<WasteRecordSummary>('/api/v1/inventory/waste', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createCustomer(payload: {
  name: string;
  phone?: string | null;
  email?: string | null;
  points?: number;
  creditLimit?: number;
}) {
  return apiRequest('/api/v1/customers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateCustomer(
  customerId: number,
  payload: {
    name: string;
    phone?: string | null;
    email?: string | null;
    points?: number;
    creditLimit?: number;
  },
) {
  return apiRequest(`/api/v1/customers/${customerId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteCustomer(customerId: number) {
  return apiRequest<{ success: true }>(`/api/v1/customers/${customerId}`, {
    method: 'DELETE',
  });
}
