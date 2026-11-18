import { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, ShoppingCart, UtensilsCrossed, ChefHat, Wallet, Boxes, Users, Bike, BarChart3, Settings, ShieldCheck, X, ChevronRight, ClipboardList, Store, MonitorSmartphone } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AppIcon, type IconComponent } from '@/components/AppIcon';
import { buildMenuSectionRoots } from '@/lib/menu-sections';
import type { PermissionCode } from '@/types/restaurant';
import type { MenuCategory } from '@/types/restaurant';
import { cn } from '@/lib/utils';

const items: Array<{
  to: string;
  label: string;
  icon: IconComponent;
  permission?: PermissionCode;
  children?: Array<{
    to: string;
    label: string;
    queryKey?: 'view' | 'section' | 'sectionId';
    queryValue?: string;
  }>;
}> = [
  { to: '/dashboard', label: 'Panel', icon: LayoutDashboard, permission: 'DASHBOARD_VIEW' },
  { to: '/pos', label: 'Punto de venta', icon: ShoppingCart, permission: 'POS_USE' },
  { to: '/kiosk', label: 'Kiosko', icon: MonitorSmartphone, permission: 'POS_USE' },
  { to: '/mesas', label: 'Mesas', icon: UtensilsCrossed, permission: 'TABLES_MANAGE' },
  { to: '/comandas', label: 'Comandas', icon: ChefHat, permission: 'KITCHEN_UPDATE' },
  {
    to: '/caja',
    label: 'Caja',
    icon: Wallet,
    permission: 'CASH_MANAGE',
    children: [
      { to: '/caja/detalle', label: 'Detalle de caja' },
      { to: '/caja/movimientos', label: 'Movimientos' },
    ],
  },
  {
    to: '/menu',
    label: 'Menú',
    icon: ClipboardList,
    permission: 'INVENTORY_MANAGE',
    children: [
      { to: '/menu?view=sections', label: 'Gestión de secciones', queryKey: 'view', queryValue: 'sections' },
    ],
  },
  {
    to: '/inventario',
    label: 'Inventario',
    icon: Boxes,
    permission: 'INVENTORY_MANAGE',
    children: [
      { to: '/inventario?view=guided', label: 'Proceso guiado', queryKey: 'view', queryValue: 'guided' },
      { to: '/inventario?view=catalog', label: 'Catálogo base', queryKey: 'view', queryValue: 'catalog' },
      { to: '/inventario?view=recipes', label: 'Recetas técnicas', queryKey: 'view', queryValue: 'recipes' },
      { to: '/inventario?view=subrecipes', label: 'Subrecetas y producción', queryKey: 'view', queryValue: 'subrecipes' },
      { to: '/inventario?view=purchases', label: 'Compras y mermas', queryKey: 'view', queryValue: 'purchases' },
      { to: '/inventario?view=audit', label: 'Ajustes y auditoría', queryKey: 'view', queryValue: 'audit' },
    ],
  },
  { to: '/usuarios', label: 'Usuarios', icon: Users, permission: 'SETTINGS_MANAGE' },
  { to: '/roles', label: 'Roles', icon: ShieldCheck, permission: 'SETTINGS_MANAGE' },
  { to: '/sucursales', label: 'Sucursales', icon: Store, permission: 'SETTINGS_MANAGE' },
  { to: '/clientes', label: 'Clientes', icon: Users, permission: 'CUSTOMERS_MANAGE' },
  { to: '/delivery', label: 'Reparto', icon: Bike, permission: 'DELIVERY_MANAGE' },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, permission: 'REPORTS_VIEW' },
  { to: '/configuracion', label: 'Configuración', icon: Settings, permission: 'SETTINGS_MANAGE' },
];

type SidebarProps = {
  permissions: PermissionCode[];
  brandName: string;
  logoData?: string | null;
  menuCategories: MenuCategory[];
  mobileOpen?: boolean;
  onClose?: () => void;
};

