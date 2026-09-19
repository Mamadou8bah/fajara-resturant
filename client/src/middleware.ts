import { NextRequest, NextResponse } from 'next/server';

/**
 * Rewrite /table1 → /table/1 so typing table1 in the address bar works in dev.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const match = pathname.match(/^\/table(\d+)\/?$/i);
  if (match) {
    const url = request.nextUrl.clone();
    url.pathname = `/table/${match[1]}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/table/:number', '/table(\\d+)'],
};
