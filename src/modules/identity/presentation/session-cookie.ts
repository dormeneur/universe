import { cookies } from 'next/headers';
import { SESSION_ABSOLUTE_TTL_MS } from '../domain/session';

export const SESSION_COOKIE = 'uniiverse_session';

/**
 * Cookie flags carry most of the session's security properties (ADR 0004):
 *
 * - `httpOnly` keeps the token out of reach of any script, so an XSS bug
 *   cannot exfiltrate it.
 * - `sameSite: 'lax'` means it is not sent on cross-site POSTs, which is the
 *   primary CSRF defence; Next's server actions add an origin check on top.
 * - `secure` outside development, so it never travels in the clear.
 * - `path: '/'` so a single sign-out clears it everywhere.
 */
export async function setSessionCookie(token: string, isProduction: boolean): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: SESSION_ABSOLUTE_TTL_MS / 1000,
  });
}

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
