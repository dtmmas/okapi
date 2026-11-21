import { AlertTriangle, ArrowLeftRight, CalendarClock, DoorOpen, GitMerge, GripVertical, Pencil, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppIcon } from '@/components/AppIcon';
import { Panel } from '@/components/Panel';
import { StatusBadge } from '@/components/StatusBadge';
import { TableCapacity } from '@/components/TableCapacity';
import { TableCardMark } from '@/components/TableCardMark';
import { TableStatusControl } from '@/components/TableReservationDetails';
import { useTableRefresh } from '@/hooks/useTableRefresh';
import { getAreaIcon } from '@/lib/area-icons';
import { getNextTableCode, getSortedAreas, normalizeAreaName, sortTablesInArea } from '@/lib/tables';
import {
  createTable,
  createTableArea,
  deleteTable,
  deleteTableArea,
  mergeTableAccounts,
  moveTableAccount,
  renameTableArea,
  reorderTableAreas,
  reorderTables,
  updateTable,
  updateTableStatus,
} from '@/services/api';
import { usePosWizardStore } from '@/store/usePosWizardStore';
import { useSessionStore } from '@/store/useSessionStore';
import type { RestaurantTable } from '@/types/restaurant';

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

type TablesView = 'layout' | 'operations';

function getTablesView(value: string | null): TablesView {
  return value === 'operations' ? 'operations' : 'layout';
}


