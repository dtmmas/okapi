import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { Panel } from '@/components/Panel';
import { createCustomer, deleteCustomer, updateCustomer } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';

type CustomerFormState = {
  name: string;
  phone: string;
  email: string;
  points: string;
  creditLimit: string;
};

const initialForm: CustomerFormState = {
  name: '',
  phone: '',
  email: '',
  points: '0',
  creditLimit: '0',
};

export default function CustomersPage() {
  const snapshot = useSessionStore((state) => state.snapshot);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const customers = snapshot?.customers ?? [];
  const currencySymbol = snapshot?.brand.currencySymbol ?? 'Q';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerFormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === editingId) ?? null,
    [customers, editingId],
  );

  function closeDialog() {
    setDialogOpen(false);
    setEditingId(null);
    setForm(initialForm);
    setError(null);
  }

  function openCreateDialog() {
    setDialogOpen(true);
    setEditingId(null);
    setForm(initialForm);
    setError(null);
    setSuccess(null);
  }

  function loadCustomer(customerId: number) {
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) {
      return;
    }

    setDialogOpen(true);
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      points: String(customer.points),
      creditLimit: String(customer.creditLimit),
    });
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        points: Number(form.points || '0'),
        creditLimit: Number(form.creditLimit || '0'),
      };

      if (editingId) {
        await updateCustomer(editingId, payload);
        setSuccess('Cliente actualizado correctamente.');
      } else {
        await createCustomer(payload);
        setSuccess('Cliente creado correctamente.');
      }

      await refreshSnapshot();
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar el cliente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(customerId: number) {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await deleteCustomer(customerId);
      await refreshSnapshot();
      if (editingId === customerId) {
        closeDialog();
      }
      setSuccess('Cliente eliminado correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible eliminar el cliente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="grid gap-6">
      <Panel
        title="Clientes registrados"
        subtitle="Consulta, edita o elimina clientes del restaurante."
        action={
          <button
            type="button"
            onClick={openCreateDialog}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white"
          >
            <AppIcon icon={Plus} className="h-4 w-4" />
            Nuevo cliente
          </button>
        }
      >
        {error ? <div className="mb-4 rounded-[20px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</div> : null}
        {success ? (
          <div className="mb-4 rounded-[20px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">{success}</div>
        ) : null}

        <div className="space-y-4">
          {customers.length === 0 ? (
            <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 text-sm text-slate-600 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:text-zinc-400 dark:shadow-none">
              Aún no hay clientes registrados.
            </div>
          ) : null}

          {customers.map((customer) => (
            <article key={customer.id} className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">{customer.name}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                    {customer.phone || 'Sin teléfono'} {customer.email ? `• ${customer.email}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadCustomer(customer.id)}
                    className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                  >
                    <AppIcon icon={Pencil} className="h-4 w-4" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(customer.id)}
                    disabled={submitting}
                    className="inline-flex h-10 items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 text-sm text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-50"
                  >
                    <AppIcon icon={Trash2} className="h-4 w-4" />
                    Eliminar
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-slate-600 dark:text-zinc-300 md:grid-cols-4">
                <div>
                  <p className="text-slate-500 dark:text-zinc-500">Segmento</p>
                  <p className="mt-1 text-slate-950 dark:text-white">{customer.segment}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-zinc-500">Puntos</p>
                  <p className="mt-1 text-slate-950 dark:text-white">{customer.points}</p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-zinc-500">Límite</p>
                  <p className="mt-1 text-slate-950 dark:text-white">
                    {currencySymbol} {customer.creditLimit}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-zinc-500">Usado</p>
                  <p className="mt-1 text-slate-950 dark:text-white">
                    {currencySymbol} {customer.creditUsed}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Panel>
      </div>

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 dark:bg-black/60">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b0b10] dark:text-white dark:shadow-none sm:p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Clientes</p>
                <h2 className="mt-2 truncate font-display text-2xl text-slate-950 dark:text-white sm:text-3xl">
                  {selectedCustomer ? `Editar cliente: ${selectedCustomer.name}` : 'Nuevo cliente'}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
                  CRUD básico de clientes con puntos y límite de crédito.
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                className="h-10 w-10 rounded-2xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white dark:hover:bg-white/[0.06]"
              >
                ×
              </button>
            </div>

            {error ? <div className="mt-4 rounded-[20px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</div> : null}

            <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Nombre</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                    placeholder="Nombre del cliente"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Teléfono</span>
                  <input
                    value={form.phone}
                    onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                    placeholder="502..."
                  />
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Correo</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  placeholder="cliente@correo.com"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Puntos</span>
                  <input
                    type="number"
                    min="0"
                    value={form.points}
                    onChange={(event) => setForm((current) => ({ ...current, points: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-slate-700 dark:text-zinc-300">Límite de crédito</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.creditLimit}
                    onChange={(event) => setForm((current) => ({ ...current, creditLimit: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                >
                  <AppIcon icon={X} className="h-4 w-4" />
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
                >
                  <AppIcon icon={editingId ? Pencil : Plus} className="h-4 w-4" />
                  {submitting ? 'Guardando...' : editingId ? 'Actualizar cliente' : 'Crear cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
