import { redirect } from 'next/navigation';
import { isProfileComplete } from '@/modules/identity';
import { currentUser } from '@/modules/identity/presentation/current-user';
import { OnboardingForm } from '@/modules/identity/presentation/onboarding-form';

export const metadata = { title: 'Welcome · Uni-verse' };

export default async function WelcomePage() {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  // Already onboarded — nothing to ask for.
  if (isProfileComplete(user)) redirect('/');

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <h1>Almost there</h1>
        <p className="lede">Two details, then you&rsquo;re in.</p>
        <OnboardingForm
          suggestedName={user.displayName}
          currentYear={new Date().getUTCFullYear()}
        />
      </div>
    </main>
  );
}
