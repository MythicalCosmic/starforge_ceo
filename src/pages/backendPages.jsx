import { BACKEND_CATALOG } from '../api/catalog.js';
import { BackendModule } from './BackendModule.jsx';

export function AccountManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendAccount} />;
}

export function PeopleManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendPeople} />;
}

export function OrganizationManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendOrganization} />;
}

export function SchedulingManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendScheduling} />;
}

export function MessagingManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendMessaging} />;
}

export function AIManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendAI} />;
}

export function AttendanceManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendAttendance} />;
}

export function AcademicsManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendAcademics} />;
}

export function AssignmentsManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendAssignments} />;
}

export function IntelligenceManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendIntelligence} />;
}

export function ApprovalsManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendApprovals} />;
}

export function FinanceManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendFinance} />;
}

export function ReportsManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendReports} />;
}

export function AuditManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendAudit} />;
}

export function OperationsManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendOperations} />;
}

export function EngagementManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendEngagement} />;
}

export function ContentManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendContent} />;
}

export function PlacementManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendPlacement} />;
}

export function RecognitionManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendRecognition} />;
}

export function AccessManagementPage() {
  return <BackendModule module={BACKEND_CATALOG.backendAccess} />;
}
