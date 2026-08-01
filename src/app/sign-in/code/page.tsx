import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CodeForm } from '@/modules/identity/presentation/code-form';
import { currentUser } from '@/modules/identity/presentation/current-user';

export const metadata = { title: 'Enter your code · Uni-verse' };

export default async function CodePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  if (await currentUser()) redirect('/');

  const { email } = await searchParams;
  // Reaching this page without an address means a stale link or a manual
  // visit; start over rather than showing a form that cannot work.
  if (!email) redirect('/sign-in');

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <h1>Check your email</h1>
        <p className="lede">
          We sent a six-digit code to <strong>{email}</strong>. It expires in 10 minutes.
        </p>

        <CodeForm email={email} />

        <p className="footnote">
          Didn&rsquo;t get it? Check spam, then <Link href="/sign-in">try a different address</Link>
          .
        </p>
      </div>
    </main>
  );
}
