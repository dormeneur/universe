'use client';

import { useActionState } from 'react';
import { completeOnboardingAction, type FormState } from './actions';
import { SubmitButton } from './submit-button';

const INITIAL: FormState = { error: null };

export function OnboardingForm({
  suggestedName,
  currentYear,
}: {
  suggestedName: string;
  currentYear: number;
}) {
  const [state, formAction] = useActionState(completeOnboardingAction, INITIAL);

  return (
    <form action={formAction} noValidate>
      <div className="field">
        <label htmlFor="displayName">Your name</label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          // Prefilled from the email address, so most students only confirm it.
          defaultValue={suggestedName}
          maxLength={60}
          required
          autoFocus
        />
        <p className="hint">This is what other students on campus will see.</p>
      </div>

      <div className="field">
        <label htmlFor="gradYear">Expected graduation year</label>
        <input
          id="gradYear"
          name="gradYear"
          type="number"
          inputMode="numeric"
          min={currentYear - 10}
          max={currentYear + 8}
          defaultValue={currentYear + 2}
          required
        />
        <p className="hint">You can change this later if it&rsquo;s wrong.</p>
      </div>

      <SubmitButton idle="Finish" busy="Saving…" />

      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
