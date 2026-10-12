// Website and notification links → screens in the app. Anything the app has no screen for opens in the
// browser instead (returns null).

export function routeFor(link: string, webHost?: string): string | null {
  let path: string;
  let query: URLSearchParams;
  try {
    const u = new URL(link, 'https://app.invalid');
    const ownHost = u.host === 'app.invalid' || (!!webHost && u.host.replace(/^www\./, '') === webHost.replace(/^www\./, ''));
    const appScheme = u.protocol === 'sahyadri:';
    if (!ownHost && !appScheme) return null;
    // sahyadri://order/SP-1?t=… parses with host "order"
    path = appScheme ? `/${u.host}${u.pathname}` : u.pathname;
    query = u.searchParams;
  } catch {
    return null;
  }
  path = path.replace(/\/+$/, '') || '/';
  let seg: string[];
  try {
    seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return null; // malformed escapes
  }
  const t = query.get('t');
  const withT = (p: string) => (t ? `${p}?t=${encodeURIComponent(t)}` : p);
  const enc = encodeURIComponent;

  if (seg.length === 0) return '/';
  switch (seg[0]) {
    case 'product':
      return seg[1] ? `/product/${enc(seg[1])}` : null;
    case 'track':
      return seg[1] ? withT(`/order/${enc(seg[1])}`) : null;
    case 'order':
      // /order/SP-1/confirmed?t=… on the website, sahyadri://order/SP-1?t=… from the payment page
      return seg[1] ? withT(`/order/${enc(seg[1])}`) : null;
    case 'jewellery':
      return seg[1] ? `/shop?category=${enc(seg[1])}` : '/shop';
    case 'collections':
      return seg[1] ? `/shop?collection=${enc(seg[1])}` : '/shop';
    case 'offers':
    case 'search':
      return query.get('q') ? `/shop?q=${enc(query.get('q')!)}` : '/shop';
    case 'ring-finder':
      return '/ring-finder';
    case 'customized-jewellery':
      return '/custom';
    case 'cart':
      return '/cart';
    case 'account':
      return seg[1] === 'orders' && seg[2] ? `/order/${enc(seg[2])}` : '/account';
    default:
      return null;
  }
}
