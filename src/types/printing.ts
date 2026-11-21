export type ReceiptKeyValue = {
  label: string;
  value: string;
};

export type ReceiptLineItem = {
  left: string;
  right?: string;
  note?: string;
};

export type ReceiptSectionEntry = {
  title?: string;
  lines: string[];
};

export type ReceiptSection = {
  title?: string;
  entries: ReceiptSectionEntry[];
};

export type ReceiptDocument = {
  brandLines?: string[];
  companyDetails?: { address?: string; phone?: string; slogan?: string };
  paperWidthMm?: number;
  title: string;
  brandName: string;
  logoPng?: string;
  printedAt: string;
  metadata: ReceiptKeyValue[];
  items?: ReceiptLineItem[];
  emptyItemsLabel?: string;
  summary?: ReceiptKeyValue[];
  summaryNote?: string;
  sections?: ReceiptSection[];
  footerLabel?: string;
};

export type ReceiptPrintSession = {
  print: (document: ReceiptDocument) => Promise<void>;
  cancel: () => void;
};

export type SunmiReceiptBridge = {
  printReceipt: (document: ReceiptDocument) => Promise<void> | void;
  isAvailable?: () => Promise<boolean> | boolean;
};

declare global {
  interface Window {
    SunmiPrinter?: SunmiReceiptBridge;
  }
}

export {};
