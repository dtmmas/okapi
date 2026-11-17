import { useEffect, useMemo, useState } from 'react';
import { Panel } from '@/components/Panel';
import { getRolesConfiguration, updateRoleProfile } from '@/services/api';
import type { PermissionCatalogItem, PermissionCode, RoleProfileSummary } from '@/types/restaurant';

type RoleEditorState = {
  role: RoleProfileSummary['role'];
  name: string;
  description: string;
  sortOrder: number;
  permissions: PermissionCode[];
};

function buildEditor(role: RoleProfileSummary): RoleEditorState {
  return {
    role: role.role,
    name: role.name,
    description: role.description ?? '',
    sortOrder: role.sortOrder,
    permissions: role.permissions,
  };
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleProfileSummary[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionCatalogItem[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleProfileSummary['role'] | null>(null);
  const [editor, setEditor] = useState<RoleEditorState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sortedRoles = useMemo(
    () =>
      roles
        .slice()
        .sort((left, right) => (left.sortOrder === right.sortOrder ? left.name.localeCompare(right.name, 'es') : left.sortOrder - right.sortOrder)),
    [roles],
  );

  const permissionGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        order: number;
        items: PermissionCatalogItem[];
      }
    >();

    permissionCatalog.forEach((item) => {
      const current = groups.get(item.category) ?? {
        key: item.category,
        label: item.categoryLabel,
        order: item.categoryOrder,
        items: [],
      };
      current.items.push(item);
      groups.set(item.category, current);
    });

    return [...groups.values()]
      .sort((left, right) => left.order - right.order)
      .map((group) => ({
        ...group,
        items: group.items.slice().sort((left, right) => left.itemOrder - right.itemOrder),
      }));
  }, [permissionCatalog]);

  async function loadConfiguration(nextRole?: RoleProfileSummary['role'] | null) {
    setLoading(true);
    setError(null);

    try {
      const data = await getRolesConfiguration();
      setRoles(data.roles);
      setPermissionCatalog(data.permissionCatalog);

      const fallbackRole = nextRole ?? selectedRole ?? data.roles[0]?.role ?? null;
      const resolvedRole = data.roles.find((item) => item.role === fallbackRole) ?? data.roles[0] ?? null;
      setSelectedRole(resolvedRole?.role ?? null);
      setEditor(resolvedRole ? buildEditor(resolvedRole) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible cargar la configuración de roles.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConfiguration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectRole(roleCode: RoleProfileSummary['role']) {
    const role = sortedRoles.find((item) => item.role === roleCode);
    if (!role) {
      return;
    }

    setSelectedRole(roleCode);
    setEditor(buildEditor(role));
    setError(null);
    setSuccess(null);
  }

  function togglePermission(permission: PermissionCode, checked: boolean) {
    setEditor((current) => {
      if (!current) {
        return current;
      }

      const nextPermissions = checked
        ? [...new Set([...current.permissions, permission])]
        : current.permissions.filter((item) => item !== permission);

      return {
        ...current,
        permissions: nextPermissions,
      };
    });
  }

  async function handleSave() {
    if (!editor) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateRoleProfile(editor.role, {
        name: editor.name.trim(),
        description: editor.description.trim(),
        sortOrder: Number(editor.sortOrder),
        permissions: editor.permissions,
      });

      setRoles((current) =>
        current.map((item) => (item.role === updated.role ? updated : item)).sort((left, right) => left.sortOrder - right.sortOrder),
      );
      setEditor(buildEditor(updated));
      setSelectedRole(updated.role);
      setSuccess('Rol guardado correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar el rol.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <Panel title="Roles" subtitle="Orden visual y perfiles operativos por tenant">
        {loading ? <p className="text-sm text-slate-600 dark:text-zinc-400">Cargando roles...</p> : null}

        <div className="space-y-3">
          {sortedRoles.map((role) => {
            const active = role.role === selectedRole;
            return (
              <button
                key={role.role}
                type="button"
                onClick={() => selectRole(role.role)}
                className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                  active
                    ? 'border-amber-300/40 bg-amber-300/10 shadow-sm dark:border-amber-300/30 dark:bg-amber-300/10'
                    : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950 dark:text-white">{role.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Orden {role.sortOrder}</p>
                  </div>
                  <span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-black/20 dark:text-zinc-200">
                    {role.permissions.length}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600 dark:text-zinc-400">{role.description || 'Sin descripción.'}</p>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="Editor de rol"
        subtitle="Permisos agrupados por categorías para un control más claro"
        action={
          <button
            type="button"
            disabled={!editor || saving}
            onClick={() => void handleSave()}
            className="h-11 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
          >
            {saving ? 'Guardando...' : 'Guardar rol'}
          </button>
        }
      >
        {!editor ? <p className="text-sm text-slate-600 dark:text-zinc-400">Selecciona un rol para editarlo.</p> : null}

        {error ? <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</div> : null}
        {success ? <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">{success}</div> : null}

        {editor ? (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_1.2fr_180px]">
              <label className="block">
                <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Nombre visible</span>
                <input
                  value={editor.name}
                  onChange={(event) => setEditor((current) => (current ? { ...current, name: event.target.value } : current))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Descripción</span>
                <input
                  value={editor.description}
                  onChange={(event) => setEditor((current) => (current ? { ...current, description: event.target.value } : current))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Orden</span>
                <input
                  value={editor.sortOrder}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, sortOrder: Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : 0 } : current,
                    )
                  }
                  type="number"
                  min={0}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </label>
            </div>

            <div className="grid gap-4 2xl:grid-cols-2">
              {permissionGroups.map((group) => (
                <section key={group.key} className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-black/20">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950 dark:text-white">{group.label}</p>
                      <p className="text-sm text-slate-500 dark:text-zinc-500">{group.items.length} permisos disponibles</p>
                    </div>
                    <span className="rounded-2xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200">
                      {group.items.filter((item) => editor.permissions.includes(item.code)).length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {group.items.map((item) => {
                      const checked = editor.permissions.includes(item.code);
                      return (
                        <label
                          key={item.code}
                          className="flex items-start gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]"
                        >
                          <input type="checkbox" checked={checked} onChange={(event) => togglePermission(item.code, event.target.checked)} className="mt-1" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.label}</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">{item.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
