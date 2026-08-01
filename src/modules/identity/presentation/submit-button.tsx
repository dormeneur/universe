'use client';

import { useFormStatus } from 'react-dom';

/**
 * Disables itself while the action is in flight.
 *
 * Worth the client component: sending a sign-in code takes a visible moment,
 * and without feedback students press the button again — which trips the
 * resend cooldown and makes the product look broken when it is working.
 */
export function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}
