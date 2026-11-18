const DEFAULT_TITLE = 'Restaurante';
const DEFAULT_FAVICON = '/api/v1/public/favicon';

const MANAGED_ICON_RELS = ['icon', 'shortcut icon', 'apple-touch-icon'] as const;

function detectFaviconType(faviconHref: string) {
  if (faviconHref.includes('/api/v1/public/favicon')) {
    return 'image/png';
  }
  if (faviconHref.startsWith('data:image/png') || faviconHref.endsWith('.png')) {
    return 'image/png';
  }
  if (faviconHref.startsWith('data:image/jpeg') || faviconHref.endsWith('.jpg') || faviconHref.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (faviconHref.startsWith('data:image/webp') || faviconHref.endsWith('.webp')) {
    return 'image/webp';
  }
  return 'image/svg+xml';
}

function buildManagedFaviconHref(faviconHref: string, brandName: string) {
  if (faviconHref.startsWith('data:')) {
    return faviconHref;
  }

  const separator = faviconHref.includes('?') ? '&' : '?';
  return `${faviconHref}${separator}brand=${encodeURIComponent(brandName)}`;
}

function ensureFaviconLink(rel: (typeof MANAGED_ICON_RELS)[number]) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"][data-brand-icon="true"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    link.setAttribute('data-brand-icon', 'true');
    document.head.appendChild(link);
  }
  return link;
}

export function applyBrowserBrand(options?: { brandName?: string | null; logoData?: string | null; pageTitle?: string | null }) {
  if (typeof document === 'undefined') {
    return;
  }

  const brandName = options?.brandName?.trim() || DEFAULT_TITLE;
  const pageTitle = options?.pageTitle?.trim();
  document.title = pageTitle && pageTitle !== brandName ? `${brandName} | ${pageTitle}` : brandName;

  const faviconVersion = options?.logoData?.trim() ? String(options.logoData.trim().length) : 'default';
  const faviconHref = `${DEFAULT_FAVICON}?v=${encodeURIComponent(faviconVersion)}`;
  const managedHref = buildManagedFaviconHref(faviconHref, brandName);
  const managedType = detectFaviconType(faviconHref);

  document
    .querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
    .forEach((link) => {
      if (!link.hasAttribute('data-brand-icon')) {
        link.remove();
      }
    });

  MANAGED_ICON_RELS.forEach((rel) => {
    const favicon = ensureFaviconLink(rel);
    favicon.type = managedType;
    favicon.href = managedHref;
    if (rel === 'apple-touch-icon') {
      favicon.sizes = '180x180';
    }
  });
}
