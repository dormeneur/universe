'use client';

import { useActionState } from 'react';
import { CODE_LENGTH } from '../domain/verification-code';
import { confirmSignInCodeAction, type FormState } from './actions';
import { SubmitButton } from './submit-button';

const INITIAL: FormState = { error: null };

export function CodeForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(confirmSignInCodeAction, INITIAL);

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="email" value={email} />

      <div className="field">
        <label htmlFor="code">Six-digit code</label>
        <input
          id="code"
          name="code"
          className="code"
          // `inputMode="numeric"` brings up the number pad on a phone, which
          // is where most students will be reading the code from.
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={CODE_LENGTH}
          // Lets iOS and Android offer the code straight from the SMS/email
          // notification instead of making people switch apps and retype it.
          autoComplete="one-time-code"
          autoFocus
          required
          aria-describedby={state.error ? 'code-error' : undefined}
        />
      </div>

      <SubmitButton idle="Sign in" busy="Checking…" />

      {state.error ? (
        <p className="error" id="code-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
