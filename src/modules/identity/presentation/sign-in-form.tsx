'use client';

import { useActionState } from 'react';
import { requestSignInCodeAction, type FormState } from './actions';
import { SubmitButton } from './submit-button';

const INITIAL: FormState = { error: null };

export function SignInForm() {
  const [state, formAction] = useActionState(requestSignInCodeAction, INITIAL);

  return (
    <form action={formAction} noValidate>
      <div className="field">
        <label htmlFor="email">College email</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          // Students arrive here to sign in and nothing else, so the field
          // takes focus immediately.
          autoFocus
          required
          placeholder="you@college.ac.in"
          aria-describedby={state.error ? 'sign-in-error' : 'sign-in-hint'}
        />
        <p className="hint" id="sign-in-hint">
          Use your college address. We&rsquo;ll send you a six-digit code.
        </p>
      </div>

      <SubmitButton idle="Send me a code" busy="Sending…" />

      {state.error ? (
        <p className="error" id="sign-in-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
