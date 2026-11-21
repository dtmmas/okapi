import { Panel } from '@/components/Panel';
import { paperWidth, paperWidths, readPaperWidth, savePaperWidth } from '@/lib/printing/paper';
import { printReceipt, receiptFormatter } from '@/lib/printing/print-service';
import { buildReceiptHtml } from '@/lib/printing/receipt-builders';
import { hasSunmiPrinterBridge } from '@/lib/printing/sunmi-print-provider';
import {
  downloadSettingsBackup,
  downloadSettingsBackupArchive,
  getBrandSettings,
  getSettingsBackupHistory,
  getSettingsBackupStatus,
  importSettingsBackup,
  startSettingsBackup,
  startSettingsBackupRestore,
  updateBrandSettings,
  type BackupArchiveSummary,
  type BackupMode,
} from '@/services/api';
import { useSessionStore } from '@/store/useSessionStore';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SettingsPage() {
  const navigate = useNavigate();
  const snapshot = useSessionStore((state) => state.snapshot);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const logout = useSessionStore((state) => state.logout);
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
  const [backupJobId, setBackupJobId] = useState<string | null>(null);
  const [backupMode, setBackupMode] = useState<BackupMode | null>(null);
  const [backupProgress, setBackupProgress] = useState(0);
  const [backupMessage, setBackupMessage] = useState('');
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [backupExportNote, setBackupExportNote] = useState<string | null>(null);
  const [backupJobOperation, setBackupJobOperation] = useState<'backup' | 'restore' | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupArchiveSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
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

  async function loadBackupHistory() {
    setHistoryLoading(true);
    try {
      const items = await getSettingsBackupHistory();
      setBackupHistory(items);
    } catch {
      setBackupHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    void loadBackupHistory();
  }, [snapshot]);

  useEffect(() => {
    if (!backupJobId || !backupRunning) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const status = await getSettingsBackupStatus(backupJobId);
        if (cancelled) {
          return;
        }

        setBackupProgress(status.progress);
        setBackupMessage(status.message);

        if (status.status === 'completed') {
          if (status.operation === 'restore') {
            setBackupRunning(false);
            setBackupJobId(null);
            setBackupMode(null);
            setBackupJobOperation(null);
            const hintEmails = status.loginHints?.filter(Boolean) ?? [];
            const loginHint = hintEmails.length
              ? `Correos del respaldo: ${hintEmails.join(', ')}. Usa la contraseña guardada en ese respaldo (las cuentas de desarrollo ya no aplican).`
              : 'Usa el correo y contraseña del respaldo (no las cuentas de desarrollo de abajo).';
            logout();
            navigate('/login', {
              replace: true,
              state: {
                notice: `Restauración completada. La base fue reemplazada: vuelve a iniciar sesión. ${loginHint}`,
              },
            });
            return;
          } else {
            await downloadSettingsBackup(backupJobId, status.fileName);
            setBackupRunning(false);
            setBackupSuccess(
              backupMode === 'full'
                ? 'Respaldo completo generado, guardado en el servidor y descargado.'
                : 'Respaldo de base de datos generado, guardado en el servidor y descargado.',
            );
            setBackupExportNote(
              status.databaseExportMethod === 'generated-sql' && status.databaseExportNote
                ? status.databaseExportNote
                : status.databaseExportMethod === 'mysqldump'
                  ? 'Base de datos exportada con mysqldump (formato SQL estándar).'
                  : 'Copia archivada en el historial del servidor.',
            );
            await loadBackupHistory();
          }
          setBackupJobId(null);
          setBackupMode(null);
          setBackupJobOperation(null);
          return;
        }

        if (status.status === 'failed') {
          setBackupRunning(false);
          setBackupError(
            status.error ??
              (status.operation === 'restore'
                ? 'No fue posible completar la restauración.'
                : 'No fue posible completar el respaldo.'),
          );
          setBackupJobId(null);
          setBackupMode(null);
          setBackupJobOperation(null);
        }
      } catch (err) {
        if (!cancelled) {
          setBackupRunning(false);
          setBackupError(err instanceof Error ? err.message : 'No fue posible consultar el progreso del respaldo.');
          setBackupJobId(null);
          setBackupMode(null);
          setBackupJobOperation(null);
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 700);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [backupJobId, backupMode, backupRunning, logout, navigate]);

  async function handleBackup(mode: BackupMode) {
    if (backupRunning) {
      return;
    }

    setBackupRunning(true);
    setBackupError(null);
    setBackupSuccess(null);
    setBackupExportNote(null);
    setBackupProgress(0);
    setBackupMessage('Iniciando...');
    setBackupMode(mode);
    setBackupJobOperation('backup');

    try {
      const started = await startSettingsBackup(mode);
      setBackupJobId(started.jobId);
      setBackupProgress(started.progress);
      setBackupMessage(started.message);
    } catch (err) {
      setBackupRunning(false);
      setBackupMode(null);
      setBackupJobId(null);
      setBackupJobOperation(null);
      setBackupError(err instanceof Error ? err.message : 'No fue posible iniciar el respaldo.');
    }
  }

  async function handleRestoreArchive(archive: BackupArchiveSummary) {
    if (backupRunning) {
      return;
    }

    const confirmed = window.confirm(
      `¿Restaurar "${archive.fileName}"?\n\nEsto reemplazará los datos actuales${archive.mode === 'full' ? ' y las imágenes del menú' : ''}. Esta acción no se puede deshacer.`,
    );
    if (!confirmed) {
      return;
    }

    setBackupRunning(true);
    setBackupError(null);
    setBackupSuccess(null);
    setBackupExportNote(null);
    setBackupProgress(0);
    setBackupMessage('Iniciando restauración...');
    setBackupJobOperation('restore');
    setBackupMode(archive.mode);

    try {
      const started = await startSettingsBackupRestore(archive.id);
      setBackupJobId(started.jobId);
      setBackupProgress(started.progress);
      setBackupMessage(started.message);
    } catch (err) {
      setBackupRunning(false);
      setBackupJobOperation(null);
      setBackupMode(null);
      setBackupError(err instanceof Error ? err.message : 'No fue posible iniciar la restauración.');
    }
  }

  async function handleImportBackup(file: File | null) {
    if (!file || backupRunning || importingBackup) {
      return;
    }

    setImportingBackup(true);
    setBackupError(null);
    setBackupSuccess(null);

    try {
      await importSettingsBackup(file);
      setBackupSuccess(`Respaldo "${file.name}" importado al historial del servidor.`);
      await loadBackupHistory();
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'No fue posible importar el respaldo.');
    } finally {
      setImportingBackup(false);
    }
  }

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

      <Panel title="Respaldos" subtitle="Crear, historial, descargar, importar y restaurar">
        <p className="text-sm text-slate-600 dark:text-zinc-400">
          Cada respaldo exitoso queda guardado en el servidor (historial). Solo puede ejecutarse una tarea a la vez.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={backupRunning}
            onClick={() => void handleBackup('database')}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
          >
            <p className="text-sm font-semibold text-slate-950 dark:text-white">Solo base de datos</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-zinc-500">
              Volcado SQL con mysqldump; si no está instalado, se genera un .sql desde las tablas.
            </p>
          </button>
          <button
            type="button"
            disabled={backupRunning}
            onClick={() => void handleBackup('full')}
            className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-4 text-left transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <p className="text-sm font-semibold text-emerald-950 dark:text-white">Completo (BD + archivos)</p>
            <p className="mt-2 text-xs text-emerald-900/80 dark:text-emerald-100/80">
              Incluye la base de datos y las imágenes subidas del menú (platillos, bebidas, salsas, etc.).
            </p>
          </button>
        </div>

        {backupRunning || backupProgress > 0 ? (
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400">
              <span>{backupMessage || 'Procesando respaldo...'}</span>
              <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{backupProgress}%</span>
            </div>
            <div
              className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={backupProgress}
              aria-label="Progreso del respaldo"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 via-emerald-400 to-teal-500 transition-[width] duration-300 ease-out"
                style={{ width: `${backupProgress}%` }}
              />
            </div>
          </div>
        ) : null}

        {backupError ? (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
            {backupError}
          </div>
        ) : null}
        {backupSuccess ? (
          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
            <p>{backupSuccess}</p>
            {backupExportNote ? <p className="mt-2 text-xs text-emerald-900/80 dark:text-emerald-100/90">{backupExportNote}</p> : null}
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-sm font-semibold text-slate-950 dark:text-white">Importar respaldo</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">Sube un archivo .sql o .zip generado por Okapi u otro entorno compatible.</p>
          <input
            type="file"
            accept=".sql,.zip,application/zip,text/plain"
            disabled={backupRunning || importingBackup}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = '';
              void handleImportBackup(file);
            }}
            className="mt-3 block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold dark:border-white/10 dark:bg-black/30 dark:file:bg-white/[0.08]"
          />
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-950 dark:text-white">Historial en el servidor</p>
            <button
              type="button"
              disabled={historyLoading}
              onClick={() => void loadBackupHistory()}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-white/10 dark:text-zinc-200"
            >
              {historyLoading ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>

          {historyLoading && !backupHistory.length ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-zinc-500">Cargando historial...</p>
          ) : backupHistory.length ? (
            <div className="mt-3 space-y-2">
              {backupHistory.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-black/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{item.fileName}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">
                        {new Date(item.createdAt).toLocaleString('es-GT')} · {item.sizeLabel} ·{' '}
                        {item.mode === 'full' ? 'Completo' : 'Solo BD'} · {item.source === 'import' ? 'Importado' : 'Sistema'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={backupRunning}
                        onClick={() => void downloadSettingsBackupArchive(item.id, item.fileName)}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-white/10 dark:text-zinc-200"
                      >
                        Descargar
                      </button>
                      <button
                        type="button"
                        disabled={backupRunning}
                        onClick={() => void handleRestoreArchive(item)}
                        className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-100"
                      >
                        Restaurar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500 dark:border-white/10 dark:text-zinc-500">
              Aún no hay respaldos guardados en el servidor.
            </p>
          )}
        </div>
      </Panel>

      <Panel title="Capacidades activables" subtitle="Hoja de ruta tecnica y comercial">
        <div className="space-y-3 text-sm text-slate-700 dark:text-zinc-300">
          {[
            'Facturacion electronica por pais y proveedor',
            'WhatsApp para notificaciones y reactivacion',
            'QR publico para menu digital por sucursal',
            'Respaldos programados automaticos y bitacora de auditoria',
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
