import { AlertTriangle, ArrowLeft, LogOut, MenuSquare, Phone, Search, UserCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '@/components/AppIcon';
import { ActiveUserLabel } from '@/components/ActiveUserLabel';
import { normalizePhone } from '@/lib/customers';
import { usePosWizardStore } from '@/store/usePosWizardStore';
import { useSessionStore } from '@/store/useSessionStore';

export default function PosCustomerPage() {
  const navigate = useNavigate();
  const logout = useSessionStore((state) => state.logout);
  const tables = useSessionStore((state) => state.snapshot?.tables ?? []);
  const activeOrders = useSessionStore((state) => state.snapshot?.activeOrders ?? []);
  const customers = useSessionStore((state) => state.snapshot?.customers ?? []);
  const tableId = usePosWizardStore((state) => state.tableId);
  const customerId = usePosWizardStore((state) => state.customerId);
  const customerName = usePosWizardStore((state) => state.customerName);
  const customerPhone = usePosWizardStore((state) => state.customerPhone);
  const setCustomer = usePosWizardStore((state) => state.setCustomer);
  const setCustomerName = usePosWizardStore((state) => state.setCustomerName);
  const setCustomerPhone = usePosWizardStore((state) => state.setCustomerPhone);
  const [error, setError] = useState<string | null>(null);

  const table = useMemo(() => tables.find((item) => item.id === tableId) ?? null, [tables, tableId]);
  const activeOrder = useMemo(() => {
    if (!table) {
      return null;
    }

    return activeOrders.find((order) => order.tableCode === table.code) ?? null;
  }, [activeOrders, table]);

  useEffect(() => {
    if (!activeOrder) {
      return;
    }

    if (!customerName.trim()) {
      setCustomer({
        name: activeOrder.customerName,
        phone: '',
      });
    }

    navigate('/pos/menu', { replace: true });
  }, [activeOrder, customerName, navigate, setCustomer]);

  const normalizedPhone = useMemo(() => normalizePhone(customerPhone), [customerPhone]);

  const matchingCustomers = useMemo(() => {
    if (!normalizedPhone) {
      return [];
    }

    return customers
      .filter((customer) => {
        const customerPhoneNormalized = normalizePhone(customer.phone);
        return customerPhoneNormalized.includes(normalizedPhone);
      })
      .slice(0, 5);
  }, [customers, normalizedPhone]);

  const exactPhoneMatch = useMemo(() => {
    if (!normalizedPhone) {
      return null;
    }

    return (
      customers.find((customer) => {
        const customerPhoneNormalized = normalizePhone(customer.phone);
        return customerPhoneNormalized.length > 0 && customerPhoneNormalized === normalizedPhone;
      }) ?? null
    );
  }, [customers, normalizedPhone]);

  const selectedExistingCustomer = useMemo(() => {
    if (!customerId) {
      return null;
    }
    return customers.find((customer) => customer.id === customerId) ?? null;
  }, [customerId, customers]);

  useEffect(() => {
    if (!exactPhoneMatch) {
      return;
    }

    if (selectedExistingCustomer?.id === exactPhoneMatch.id) {
      return;
    }

    setCustomer({
      id: exactPhoneMatch.id,
      name: exactPhoneMatch.name,
      phone: exactPhoneMatch.phone ?? '',
    });
  }, [exactPhoneMatch, selectedExistingCustomer?.id, setCustomer]);

  function handleNext() {
    if (!tableId) {
      navigate('/pos/mesas');
      return;
    }

    if (!customerName.trim()) {
      setError('Ingresa el nombre del cliente.');
      return;
    }

    setError(null);
    navigate('/pos/menu');
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-900 dark:bg-[#07070a] dark:text-white sm:px-6 sm:py-6 lg:px-10 lg:py-8">
      <header className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">POS</p>
            <h1 className="mt-3 font-display text-3xl text-slate-950 dark:text-white sm:text-4xl lg:text-5xl">Datos del cliente</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400 sm:text-base lg:text-lg">Mesa: {table?.code ?? 'No seleccionada'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActiveUserLabel height="h-11 sm:h-12 lg:h-14" />
            <button
              type="button"
              onClick={logout}
              className="session-exit inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition sm:h-12 sm:text-base lg:h-14 lg:px-5 lg:text-lg"
            >
              <AppIcon icon={LogOut} className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-8 max-w-3xl sm:mt-10">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:p-6 lg:p-8">
          <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Nombre</label>
          <input
            value={customerName}
            onChange={(event) => {
              setCustomerName(event.target.value);
              setError(null);
            }}
            placeholder="Consumidor final"
            className="mt-3 h-12 w-full rounded-[22px] border border-slate-200 bg-white px-5 text-base text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:h-14 sm:text-lg lg:h-16 lg:text-xl"
            autoFocus
          />
          <div className="mt-5">
            <label className="text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-zinc-500">Teléfono</label>
            <div className="relative mt-3">
              <span className="pointer-events-none absolute inset-y-0 left-4 inline-flex items-center text-slate-400 dark:text-zinc-500">
                <AppIcon icon={Search} className="h-4 w-4" />
              </span>
              <input
                value={customerPhone}
                onChange={(event) => {
                  setCustomerPhone(event.target.value);
                  setError(null);
                }}
                placeholder="Buscar o escribir teléfono"
                className="h-12 w-full rounded-[22px] border border-slate-200 bg-white pl-11 pr-5 text-base text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white sm:h-14 sm:text-lg lg:h-16 lg:text-xl"
                inputMode="tel"
              />
            </div>
          </div>
          {exactPhoneMatch ? (
            <div className="mt-4 rounded-[22px] border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 sm:text-base">
              <div className="flex items-start gap-3">
                <AppIcon icon={AlertTriangle} className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Este número ya está registrado.</p>
                  <p className="mt-1">
                    Se sugiere usar a <strong>{exactPhoneMatch.name}</strong> y se completan sus datos automáticamente.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {selectedExistingCustomer ? (
            <div className="mt-4 rounded-[22px] border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200 sm:text-base">
              <div className="flex items-start gap-3">
                <AppIcon icon={UserCheck} className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Cliente encontrado</p>
                  <p className="mt-1">
                    {selectedExistingCustomer.name}
                    {selectedExistingCustomer.phone ? ` • ${selectedExistingCustomer.phone}` : ''}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {matchingCustomers.length && !exactPhoneMatch ? (
            <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">Sugerencias</p>
              <div className="mt-3 space-y-2">
                {matchingCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() =>
                      setCustomer({
                        id: customer.id,
                        name: customer.name,
                        phone: customer.phone ?? '',
                      })
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-black/20 dark:text-zinc-200 dark:hover:bg-white/[0.05]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-950 dark:text-white">{customer.name}</span>
                      <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-500">
                        <AppIcon icon={Phone} className="h-3.5 w-3.5" />
                        {customer.phone ?? 'Sin teléfono'}
                      </span>
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-700 dark:text-amber-200">Usar</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 rounded-[22px] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200 sm:text-base">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => navigate('/pos/mesas')}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06] sm:h-14 sm:text-base lg:h-16 lg:text-lg"
            >
              <AppIcon icon={ArrowLeft} className="h-4 w-4" />
              Volver a mesas
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white sm:h-14 sm:text-base lg:h-16 lg:text-lg"
            >
              <AppIcon icon={MenuSquare} className="h-4 w-4" />
              Ir al menú
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
