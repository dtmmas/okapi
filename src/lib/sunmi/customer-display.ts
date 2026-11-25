import { useEffect } from 'react';

export type CustomerDisplayLine = {
  name: string;
  quantity: number;
  lineTotal: number;
  detail?: string;
};

export type CustomerDisplayPayload = {
  brandName: string;
  currencySymbol: string;
  lines: CustomerDisplayLine[];
  total: number;
};

export type SunmiCustomerDisplayBridge = {
  isAvailable?: () => Promise<boolean> | boolean;
  updateCart: (payload: CustomerDisplayPayload) => Promise<void> | void;
  clear?: () => Promise<void> | void;
};

declare global {
  interface Window {
    SunmiCustomerDisplay?: SunmiCustomerDisplayBridge;
  }
}

type CartLineLike = {
  productId: number;
  quantity: number;
  notes: string;
  sauces: string[];
  dressings: string[];
};

function getBridge(): SunmiCustomerDisplayBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.SunmiCustomerDisplay?.updateCart ? window.SunmiCustomerDisplay : null;
}

export function hasSunmiCustomerDisplayBridge() {
  return Boolean(getBridge());
}

export function formatCartLineDetail(line: Pick<CartLineLike, 'notes' | 'sauces' | 'dressings'>) {
  const parts = [
    line.sauces.length ? `Salsas: ${line.sauces.join(', ')}` : '',
    line.dressings.length ? `Aderezos: ${line.dressings.join(', ')}` : '',
    line.notes.trim(),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

export function buildCustomerDisplayFromCartLines(params: {
  brandName: string;
  currencySymbol: string;
  lines: CartLineLike[];
  getProductName: (productId: number) => string | undefined;
  getUnitPrice: (productId: number) => number;
  getModifierUnitTotal: (line: CartLineLike) => number;
}): CustomerDisplayPayload {
  const displayLines: CustomerDisplayLine[] = params.lines.map((line) => {
    const name = params.getProductName(line.productId) ?? 'Producto';
    const unit = params.getUnitPrice(line.productId) + params.getModifierUnitTotal(line);
    return {
      name,
      quantity: line.quantity,
      lineTotal: unit * line.quantity,
      detail: formatCartLineDetail(line),
    };
  });

  const total = displayLines.reduce((sum, line) => sum + line.lineTotal, 0);

  return {
    brandName: params.brandName,
    currencySymbol: params.currencySymbol,
    lines: displayLines,
    total,
  };
}

export async function updateSunmiCustomerDisplay(payload: CustomerDisplayPayload) {
  const bridge = getBridge();
  if (!bridge) {
    return;
  }
  if (bridge.isAvailable) {
    const available = await bridge.isAvailable();
    if (!available) {
      return;
    }
  }
  await bridge.updateCart(payload);
}

export async function clearSunmiCustomerDisplay() {
  const bridge = getBridge();
  if (!bridge) {
    return;
  }
  if (bridge.clear) {
    await bridge.clear();
    return;
  }
  await bridge.updateCart({
    brandName: '',
    currencySymbol: 'Q',
    lines: [],
    total: 0,
  });
}

export function useSunmiCustomerDisplaySync(payload: CustomerDisplayPayload | null) {
  useEffect(() => {
    if (!hasSunmiCustomerDisplayBridge()) {
      return;
    }

    if (!payload?.lines.length) {
      void clearSunmiCustomerDisplay();
      return;
    }

    void updateSunmiCustomerDisplay(payload);
  }, [payload]);

  useEffect(() => {
    if (!hasSunmiCustomerDisplayBridge()) {
      return;
    }
    return () => {
      void clearSunmiCustomerDisplay();
    };
  }, []);
}