export default function TablesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = getTablesView(searchParams.get('view'));
  const snapshot = useSessionStore((state) => state.snapshot);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const tables = snapshot?.tables ?? [];
  const tableAreas = snapshot?.tableAreas ?? [];
  const branches = snapshot?.branches ?? [];
  const activeOrders = snapshot?.activeOrders ?? [];
  const setTable = usePosWizardStore((state) => state.setTable);
  const setCustomer = usePosWizardStore((state) => state.setCustomer);
  const clearCart = usePosWizardStore((state) => state.clearCart);

  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [moveToTableId, setMoveToTableId] = useState<number | null>(null);
  const [mergeToTableId, setMergeToTableId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tableForm, setTableForm] = useState<TableFormState>(initialForm);
  const [editingTableId, setEditingTableId] = useState<number | null>(null);
  const [newAreaName, setNewAreaName] = useState('');
  const [activeArea, setActiveArea] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [editingAreaName, setEditingAreaName] = useState<string | null>(null);
  const [areaDraftName, setAreaDraftName] = useState('');
  const [deleteAreaState, setDeleteAreaState] = useState<DeleteAreaState | null>(null);
  const [deleteTableId, setDeleteTableId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [reserveTableId, setReserveTableId] = useState<number | null>(null);
  const [freeOpen, setFreeOpen] = useState(false);
  const [freeTableId, setFreeTableId] = useState<number | null>(null);
  const [draggingTableId, setDraggingTableId] = useState<number | null>(null);
  const [draggingAreaName, setDraggingAreaName] = useState<string | null>(null);

  useTableRefresh(refreshSnapshot);

  useEffect(() => {
    if (!searchParams.get('view')) {
      setSearchParams({ view: 'layout' }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!tables.length) {
      setSelectedTableId(null);
      return;
    }
    if (selectedTableId && tables.some((item) => item.id === selectedTableId)) {
      return;
    }
    setSelectedTableId(null);
    setMoveToTableId(null);
    setMergeToTableId(null);
  }, [selectedTableId, tables]);

  const selectedTable = useMemo(() => {
    if (!selectedTableId) {
      return null;
    }
    return tables.find((table) => table.id === selectedTableId) ?? null;
  }, [selectedTableId, tables]);

  const reserveTable = useMemo(() => {
    if (!reserveTableId) {
      return null;
    }
    return tables.find((table) => table.id === reserveTableId) ?? null;
  }, [reserveTableId, tables]);

  const freeTable = useMemo(() => {
    if (!freeTableId) {
      return null;
    }
    return tables.find((table) => table.id === freeTableId) ?? null;
  }, [freeTableId, tables]);

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

  const mergeCandidateTables = useMemo(() => {
    if (!selectedTable || !selectedOrder) {
      return [];
    }
    const occupiedCodes = new Set(activeOrders.map((order) => order.tableCode).filter(Boolean));
    return tables.filter(
      (table) =>
        table.id !== selectedTable.id &&
        table.branchId === selectedTable.branchId &&
        table.status !== 'RESERVED' &&
        table.code &&
        occupiedCodes.has(table.code),
    );
  }, [activeOrders, selectedOrder, selectedTable, tables]);

  const orderByTableCode = useMemo(
    () => new Map(activeOrders.map((order) => [order.tableCode ?? '', order])),
    [activeOrders],
  );

  const tablesWithActiveAccount = useMemo(
    () =>
      tables
        .filter((table) => Boolean(table.code && orderByTableCode.get(table.code)))
        .sort((left, right) => left.code.localeCompare(right.code, 'es')),
    [orderByTableCode, tables],
  );

  function selectHostTable(tableId: number) {
    setSelectedTableId(tableId);
    setMoveToTableId(null);
    setMergeToTableId(null);
    setError(null);
  }

  function renderOperationMiniCard(
    table: RestaurantTable,
    payload: {
      selected: boolean;
      onSelect: () => void;
      badge: string;
      badgeClassName?: string;
      disabled?: boolean;
    },
  ) {
    const { selected, onSelect, badge, badgeClassName, disabled } = payload;
    return (
      <button
        key={table.id}
        type="button"
        disabled={disabled || submitting}
        onClick={onSelect}
        aria-pressed={selected}
        className={`rounded-xl border px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
          selected
            ? 'border-amber-300/50 bg-amber-300/15 ring-2 ring-amber-400/60 dark:border-amber-300/35'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]'
        }`}
      >
        <p className="truncate font-display text-base leading-tight text-slate-950 dark:text-white">{table.code}</p>
        <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500 dark:text-zinc-400">
          {normalizeAreaName(table.area)}
        </p>
        <span
          className={`mt-1 inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
            badgeClassName ??
            'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
          }`}
        >
          {badge}
        </span>
      </button>
    );
  }

  const areaGroups = useMemo(() => {
    const grouped = new Map<string, typeof tables>();
    for (const table of tables) {
      const key = normalizeAreaName(table.area);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)?.push(table);
    }
    for (const area of tableAreas) {
      const normalizedArea = normalizeAreaName(area.name);
      if (!grouped.has(normalizedArea)) {
        grouped.set(normalizedArea, []);
      }
    }
    const orderedAreas = getSortedAreas(
      [...tableAreas.map((area) => area.name), ...tables.map((table) => table.area)],
      tableAreas,
    );
    return orderedAreas.map((area) => [area, grouped.get(area) ?? []] as const);
  }, [tableAreas, tables]);

  const availableAreas = useMemo(
    () => getSortedAreas([...tableAreas.map((area) => area.name), ...tables.map((table) => table.area)], tableAreas),
    [tableAreas, tables],
  );
  const visibleAreaGroups = useMemo(
    () => areaGroups.filter(([area]) => area === activeArea).map(([area, groupTables]) => [area, sortTablesInArea(groupTables)] as const),
    [activeArea, areaGroups],
  );

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

  async function applyAreaDraft() {
    const area = normalizeAreaName(newAreaName);
    if (!area) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createTableArea({ name: area });
      await refreshSnapshot();
      setActiveArea(area);
      setCodeTouched(false);
      setTableForm((current) => ({
        ...current,
        area,
        code: editingTableId ? current.code : getNextTableCode(area, tables),
      }));
      setNewAreaName('');
      setSuccess(`Área ${area} agregada al diseño.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible crear el área.');
    } finally {
      setSubmitting(false);
    }
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
      await renameTableArea({ previousName: previousArea, nextName: nextArea });
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

  async function handleDeleteArea(area: string) {
    setSubmitting(true);
    setError(null);
    try {
      await deleteTableArea({ name: area });
      if (activeArea === area) {
        const nextAreas = availableAreas.filter((item) => item !== area);
        setActiveArea(nextAreas[0] ?? '');
      }
      if (editingAreaName === area) {
        cancelAreaEdit();
      }
      await refreshSnapshot();
      closeDeleteDialogs();
      setSuccess(`Área ${area} eliminada del diseño.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible eliminar el área.');
    } finally {
      setSubmitting(false);
    }
  }

  function openReserveModal(tableId: number) {
    setReserveTableId(tableId);
    setReserveOpen(true);
    setError(null);
    setSuccess(null);
  }

  function closeReserveModal() {
    if (submitting) {
      return;
    }
    setReserveOpen(false);
    setReserveTableId(null);
  }

  async function handleReserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const table = reserveTable;
    if (!table) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (table.status !== 'FREE') {
        throw new Error('Solo puedes reservar una mesa que esté libre.');
      }
      const name = String(fields.get('name') ?? '').trim();
      if (!name) throw new Error('Ingresa el nombre de quien reserva.');
      const phone = String(fields.get('phone') ?? '').trim();
      const observations = String(fields.get('observations') ?? '').trim();
      await updateTableStatus({
        tableId: table.id,
        status: 'RESERVED',
        reservation: {
          name,
          address: String(fields.get('address') ?? '').trim(),
          guests: Number(fields.get('guests')),
          ...(phone ? { phone } : {}),
          ...(observations ? { observations } : {}),
        },
      });
      await refreshSnapshot();
      setReserveOpen(false);
      setReserveTableId(null);
      setSuccess(`Mesa ${table.code} reservada.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible reservar la mesa.');
    } finally {
      setSubmitting(false);
    }
  }

  function openFreeModal(tableId: number) {
    setFreeTableId(tableId);
    setFreeOpen(true);
    setError(null);
    setSuccess(null);
  }

  function closeFreeModal() {
    if (submitting) {
      return;
    }
    setFreeOpen(false);
    setFreeTableId(null);
  }

  async function handleFree(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const table = freeTable ?? selectedTable;
    if (!table) {
      return;
    }
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (table.status === 'OCCUPIED') {
        throw new Error('No se puede liberar una mesa con cuenta activa. Debe cobrarse primero.');
      }
      if (!reason) {
        throw new Error('Indica el motivo de la liberación.');
      }
      await updateTableStatus({ tableId: table.id, status: 'FREE', reason });
      await refreshSnapshot();
      setFreeOpen(false);
      setFreeTableId(null);
      setSuccess(`Mesa ${table.code} liberada.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible liberar la mesa.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMerge() {
    if (!selectedTable) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (!selectedOrder) {
        throw new Error('La mesa principal debe tener una cuenta activa.');
      }
      if (!mergeToTableId) {
        throw new Error('Selecciona la mesa cuya cuenta quieres sumar.');
      }
      const joinTable = mergeCandidateTables.find((table) => table.id === mergeToTableId);
      if (!joinTable) {
        throw new Error('La mesa seleccionada no se puede unir.');
      }
      await mergeTableAccounts({ hostTableId: selectedTable.id, joinTableId: mergeToTableId });
      await refreshSnapshot();
      setSuccess(`Cuenta de ${joinTable.code} unida a la mesa ${selectedTable.code}.`);
      setMergeToTableId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible unir las mesas.');
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
      setEditorOpen(false);
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
      setEditorOpen(false);
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

  function openCreateTablesEditor() {
    resetTableForm();
    setCodeTouched(false);
    setTableForm({
      branchId: branches[0] ? String(branches[0].id) : '',
      code: getNextTableCode(activeArea || 'Mesa', tables),
      area: activeArea || '',
      capacity: '4',
      quantity: '10',
    });
    setError(null);
    setSuccess(null);
    setEditorOpen(true);
  }

  async function handleReorderAreas(sourceName: string, targetName: string) {
    if (sourceName === targetName) {
      return;
    }

    const ordered = [...availableAreas];
    const fromIndex = ordered.indexOf(sourceName);
    const toIndex = ordered.indexOf(targetName);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);

    setSubmitting(true);
    setError(null);
    try {
      await reorderTableAreas({ areaNames: ordered });
      await refreshSnapshot();
      setSuccess('Orden de áreas actualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible ordenar las áreas.');
    } finally {
      setSubmitting(false);
      setDraggingAreaName(null);
    }
  }

  async function handleReorderTables(area: string, sourceId: number, targetId: number) {
    if (sourceId === targetId) {
      return;
    }

    const areaTables = sortTablesInArea(
      tables.filter((table) => normalizeAreaName(table.area) === normalizeAreaName(area)),
    );
    const fromIndex = areaTables.findIndex((table) => table.id === sourceId);
    const toIndex = areaTables.findIndex((table) => table.id === targetId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const reordered = [...areaTables];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    setSubmitting(true);
    setError(null);
    try {
      await reorderTables({
        area: normalizeAreaName(area),
        tableIds: reordered.map((table) => table.id),
      });
      await refreshSnapshot();
      setSuccess('Orden de mesas actualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible ordenar las mesas.');
    } finally {
      setSubmitting(false);
      setDraggingTableId(null);
    }
  }

  function openTableEditor(tableId: number) {
    fillTableForm(tableId);
    setError(null);
    setSuccess(null);
    setEditorOpen(true);
  }

  const freeMotivoOptions = [
    'Cliente no se presentó',
    'Cancelación del cliente',
    'Reserva duplicada o error',
    'Cambio de mesa',
    'Otro',
  ];

  const modalFieldClass =
    'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white';
  const modalLabelClass = 'block space-y-1 text-xs font-medium text-slate-600 dark:text-zinc-400';

  const freeForm = freeTable ? (
    <form key={freeTable.id} className="space-y-3" onSubmit={(event) => void handleFree(event)}>
      <label className={modalLabelClass}>
        Motivo
        <select
          name="reasonPreset"
          defaultValue={freeMotivoOptions[0]}
          onChange={(event) => {
            const textarea = event.currentTarget.form?.elements.namedItem('reason') as HTMLTextAreaElement | null;
            const value = event.currentTarget.value;
            if (!textarea || value === 'Otro') {
              return;
            }
            textarea.value = value;
          }}
          className={modalFieldClass}
        >
          {freeMotivoOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className={modalLabelClass}>
        Detalle
        <textarea
          name="reason"
          required
          maxLength={250}
          rows={2}
          defaultValue={freeMotivoOptions[0]}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
          placeholder="Por qué se libera la mesa"
        />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          disabled={submitting}
          onClick={closeFreeModal}
          className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
        >
          <AppIcon icon={DoorOpen} className="h-4 w-4" />
          {submitting ? 'Procesando...' : 'Confirmar liberación'}
        </button>
      </div>
    </form>
  ) : null;

  const reserveForm = reserveTable ? (
    <form key={reserveTable.id} className="space-y-3" onSubmit={(event) => void handleReserve(event)}>
      <label className={modalLabelClass}>
        Nombre
        <input name="name" required maxLength={150} className={modalFieldClass} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={modalLabelClass}>
          Teléfono
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={40}
            className={modalFieldClass}
            placeholder="+502 0000-0000"
          />
        </label>
        <label className={modalLabelClass}>
          Personas
          <input
            name="guests"
            type="number"
            min={1}
            max={reserveTable.capacity}
            defaultValue={1}
            required
            className={modalFieldClass}
          />
        </label>
      </div>
      <label className={modalLabelClass}>
        Dirección
        <input name="address" maxLength={250} className={modalFieldClass} placeholder="Opcional" />
      </label>
      <label className={modalLabelClass}>
        Observaciones
        <textarea
          name="observations"
          maxLength={500}
          rows={2}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-300/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
          placeholder="Horario, alergias, notas..."
        />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          disabled={submitting}
          onClick={closeReserveModal}
          className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
        >
          <AppIcon icon={CalendarClock} className="h-4 w-4" />
          {submitting ? 'Guardando...' : 'Reservar'}
        </button>
      </div>
    </form>
  ) : null;

  const tableEditorForm = (
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
        ) : null}
        <button
          type="button"
          onClick={() => {
            resetTableForm();
            setEditorOpen(false);
          }}
          className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
        >
          <AppIcon icon={X} className="h-4 w-4" />
          Cancelar
        </button>
      </div>
    </form>
  );

  const layoutPanel = (
      <Panel
        title="Diseño gráfico del salón"
        subtitle="Organiza las mesas por áreas y usa los botones de acción en cada tarjeta."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openCreateTablesEditor}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 dark:text-white"
            >
              <AppIcon icon={Plus} className="h-4 w-4" />
              Crear mesas
            </button>
            <button
              type="button"
              onClick={() => {
                void refreshSnapshot();
              }}
              className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
            >
              Refrescar
            </button>
          </div>
        }
      >
        {error ? (
          <div className="mb-4 rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-700 dark:text-rose-200">{error}</div>
        ) : null}
        {success ? (
          <div className="mb-4 rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-700 dark:text-emerald-200">
            {success}
          </div>
        ) : null}
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
              disabled={submitting}
              onClick={() => void applyAreaDraft()}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
            >
              <AppIcon icon={Plus} className="h-4 w-4" />
              Agregar área al diseño
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-zinc-500">El área queda operativa al guardar al menos una mesa dentro de ella.</p>
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-zinc-500">
          Arrastra las áreas y las mesas para ordenar el salón. Ese orden se refleja en POS y Caja.
        </p>

        <div className="space-y-6">
          {availableAreas.length ? (
            <div className="flex flex-wrap gap-2">
              {availableAreas.map((area) => {
                const count = areaGroups.find(([groupArea]) => groupArea === area)?.[1].length ?? 0;
                const isActive = area === activeArea;
                const AreaIcon = getAreaIcon(area);
                return (
                  <div
                    key={area}
                    onDragOver={(event) => {
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceName = event.dataTransfer.getData('text/plain');
                      if (sourceName) {
                        void handleReorderAreas(sourceName, area);
                      }
                    }}
                    className={`inline-flex items-stretch overflow-hidden rounded-2xl border text-sm font-semibold transition ${
                      isActive
                        ? 'border-amber-300/35 bg-amber-300/10 text-amber-900 dark:text-white'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200'
                    } ${draggingAreaName === area ? 'opacity-60' : ''}`}
                  >
                    <button
                      type="button"
                      aria-label={`Arrastrar área ${area} para ordenar`}
                      draggable={!submitting}
                      onDragStart={(event) => {
                        setDraggingAreaName(area);
                        event.dataTransfer.setData('text/plain', area);
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => setDraggingAreaName(null)}
                      className="inline-flex items-center border-r border-slate-200/80 px-2 text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/[0.06]"
                    >
                      <AppIcon icon={GripVertical} className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveArea(area)}
                      className="inline-flex items-center gap-2 px-4 py-2 transition hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                    >
                      <AppIcon icon={AreaIcon} className="h-4 w-4" />
                      <span>{area}</span>
                      <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">{count}</span>
                    </button>
                  </div>
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
              <div className="isolate grid gap-x-2.5 gap-y-4 md:grid-cols-2">
                {groupTables.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500">
                    Aún no hay mesas en esta área.
                  </div>
                ) : null}
                {groupTables.map((table) => (
                  <div
                    key={table.id}
                    data-table-status={table.status}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const sourceId = Number(event.dataTransfer.getData('text/plain'));
                      if (Number.isFinite(sourceId)) {
                        void handleReorderTables(area, sourceId, table.id);
                      }
                    }}
                    className={`relative rounded-[26px] border p-5 text-left transition ${
                      draggingTableId === table.id ? 'opacity-60' : ''
                    }`}
                  >
                    <button
                      type="button"
                      aria-label={`Arrastrar mesa ${table.code} para ordenar`}
                      draggable={!submitting}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        setDraggingTableId(table.id);
                        event.dataTransfer.setData('text/plain', String(table.id));
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => setDraggingTableId(null)}
                      className="pointer-events-auto absolute left-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-300 dark:hover:bg-white/10"
                    >
                      <AppIcon icon={GripVertical} className="h-4 w-4" />
                    </button>
                    <div className="relative z-10 pl-10">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <TableCardMark status={table.status} />
                          <div className="min-w-0">
                            <p className="table-code text-3xl text-slate-950 dark:text-white">{table.code}</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                              {branches.find((branch) => branch.id === table.branchId)?.name ?? 'Sucursal sin definir'}
                            </p>
                          </div>
                        </div>
                        {table.status === 'RESERVED' ? (
                          <TableStatusControl table={table} />
                        ) : (
                          <StatusBadge value={table.status} />
                        )}
                      </div>
                      <div className="mt-6 space-y-2 text-sm text-slate-600 dark:text-zinc-300">
                        <TableCapacity capacity={table.capacity} />
                        <p>Orden activa: {table.currentOrder || 'Sin pedido'}</p>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200/80 pt-4 dark:border-white/10">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => openTableEditor(table.id)}
                          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                        >
                          <AppIcon icon={Pencil} className="h-4 w-4" />
                          Editar
                        </button>
                        {table.status === 'FREE' ? (
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => openReserveModal(table.id)}
                            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
                          >
                            <AppIcon icon={CalendarClock} className="h-4 w-4" />
                            Reservar mesa
                          </button>
                        ) : null}
                        {table.status === 'RESERVED' ? (
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => openFreeModal(table.id)}
                            className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                          >
                            <AppIcon icon={DoorOpen} className="h-4 w-4" />
                            Liberar mesa
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Panel>
  );

  const operationsPanel = (
        <Panel
          subtitle={
            selectedTable
              ? `Mesa ${selectedTable.code} • ${selectedTable.area}${selectedOrder ? ` • ${selectedOrder.code}` : ''}`
              : 'Elige una mesa con cuenta activa.'
          }
        >
          <section className="mb-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-500">Cuentas activas</p>
            {tablesWithActiveAccount.length ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {tablesWithActiveAccount.map((table) =>
                  renderOperationMiniCard(table, {
                    selected: selectedTableId === table.id,
                    onSelect: () => selectHostTable(table.id),
                    badge: 'Cuenta activa',
                  }),
                )}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500 dark:border-white/10 dark:text-zinc-500">
                No hay mesas con cuenta abierta.
              </p>
            )}
          </section>

          {error ? (
            <div className="mb-4 rounded-[24px] border border-rose-400/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-700 dark:text-rose-200">{error}</div>
          ) : null}
          {success ? (
            <div className="mb-4 rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-700 dark:text-emerald-200">
              {success}
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">Mover cuenta a mesa libre</p>
              {destinationTables.length ? (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                  {destinationTables.map((table) =>
                    renderOperationMiniCard(table, {
                      selected: moveToTableId === table.id,
                      onSelect: () => setMoveToTableId(table.id),
                      badge: 'Libre',
                      badgeClassName: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-zinc-300',
                      disabled: !selectedOrder,
                    }),
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500 dark:text-zinc-500">No hay mesas libres disponibles.</p>
              )}
              <button
                type="button"
                disabled={!selectedOrder || !moveToTableId || submitting}
                onClick={() => void handleMove()}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-300/15 disabled:opacity-50 dark:text-white"
              >
                <AppIcon icon={ArrowLeftRight} className="h-4 w-4" />
                {submitting ? 'Procesando...' : 'Mover cuenta'}
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">Unir otra cuenta a {selectedTable?.code ?? '…'}</p>
              {mergeCandidateTables.length ? (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                  {mergeCandidateTables.map((table) =>
                    renderOperationMiniCard(table, {
                      selected: mergeToTableId === table.id,
                      onSelect: () => setMergeToTableId(table.id),
                      badge: 'Cuenta activa',
                      disabled: !selectedOrder,
                    }),
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500 dark:text-zinc-500">
                  {selectedOrder ? 'No hay otra mesa con cuenta para unir.' : 'Primero elige la mesa principal arriba.'}
                </p>
              )}
              <button
                type="button"
                disabled={!selectedOrder || !mergeToTableId || submitting}
                onClick={() => void handleMerge()}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
              >
                <AppIcon icon={GitMerge} className="h-4 w-4" />
                {submitting ? 'Procesando...' : 'Unir cuentas'}
              </button>
            </div>

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
          </div>
        </Panel>
  );

  return (
    <>
      {view === 'operations' ? operationsPanel : layoutPanel}

      {freeOpen && freeTable ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#101014]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10">
              <div className="min-w-0">
                <h3 className="truncate font-display text-lg text-slate-950 dark:text-white">
                  Liberar mesa {freeTable.code}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-500">El motivo queda en bitácora</p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={closeFreeModal}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                aria-label="Cerrar"
              >
                <AppIcon icon={X} className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[min(85vh,28rem)] overflow-y-auto px-4 py-3">
              {error ? (
                <div className="mb-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
                  {error}
                </div>
              ) : null}
              {freeForm}
            </div>
          </div>
        </div>
      ) : null}

      {reserveOpen && reserveTable ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#101014]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10">
              <div className="min-w-0">
                <h3 className="truncate font-display text-lg text-slate-950 dark:text-white">
                  Reservar mesa {reserveTable.code}
                </h3>
                <p className="truncate text-xs text-slate-500 dark:text-zinc-500">
                  {reserveTable.area} · hasta {reserveTable.capacity} personas
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={closeReserveModal}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                aria-label="Cerrar"
              >
                <AppIcon icon={X} className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[min(85vh,32rem)] overflow-y-auto px-4 py-3">
              {error ? (
                <div className="mb-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
                  {error}
                </div>
              ) : null}
              {reserveForm}
            </div>
          </div>
        </div>
      ) : null}

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[min(90vh,52rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#101014]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-white/10">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">Mesas</p>
                <h3 className="mt-1 font-display text-2xl text-slate-950 dark:text-white">
                  {editingTableId ? 'Editar mesa' : 'Crear mesas'}
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                  Asigna sucursal, área, capacidad y cantidad de mesas nuevas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!submitting) {
                    resetTableForm();
                    setEditorOpen(false);
                  }
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200"
                aria-label="Cerrar"
              >
                <AppIcon icon={X} className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5">
              {error ? (
                <div className="mb-4 rounded-[20px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
                  {error}
                </div>
              ) : null}
              {success ? (
                <div className="mb-4 rounded-[20px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
                  {success}
                </div>
              ) : null}
              {tableEditorForm}
            </div>
          </div>
        </div>
      ) : null}

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
                    void handleDeleteArea(deleteAreaState.area);
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
    </>
  );
}
