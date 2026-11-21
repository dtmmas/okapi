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

    if (
      response.status === 401 &&
      token &&
      !url.startsWith('/api/auth/login') &&
      (message.includes('Token') || message.includes('Sesion') || message.includes('Sesión'))
    ) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }

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

export type DemoAccountHint = {
  role: string;
  email: string;
  password: string;
};

export function getDemoAccounts() {
  return apiRequest<DemoAccountHint[]>('/api/auth/demo-accounts');
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

export type BackupMode = 'database' | 'full';

export type BackupArchiveSummary = {
  id: string;
  mode: BackupMode;
  fileName: string;
  sizeBytes: number;
  sizeLabel: string;
  createdAt: string;
  source: 'system' | 'import';
  databaseExportMethod?: 'mysqldump' | 'generated-sql';
};

export type BackupJobSnapshot = {
  jobId: string;
  operation: 'backup' | 'restore';
  mode: BackupMode;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  fileName: string | null;
  error: string | null;
  databaseExportMethod: 'mysqldump' | 'generated-sql' | null;
  databaseExportNote: string | null;
  archiveId: string | null;
  completedAt: string | null;
  loginHints: string[] | null;
};

export function getSettingsBackupHistory() {
  return apiRequest<BackupArchiveSummary[]>('/api/v1/settings/backups/history');
}

export function importSettingsBackup(file: File) {
  const body = new FormData();
  body.append('backup', file);
  return apiRequest<BackupArchiveSummary>('/api/v1/settings/backups/import', {
    method: 'POST',
    body,
  });
}

export function startSettingsBackupRestore(archiveId: string) {
  return apiRequest<{
    jobId: string;
    operation: BackupJobSnapshot['operation'];
    mode: BackupMode;
    status: BackupJobSnapshot['status'];
    progress: number;
    message: string;
    archiveId: string | null;
  }>(`/api/v1/settings/backups/archives/${archiveId}/restore`, {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  });
}

export async function downloadSettingsBackupArchive(archiveId: string, fileName: string) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const response = await fetch(`/api/v1/settings/backups/archives/${archiveId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error('No fue posible descargar el respaldo del historial.');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function startSettingsBackup(mode: BackupMode) {
  return apiRequest<{ jobId: string; operation: BackupJobSnapshot['operation']; mode: BackupMode; status: BackupJobSnapshot['status']; progress: number; message: string }>(
    '/api/v1/settings/backups',
    {
      method: 'POST',
      body: JSON.stringify({ mode }),
    },
  );
}

export function getSettingsBackupStatus(jobId: string) {
  return apiRequest<BackupJobSnapshot>(`/api/v1/settings/backups/${jobId}`);
}

export async function downloadSettingsBackup(jobId: string, fileName: string | null) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const response = await fetch(`/api/v1/settings/backups/${jobId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    const rawBody = await response.text();
    let message = `No fue posible descargar el respaldo (${response.status}).`;
    if (rawBody) {
      try {
        const payload = JSON.parse(rawBody) as { message?: string };
        if (payload.message) {
          message = payload.message;
        }
      } catch {
        // keep default message
      }
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName?.trim() || `okapi-backup-${jobId}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
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
  return apiRequest<{ success: true; completed: boolean; paidAmount: number; remainingAmount: number; registeredAmount: number; collectedByName: string | null }>(
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
  kioskKey?: string;
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

export function mergeTableAccounts(payload: { hostTableId: number; joinTableId: number }) {
  return apiRequest('/api/v1/tables/merge', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

type TableChange = import('../../shared/table-reservation').ReservationChange & { tableId: number };

export function updateTableStatus({ tableId, ...change }: TableChange) {
  return apiRequest<{ success: true }>(`/api/v1/tables/${tableId}/status`, {
    method: 'PUT',
    body: JSON.stringify(change),
  });
}

export function updateTableReservation({ tableId, ...change }: TableChange & { kioskKey: string }) {
  return apiRequest<{ success: true }>(`/api/v1/tables/${tableId}/reservation`, {
    method: 'PUT',
    body: JSON.stringify(change),
  });
}

export function releaseTableReservationKeepalive(tableId: number, kioskKey: string) {
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
    body: JSON.stringify({ status: 'FREE', kioskKey }),
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

export function reorderTables(payload: { area: string; tableIds: number[] }) {
  return apiRequest<{ success: true }>('/api/v1/tables/reorder', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function createTableArea(payload: { name: string }) {
  return apiRequest<{ id: number; name: string; sortOrder: number }>('/api/v1/table-areas', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function renameTableArea(payload: { previousName: string; nextName: string }) {
  return apiRequest<{ success: true }>('/api/v1/table-areas/rename', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteTableArea(payload: { name: string }) {
  return apiRequest<{ success: true }>('/api/v1/table-areas', {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}

export function reorderTableAreas(payload: { areaNames: string[] }) {
  return apiRequest<{ success: true }>('/api/v1/table-areas/reorder', {
    method: 'PUT',
    body: JSON.stringify(payload),
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

export function suggestUserEmail(names: string, firstSurname: string, secondSurname: string) {
  return apiRequest<{ email: string | null }>('/api/v1/users/email-suggestion', {
    method: 'POST', body: JSON.stringify({ names, firstSurname, secondSurname }),
  });
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
