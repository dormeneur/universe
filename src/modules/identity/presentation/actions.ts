'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getContainer } from '@/composition/container';
import { CODE_LENGTH } from '../domain/verification-code';
import {
  describeConfirmCodeError,
  describeOnboardingError,
  describeRequestCodeError,
} from './messages';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from './session-cookie';

/**
 * Server actions: parse input, call a use case, map the Result to something
 * the form can render. No business logic lives here.
 */

export type FormState = { readonly error: string | null };

const EmailInput = z.object({ email: z.string() });
const CodeInput = z.object({ email: z.string(), code: z.string() });
const OnboardingInput = z.object({
  displayName: z.string(),
  gradYear: z.coerce.number().int(),
});

/**
 * Rate limiting needs the caller's address. Behind Vercel the immediate peer
 * is a proxy, so the first entry of `x-forwarded-for` is the client. This is
 * only ever used as a rate-limit key and is never stored against the account.
 */
async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() ?? headerList.get('x-real-ip') ?? 'unknown';
}

export async function requestSignInCodeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = EmailInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Enter your college email address.' };

  const { identity } = getContainer();
  const result = await identity.requestSignInCode({
    email: parsed.data.email,
    ipAddress: await clientIp(),
  });

  if (!result.ok) return { error: describeRequestCodeError(result.error) };

  // The address travels in the URL so the code screen can submit it back
  // without a second round trip. It is the user's own address, and knowing it
  // grants nothing without the code.
  redirect(`/sign-in/code?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function confirmSignInCodeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = CodeInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: `Enter the ${CODE_LENGTH}-digit code from your email.` };

  const container = getContainer();
  const result = await container.identity.confirmSignInCode({
    email: parsed.data.email,
    code: parsed.data.code,
  });

  if (!result.ok) return { error: describeConfirmCodeError(result.error) };

  await setSessionCookie(result.value.token, container.config.NODE_ENV === 'production');

  // New accounts have no graduation year yet, so they finish onboarding while
  // already signed in — an abandoned form leaves a real account, not a
  // half-registration.
  redirect(result.value.isNewAccount ? '/welcome' : '/');
}

export async function completeOnboardingAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = OnboardingInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'Enter your name and expected graduation year.' };

  const container = getContainer();
  const token = await readSessionCookie();
  if (!token) redirect('/sign-in');

  const authenticated = await container.identity.authenticate(token);
  if (!authenticated.ok) redirect('/sign-in');

  const result = await container.identity.completeOnboarding({
    userId: authenticated.value.id,
    displayName: parsed.data.displayName,
    gradYear: parsed.data.gradYear,
  });

  if (!result.ok) return { error: describeOnboardingError(result.error) };

  redirect('/');
}

export async function signOutAction(): Promise<void> {
  const token = await readSessionCookie();
  if (token) await getContainer().identity.signOut(token);
  await clearSessionCookie();
  redirect('/sign-in');
}
