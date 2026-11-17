import { AlertTriangle, ArrowLeftRight, CalendarClock, DoorOpen, GitMerge, Pencil, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '@/components/AppIcon';
import { Panel } from '@/components/Panel';
import { StatusBadge } from '@/components/StatusBadge';
import { getAreaIcon } from '@/lib/area-icons';
import { getNextTableCode, getSortedAreas, normalizeAreaName } from '@/lib/tables';
import { createTable, deleteTable, moveTableAccount, updateTable, updateTableStatus } from '@/services/api';
import { usePosWizardStore } from '@/store/usePosWizardStore';
import { useSessionStore } from '@/store/useSessionStore';

type TableFormState = {
  branchId: string;
  code: string;
  area: string;
  capacity: string;
  quantity: string;
};

type DeleteAreaState = {
  area: string;
};

const initialForm: TableFormState = {
  branchId: '',
  code: '',
  area: '',
  capacity: '4',
  quantity: '10',
};

function replaceAreaName(list: string[], previousArea: string, nextArea: string) {
  const nextNormalized = normalizeAreaName(nextArea);
  return Array.from(new Set(list.map((area) => (area === previousArea ? nextNormalized : area)).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, 'es'),
  );
}

export default function TablesPage() {
  const navigate = useNavigate();
  const snapshot = useSessionStore((state) => state.snapshot);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const tables = snapshot?.tables ?? [];
  const branches = snapshot?.branches ?? [];
  const activeOrders = snapshot?.activeOrders ?? [];
  const setTable = usePosWizardStore((state) => state.setTable);
  const setCustomer = usePosWizardStore((state) => state.setCustomer);
  const clearCart = usePosWizardStore((state) => state.clearCart);

  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [moveToTableId, setMoveToTableId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tableForm, setTableForm] = useState<TableFormState>(initialForm);
  const [editingTableId, setEditingTableId] = useState<number | null>(null);
  const [newAreaName, setNewAreaName] = useState('');
  const [customAreas, setCustomAreas] = useState<string[]>([]);
  const [activeArea, setActiveArea] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [editingAreaName, setEditingAreaName] = useState<string | null>(null);
  const [areaDraftName, setAreaDraftName] = useState('');
  const [deleteAreaState, setDeleteAreaState] = useState<DeleteAreaState | null>(null);
  const [deleteTableId, setDeleteTableId] = useState<number | null>(null);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  useEffect(() => {
    if (!tables.length) {
      setSelectedTableId(null);
      return;
    }
    if (selectedTableId && tables.some((item) => item.id === selectedTableId)) {
      return;
    }
    setSelectedTableId(tables[0].id);
  }, [selectedTableId, tables]);

  const selectedTable = useMemo(() => {
    if (!selectedTableId) {
      return null;
    }
    return tables.find((table) => table.id === selectedTableId) ?? null;
  }, [selectedTableId, tables]);

  const selectedOrder = useMemo(() => {
    if (!selectedTable?.code) {
      return null;
    }
    return activeOrders.find((order) => order.tableCode === selectedTable.code) ?? null;
  }, [activeOrders, selectedTable]);

  const destinationTables = useMemo(() => {
    if (!selectedTable) {
      return [];
    }
    return tables.filter((table) => table.id !== selectedTable.id && table.status === 'FREE');
  }, [selectedTable, tables]);

  const areaGroups = useMemo(() => {
    const grouped = new Map<string, typeof tables>();
    for (const table of tables) {
      const key = normalizeAreaName(table.area);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)?.push(table);
    }
    for (const area of customAreas) {
      const normalizedArea = normalizeAreaName(area);
      if (!grouped.has(normalizedArea)) {
        grouped.set(normalizedArea, []);
      }
    }
    return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right, 'es'));
  }, [customAreas, tables]);

  const availableAreas = useMemo(() => getSortedAreas([...customAreas, ...tables.map((table) => table.area)]), [customAreas, tables]);
  const visibleAreaGroups = useMemo(() => areaGroups.filter(([area]) => area === activeArea), [activeArea, areaGroups]);

  function resetTableForm() {
    setEditingTableId(null);
    setCodeTouched(false);
    setTableForm({
      branchId: branches[0] ? String(branches[0].id) : '',
      code: '',
      area: '',
      capacity: '4',
      quantity: '10',
    });
  }

  useEffect(() => {
    if (!tableForm.branchId && branches[0]) {
      setTableForm((current) => ({ ...current, branchId: String(branches[0].id) }));
    }
  }, [branches, tableForm.branchId]);

  useEffect(() => {
    if (!availableAreas.length) {
      setActiveArea('');
      return;
    }
    if (activeArea && availableAreas.includes(activeArea)) {
      return;
    }
    setActiveArea(availableAreas[0]);
  }, [activeArea, availableAreas]);

  useEffect(() => {
    if (editingTableId || codeTouched) {
      return;
    }
    setTableForm((current) => ({
      ...current,
      code: getNextTableCode(current.area || activeArea || 'Mesa', tables),
    }));
  }, [activeArea, codeTouched, editingTableId, tableForm.area, tables]);

  function fillTableForm(tableId: number) {
    const table = tables.find((item) => item.id === tableId);
    if (!table) {
      return;
    }

    setEditingTableId(table.id);
    setCodeTouched(true);
    setTableForm({
      branchId: table.branchId ? String(table.branchId) : branches[0] ? String(branches[0].id) : '',
      code: table.code,
      area: table.area,
      capacity: String(table.capacity),
      quantity: '1',
    });
    setError(null);
    setSuccess(null);
  }

  function applyAreaDraft() {
    const area = normalizeAreaName(newAreaName);
    if (!area) {
      return;
    }
    setCustomAreas((current) => (current.includes(area) ? current : [...current, area]));
    setActiveArea(area);
    setCodeTouched(false);
    setTableForm((current) => ({
      ...current,
      area,
      code: editingTableId ? current.code : getNextTableCode(area, tables),
    }));
    setNewAreaName('');
  }

  function beginAreaEdit(area: string) {
    setEditingAreaName(area);
    setAreaDraftName(area);
    setError(null);
    setSuccess(null);
  }

  function cancelAreaEdit() {
    setEditingAreaName(null);
    setAreaDraftName('');
  }

  function closeDeleteDialogs() {
    setDeleteAreaState(null);
    setDeleteTableId(null);
  }

  async function handleAreaRename(previousArea: string, groupTables: typeof tables) {
    const nextArea = normalizeAreaName(areaDraftName);
    if (!nextArea) {
      setError('El nombre del área es obligatorio.');
      return;
    }
    if (nextArea === previousArea) {
      cancelAreaEdit();
      return;
    }
    if (availableAreas.includes(nextArea)) {
      setError('Ya existe un área con ese nombre.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (groupTables.length) {
        for (const table of groupTables) {
          await updateTable(table.id, {
            branchId: table.branchId,
            code: table.code,
            area: nextArea,
            capacity: table.capacity,
          });
        }
      }

      setCustomAreas((current) => replaceAreaName(current, previousArea, nextArea));
      setActiveArea(nextArea);
      await refreshSnapshot();
      cancelAreaEdit();
      setSuccess(`Área ${previousArea} actualizada a ${nextArea}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible actualizar el área.');
    } finally {
      setSubmitting(false);
    }
  }

  function requestDeleteArea(area: string, tableCount: number) {
    if (tableCount > 0) {
      setError('No se puede eliminar un área mientras tenga mesas. Solo puedes editar su nombre.');
      return;
    }

    setDeleteAreaState({ area });
    setError(null);
    setSuccess(null);
  }

  function handleDeleteArea(area: string) {
    setCustomAreas((current) => current.filter((item) => item !== area));
    if (activeArea === area) {
      const nextAreas = availableAreas.filter((item) => item !== area);
      setActiveArea(nextAreas[0] ?? '');
    }
    if (editingAreaName === area) {
      cancelAreaEdit();
    }
    setSuccess(`Área ${area} eliminada del diseño.`);
    setError(null);
    closeDeleteDialogs();
  }

  async function handleReserve() {
    if (!selectedTable) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (selectedTable.status !== 'FREE') {
        throw new Error('Solo puedes reservar una mesa que esté libre.');
      }
      await updateTableStatus({ tableId: selectedTable.id, status: 'RESERVED' });
      await refreshSnapshot();
      setSuccess(`Mesa ${selectedTable.code} reservada.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible reservar la mesa.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFree() {
    if (!selectedTable) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (selectedTable.status === 'OCCUPIED') {
        throw new Error('No se puede liberar una mesa con cuenta activa. Debe cobrarse primero.');
      }
      await updateTableStatus({ tableId: selectedTable.id, status: 'FREE' });
      await refreshSnapshot();
      setSuccess(`Mesa ${selectedTable.code} liberada.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible liberar la mesa.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMove() {
    if (!selectedTable) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (!selectedOrder) {
        throw new Error('La mesa seleccionada no tiene cuenta activa para mover.');
      }
      if (!moveToTableId) {
        throw new Error('Selecciona una mesa destino.');
      }
      await moveTableAccount({ fromTableId: selectedTable.id, toTableId: moveToTableId });
      await refreshSnapshot();
      const destination = destinationTables.find((table) => table.id === moveToTableId);
      setSuccess(`Cuenta movida a ${destination?.code ?? 'mesa destino'}.`);
      setMoveToTableId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible mover la cuenta.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTableSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const generatedCode = tableForm.code.trim() || getNextTableCode(tableForm.area || activeArea || 'Mesa', tables, editingTableId);
      const parsedQuantity = Number(tableForm.quantity || '1');
      const quantity = Number.isFinite(parsedQuantity) ? Math.max(1, Math.trunc(parsedQuantity)) : 1;
      const payload = {
        branchId: tableForm.branchId ? Number(tableForm.branchId) : null,
        code: generatedCode,
        area: normalizeAreaName(tableForm.area || activeArea),
        capacity: Number(tableForm.capacity || '0'),
      };

      if (editingTableId) {
        await updateTable(editingTableId, payload);
        setSuccess('Mesa actualizada correctamente.');
      } else {
        const createdTables: string[] = [];
        const plannedTables = [...tables];

        for (let index = 0; index < quantity; index += 1) {
          const nextCode = index === 0 && tableForm.code.trim() ? tableForm.code.trim() : getNextTableCode(payload.area, plannedTables);
          await createTable({
            ...payload,
            code: nextCode,
          });
          plannedTables.push({
            id: -1 * (index + 1),
            code: nextCode,
            area: payload.area,
          } as (typeof tables)[number]);
          createdTables.push(nextCode);
        }

        setSuccess(
          quantity === 1
            ? `Mesa ${createdTables[0]} creada correctamente.`
            : `${quantity} mesas creadas correctamente en ${payload.area}: ${createdTables[0]} a ${createdTables[createdTables.length - 1]}.`,
        );
      }
      await refreshSnapshot();
      resetTableForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible guardar la mesa.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteTable() {
    if (!deleteTableId) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await deleteTable(deleteTableId);
      await refreshSnapshot();
      if (selectedTableId === deleteTableId) {
        setSelectedTableId(null);
      }
      resetTableForm();
      closeDeleteDialogs();
      setSuccess('Mesa eliminada correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible eliminar la mesa.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenInPos() {
    if (!selectedTable) {
      return;
    }
    clearCart();
    setTable(selectedTable.id);
    setCustomer({ name: selectedOrder?.customerName ?? '', phone: '' });
    navigate(selectedOrder ? '/pos/menu' : '/pos/cliente');
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <Panel
        title="Diseño gráfico del salón"
        subtitle="Organiza las mesas por áreas y selecciónalas visualmente para operar."
        action={
          <button
            type="button"
            onClick={() => {
              resetTableForm();
              void refreshSnapshot();
            }}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
          >
            Refrescar
          </button>
        }
      >
        <div className="mb-5 rounded-[24px] border border-slate-200/80 bg-slate-50 p-4 dark:border-white/8 dark:bg-zinc-950/45">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 space-y-2">
              <span className="text-sm text-slate-700 dark:text-zinc-300">Nueva área</span>
              <input
                value={newAreaName}
                onChange={(event) => setNewAreaName(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                placeholder="Ej. Terraza, Salón VIP, Familiar"
              />
            </label>
            <button
              type="button"
              onClick={applyAreaDraft}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white"
            >
              <AppIcon icon={Plus} className="h-4 w-4" />
              Agregar área al diseño
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-zinc-500">El área queda operativa al guardar al menos una mesa dentro de ella.</p>
        </div>

        <div className="space-y-6">
          {availableAreas.length ? (
            <div className="flex flex-wrap gap-2">
              {availableAreas.map((area) => {
                const count = areaGroups.find(([groupArea]) => groupArea === area)?.[1].length ?? 0;
                const isActive = area === activeArea;
                const AreaIcon = getAreaIcon(area);
                return (
                  <button
                    key={area}
                    type="button"
                    onClick={() => setActiveArea(area)}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'border-amber-300/35 bg-amber-300/10 text-amber-900 dark:text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <AppIcon icon={AreaIcon} className="h-4 w-4" />
                    <span>{area}</span>
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">{count}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {visibleAreaGroups.map(([area, groupTables]) => (
            <section key={area} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200">
                    <AppIcon icon={getAreaIcon(area)} className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">Área</p>
                    <h3 className="mt-1 font-display text-2xl text-slate-950 dark:text-white">{area}</h3>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">
                    {groupTables.length} mesa{groupTables.length === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    onClick={() => beginAreaEdit(area)}
                    className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                  >
                    <AppIcon icon={Pencil} className="h-4 w-4" />
                    Editar área
                  </button>
                  <button
                    type="button"
                    onClick={() => requestDeleteArea(area, groupTables.length)}
                    disabled={groupTables.length > 0}
                    className="inline-flex h-10 items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-200"
                  >
                    <AppIcon icon={Trash2} className="h-4 w-4" />
                    Eliminar área
                  </button>
                </div>
              </div>
              {editingAreaName === area ? (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                    <input
                      value={areaDraftName}
                      onChange={(event) => setAreaDraftName(event.target.value)}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                      placeholder="Nombre del área"
                    />
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void handleAreaRename(area, groupTables)}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
                    >
                      <AppIcon icon={Pencil} className="h-4 w-4" />
                      Guardar nombre
                    </button>
                    <button
                      type="button"
                      onClick={cancelAreaEdit}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                    >
                      <AppIcon icon={X} className="h-4 w-4" />
                      Cancelar
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-zinc-500">
                    {groupTables.length > 0
                      ? 'Esta área tiene mesas, así que solo puedes renombrarla.'
                      : 'Esta área está vacía y puedes renombrarla o eliminarla del diseño.'}
                  </p>
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                {groupTables.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500">
                    Aún no hay mesas en esta área.
                  </div>
                ) : null}
                {groupTables.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => {
                      setSelectedTableId(table.id);
                      fillTableForm(table.id);
                    }}
                    className={`rounded-[26px] border bg-gradient-to-br p-5 text-left transition ${
                      selectedTableId === table.id
                        ? 'border-amber-300/35 from-amber-300/10 to-white shadow-sm dark:to-transparent dark:shadow-none'
                        : 'border-slate-200 from-white to-slate-50 hover:border-slate-300 dark:border-white/10 dark:from-white/[0.05] dark:to-transparent dark:hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-display text-3xl text-slate-950 dark:text-white">{table.code}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                          {branches.find((branch) => branch.id === table.branchId)?.name ?? 'Sucursal sin definir'}
                        </p>
                      </div>
                      <StatusBadge value={table.status} />
                    </div>
                    <div className="mt-6 space-y-2 text-sm text-slate-600 dark:text-zinc-300">
                      <p>Capacidad: {table.capacity} personas</p>
                      <p>Orden activa: {table.currentOrder || 'Sin pedido'}</p>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">Toca la mesa para modificar sus datos</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Panel>

      <div className="space-y-6">
        <Panel title="Operación de mesa" subtitle={selectedTable ? `Mesa ${selectedTable.code} • ${selectedTable.area}` : 'Selecciona una mesa para operar.'}>
          {error ? (
            <div className="mb-4 rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-700 dark:text-rose-200">{error}</div>
          ) : null}
          {success ? (
            <div className="mb-4 rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-700 dark:text-emerald-200">
              {success}
            </div>
          ) : null}

          <div className="space-y-3">
            <button
              type="button"
              disabled={!selectedTable || submitting}
              onClick={handleOpenInPos}
              className="flex h-14 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
            >
              <span className="flex items-center gap-2">
                <AppIcon icon={ShoppingCart} className="h-4 w-4" />
                {selectedOrder ? 'Abrir cuenta en punto de venta' : 'Abrir mesa en punto de venta'}
              </span>
              <span className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">POS</span>
            </button>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">Mover cuenta</p>
              <div className="mt-3 grid gap-3">
                <select
                  value={moveToTableId ?? ''}
                  onChange={(event) => setMoveToTableId(event.target.value ? Number(event.target.value) : null)}
                  disabled={!selectedOrder || submitting}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 disabled:opacity-50 dark:border-white/10 dark:bg-black/30 dark:text-white"
                >
                  <option value="">Selecciona mesa destino</option>
                  {destinationTables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.code} • {table.area}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedOrder || !moveToTableId || submitting}
                  onClick={() => void handleMove()}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
                >
                  <AppIcon icon={ArrowLeftRight} className="h-4 w-4" />
                  {submitting ? 'Procesando...' : 'Mover cuenta'}
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={!selectedTable || submitting || selectedTable?.status !== 'FREE'}
              onClick={() => void handleReserve()}
              className="flex h-14 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
            >
              <span className="flex items-center gap-2">
                <AppIcon icon={CalendarClock} className="h-4 w-4" />
                Reservar mesa
              </span>
              <span className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Reserva</span>
            </button>

            <button
              type="button"
              disabled={!selectedTable || submitting || selectedTable?.status === 'OCCUPIED'}
              onClick={() => void handleFree()}
              className="flex h-14 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
            >
              <span className="flex items-center gap-2">
                <AppIcon icon={DoorOpen} className="h-4 w-4" />
                Liberar mesa
              </span>
              <span className="text-xs uppercase tracking-[0.25em] text-slate-500 dark:text-zinc-500">Estado</span>
            </button>

            <button
              type="button"
              disabled
              className="flex h-14 w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 text-left text-sm text-slate-500 opacity-60 dark:border-white/5 dark:bg-white/[0.02] dark:text-zinc-500"
            >
              <span className="flex items-center gap-2">
                <AppIcon icon={GitMerge} className="h-4 w-4" />
                Unir mesas
              </span>
              <span className="text-xs uppercase tracking-[0.25em] text-slate-400 dark:text-zinc-600">Próximamente</span>
            </button>
          </div>
        </Panel>

        <Panel title={editingTableId ? 'Editar mesa' : 'Agregar mesa'} subtitle="Crea mesas, asígnalas a un área y ordénalas por sucursal.">
          <form className="space-y-4" onSubmit={(event) => void handleTableSubmit(event)}>
            <label className="space-y-2">
              <span className="text-sm text-slate-700 dark:text-zinc-300">Sucursal</span>
              <select
                value={tableForm.branchId}
                onChange={(event) => setTableForm((current) => ({ ...current, branchId: event.target.value }))}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
              >
                <option value="">Selecciona sucursal</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Código de mesa</span>
                <input
                  value={tableForm.code}
                  onChange={(event) => {
                    setCodeTouched(true);
                    setTableForm((current) => ({ ...current, code: event.target.value.toUpperCase() }));
                  }}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  placeholder="Se genera automáticamente"
                />
                {!editingTableId ? (
                  <p className="text-xs text-slate-500 dark:text-zinc-500">Se propone automáticamente según el área y reutiliza el primer correlativo libre.</p>
                ) : null}
              </label>
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Capacidad</span>
                <input
                  type="number"
                  min="1"
                  value={tableForm.capacity}
                  onChange={(event) => setTableForm((current) => ({ ...current, capacity: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
              </label>
            </div>

            {!editingTableId ? (
              <label className="space-y-2">
                <span className="text-sm text-slate-700 dark:text-zinc-300">Cantidad de mesas a crear</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={tableForm.quantity}
                  onChange={(event) => setTableForm((current) => ({ ...current, quantity: event.target.value }))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                />
                <p className="text-xs text-slate-500 dark:text-zinc-500">Usa `10` para generar automáticamente 10 mesas seguidas dentro de la misma área.</p>
              </label>
            ) : null}

            <label className="space-y-2">
              <span className="text-sm text-slate-700 dark:text-zinc-300">Área</span>
              <div className="space-y-3">
                <input
                  value={tableForm.area}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCodeTouched(false);
                    setTableForm((current) => ({
                      ...current,
                      area: value,
                      code: editingTableId ? current.code : getNextTableCode(value || activeArea || 'Mesa', tables),
                    }));
                  }}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
                  placeholder="Terraza, Salón principal, Familiar..."
                />
                {availableAreas.length ? (
                  <div className="flex flex-wrap gap-2">
                    {availableAreas.map((area) => (
                      <button
                        key={area}
                        type="button"
                        onClick={() => {
                          setActiveArea(area);
                          setCodeTouched(false);
                          setTableForm((current) => ({
                            ...current,
                            area,
                            code: editingTableId ? current.code : getNextTableCode(area, tables),
                          }));
                        }}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:bg-white/[0.08]"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <AppIcon icon={getAreaIcon(area)} className="h-3.5 w-3.5" />
                        {area}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </label>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
              >
                <AppIcon icon={editingTableId ? Pencil : Plus} className="h-4 w-4" />
                {submitting
                  ? 'Guardando...'
                  : editingTableId
                    ? 'Actualizar mesa'
                    : `Crear ${(() => {
                        const parsed = Number(tableForm.quantity || '1');
                        return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
                      })()} mesa(s)`}
              </button>
              {editingTableId ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (!editingTableId) {
                        return;
                      }
                      setDeleteTableId(editingTableId);
                      setError(null);
                      setSuccess(null);
                    }}
                    disabled={submitting}
                    className="inline-flex h-12 items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-5 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-50"
                  >
                    <AppIcon icon={Trash2} className="h-4 w-4" />
                    Eliminar mesa
                  </button>
                  <button
                    type="button"
                    onClick={resetTableForm}
                    className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                  >
                    <AppIcon icon={X} className="h-4 w-4" />
                    Cancelar
                  </button>
                </>
              ) : null}
            </div>
          </form>
        </Panel>
      </div>

      {deleteAreaState || deleteTableId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#101014]">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 text-rose-600 dark:text-rose-200">
                <AppIcon icon={AlertTriangle} className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-zinc-500">Confirmación</p>
                <h3 className="mt-2 font-display text-2xl text-slate-950 dark:text-white">
                  {deleteAreaState ? 'Eliminar área vacía' : 'Eliminar mesa'}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-zinc-300">
                  {deleteAreaState
                    ? `Vas a eliminar el área ${deleteAreaState.area}. Esta acción la quita del diseño actual.`
                    : `Vas a eliminar la mesa ${tables.find((table) => table.id === deleteTableId)?.code ?? ''}. Si la mesa tiene historial de pedidos, el sistema bloqueará la eliminación.`}
                </p>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                  {deleteAreaState
                    ? 'Solo se permite eliminar áreas que no tienen mesas.'
                    : 'Confirma solo si realmente quieres retirar esta mesa del sistema.'}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteDialogs}
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
              >
                <AppIcon icon={X} className="h-4 w-4" />
                Cancelar
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  if (deleteAreaState) {
                    handleDeleteArea(deleteAreaState.area);
                    return;
                  }
                  void handleDeleteTable();
                }}
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-5 text-sm font-semibold text-rose-700 transition hover:bg-rose-500/15 disabled:opacity-50 dark:text-rose-200"
              >
                <AppIcon icon={Trash2} className="h-4 w-4" />
                {submitting ? 'Eliminando...' : deleteAreaState ? 'Sí, eliminar área' : 'Sí, eliminar mesa'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
