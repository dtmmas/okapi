import { Panel } from '@/components/Panel';
import { paperWidth, paperWidths, readPaperWidth, savePaperWidth } from '@/lib/printing/paper';
import { printReceipt, receiptFormatter } from '@/lib/printing/print-service';
import { buildReceiptHtml } from '@/lib/printing/receipt-builders';
import { hasSunmiPrinterBridge } from '@/lib/printing/sunmi-print-provider';
import { getBrandSettings, updateBrandSettings } from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';
import { useEffect, useMemo, useState } from 'react';

export default function SettingsPage() {
  const snapshot = useSessionStore((state) => state.snapshot);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const [name, setName] = useState('');
  const [stationLayout, setStationLayout] = useState('SEPARATE');
  const [companyDetails, setCompanyDetails] = useState({ address: '', phone: '', slogan: '' });
  const [currencyCode, setCurrencyCode] = useState('GTQ');
  const [currencySymbol, setCurrencySymbol] = useState('Q');
  const [logoData, setLogoData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const nativePrinter = hasSunmiPrinterBridge();
  const [width, setWidth] = useState(() => paperWidth(Math.min(readPaperWidth(), nativePrinter ? 80 : 112)));
  const [printerMessage, setPrinterMessage] = useState('');
  const [testing, setTesting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewHtml, setPreviewHtml] = useState('');
  const formatPreview = useMemo(() => receiptFormatter(logoData), [width, logoData]);
  const sample = useMemo(() => ({
    brandName: name.trim() || 'Restaurante', title: 'PRUEBA DE IMPRESIÓN',
    companyDetails,
    printedAt: new Date().toLocaleString('es-GT'), metadata: [{ label: 'Ancho', value: `${width} mm` }],
    items: [{ left: 'Producto de ejemplo', right: `${currencySymbol.trim()} 12.50`.trim() }],
    footerLabel: 'PRUEBA SIN VALOR COMERCIAL',
  }), [width, name, currencySymbol, companyDetails]);

  useEffect(() => {
    if (!previewOpen) return;
    let active = true;
    void formatPreview(sample).then(document => {
      if (active) setPreviewHtml(buildReceiptHtml(document, 'preview'));
    });
    return () => { active = false; };
  }, [previewOpen, sample, formatPreview]);

  const currencyOptions = useMemo(
    () => [
      { code: 'GTQ', symbol: 'Q', label: 'Quetzal (GTQ)' },
      { code: 'USD', symbol: '$', label: 'Dolar (USD)' },
      { code: 'PEN', symbol: 'S/', label: 'Sol (PEN)' },
      { code: 'MXN', symbol: '$', label: 'Peso MXN (MXN)' },
      { code: 'CRC', symbol: 'CRC', label: 'Colon CRC (CRC)' },
      { code: 'EUR', symbol: 'EUR', label: 'Euro (EUR)' },
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
        setStationLayout(brand.stationLayout ?? 'SEPARATE');
        setCompanyDetails({ address: brand.address ?? '', phone: brand.phone ?? '', slogan: brand.slogan ?? '' });
        setCurrencyCode(brand.currencyCode);
        setCurrencySymbol(brand.currencySymbol);
        setLogoData(brand.logoData ?? null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'No fue posible cargar la configuracion.');
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
        ...companyDetails,
        stationLayout,
        currencyCode,
        currencySymbol,
        logoData,
      });
      await refreshSnapshot();
      setSuccess('Configuracion guardada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar la configuracion.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <Panel title="Impresora de tickets" subtitle="Preferencia de este navegador o terminal">
        <label className="block text-sm">Ancho del rollo
          <select value={width} onChange={event => {
            const next = paperWidth(event.target.value);
            try {
              savePaperWidth(next);
              setWidth(next);
              setPrinterMessage(`Guardado en este equipo: ${next} mm.`);
            } catch { setPrinterMessage('No se pudo guardar la preferencia en este equipo.'); }
          }} className="mt-2 h-12 w-full rounded-2xl border px-4 dark:bg-zinc-900">
            {paperWidths.filter(mm => !nativePrinter || mm <= 80).map(mm =>
              <option key={mm} value={mm}>{mm} mm{mm === 80 ? ' (predeterminado)' : ''}</option>)}
          </select>
        </label>
        <p className="my-3 text-sm text-slate-600 dark:text-zinc-400">
          Elige el ancho que admite tu impresora. {nativePrinter ? 'Este ajuste no cambia el tamaño físico del rollo.' : 'En el diálogo de impresión, selecciona la impresora y el mismo tamaño de papel.'}
        </p>
        <button type="button" aria-expanded={previewOpen}
          className="mr-2 rounded-xl border px-4 py-2" onClick={() => setPreviewOpen(open => !open)}>
          {previewOpen ? 'Ocultar vista previa' : 'Vista previa'}
        </button>
        <button type="button" disabled={testing} className="rounded-xl border px-4 py-2" onClick={async () => {
          setTesting(true);
          setPrinterMessage('');
          try {
            await printReceipt({ ...sample, printedAt: new Date().toLocaleString('es-GT') }, logoData);
            setPrinterMessage('Prueba enviada al sistema de impresión.');
          } catch (error) { setPrinterMessage(error instanceof Error ? error.message : 'No se pudo imprimir la prueba.'); }
          finally { setTesting(false); }
        }}>{testing ? 'Enviando…' : 'Imprimir prueba'}</button>
        <p role="status" className="mt-2 text-sm">{printerMessage}</p>
        {previewOpen && <div className="mt-4 min-w-0 rounded-xl bg-slate-100 p-3 dark:bg-zinc-800">
          <p className="mb-2 text-sm">Vista previa en vivo · Rollo de {width} mm</p>
          <div className="overflow-x-auto">
            {previewHtml ? <iframe title={`Ticket de prueba de ${width} mm`} sandbox="" srcDoc={previewHtml}
              style={{ width: `${width}mm` }} className="mx-auto block h-96 border-0 bg-white shadow-sm" />
              : <p role="status">Preparando ticket…</p>}
          </div>
        </div>}
      </Panel>
      <Panel title="Restaurante" subtitle="Datos de la empresa, moneda y logo">
        {loading ? (
          <p className="text-sm text-slate-600 dark:text-zinc-400">Cargando configuracion...</p>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm">Pantallas de preparación
              <select value={stationLayout} onChange={event => setStationLayout(event.target.value)}
                className="mt-2 h-12 w-full rounded-2xl border px-4 dark:bg-zinc-900">
                <option value="SEPARATE">Áreas separadas</option>
                <option value="BAR_PASTRY">Barra + Pastelería</option>
                <option value="KITCHEN_BAR">Cocina + Barra</option>
                <option value="KITCHEN_PASTRY">Cocina + Pastelería</option>
                <option value="ALL">Cocina + Barra + Pastelería</option>
              </select>
              <span className="mt-1 block text-xs">Los usuarios de las áreas unidas ven y atienden las mismas comandas. Las demás áreas siguen separadas.</span>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Nombre del restaurante</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-amber-300/50 dark:border-white/10 dark:bg-white/5 dark:text-white"
                placeholder="Restaurante"
              />
            </label>
            {([
              ['address', 'Dirección', 250],
              ['phone', 'Número de teléfono', 40],
              ['slogan', 'Eslogan', 160],
            ] as const).map(([key, label, limit]) => (
              <label key={key} className="block">
                <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">{label} (opcional)</span>
                <input type={key === 'phone' ? 'tel' : 'text'} maxLength={limit} value={companyDetails[key]}
                  onChange={event => {
                    const value = event.target.value;
                    setCompanyDetails(previous => ({ ...previous, [key]: value }));
                  }}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm dark:border-white/10 dark:bg-white/5" />
              </label>
            ))}

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
                <span className="mb-2 block text-sm text-slate-600 dark:text-zinc-400">Simbolo</span>
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
                    setError('El logo es muy grande. Usa una imagen mas liviana.');
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
                      <p className="text-xs text-slate-500 dark:text-zinc-500">Se aplica en login y menu lateral</p>
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

      <Panel title="Capacidades activables" subtitle="Hoja de ruta tecnica y comercial">
        <div className="space-y-3 text-sm text-slate-700 dark:text-zinc-300">
          {[
            'Facturacion electronica por pais y proveedor',
            'WhatsApp para notificaciones y reactivacion',
            'QR publico para menu digital por sucursal',
            'Respaldos automaticos y bitacora de auditoria',
            'Soporte sin conexion con cola de sincronizacion',
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