export function Sidebar({ permissions, brandName, logoData, menuCategories, mobileOpen = false, onClose }: SidebarProps) {
  const location = useLocation();
  const navItems = useMemo(() => {
    const menuSectionChildren = buildMenuSectionRoots(menuCategories).map((section) => ({
      to: `/menu?sectionId=${section.id}`,
      label: section.name,
      queryKey: 'sectionId' as const,
      queryValue: String(section.id),
    }));

    return items
      .filter((item) => !item.permission || permissions.includes(item.permission))
      .map((item) =>
        item.to === '/menu'
          ? {
              ...item,
              children: [item.children?.[0], ...menuSectionChildren].filter(Boolean) as NonNullable<typeof item.children>,
            }
          : item,
      );
  }, [menuCategories, permissions]);
  const searchParams = new URLSearchParams(location.search);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  function isChildActive(item: (typeof items)[number], child: NonNullable<(typeof items)[number]['children']>[number]) {
    if (child.queryKey) {
      return location.pathname === item.to && searchParams.get(child.queryKey) === (child.queryValue ?? '');
    }

    return location.pathname === child.to;
  }

  function hasActiveChild(item: (typeof items)[number]) {
    if (!item.children?.length) return false;

    return item.children.some((child) => isChildActive(item, child));
  }

  useEffect(() => {
    const activeParent = navItems.find((item) => hasActiveChild(item)) ?? null;
    setExpandedItem(activeParent?.to ?? null);
  }, [location.pathname, location.search, navItems]);

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm transition lg:hidden',
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-screen w-[280px] shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white/95 px-5 py-6 backdrop-blur-xl transition-transform dark:border-white/8 dark:bg-[#09090c] lg:static lg:z-auto lg:w-[260px] lg:translate-x-0 lg:bg-white/70 dark:lg:bg-black/20',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
      <div className="mb-4 flex items-center justify-between lg:hidden">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Menú</p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
          aria-label="Cerrar menú"
        >
          <AppIcon icon={X} className="h-4 w-4" />
        </button>
      </div>

      <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
        <div className="flex flex-col items-center text-center">
          {logoData ? <img src={logoData} alt={brandName} className="h-16 w-16 rounded-[20px] bg-slate-100 object-contain dark:bg-black/30" /> : null}
          <div className="mt-3 min-w-0">
            <p className="truncate font-display text-2xl text-slate-950 dark:text-white">{brandName}</p>
          </div>
        </div>
      </div>

      <nav className="mt-6 space-y-2 pb-4">
        {navItems.map((item) => {
            const Icon = item.icon;
            const hasChildren = Boolean(item.children?.length);
            const isExpanded = expandedItem === item.to;
            const linkActive = !hasChildren && location.pathname === item.to;

            return (
              <div key={item.to} className="space-y-2">
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => setExpandedItem((current) => (current === item.to ? null : item.to))}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-white/6',
                      isExpanded
                        ? 'bg-amber-50 text-slate-950 shadow-sm dark:bg-white/10 dark:text-white dark:shadow-lg'
                        : 'text-slate-600 dark:text-zinc-400',
                    )}
                    aria-expanded={isExpanded}
                    aria-controls={`sidebar-group-${item.label}`}
                  >
                    <AppIcon icon={Icon} className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    <AppIcon icon={ChevronRight} className={cn('h-4 w-4 transition', isExpanded ? 'rotate-90' : '')} />
                  </button>
                ) : (
                  <NavLink
                    to={item.to}
                    onClick={onClose}
                    className={() =>
                      cn(
                        'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition hover:bg-slate-100 dark:hover:bg-white/6',
                        linkActive
                          ? 'bg-amber-50 text-slate-950 shadow-sm dark:bg-white/10 dark:text-white dark:shadow-lg'
                          : 'text-slate-600 dark:text-zinc-400',
                      )
                    }
                  >
                    <AppIcon icon={Icon} className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                  </NavLink>
                )}

                {hasChildren ? (
                  <div
                    id={`sidebar-group-${item.label}`}
                    className={cn(
                      'ml-5 overflow-hidden border-l border-slate-200 pl-4 transition-all duration-200 ease-out dark:border-white/10',
                      isExpanded ? 'mt-2 max-h-80 opacity-100' : 'max-h-0 opacity-0',
                    )}
                  >
                    <div className="space-y-1 pb-1">
                    {item.children?.map((child) => {
                      const childActive =
                        isChildActive(item, child);
                      return (
                        <Link
                          key={child.to}
                          to={child.to}
                          onClick={onClose}
                          className={cn(
                            'block rounded-2xl px-3 py-2 text-sm transition hover:bg-slate-100 dark:hover:bg-white/6',
                            childActive ? 'bg-amber-50 font-semibold text-slate-950 dark:bg-white/10 dark:text-white' : 'text-slate-500 dark:text-zinc-400',
                          )}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
      </nav>
    </aside>
    </>
  );
}
