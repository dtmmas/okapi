import { create } from 'zustand';

type CartLine = {
  id: string;
  productId: number;
  quantity: number;
  notes: string;
  sauces: string[];
  dressings: string[];
};

type PosWizardState = {
  tableId: number | null;
  customerId: number | null;
  customerName: string;
  customerPhone: string;
  cart: Record<string, CartLine>;
  setTable: (tableId: number) => void;
  setCustomer: (payload: { id?: number | null; name: string; phone?: string | null }) => void;
  setCustomerName: (name: string) => void;
  setCustomerPhone: (phone: string) => void;
  clearCustomer: () => void;
  addToCart: (payload: { productId: number; notes?: string; sauces?: string[]; dressings?: string[] }) => void;
  incrementLine: (lineId: string) => void;
  decrementLine: (lineId: string) => void;
  removeLine: (lineId: string) => void;
  clearCart: () => void;
  reset: () => void;
};

export const usePosWizardStore = create<PosWizardState>((set) => ({
  tableId: null,
  customerId: null,
  customerName: '',
  customerPhone: '',
  cart: {},
  setTable(tableId) {
    set({ tableId });
  },
  setCustomer(payload) {
    set({
      customerId: payload.id ?? null,
      customerName: payload.name,
      customerPhone: payload.phone ?? '',
    });
  },
  setCustomerName(name) {
    set({ customerName: name, customerId: null });
  },
  setCustomerPhone(phone) {
    set({ customerPhone: phone, customerId: null });
  },
  clearCustomer() {
    set({ customerId: null, customerName: '', customerPhone: '' });
  },
  addToCart(payload) {
    set((state) => {
      const normalizedNotes = (payload.notes ?? '').trim();
      const sauces = [...new Set((payload.sauces ?? []).map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      const dressings = [...new Set((payload.dressings ?? []).map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      const existing = Object.values(state.cart).find(
        (line) =>
          line.productId === payload.productId &&
          line.notes === normalizedNotes &&
          line.sauces.join('||') === sauces.join('||') &&
          line.dressings.join('||') === dressings.join('||'),
      );

      return {
        cart: {
          ...state.cart,
          ...(existing
            ? {
                [existing.id]: {
                  ...existing,
                  quantity: existing.quantity + 1,
                },
              }
            : (() => {
                const id = `L${Date.now()}${Math.random().toString(16).slice(2)}`;
                return {
                  [id]: {
                    id,
                    productId: payload.productId,
                    quantity: 1,
                    notes: normalizedNotes,
                    sauces,
                    dressings,
                  },
                };
              })()),
        },
      };
    });
  },
  incrementLine(lineId) {
    set((state) => {
      const existing = state.cart[lineId];
      if (!existing) {
        return {};
      }

      return {
        cart: {
          ...state.cart,
          [lineId]: {
            ...existing,
            quantity: existing.quantity + 1,
          },
        },
      };
    });
  },
  decrementLine(lineId) {
    set((state) => {
      const existing = state.cart[lineId];
      if (!existing) {
        return {};
      }

      if (existing.quantity <= 1) {
        const next = { ...state.cart };
        delete next[lineId];
        return { cart: next };
      }

      return {
        cart: {
          ...state.cart,
          [lineId]: {
            ...existing,
            quantity: existing.quantity - 1,
          },
        },
      };
    });
  },
  removeLine(lineId) {
    set((state) => {
      if (!state.cart[lineId]) {
        return {};
      }

      const next = { ...state.cart };
      delete next[lineId];
      return { cart: next };
    });
  },
  clearCart() {
    set({ cart: {} });
  },
  reset() {
    set({ tableId: null, customerId: null, customerName: '', customerPhone: '', cart: {} });
  },
}));
