import { Menu, MoonStar, SunMedium, LogOut } from 'lucide-react';
import { AppIcon } from '@/components/AppIcon';
import { ActiveUserLabel } from '@/components/ActiveUserLabel';
import { useTheme } from '@/hooks/useTheme';
import type { AuthUser } from '@/types/restaurant';

type TopbarProps = {
  user: AuthUser;
  branchName: string;
  onLogout: () => void;
  onMenuToggle?: () => void;
};

export function Topbar({ user, branchName, onLogout, onMenuToggle }: TopbarProps) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-6 py-5 backdrop-blur-xl dark:border-white/8 dark:bg-[#09090c]/85">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10 lg:hidden"
          aria-label="Abrir menú"
        >
          <AppIcon icon={Menu} className="h-5 w-5" />
        </button>

        <div>
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Sucursal activa</p>
        <div className="mt-2">
          <div>
            <p className="font-display text-xl text-slate-950 dark:text-white">{branchName}</p>
            <p className="text-sm text-slate-600 dark:text-zinc-400">
              {user.role}
            </p>
          </div>
        </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
        >
          {isDark ? <AppIcon icon={SunMedium} className="h-4 w-4" /> : <AppIcon icon={MoonStar} className="h-4 w-4" />}
          {isDark ? 'Modo claro' : 'Modo oscuro'}
        </button>
        <ActiveUserLabel />
        <button
          type="button"
          onClick={onLogout}
          className="session-exit inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm transition"
        >
          <AppIcon icon={LogOut} className="h-4 w-4" />
          Salir
        </button>
      </div>
    </header>
  );
}
