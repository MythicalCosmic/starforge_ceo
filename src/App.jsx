import { lazy, Suspense, useMemo } from 'react';
import { PageLoader } from './components/feedback.jsx';
import { roleConfigForUser } from './config/roles.js';
import { useAuth } from './context/AuthContext.jsx';
import { ScopeProvider } from './context/ScopeContext.jsx';
import { useHashRoute } from './hooks/useHashRoute.js';
import { Shell } from './layout/Shell.jsx';
import {
  AuthLoadingPage,
  AuthMessagePage,
  LoginPage,
  PasswordChangePage,
} from './pages/Login.jsx';

const lazyPage = (loader, exportName) =>
  lazy(() => loader().then((module) => ({ default: module[exportName] })));

// Route modules are fetched only after authentication and only when selected.
// A manager session therefore never eagerly downloads CEO-only modules.
const PAGES = {
  dash: lazyPage(() => import('./pages/Dashboard.jsx'), 'DashboardPage'),
  settings: lazyPage(() => import('./pages/Settings.jsx'), 'SettingsPage'),
  backendAccount: lazyPage(() => import('./pages/backendPages.jsx'), 'AccountManagementPage'),
  backendPeople: lazyPage(() => import('./pages/backendPages.jsx'), 'PeopleManagementPage'),
  backendOrganization: lazyPage(() => import('./pages/backendPages.jsx'), 'OrganizationManagementPage'),
  backendScheduling: lazyPage(() => import('./pages/backendPages.jsx'), 'SchedulingManagementPage'),
  backendMessaging: lazyPage(() => import('./pages/backendPages.jsx'), 'MessagingManagementPage'),
  backendAI: lazyPage(() => import('./pages/backendPages.jsx'), 'AIManagementPage'),
  backendAttendance: lazyPage(() => import('./pages/backendPages.jsx'), 'AttendanceManagementPage'),
  backendAcademics: lazyPage(() => import('./pages/backendPages.jsx'), 'AcademicsManagementPage'),
  backendAssignments: lazyPage(() => import('./pages/backendPages.jsx'), 'AssignmentsManagementPage'),
  backendIntelligence: lazyPage(() => import('./pages/backendPages.jsx'), 'IntelligenceManagementPage'),
  backendApprovals: lazyPage(() => import('./pages/backendPages.jsx'), 'ApprovalsManagementPage'),
  backendFinance: lazyPage(() => import('./pages/backendPages.jsx'), 'FinanceManagementPage'),
  backendReports: lazyPage(() => import('./pages/backendPages.jsx'), 'ReportsManagementPage'),
  backendAudit: lazyPage(() => import('./pages/backendPages.jsx'), 'AuditManagementPage'),
  backendOperations: lazyPage(() => import('./pages/backendPages.jsx'), 'OperationsManagementPage'),
  backendEngagement: lazyPage(() => import('./pages/backendPages.jsx'), 'EngagementManagementPage'),
  backendContent: lazyPage(() => import('./pages/backendPages.jsx'), 'ContentManagementPage'),
  backendPlacement: lazyPage(() => import('./pages/backendPages.jsx'), 'PlacementManagementPage'),
  backendRecognition: lazyPage(() => import('./pages/backendPages.jsx'), 'RecognitionManagementPage'),
  backendAccess: lazyPage(() => import('./pages/backendPages.jsx'), 'AccessManagementPage'),
};

function LeadershipWorkspace({ role, user, logout }) {
  const cfg = useMemo(() => roleConfigForUser(role, user), [role, user]);
  const allowed = useMemo(() => new Set(cfg.nav.map((item) => item.id)), [cfg]);
  const fallback = cfg.nav[0].id;
  const [active, navigate] = useHashRoute(fallback);
  const routeId = allowed.has(active) ? active : fallback;
  const Page = PAGES[routeId] || PAGES[fallback];

  return (
    <ScopeProvider role={role} defaultBranch={cfg.defaultBranch}>
      <Shell cfg={cfg} active={routeId} onNav={navigate} onLogout={logout}>
        <Suspense fallback={<PageLoader label="Shaping your next view…" />}>
          <div className="sf-route-stage" key={routeId}>
            <Page role={role} user={user} onNav={navigate} />
          </div>
        </Suspense>
      </Shell>
    </ScopeProvider>
  );
}

export default function App() {
  const auth = useAuth();

  if (auth.status === 'checking') return <AuthLoadingPage />;
  if (auth.status === 'anonymous') return <LoginPage />;
  if (auth.status === 'password-change') return <PasswordChangePage />;
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
        description={auth.error?.message || 'Please try again in a moment. Your information remains protected.'}
        retry={auth.retry}
        logout={auth.logout}
      />
    );
  }
  return <LeadershipWorkspace role={auth.role} user={auth.user} logout={auth.logout} />;
}
