import type { ReceiptDocument, ReceiptSectionEntry } from '@/types/printing';

export function escapeReceiptHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function renderReceiptEntry(entry: ReceiptSectionEntry) {
  const titleHtml = entry.title ? `<div class="entry-title">${escapeReceiptHtml(entry.title)}</div>` : '';
  const linesHtml = entry.lines.map((line) => `<div>${escapeReceiptHtml(line)}</div>`).join('');
  return `<div class="meta">${titleHtml}${linesHtml}</div>`;
}

export function buildReceiptHtml(document: ReceiptDocument) {
  const metadataHtml = document.metadata
    .map((item) => `<strong>${escapeReceiptHtml(item.label)}:</strong> ${escapeReceiptHtml(item.value)}`)
    .join('<br/>');
  const itemsHtml = document.items?.length
    ? document.items
        .map((item) => {
          const right = item.right ? escapeReceiptHtml(item.right) : '';
          const noteHtml = item.note ? `<div class="note">${escapeReceiptHtml(item.note)}</div>` : '';
          return `<div class="row"><div class="left">${escapeReceiptHtml(item.left)}${noteHtml}</div><div class="right">${right}</div></div>`;
        })
        .join('')
    : `<div class="meta">${escapeReceiptHtml(document.emptyItemsLabel ?? 'Sin items.')}</div>`;
  const summaryHtml = document.summary?.length
    ? document.summary
        .map((item) => `<div class="row"><div class="left">${escapeReceiptHtml(item.label)}</div><div class="right">${escapeReceiptHtml(item.value)}</div></div>`)
        .join('')
    : '';
  const summaryNoteHtml = document.summaryNote ? `<div class="summary-note">${escapeReceiptHtml(document.summaryNote)}</div>` : '';
  const sectionsHtml =
    document.sections
      ?.filter((section) => section.entries.length)
      .map((section) => {
        const titleHtml = section.title ? `<div class="meta"><strong>${escapeReceiptHtml(section.title)}</strong></div>` : '';
        const entriesHtml = section.entries.map(renderReceiptEntry).join('');
        return `<div class="divider"></div>${titleHtml}${entriesHtml}`;
      })
      .join('') ?? '';
  const footerHtml = document.footerLabel ? `<div class="footer">${escapeReceiptHtml(document.footerLabel)}</div>` : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeReceiptHtml(document.title)}</title>
    <style>
      * { box-sizing: border-box; }
      @page { size: 80mm auto; margin: 0; }
      body { margin: 0; background: #fff; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: #111; }
      .ticket { width: 80mm; padding: 3mm 3mm 2mm; margin: 0; }
      .center { text-align: center; }
      .title { font-weight: 900; font-size: 20px; letter-spacing: 0.1em; }
      .subtitle { font-weight: 900; font-size: 14px; margin-top: 4px; }
      .meta { font-size: 12px; margin-top: 8px; font-weight: 800; }
      .divider { border-top: 2px dashed #222; margin: 8px 0; }
      .row { display: flex; gap: 8px; align-items: flex-start; justify-content: space-between; font-size: 13px; padding: 6px 0; }
      .left { flex: 1 1 auto; min-width: 0; font-weight: 800; }
      .right { flex: 0 0 40%; max-width: 40%; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 900; }
      .note { font-weight: 700; font-size: 12px; opacity: 0.88; margin-top: 2px; white-space: pre-wrap; }
      .entry-title { margin-bottom: 2px; font-weight: 900; }
      .summary-note { margin-top: 6px; text-align: center; font-size: 11px; font-weight: 800; opacity: 0.82; }
      .footer { margin-top: 8px; font-size: 12px; font-weight: 900; text-align: center; letter-spacing: 0.06em; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <div class="ticket">
      <div class="center">
        <div class="subtitle">${escapeReceiptHtml(document.brandName)}</div>
        <div class="title">${escapeReceiptHtml(document.title)}</div>
        <div class="meta">${escapeReceiptHtml(document.printedAt)}</div>
      </div>
      <div class="divider"></div>
      <div class="meta">${metadataHtml}</div>
      <div class="divider"></div>
      ${itemsHtml}
      ${summaryHtml ? `<div class="divider"></div><div class="summary">${summaryHtml}${summaryNoteHtml}</div>` : ''}
      ${sectionsHtml}
      ${footerHtml}
    </div>
    <script>
      window.onload = () => { window.print(); };
      window.onafterprint = () => { window.close(); };
    </script>
  </body>
</html>`;
}
