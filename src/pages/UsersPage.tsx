import { useEffect, useMemo, useState } from 'react';
import { Panel } from '@/components/Panel';
import { StatusBadge } from '@/components/StatusBadge';
import { createUser, listUsers, updateUser, updateUserPassword } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';
import type { UserSummary } from '@/types/restaurant';

const roleOptions = ['ADMIN', 'SUPERVISOR', 'CASHIER', 'WAITER', 'KITCHEN', 'BAR', 'PASTRY', 'DELIVERY'] as const;
const permissionOptions = [
  { code: 'DASHBOARD_VIEW', label: 'Panel' },
  { code: 'POS_USE', label: 'Punto de venta' },
  { code: 'TABLES_MANAGE', label: 'Mesas' },
  { code: 'KITCHEN_UPDATE', label: 'Comandas' },
  { code: 'CASH_MANAGE', label: 'Caja' },
  { code: 'INVENTORY_MANAGE', label: 'Inventario' },
  { code: 'CUSTOMERS_MANAGE', label: 'Clientes' },
  { code: 'DELIVERY_MANAGE', label: 'Reparto' },
  { code: 'REPORTS_VIEW', label: 'Reportes' },
  { code: 'SETTINGS_MANAGE', label: 'Configuración' },
] as const;

function roleLabel(role: string) {
  if (role === 'CASHIER') return 'Cajero';
  if (role === 'WAITER') return 'Mesero';
  if (role === 'KITCHEN') return 'Cocina';
  if (role === 'BAR') return 'Bar';
  if (role === 'PASTRY') return 'Pastelería';
  if (role === 'SUPERVISOR') return 'Supervisor';
  if (role === 'ADMIN') return 'Administrador';
  if (role === 'DELIVERY') return 'Reparto';
  return role;
}

