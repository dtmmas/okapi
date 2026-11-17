import type { PermissionCatalogItem, PermissionCode, RoleCode, RoleProfileSummary } from '../types.js';

export const roleCodeOrder: RoleCode[] = ['ADMIN', 'SUPERVISOR', 'CASHIER', 'WAITER', 'KITCHEN', 'BAR', 'PASTRY', 'DELIVERY'];

export const permissionCatalog: PermissionCatalogItem[] = [
  {
    code: 'DASHBOARD_VIEW',
    label: 'Panel',
    description: 'Permite ver métricas operativas y accesos ejecutivos.',
    category: 'GENERAL',
    categoryLabel: 'Visión general',
    categoryOrder: 1,
    itemOrder: 1,
  },
  {
    code: 'POS_USE',
    label: 'Punto de venta',
    description: 'Permite abrir mesas, tomar pedidos y enviar comandas.',
    category: 'OPERACION',
    categoryLabel: 'Operación',
    categoryOrder: 2,
    itemOrder: 1,
  },
  {
    code: 'TABLES_MANAGE',
    label: 'Mesas',
    description: 'Permite gestionar áreas, mesas, reservas y movimientos de cuenta.',
    category: 'OPERACION',
    categoryLabel: 'Operación',
    categoryOrder: 2,
    itemOrder: 2,
  },
  {
    code: 'KITCHEN_UPDATE',
    label: 'Comandas',
    description: 'Permite ver y actualizar estados en cocina, bar y pastelería.',
    category: 'OPERACION',
    categoryLabel: 'Operación',
    categoryOrder: 2,
    itemOrder: 3,
  },
  {
    code: 'CASH_MANAGE',
    label: 'Caja',
    description: 'Permite abrir, cobrar, registrar movimientos y cerrar cajas.',
    category: 'CAJA',
    categoryLabel: 'Caja y cobro',
    categoryOrder: 3,
    itemOrder: 1,
  },
  {
    code: 'CUSTOMERS_MANAGE',
    label: 'Clientes',
    description: 'Permite consultar, crear y editar clientes.',
    category: 'GESTION',
    categoryLabel: 'Gestión comercial',
    categoryOrder: 4,
    itemOrder: 1,
  },
  {
    code: 'INVENTORY_MANAGE',
    label: 'Inventario',
    description: 'Permite gestionar categorías, productos, stock y recetas.',
    category: 'GESTION',
    categoryLabel: 'Gestión comercial',
    categoryOrder: 4,
    itemOrder: 2,
  },
  {
    code: 'DELIVERY_MANAGE',
    label: 'Reparto',
    description: 'Permite gestionar pedidos a domicilio y repartidores.',
    category: 'GESTION',
    categoryLabel: 'Gestión comercial',
    categoryOrder: 4,
    itemOrder: 3,
  },
  {
    code: 'REPORTS_VIEW',
    label: 'Reportes',
    description: 'Permite ver reportes de ventas, operación y desempeño.',
    category: 'GESTION',
    categoryLabel: 'Gestión comercial',
    categoryOrder: 4,
    itemOrder: 4,
  },
  {
    code: 'SETTINGS_MANAGE',
    label: 'Configuración',
    description: 'Permite administrar usuarios, roles y configuración general.',
    category: 'CONFIGURACION',
    categoryLabel: 'Configuración y seguridad',
    categoryOrder: 5,
    itemOrder: 1,
  },
];

export const defaultRoleProfiles: Record<RoleCode, RoleProfileSummary> = {
  ADMIN: {
    role: 'ADMIN',
    name: 'Administrador',
    description: 'Control total del sistema, configuración y supervisión operativa.',
    sortOrder: 1,
    permissions: permissionCatalog.map((item) => item.code),
  },
  SUPERVISOR: {
    role: 'SUPERVISOR',
    name: 'Supervisor',
    description: 'Supervisa la operación, apoya caja y coordina el servicio.',
    sortOrder: 2,
    permissions: ['DASHBOARD_VIEW', 'POS_USE', 'TABLES_MANAGE', 'KITCHEN_UPDATE', 'CASH_MANAGE', 'DELIVERY_MANAGE', 'REPORTS_VIEW'],
  },
  CASHIER: {
    role: 'CASHIER',
    name: 'Cajero',
    description: 'Opera caja, realiza cobros y controla cierres de turno.',
    sortOrder: 3,
    permissions: ['CASH_MANAGE'],
  },
  WAITER: {
    role: 'WAITER',
    name: 'Mesero',
    description: 'Toma pedidos, gestiona mesas y atiende clientes en salón.',
    sortOrder: 4,
    permissions: ['POS_USE', 'TABLES_MANAGE', 'CUSTOMERS_MANAGE'],
  },
  KITCHEN: {
    role: 'KITCHEN',
    name: 'Cocina',
    description: 'Gestiona comandas y estados de preparación en cocina.',
    sortOrder: 5,
    permissions: ['KITCHEN_UPDATE'],
  },
  BAR: {
    role: 'BAR',
    name: 'Bar',
    description: 'Gestiona comandas y estados de bebidas y barra.',
    sortOrder: 6,
    permissions: ['KITCHEN_UPDATE'],
  },
  PASTRY: {
    role: 'PASTRY',
    name: 'Pastelería',
    description: 'Gestiona comandas y estados de producción en pastelería.',
    sortOrder: 7,
    permissions: ['KITCHEN_UPDATE'],
  },
  DELIVERY: {
    role: 'DELIVERY',
    name: 'Reparto',
    description: 'Gestiona entregas y seguimiento de pedidos a domicilio.',
    sortOrder: 8,
    permissions: ['DELIVERY_MANAGE'],
  },
};

export const rolePermissions: Record<RoleCode, PermissionCode[]> = Object.fromEntries(
  roleCodeOrder.map((role) => [role, defaultRoleProfiles[role].permissions]),
) as Record<RoleCode, PermissionCode[]>;

export function normalizePermissions(permissions: PermissionCode[]): PermissionCode[] {
  const allowed = new Set(permissionCatalog.map((item) => item.code));
  return [...new Set(permissions)].filter((permission): permission is PermissionCode => allowed.has(permission));
}

export function getPermissionsForRole(role: RoleCode): PermissionCode[] {
  return [...(rolePermissions[role] ?? [])];
}

export function getDefaultRoleProfile(role: RoleCode): RoleProfileSummary {
  const profile = defaultRoleProfiles[role];
  return {
    role: profile.role,
    name: profile.name,
    description: profile.description,
    sortOrder: profile.sortOrder,
    permissions: [...profile.permissions],
  };
}
