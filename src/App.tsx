import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { buildMenuSectionRoots, findMenuSectionRootByQueryValue } from '@/lib/menu-sections';
import { useSessionStore } from '@/store/useSessionStore';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import PosTablesPage from '@/pages/pos/PosTablesPage';
import PosCustomerPage from '@/pages/pos/PosCustomerPage';
import PosMenuPage from '@/pages/pos/PosMenuPage';
import KioskPage from '@/pages/kiosk/KioskPage';
import CashierTablesPage from '@/pages/cashier/CashierTablesPage';
import CashierCheckoutPage from '@/pages/cashier/CashierCheckoutPage';
import TablesPage from '@/pages/TablesPage';
import ComandasPage from '@/pages/ComandasPage';
import CashPage from '@/pages/CashPage';
import InventoryPage from '@/pages/InventoryPage';
import MenuPage from '@/pages/MenuPage';
import CustomersPage from '@/pages/CustomersPage';
import UsersPage from '@/pages/UsersPage';
import RolesPage from '@/pages/RolesPage';
import DeliveryPage from '@/pages/DeliveryPage';
import ReportsPage from '@/pages/ReportsPage';
import SettingsPage from '@/pages/SettingsPage';
import BranchesPage from '@/pages/BranchesPage';
import { getPostLoginPath } from '@/lib/session-routing';
import type { MenuCategory } from '@/types/restaurant';

const pageTitles: Record<string, { title: string; description: string }> = {
  '/dashboard': { title: 'Panel principal operativo', description: 'Ventas, órdenes activas, combinación de productos y salud de la operación.' },
  '/pos': { title: 'Punto de venta', description: 'Flujo táctil para pedidos, descuentos, modificadores y pagos mixtos.' },
  '/mesas': { title: 'Gestión de mesas', description: 'Plano visual del restaurante con unión y traslado de pedidos.' },
  '/comandas': { title: 'Comandas', description: 'Cocina, bar y pastelería en una sola vista con estados y cronómetro.' },
  '/usuarios': { title: 'Usuarios', description: 'Roles, estaciones, sucursales y control de acceso centralizado.' },
  '/caja/detalle': { title: 'Detalle de caja', description: 'Caja, arqueo, apertura, cierre y control administrativo del turno actual.' },
  '/caja/movimientos': { title: 'Movimientos', description: 'Ventas agrupadas por cuenta, abonos, auditoria y reimpresiones.' },
  '/menu': { title: 'Menú y catálogo comercial', description: 'Platillos, bebidas, productos, extras, salsas y aderezos organizados en un módulo separado.' },
  '/inventario': { title: 'Inventario y recetas', description: 'Stock por sucursal, kardex, alertas y abastecimiento.' },
  '/clientes': { title: 'Clientes y fidelización', description: 'Historial, puntos, crédito y activaciones de CRM.' },
  '/delivery': { title: 'Reparto y despacho', description: 'Asignación de repartidores, tiempo estimado y preparación para mapas.' },
  '/reportes': { title: 'Reportes ejecutivos', description: 'Analítica por período, producto, usuario y rentabilidad.' },
  '/roles': { title: 'Roles y permisos', description: 'Define perfiles operativos, orden visual y permisos por categorías.' },
  '/sucursales': { title: 'Sucursales', description: 'Administra sedes, estado operativo y datos de contacto por sucursal.' },
  '/configuracion': { title: 'Configuración central', description: 'Marca, seguridad y hoja de ruta del sistema.' },
};

function getMenuPageCopy(search: string, sectionNames: MenuCategory[]) {
  const params = new URLSearchParams(search);
  const view = params.get('view') ?? '';
  const section = findMenuSectionRootByQueryValue(params.get('sectionId') ?? params.get('section'), sectionNames);

  if (view === 'sections') {
    return { title: 'Gestión de secciones', description: '' };
  }

  if (section) {
    return { title: section.name, description: '' };
  }

  return { title: 'Menú', description: '' };
}

