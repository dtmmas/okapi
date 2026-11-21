import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Store, UtensilsCrossed } from 'lucide-react';
import { AppIcon } from '@/components/AppIcon';
import { applyBrowserBrand } from '@/lib/browser-brand';
import { useSessionStore } from '@/store/useSessionStore';
import { getDemoAccounts, getPublicBrand, type DemoAccountHint } from '@/services/api';

export default function LoginPage() {
  const location = useLocation();
  const { login, loading, error } = useSessionStore();
  const routeNotice = useMemo(() => {
    const state = location.state as { notice?: string } | null;
    return state?.notice?.trim() ?? '';
  }, [location.state]);
  const hideDemoAccounts = useMemo(() => /restauraci[oó]n|respaldo/i.test(routeNotice), [routeNotice]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [brandName, setBrandName] = useState('Restaurante');
  const [logoData, setLogoData] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccountHint[]>([]);

  useEffect(() => {
    void getPublicBrand()
      .then((brand) => {
        setBackendOnline(true);
        setBrandName(brand.name);
        setLogoData(brand.logoData ?? null);
      })
      .catch(() => {
        setBackendOnline(false);
      });

    void getDemoAccounts()
      .then((accounts) => setDemoAccounts(accounts))
      .catch(() => setDemoAccounts([]));
  }, []);

  useEffect(() => {
    applyBrowserBrand({ brandName, logoData, pageTitle: 'Acceso' });
  }, [brandName, logoData]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await login(email.trim().toLowerCase(), password.trim());
    } catch {
      return;
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 px-6 py-10 text-slate-900 dark:bg-[#07070a] dark:text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.18),_transparent_25%),radial-gradient(circle_at_bottom_right,_rgba(244,63,94,0.18),_transparent_28%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.18),_transparent_25%),radial-gradient(circle_at_bottom_right,_rgba(244,63,94,0.18),_transparent_28%)]" />
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl items-center gap-8 xl:grid-cols-[1.2fr_0.9fr]">
        <section className="relative rounded-[36px] border border-slate-200/80 bg-white/90 p-8 shadow-[0_30px_120px_rgba(15,23,42,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[0_30px_120px_rgba(0,0,0,0.45)] lg:p-12">
          <div className="flex items-center gap-3">
            {logoData ? <img src={logoData} alt={brandName} className="h-11 w-11 rounded-2xl bg-slate-100 object-contain dark:bg-black/30" /> : null}
            <p className="text-xs uppercase tracking-[0.45em] text-amber-300">{brandName}</p>
          </div>
          <h1 className="mt-6 max-w-2xl font-display text-5xl leading-none text-slate-950 dark:text-white lg:text-7xl">
            Gestiona salón, caja, cocina y reparto desde una sola consola.
          </h1>
          <p className="mt-6 max-w-xl text-base text-slate-600 dark:text-zinc-300 lg:text-lg">
            Plataforma moderna para restaurantes multi-sucursal con punto de venta táctil, comandas en tiempo real, control de inventario, clientes y reportes ejecutivos.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ['Tiempo real', 'Punto de venta, cocina y reparto sincronizados'],
              ['Seguridad', 'JWT, auditoría y permisos granulares'],
              ['Escala', 'Arquitectura lista para Docker y MySQL'],
            ].map(([title, description]) => (
              <article key={title} className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-black/20 dark:shadow-none">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/6 text-amber-200">
                  {title === 'Tiempo real' ? (
                    <AppIcon icon={UtensilsCrossed} className="h-5 w-5" />
                  ) : title === 'Seguridad' ? (
                    <AppIcon icon={ShieldCheck} className="h-5 w-5" />
                  ) : (
                    <AppIcon icon={Store} className="h-5 w-5" />
                  )}
                </div>
                <p className="font-display text-xl text-slate-950 dark:text-white">{title}</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[36px] border border-slate-200/80 bg-white/90 p-8 shadow-[0_24px_120px_rgba(15,23,42,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-black/25 dark:shadow-[0_24px_120px_rgba(0,0,0,0.55)]">
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-zinc-500">Acceso seguro</p>
          <h2 className="mt-4 font-display text-4xl text-slate-950 dark:text-white">Iniciar sesion</h2>
          <p className="mt-3 text-sm text-slate-600 dark:text-zinc-400">Ingresa el correo y la contraseña de tu cuenta.</p>
          {backendOnline === false ? (
            <p className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
              No hay conexión con el API. En local ejecuta <strong>npm run dev</strong> y abre{' '}
              <strong>http://localhost:5174</strong> (no el puerto 3002 directo).
            </p>
          ) : null}
          {backendOnline && !logoData ? (
            <p className="mt-3 text-xs text-slate-500 dark:text-zinc-500">
              Conectado al servidor. El logo está vacío hasta que lo subas en Configuración (es normal tras un respaldo nuevo).
            </p>
          ) : null}

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Correo</span>
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                placeholder="tu@correo.com"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Contrasena</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                placeholder="********"
              />
            </label>

            {routeNotice ? (
              <p className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-900 dark:text-sky-100">
                {routeNotice}
              </p>
            ) : null}
            {error ? <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400 font-semibold text-zinc-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Ingresando...' : 'Entrar al sistema'}
              <AppIcon icon={ArrowRight} className="h-4 w-4" />
            </button>
          </form>

          {demoAccounts.length && !hideDemoAccounts ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">
                Cuentas de desarrollo
              </p>
              <div className="mt-3 space-y-2">
                {demoAccounts.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(account.password);
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-black/20 dark:hover:bg-white/[0.06]"
                  >
                    <span className="font-medium text-slate-900 dark:text-white">{account.role}</span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">{account.email}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

        </section>
      </div>
    </main>
  );
}
