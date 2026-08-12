import { lazy, Suspense } from 'react';
import { PageLoader } from './components/feedback.jsx';
import { ROUTE_MODULES } from './config/routeLoaders.js';
import { useAuth } from './context/AuthContext.jsx';
import { userFacingError } from './lib/userFacingError.js';
import {
  AuthLoadingPage,
  AuthMessagePage,
  LoginPage,
  PasswordChangePage,
} from './pages/Login.jsx';

const LeadershipWorkspace = lazy(() => import('./LeadershipWorkspace.jsx'));

// eslint-disable-next-line react-refresh/only-export-components
export const REGISTERED_PAGE_IDS = Object.freeze(Object.keys(ROUTE_MODULES));

export default function App() {
  const auth = useAuth();

  if (auth.status === 'checking') return <AuthLoadingPage />;
  if (auth.status === 'anonymous') return <LoginPage />;
  if (auth.status === 'password-change') return <PasswordChangePage />;
  if (auth.status === 'signout-unconfirmed') {
    return (
      <AuthMessagePage
        title="Sign-out could not be confirmed"
        description={auth.reason}
        retry={auth.logout}
        retryLabel="Try sign out again"
      />
    );
  }
  if (auth.status === 'forbidden') {
    return (
      <AuthMessagePage
        title="Management access unavailable"
        description={auth.reason || 'This account is not authorized to open the leadership workspace.'}
        logout={auth.logout}
      />
    );
  }
  if (auth.status === 'error') {
    return (
      <AuthMessagePage
        title="Your workspace could not be opened"
        description={userFacingError(auth.error, {
          fallback: 'Please try again in a moment. Your information remains protected.',
        })}
        retry={auth.retry}
        logout={auth.logout}
      />
    );
  }
  return (
    <Suspense fallback={<PageLoader label="Opening your leadership workspace…" />}>
      <LeadershipWorkspace role={auth.role} user={auth.user} logout={auth.logout} />
    </Suspense>
  );
}