function ProtectedLayout() {
  const location = useLocation();
  const { token, user, snapshot, loading, hydrate, logout } = useSessionStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (token && !user && !loading) {
      void hydrate();
    }
  }, [token, user, loading, hydrate]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (loading || !user || !snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600 dark:bg-[#07070a] dark:text-zinc-300">
        Cargando plataforma...
      </div>
    );
  }

  const currentBranch = snapshot.branches.find((branch) => branch.id === user.branchId);
  const menuSectionRoots = buildMenuSectionRoots(snapshot.menuCategories);
  const copy = location.pathname === '/menu' ? getMenuPageCopy(location.search, menuSectionRoots) : pageTitles[location.pathname] || pageTitles['/dashboard'];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-[#07070a] dark:text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.10),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(244,63,94,0.12),_transparent_22%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.10),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(244,63,94,0.12),_transparent_22%)]" />
      <div className="relative flex">
        <Sidebar
          permissions={user.permissions}
          brandName={snapshot.brand.name}
          logoData={snapshot.brand.logoData ?? null}
          menuCategories={snapshot.menuCategories}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="min-w-0 flex-1">
          <Topbar user={user} branchName={currentBranch?.name || 'Sucursal'} onLogout={logout} onMenuToggle={() => setSidebarOpen(true)} />
          <main className="space-y-6 px-6 py-6">
            <section className="rounded-[28px] border border-slate-200/80 bg-white/90 px-6 py-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">{currentBranch?.city || 'Operación centralizada'}</p>
              <h2 className="mt-3 font-display text-4xl text-slate-950 dark:text-white">{copy.title}</h2>
              {copy.description ? <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-zinc-400">{copy.description}</p> : null}
            </section>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function DashboardRoute() {
  const user = useSessionStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.permissions.includes('DASHBOARD_VIEW')) {
    return <Navigate to={getPostLoginPath(user)} replace />;
  }

  return <DashboardPage />;
}

function FullscreenLayout() {
  const location = useLocation();
  const { token, user, snapshot, loading, hydrate, logout } = useSessionStore();

  useEffect(() => {
    if (token && !user && !loading) {
      void hydrate();
    }
  }, [token, user, loading, hydrate]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (loading || !user || !snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600 dark:bg-[#07070a] dark:text-zinc-300">
        Cargando POS...
      </div>
    );
  }

  if ((location.pathname.startsWith('/pos') || location.pathname.startsWith('/kiosk')) && user.role === 'WAITER' && !snapshot.cashShift?.isOpen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900 dark:bg-[#07070a] dark:text-white">
        <div className="w-full max-w-xl rounded-[28px] border border-slate-200/80 bg-white/90 p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.03] dark:shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">POS bloqueado</p>
          <h1 className="mt-4 font-display text-4xl text-slate-950 dark:text-white">Caja pendiente de apertura</h1>
          <p className="mt-4 text-base text-slate-600 dark:text-zinc-300">
            El mesero no puede ingresar al POS hasta que un administrador, supervisor o cajero abra la caja de la sucursal.
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-zinc-500">Cuando la caja esté abierta, vuelve a iniciar sesión o recarga la página.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-12 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-white transition hover:bg-amber-300/15"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={logout}
              className="h-12 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
            >
              Salir
            </button>
          </div>
        </div>
      </div>
    );
  }

  if ((location.pathname.startsWith('/pos') || location.pathname.startsWith('/kiosk')) && !user.permissions.includes('POS_USE')) {
    return <Navigate to={getPostLoginPath(user)} replace />;
  }

  return <Outlet />;
}

function HomeRedirect() {
  const user = useSessionStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getPostLoginPath(user)} replace />;
}

function ComandasRoute() {
  const user = useSessionStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.permissions.includes('KITCHEN_UPDATE')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <ComandasPage />;
}

function KdsRoute() {
  const user = useSessionStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.permissions.includes('KITCHEN_UPDATE')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <ComandasPage />;
}

function UsersRoute() {
  const user = useSessionStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.permissions.includes('SETTINGS_MANAGE')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <UsersPage />;
}

function RolesRoute() {
  const user = useSessionStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.permissions.includes('SETTINGS_MANAGE')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <RolesPage />;
}

function BranchesRoute() {
  const user = useSessionStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.permissions.includes('SETTINGS_MANAGE')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <BranchesPage />;
}

function TablesRoute() {
  const user = useSessionStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'CASHIER') {
    return <Navigate to={getPostLoginPath(user)} replace />;
  }

  if (!user.permissions.includes('TABLES_MANAGE')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <TablesPage />;
}

function CashRoute() {
  const user = useSessionStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.permissions.includes('CASH_MANAGE')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <CashPage view="overview" />;
}

function CashMovementsRoute() {
  const user = useSessionStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.permissions.includes('CASH_MANAGE')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <CashPage view="movements" />;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<FullscreenLayout />}>
          <Route path="/pos" element={<Navigate to="/pos/mesas" replace />} />
          <Route path="/pos/mesas" element={<PosTablesPage />} />
          <Route path="/pos/cliente" element={<PosCustomerPage />} />
          <Route path="/pos/menu" element={<PosMenuPage />} />
          <Route path="/kiosk" element={<KioskPage />} />
          <Route path="/cashier/mesas" element={<CashierTablesPage />} />
          <Route path="/cashier/cobrar/:tableId" element={<CashierCheckoutPage />} />
          <Route path="/kds" element={<KdsRoute />} />
        </Route>
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/dashboard" element={<DashboardRoute />} />
          <Route path="/mesas" element={<TablesRoute />} />
          <Route path="/comandas" element={<ComandasRoute />} />
          <Route path="/cocina" element={<Navigate to="/comandas" replace />} />
          <Route path="/bar" element={<Navigate to="/comandas" replace />} />
          <Route path="/pasteleria" element={<Navigate to="/comandas" replace />} />
          <Route path="/caja" element={<Navigate to="/caja/detalle" replace />} />
          <Route path="/caja/detalle" element={<CashRoute />} />
          <Route path="/caja/movimientos" element={<CashMovementsRoute />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/inventario" element={<InventoryPage />} />
          <Route path="/usuarios" element={<UsersRoute />} />
          <Route path="/roles" element={<RolesRoute />} />
          <Route path="/sucursales" element={<BranchesRoute />} />
          <Route path="/clientes" element={<CustomersPage />} />
          <Route path="/delivery" element={<DeliveryPage />} />
          <Route path="/reportes" element={<ReportsPage />} />
          <Route path="/configuracion" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Router>
  );
}
