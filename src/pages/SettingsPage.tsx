import { Panel } from '@/components/Panel';
import { useEffect, useMemo, useState } from 'react';
import { getBrandSettings, updateBrandSettings } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';

export default function SettingsPage() {
  const snapshot = useSessionStore((state) => state.snapshot);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const [name, setName] = useState('');
  const [currencyCode, setCurrencyCode] = useState('GTQ');
  const [currencySymbol, setCurrencySymbol] = useState('Q');
  const [logoData, setLogoData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currencyOptions = useMemo(
    () => [
      { code: 'GTQ', symbol: 'Q', label: 'Quetzal (GTQ)' },
      { code: 'USD', symbol: '$', label: 'Dólar (USD)' },
      { code: 'PEN', symbol: 'S/', label: 'Sol (PEN)' },
      { code: 'MXN', symbol: '$', label: 'Peso MXN (MXN)' },
      { code: 'CRC', symbol: '₡', label: 'Colón CRC (CRC)' },
      { code: 'EUR', symbol: '€', label: 'Euro (EUR)' },
    ],
    [],
  );

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    setLoading(true);
    setError(null);
    void getBrandSettings()
      .then((brand) => {
        setName(brand.name);
        setCurrencyCode(brand.currencyCode);
        setCurrencySymbol(brand.currencySymbol);
        setLogoData(brand.logoData ?? null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'No fue posible cargar la configuración.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [snapshot]);

  async function handleSave() {
    if (!snapshot) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateBrandSettings({
        name,
        slogan: snapshot.brand.slogan,
        currencyCode,
        currencySymbol,
        logoData,
      });
      await refreshSnapshot();
      setSuccess('Configuración guardada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar la configuración.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <Panel title="Restaurante" subtitle="Nombre, moneda y logo">
        {loading ? (
          <p className="text-sm text-slate-600 dark:text-zinc-400">Cargando configuración...</p>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Nombre del restaurante</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                placeholder="Restaurante"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Moneda</span>
                <select
                  value={currencyCode}
                  onChange={(event) => {
                    const code = event.target.value;
                    setCurrencyCode(code);
                    const preset = currencyOptions.find((item) => item.code === code);
                    if (preset) {
                      setCurrencySymbol(preset.symbol);
                    }
                  }}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-[#0b0b10] dark:text-white"
                >
                  {currencyOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Símbolo</span>
                <input
                  value={currencySymbol}
                  onChange={(event) => setCurrencySymbol(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  placeholder="Q"
                />
              </label>
            </div>

            <div>
              <p className="text-sm text-slate-600 dark:text-zinc-400">Logo</p>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setError(null);
                  setSuccess(null);
                  if (!file) {
                    return;
                  }
                  if (!file.type.startsWith('image/')) {
                    setError('El logo debe ser una imagen.');
                    return;
                  }
                  if (file.size > 1_800_000) {
                    setError('El logo es muy grande. Usa una imagen más liviana.');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    const value = typeof reader.result === 'string' ? reader.result : null;
                    setLogoData(value);
                  };
                  reader.onerror = () => {
                    setError('No fue posible leer el logo.');
                  };
                  reader.readAsDataURL(file);
                }}
                className="mt-3 block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-black/30 dark:text-white dark:file:bg-white/[0.06] dark:file:text-white dark:hover:bg-white/[0.04]"
              />

              {logoData ? (
                <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-black/20">
                  <div className="flex items-center gap-4 px-5 py-4">
                    <img src={logoData} alt="Logo" className="h-14 w-14 rounded-2xl object-contain" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{name || 'Logo cargado'}</p>
                      <p className="text-xs text-slate-500 dark:text-zinc-500">Se aplica en login y menú lateral</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLogoData(null)}
                    className="w-full border-t border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]"
                  >
                    Quitar logo
                  </button>
                </div>
              ) : null}
            </div>

            {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</div> : null}
            {success ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">{success}</div> : null}

            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400 text-sm font-semibold text-zinc-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        )}
      </Panel>

      <Panel title="Sucursales y operación" subtitle="Configuración centralizada multi-sucursal">
        <div className="space-y-4">
          {snapshot?.branches.map((branch) => (
            <article key={branch.id} className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/45 dark:shadow-none">
              <p className="font-semibold text-slate-950 dark:text-white">{branch.name}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                {branch.city} · {branch.address}
              </p>
              <p className="mt-3 text-sm text-slate-700 dark:text-zinc-300">{branch.phone}</p>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="Capacidades activables" subtitle="Hoja de ruta técnica y comercial">
        <div className="space-y-3 text-sm text-slate-700 dark:text-zinc-300">
          {[
            'Facturación electrónica por país y proveedor',
            'WhatsApp para notificaciones y reactivación',
            'QR público para menú digital por sucursal',
            'Respaldos automáticos y bitácora de auditoría',
            'Soporte sin conexión con cola de sincronización',
          ].map((item) => (
            <div key={item} className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
              {item}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
