import { redirect } from 'next/navigation';
import { deriveRole, isProfileComplete } from '@/modules/identity';
import { signOutAction } from '@/modules/identity/presentation/actions';
import { currentUser } from '@/modules/identity/presentation/current-user';

export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  if (!isProfileComplete(user)) redirect('/welcome');

  const role = deriveRole(user, new Date());

  return (
    <main className="page">
      {user.status === 'pending_approval' ? (
        <p className="banner">
          Your email domain isn&rsquo;t on the campus list yet, so an admin is reviewing your
          account. You can look around in the meantime.
        </p>
      ) : null}

      <h1>Hi, {user.displayName}</h1>
      <p style={{ color: 'var(--muted)' }}>
        Signed in as {user.email} · {role} · graduating {user.gradYear}
      </p>

      <p style={{ marginTop: '2rem' }}>
        {user.github
          ? `GitHub linked as @${user.github.login}.`
          : 'GitHub isn’t linked yet. Linking it is how your projects get indexed — that lands in the next slice.'}
      </p>

      <p style={{ marginTop: '2.5rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
        Phase 1, slice 1. Project discovery arrives in Phase 2.
      </p>

      <form action={signOutAction} style={{ marginTop: '1.5rem' }}>
        <button className="link" type="submit">
          Sign out
        </button>
      </form>
    </main>
  );
}
