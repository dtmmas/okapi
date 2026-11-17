import { LayoutDashboard, ShoppingCart, UtensilsCrossed, ChefHat, Wallet, Boxes, Users, Bike, BarChart3, Settings, ShieldCheck, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { AppIcon, type IconComponent } from '@/components/AppIcon';
import type { PermissionCode } from '@/types/restaurant';
import { cn } from '@/lib/utils';

const items: Array<{
  to: string;
  label: string;
  icon: IconComponent;
  permission?: PermissionCode;
}> = [
  { to: '/dashboard', label: 'Panel', icon: LayoutDashboard, permission: 'DASHBOARD_VIEW' },
  { to: '/pos', label: 'Punto de venta', icon: ShoppingCart, permission: 'POS_USE' },
  { to: '/mesas', label: 'Mesas', icon: UtensilsCrossed, permission: 'TABLES_MANAGE' },
  { to: '/comandas', label: 'Comandas', icon: ChefHat, permission: 'KITCHEN_UPDATE' },
  { to: '/caja', label: 'Caja', icon: Wallet, permission: 'CASH_MANAGE' },
  { to: '/inventario', label: 'Inventario', icon: Boxes, permission: 'INVENTORY_MANAGE' },
  { to: '/usuarios', label: 'Usuarios', icon: Users, permission: 'SETTINGS_MANAGE' },
  { to: '/roles', label: 'Roles', icon: ShieldCheck, permission: 'SETTINGS_MANAGE' },
  { to: '/clientes', label: 'Clientes', icon: Users, permission: 'CUSTOMERS_MANAGE' },
  { to: '/delivery', label: 'Reparto', icon: Bike, permission: 'DELIVERY_MANAGE' },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, permission: 'REPORTS_VIEW' },
  { to: '/configuracion', label: 'Configuración', icon: Settings, permission: 'SETTINGS_MANAGE' },
];

type SidebarProps = {
  permissions: PermissionCode[];
  brandName: string;
  logoData?: string | null;
  mobileOpen?: boolean;
  onClose?: () => void;
};

export function Sidebar({ permissions, brandName, logoData, mobileOpen = false, onClose }: SidebarProps) {
  const navItems = items.filter((item) => !item.permission || permissions.includes(item.permission));

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

            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition hover:bg-slate-100 dark:hover:bg-white/6',
                    isActive
                      ? 'bg-amber-50 text-slate-950 shadow-sm dark:bg-white/10 dark:text-white dark:shadow-lg'
                      : 'text-slate-600 dark:text-zinc-400',
                  )
                }
              >
                <AppIcon icon={Icon} className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
      </nav>
    </aside>
    </>
  );
}