export default function UsersPage() {
  const snapshot = useSessionStore((state) => state.snapshot);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<(typeof roleOptions)[number]>('WAITER');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [permissionMode, setPermissionMode] = useState<'ROLE' | 'CUSTOM'>('ROLE');
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);

  const [newPassword, setNewPassword] = useState('');

  const branches = snapshot?.branches ?? [];
  const branchLookup = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name] as const)), [branches]);

  const sortedUsers = useMemo(() => {
    return users.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [users]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar usuarios.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function resetForm() {
    setName('');
    setEmail('');
    setPassword('');
    setRole('WAITER');
    setBranchId(null);
    setIsActive(true);
    setPermissionMode('ROLE');
    setCustomPermissions([]);
  }

  function openCreate() {
    resetForm();
    setCreateOpen(true);
  }

  function openEdit(user: UserSummary) {
    setSelectedUser(user);
    setName(user.name);
    setEmail(user.email);
    setPassword('');
    setRole((roleOptions.includes(user.role as any) ? (user.role as any) : 'WAITER') as (typeof roleOptions)[number]);
    setBranchId(user.branchId ?? null);
    setIsActive(user.isActive);
    setPermissionMode(user.permissionMode);
    setCustomPermissions(user.customPermissions ?? []);
    setEditOpen(true);
  }

  function openPassword(user: UserSummary) {
    setSelectedUser(user);
    setNewPassword('');
    setPasswordOpen(true);
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      await createUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        branchId,
        isActive,
        permissionMode,
        customPermissions: permissionMode === 'CUSTOM' ? customPermissions : [],
      });
      setCreateOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible crear el usuario.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate() {
    if (!selectedUser) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await updateUser(selectedUser.id, {
        name: name.trim(),
        role,
        branchId,
        isActive,
        permissionMode,
        customPermissions: permissionMode === 'CUSTOM' ? customPermissions : [],
      });
      setEditOpen(false);
      setSelectedUser(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible actualizar el usuario.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePassword() {
    if (!selectedUser) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await updateUserPassword(selectedUser.id, { password: newPassword });
      setPasswordOpen(false);
      setSelectedUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible actualizar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Usuarios"
        subtitle="Control de accesos por rol, estación y sucursal"
        action={
          <button
            type="button"
            onClick={openCreate}
            className="h-11 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white"
          >
            Nuevo usuario
          </button>
        }
      >
        {error ? (
          <div className="mb-4 rounded-[22px] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        {loading ? <p className="text-sm text-slate-600 dark:text-zinc-400">Cargando...</p> : null}

        <div className="space-y-3">
          {sortedUsers.map((user) => (
            <article key={user.id} className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950 dark:text-white">{user.name}</p>
                  <p className="truncate text-sm text-slate-500 dark:text-zinc-500">{user.email}</p>
                  <p className="mt-2 text-sm text-slate-700 dark:text-zinc-300">
                    {roleLabel(user.role)} · {user.branchId ? branchLookup.get(user.branchId) ?? `Sucursal ${user.branchId}` : 'Sin sucursal'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <StatusBadge value={user.isActive ? 'OK' : 'LOW'} />
                  <StatusBadge value={user.role} />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(user)}
                  className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => openPassword(user)}
                  className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
                >
                  Reset clave
                </button>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 dark:bg-black/60">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b0b10] dark:text-white dark:shadow-none sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Administración</p>
                <h2 className="mt-2 truncate font-display text-2xl text-slate-950 dark:text-white sm:text-3xl">Nuevo usuario</h2>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="h-10 w-10 rounded-2xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Nombre</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-3 h-12 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:h-14 sm:text-base"
                />
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Correo</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-3 h-12 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:h-14 sm:text-base"
                />
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Contraseña</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  className="mt-3 h-12 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:h-14 sm:text-base"
                />
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Rol</span>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as any)}
                  className="mt-3 h-12 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:h-14 sm:text-base"
                >
                  {roleOptions.map((item) => (
                    <option key={item} value={item}>
                      {roleLabel(item)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Sucursal</span>
                <select
                  value={branchId ?? ''}
                  onChange={(event) => setBranchId(event.target.value ? Number(event.target.value) : null)}
                  className="mt-3 h-12 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:h-14 sm:text-base"
                >
                  <option value="">Sin sucursal</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 sm:col-span-2 dark:border-white/10 dark:bg-black/20">
                <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
                <span className="text-sm text-slate-700 dark:text-zinc-200">Activo</span>
              </label>

              <div className="space-y-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 sm:col-span-2 dark:border-white/10 dark:bg-black/20">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-700 dark:text-zinc-200">Permisos personalizados</span>
                  <input
                    type="checkbox"
                    checked={permissionMode === 'CUSTOM'}
                    onChange={(event) => setPermissionMode(event.target.checked ? 'CUSTOM' : 'ROLE')}
                  />
                </label>
                {permissionMode === 'CUSTOM' ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {permissionOptions.map((option) => {
                      const checked = customPermissions.includes(option.code);
                      return (
                        <label key={option.code} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              setCustomPermissions((current) => {
                                if (event.target.checked) {
                                  return [...new Set([...current, option.code])];
                                }
                                return current.filter((value) => value !== option.code);
                              });
                            }}
                          />
                          <span className="text-sm text-slate-700 dark:text-zinc-200">{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-zinc-500">Usa los permisos del rol seleccionado.</p>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-14 sm:text-base"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleCreate()}
                className="h-12 rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white sm:h-14 sm:text-base"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editOpen && selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 dark:bg-black/60">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b0b10] dark:text-white dark:shadow-none sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Administración</p>
                <h2 className="mt-2 truncate font-display text-2xl text-slate-950 dark:text-white sm:text-3xl">Editar usuario</h2>
                <p className="mt-2 truncate text-sm text-slate-600 dark:text-zinc-400">{selectedUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="h-10 w-10 rounded-2xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Nombre</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-3 h-12 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:h-14 sm:text-base"
                />
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Rol</span>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as any)}
                  className="mt-3 h-12 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:h-14 sm:text-base"
                >
                  {roleOptions.map((item) => (
                    <option key={item} value={item}>
                      {roleLabel(item)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Sucursal</span>
                <select
                  value={branchId ?? ''}
                  onChange={(event) => setBranchId(event.target.value ? Number(event.target.value) : null)}
                  className="mt-3 h-12 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:h-14 sm:text-base"
                >
                  <option value="">Sin sucursal</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-black/20">
                <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
                <span className="text-sm text-slate-700 dark:text-zinc-200">Activo</span>
              </label>

              <div className="space-y-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 sm:col-span-2 dark:border-white/10 dark:bg-black/20">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-700 dark:text-zinc-200">Permisos personalizados</span>
                  <input
                    type="checkbox"
                    checked={permissionMode === 'CUSTOM'}
                    onChange={(event) => setPermissionMode(event.target.checked ? 'CUSTOM' : 'ROLE')}
                  />
                </label>
                {permissionMode === 'CUSTOM' ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {permissionOptions.map((option) => {
                      const checked = customPermissions.includes(option.code);
                      return (
                        <label key={option.code} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              setCustomPermissions((current) => {
                                if (event.target.checked) {
                                  return [...new Set([...current, option.code])];
                                }
                                return current.filter((value) => value !== option.code);
                              });
                            }}
                          />
                          <span className="text-sm text-slate-700 dark:text-zinc-200">{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-zinc-500">Usa los permisos del rol seleccionado.</p>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-14 sm:text-base"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleUpdate()}
                className="h-12 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-500/15 disabled:opacity-50 dark:text-white sm:h-14 sm:text-base"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {passwordOpen && selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 dark:bg-black/60">
          <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b0b10] dark:text-white dark:shadow-none sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Seguridad</p>
                <h2 className="mt-2 truncate font-display text-2xl text-slate-950 dark:text-white sm:text-3xl">Reset contraseña</h2>
                <p className="mt-2 truncate text-sm text-slate-600 dark:text-zinc-400">{selectedUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setPasswordOpen(false)}
                className="h-10 w-10 rounded-2xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
              >
                ×
              </button>
            </div>

            <label className="mt-6 block">
              <span className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Nueva contraseña</span>
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                className="mt-3 h-12 w-full rounded-[22px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:h-14 sm:text-base"
              />
            </label>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPasswordOpen(false)}
                className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-14 sm:text-base"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handlePassword()}
                className="h-12 rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white sm:h-14 sm:text-base"
              >
                Actualizar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
