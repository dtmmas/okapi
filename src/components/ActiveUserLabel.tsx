import { useId, useRef } from 'react';
import { useMatch } from 'react-router-dom';
import { ChevronDown, UserRound } from 'lucide-react';
import { AppIcon } from '@/components/AppIcon';
import { useSessionStore } from '@/store/useSessionStore';
import type { RoleCode } from '@/types/restaurant';

const roles: Record<RoleCode, string> = {
  KIOSK: 'Kiosco', ADMIN: 'Administrador', SUPERVISOR: 'Supervisor',
  CASHIER: 'Cajero', WAITER: 'Mesero', KITCHEN: 'Cocina', BAR: 'Bar',
  PASTRY: 'Pastelería', DELIVERY: 'Repartidor',
};

export function ActiveUserLabel({ height = 'h-11' }: { height?: 'h-11' | 'h-12' | 'h-11 sm:h-12 lg:h-14' }) {
  const user = useSessionStore(state => state.token ? state.user : null);
  const branch = useSessionStore(state => state.snapshot?.branches.find(b => b.id === user?.branchId)?.name);
  const kiosk = useMatch('/kiosk/*');
  const preparationScreen = useMatch('/kds');
  const logout = useSessionStore(state => state.logout);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  if (!user) return null;

  return (
    <>
      <button type="button" aria-haspopup="dialog" aria-label={`Ver perfil de ${user.name}`}
        onClick={() => dialog.current?.showModal()}
        className={`${height} inline-flex min-w-0 max-w-full items-center gap-2 self-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] print:hidden ${height.includes('sm:') ? 'sm:text-base lg:px-5 lg:text-lg' : ''}`}>
        <AppIcon icon={UserRound} className="h-4 w-4 shrink-0" />
        <span className="max-w-[12rem] truncate">{user.name}</span>
        <AppIcon icon={ChevronDown} className="h-3.5 w-3.5 shrink-0" />
      </button>
      <dialog ref={dialog} aria-labelledby={titleId}
        className="m-auto w-80 max-w-[90vw] rounded-2xl bg-white p-5 text-left text-slate-900 shadow-xl backdrop:bg-black/40 dark:bg-zinc-900 dark:text-white">
        <h2 id={titleId} className="text-lg font-semibold">Perfil de la cuenta</h2>
        <dl className="my-4 grid gap-3 text-sm">
          <div><dt className="text-slate-500 dark:text-zinc-400">Nombre</dt><dd className="break-words">{user.name}</dd></div>
          <div><dt className="text-slate-500 dark:text-zinc-400">Rol</dt><dd>{roles[user.role]}</dd></div>
          {branch && <div><dt className="text-slate-500 dark:text-zinc-400">Sucursal</dt><dd>{branch}</dd></div>}
          {!kiosk && user.role !== 'KIOSK' && <div><dt className="text-slate-500 dark:text-zinc-400">Correo</dt><dd className="break-all">{user.email}</dd></div>}
        </dl>
        <button type="button" onClick={() => dialog.current?.close()} className="min-h-11 w-full rounded-xl bg-slate-100 text-sm font-semibold hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700">Cerrar ficha</button>
        {preparationScreen && user.role !== 'KIOSK' && (
          <button type="button" onClick={logout}
            className="session-exit mt-2 min-h-11 w-full rounded-xl text-sm font-semibold">
            Cerrar sesión
          </button>
        )}
      </dialog>
    </>
  );
}
