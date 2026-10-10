import { NextResponse, type NextRequest } from 'next/server';

/** Link from the cart reminder: puts the guest cart back in this browser, then shows it. */
export function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('c') ?? '';
  const res = NextResponse.redirect(new URL('/cart', req.url));
  if (/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    res.cookies.set('sp_cart', token, { httpOnly: true, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', path: '/', maxAge: 90 * 86400 });
  }
  return res;
}
