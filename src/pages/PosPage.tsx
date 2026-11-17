import { useMemo, useState } from 'react';
import { Panel } from '@/components/Panel';
import { StatusBadge } from '@/components/StatusBadge';
import { useSessionStore } from '@/store/useSessionStore';
import { createOrUpdateOrder, moveTableAccount } from '@/services/api';

type CartLine = {
  productId: number;
  quantity: number;
};

export default function PosPage() {
  const snapshot = useSessionStore((state) => state.snapshot);
  const refreshSnapshot = useSessionStore((state) => state.refreshSnapshot);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [cart, setCart] = useState<Record<number, CartLine>>({});
  const [moveToTableId, setMoveToTableId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!snapshot) {
    return null;
  }

  const tables = snapshot.tables;
  const menuCategories = snapshot.menuCategories.filter((category) => category.parentId);
  const menuProducts = snapshot.menuProducts;
  const currencySymbol = snapshot.brand.currencySymbol;

  const selectedCategory = useMemo(() => {
    if (!menuCategories.length) {
      return null;
    }

    if (selectedCategoryId) {
      return menuCategories.find((category) => category.id === selectedCategoryId) ?? menuCategories[0];
    }

    return menuCategories[0];
  }, [menuCategories, selectedCategoryId]);

  const selectedTable = useMemo(() => tables.find((table) => table.id === selectedTableId) ?? null, [tables, selectedTableId]);

  const activeOrder = useMemo(() => {
    if (!selectedTable) {
      return null;
    }

    return snapshot.activeOrders.find((order) => order.tableCode === selectedTable.code) ?? null;
  }, [selectedTable, snapshot.activeOrders]);

  const productsForCategory = useMemo(() => {
    if (!selectedCategory) {
      return [];
    }

    return menuProducts.filter((product) => product.categoryId === selectedCategory.id);
  }, [menuProducts, selectedCategory]);

  const cartLines = useMemo(() => Object.values(cart), [cart]);

  const cartTotal = useMemo(() => {
    return cartLines.reduce((sum, line) => {
      const product = menuProducts.find((item) => item.id === line.productId);
      return sum + (product ? product.price * line.quantity : 0);
    }, 0);
  }, [cartLines, menuProducts]);

  const destinationTables = useMemo(
    () => tables.filter((table) => table.id !== selectedTableId && table.status !== 'OCCUPIED'),
    [tables, selectedTableId],
  );

  function addToCart(productId: number) {
    setCart((current) => {
      const existing = current[productId];
      return {
        ...current,
        [productId]: {
          productId,
          quantity: existing ? existing.quantity + 1 : 1,
        },
      };
    });
  }

  function removeFromCart(productId: number) {
    setCart((current) => {
      const existing = current[productId];
      if (!existing) {
        return current;
      }

      if (existing.quantity <= 1) {
        const next = { ...current };
        delete next[productId];
        return next;
      }

      return {
        ...current,
        [productId]: {
          productId,
          quantity: existing.quantity - 1,
        },
      };
    });
  }

  async function handleSubmit() {
    if (!selectedTable) {
      setError('Selecciona una mesa antes de enviar el pedido.');
      return;
    }

    if (!customerName.trim()) {
      setError('Ingresa el nombre del cliente (puede ser “Consumidor final”).');
      return;
    }

    if (!cartLines.length) {
      setError('Agrega al menos un producto.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createOrUpdateOrder({
        tableId: selectedTable.id,
        customer: { name: customerName.trim() },
        type: 'DINE_IN',
        items: cartLines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
      });
      setCart({});
      await refreshSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible registrar el pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMoveTable() {
    if (!selectedTable || !moveToTableId) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await moveTableAccount({ fromTableId: selectedTable.id, toTableId: moveToTableId });
      await refreshSnapshot();
      setSelectedTableId(moveToTableId);
      setMoveToTableId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible mover la cuenta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.15fr_0.95fr]">
      <Panel title="Mesas" subtitle="Selecciona mesa para abrir/continuar cuenta">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
          {tables.map((table) => (
            <button
              key={table.id}
              type="button"
              onClick={() => setSelectedTableId(table.id)}
              className={`rounded-[26px] border p-5 text-left transition ${
                selectedTableId === table.id
                  ? 'border-emerald-300/40 bg-emerald-500/10'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-3xl text-white">{table.code}</p>
                  <p className="mt-1 text-sm text-zinc-500">{table.area}</p>
                </div>
                <StatusBadge value={table.status} />
              </div>
              <p className="mt-5 text-sm text-zinc-300">Cuenta: {table.currentOrder || 'Sin cuenta'}</p>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Menú" subtitle={selectedCategory ? `Categoría: ${selectedCategory.name}` : 'Selecciona una categoría'}>
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {menuCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategoryId(category.id)}
                className={`rounded-2xl border px-4 py-2 text-sm transition ${
                  selectedCategory?.id === category.id
                    ? 'border-amber-300/40 bg-amber-300/10 text-white'
                    : 'border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {productsForCategory.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addToCart(product.id)}
                className="rounded-[22px] border border-white/10 bg-zinc-950/40 p-4 text-left transition hover:bg-zinc-950/55"
              >
                <p className="font-semibold text-white">{product.name}</p>
                <p className="mt-2 text-sm text-zinc-400">
                  {currencySymbol} {product.price} •{' '}
                  {product.station === 'BAR' ? 'Bar' : product.station === 'PASTRY' ? 'Pastelería' : 'Cocina'}
                </p>
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Cuenta" subtitle={selectedTable ? `Mesa ${selectedTable.code}` : 'Selecciona una mesa'}>
        <div className="space-y-4">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Cliente</p>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Nombre del cliente"
              className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-amber-300/40"
            />
            {activeOrder ? (
              <p className="mt-3 text-sm text-zinc-400">
                Cuenta activa: <span className="text-zinc-200">{activeOrder.code}</span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">No hay cuenta activa. Al enviar se abrirá una.</p>
            )}
          </div>

          {error ? (
            <div className="rounded-[22px] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          {activeOrder ? (
            <div className="rounded-[24px] border border-white/10 bg-zinc-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Items en cuenta</p>
              <div className="mt-3 space-y-2 text-sm text-zinc-200">
                {activeOrder.items.map((item) => (
                  <div key={`${item.product}-${item.quantity}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-3 py-2">
                    <span>{item.product}</span>
                    <span>x{item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-[24px] border border-white/10 bg-zinc-950/40 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Nuevo pedido</p>
            <div className="mt-3 space-y-2">
              {cartLines.length ? (
                cartLines.map((line) => {
                  const product = menuProducts.find((item) => item.id === line.productId);
                  if (!product) {
                    return null;
                  }

                  return (
                    <div key={line.productId} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-3 py-2 text-sm text-zinc-200">
                      <div>
                        <p className="text-white">{product.name}</p>
                        <p className="text-xs text-zinc-500">
                          {currencySymbol} {product.price}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => removeFromCart(line.productId)}
                          className="h-8 w-8 rounded-xl border border-white/10 bg-black/20 text-white hover:bg-white/[0.06]"
                        >
                          -
                        </button>
                        <span className="w-6 text-center text-white">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => addToCart(line.productId)}
                          className="h-8 w-8 rounded-xl border border-white/10 bg-black/20 text-white hover:bg-white/[0.06]"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-zinc-500">Agrega productos desde el menú.</p>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-zinc-200">
              <span>Total nuevo</span>
              <span className="font-semibold text-white">
                {currencySymbol} {cartTotal.toFixed(2)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="mt-4 h-12 w-full rounded-2xl border border-amber-300/30 bg-amber-300/10 text-sm font-semibold text-white transition hover:bg-amber-300/15 disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Enviar a comandas'}
            </button>
          </div>

          {selectedTable && activeOrder ? (
            <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Mover cuenta</p>
              <div className="mt-3 flex gap-2">
                <select
                  value={moveToTableId ?? ''}
                  onChange={(event) => setMoveToTableId(event.target.value ? Number(event.target.value) : null)}
                  className="h-12 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-emerald-300/40"
                >
                  <option value="">Selecciona mesa destino</option>
                  {destinationTables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.code} ({table.area})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={submitting || !moveToTableId}
                  onClick={() => void handleMoveTable()}
                  className="h-12 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500/15 disabled:opacity-50"
                >
                  Mover
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
