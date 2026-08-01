import { redirect } from 'next/navigation';
import { SignInForm } from '@/modules/identity/presentation/sign-in-form';
import { currentUser } from '@/modules/identity/presentation/current-user';

export const metadata = { title: 'Sign in · Uni-verse' };

export default async function SignInPage() {
  // Already signed in — no reason to show the form again.
  if (await currentUser()) redirect('/');

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <h1>Sign in to Uni-verse</h1>
        <p className="lede">
          Find out what your campus is actually building. No password to remember.
        </p>
        <SignInForm />
      </div>
    </main>
  );
}
