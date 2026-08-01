import { getContainer } from '@/composition/container';
import type { User } from '../domain/user';
import { readSessionCookie } from './session-cookie';

/**
 * Resolves the signed-in user for a server component, or null.
 *
 * Returning null rather than redirecting keeps this usable from pages that
 * render differently when signed out — the redirect is the caller's decision.
 */
export async function currentUser(): Promise<User | null> {
  const token = await readSessionCookie();
  if (!token) return null;

  const result = await getContainer().identity.authenticate(token);
  return result.ok ? result.value : null;
}
