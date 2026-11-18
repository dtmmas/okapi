import { Panel } from '@/components/Panel';
import { createBranch, deleteBranch, updateBranch } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';
import { useMemo, useState } from 'react';

type BranchFormState = {
  name: string;
  city: string;
  address: string;
  phone: string;
  isActive: boolean;
};

const emptyBranchForm: BranchFormState = {
  name: '',
  city: '',
  address: '',
  phone: '',
  isActive: true,
};

function branchStatusClass(isActive: boolean) {
  return isActive
    ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
    : 'border-slate-300/60 bg-slate-500/10 text-slate-600 dark:text-zinc-300';
}

export default function BranchesPage() {
  const snapshot = useSessionStore((state) => state.snapshot);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);

  const [branchForm, setBranchForm] = useState<BranchFormState>(emptyBranchForm);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [branchSuccess, setBranchSuccess] = useState<string | null>(null);
  const [branchEditorOpen, setBranchEditorOpen] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<number | null>(null);

  const branches = snapshot?.branches ?? [];
  const sortedBranches = useMemo(
    () =>
      branches
        .slice()
        .sort((left, right) => Number(right.isActive) - Number(left.isActive) || left.name.localeCompare(right.name, 'es')),
    [branches],
  );

  function resetBranchEditor() {
    setBranchForm(emptyBranchForm);
    setEditingBranchId(null);
    setBranchEditorOpen(false);
  }

  function openCreateBranch() {
    setBranchError(null);
    setBranchSuccess(null);
    setBranchForm(emptyBranchForm);
    setEditingBranchId(null);
    setBranchEditorOpen(true);
  }

  function openEditBranch(branch: (typeof branches)[number]) {
    setBranchError(null);
    setBranchSuccess(null);
    setBranchForm({
      name: branch.name,
      city: branch.city,
      address: branch.address,
      phone: branch.phone,
      isActive: branch.isActive,
    });
    setEditingBranchId(branch.id);
    setBranchEditorOpen(true);
  }

  async function handleBranchSubmit() {
    setBranchLoading(true);
    setBranchError(null);
    setBranchSuccess(null);

    try {
      const payload = {
        name: branchForm.name.trim(),
        city: branchForm.city.trim(),
        address: branchForm.address.trim(),
        phone: branchForm.phone.trim(),
        isActive: branchForm.isActive,
      };

      if (editingBranchId) {
        await updateBranch(editingBranchId, payload);
        setBranchSuccess('Sucursal actualizada.');
      } else {
        await createBranch(payload);
        setBranchSuccess('Sucursal creada.');
      }

      await refreshSnapshot();
      resetBranchEditor();
    } catch (err) {
      setBranchError(err instanceof Error ? err.message : 'No fue posible guardar la sucursal.');
    } finally {
      setBranchLoading(false);
    }
  }

  async function handleDeleteBranch(branch: (typeof branches)[number]) {
    if (!window.confirm(`Eliminar la sucursal ${branch.name}?`)) {
      return;
    }

    setBranchLoading(true);
    setBranchError(null);
    setBranchSuccess(null);
    try {
      await deleteBranch(branch.id);
      await refreshSnapshot();
      if (editingBranchId === branch.id) {
        resetBranchEditor();
      }
      setBranchSuccess('Sucursal eliminada.');
    } catch (err) {
      setBranchError(err instanceof Error ? err.message : 'No fue posible eliminar la sucursal.');
    } finally {
      setBranchLoading(false);
    }
  }

  return (
    <Panel
      title="Sucursales y operacion"
      subtitle="Crea, actualiza, activa o desactiva sucursales desde un modulo propio"
      action={
        <button
          type="button"
          onClick={openCreateBranch}
          className="h-11 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white"
        >
          Nueva sucursal
        </button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">
          Si una sucursal ya tiene usuarios, mesas, ventas o inventario, el sistema no la elimina. En ese caso puedes desactivarla.
        </div>

        {branchError ? <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{branchError}</div> : null}
        {branchSuccess ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">{branchSuccess}</div> : null}

        {branchEditorOpen ? (
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950/45 dark:shadow-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950 dark:text-white">
                  {editingBranchId ? 'Editar sucursal' : 'Crear sucursal'}
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">Define nombre, ubicacion, contacto y estado operativo.</p>
              </div>
              <button
                type="button"
                onClick={resetBranchEditor}
                className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/[0.06]"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Nombre</span>
                <input
                  value={branchForm.name}
                  onChange={(event) => setBranchForm((current) => ({ ...current, name: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  placeholder="Sucursal Central"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Ciudad</span>
                <input
                  value={branchForm.city}
                  onChange={(event) => setBranchForm((current) => ({ ...current, city: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  placeholder="Guatemala"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Direccion</span>
                <input
                  value={branchForm.address}
                  onChange={(event) => setBranchForm((current) => ({ ...current, address: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  placeholder="Zona 10, avenida principal"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Telefono</span>
                <input
                  value={branchForm.phone}
                  onChange={(event) => setBranchForm((current) => ({ ...current, phone: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  placeholder="5555-0000"
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={branchForm.isActive}
                  onChange={(event) => setBranchForm((current) => ({ ...current, isActive: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                />
                Sucursal activa
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={branchLoading}
                onClick={handleBranchSubmit}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400 px-5 text-sm font-semibold text-zinc-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {branchLoading ? 'Guardando...' : editingBranchId ? 'Guardar sucursal' : 'Crear sucursal'}
              </button>
              <button
                type="button"
                disabled={branchLoading}
                onClick={resetBranchEditor}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-zinc-100 dark:hover:bg-white/[0.06]"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {sortedBranches.length ? (
          sortedBranches.map((branch) => (
            <article key={branch.id} className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-950 dark:text-white">{branch.name}</p>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${branchStatusClass(branch.isActive)}`}>
                      {branch.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                    {branch.city} · {branch.address}
                  </p>
                  <p className="mt-3 text-sm text-slate-700 dark:text-zinc-300">{branch.phone}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditBranch(branch)}
                    className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={branchLoading}
                    onClick={() => void handleDeleteBranch(branch)}
                    className="h-10 rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-200"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
            Aun no hay sucursales registradas.
          </div>
        )}
      </div>
    </Panel>
  );
}
