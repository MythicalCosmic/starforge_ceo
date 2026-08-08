import { describe, expect, it } from 'vitest';
import { LEGACY_ROUTES, resolveLegacySegments } from './routes.js';

const RESTORED_MODULES = {
  backendAccount: 'account',
  backendPeople: 'people',
  backendOrganization: 'organization',
  backendScheduling: 'schedule',
  backendMessaging: 'messaging',
  backendAI: 'ai-governance',
  backendAttendance: 'attendance',
  backendAcademics: 'academics',
  backendAssignments: 'assignments',
  backendIntelligence: 'intelligence',
  backendApprovals: 'decisions',
  backendCRM: 'crm',
  backendFinance: 'finance',
  backendPayroll: 'payroll',
  backendReports: 'reports',
  backendAudit: 'audit',
  backendOperations: 'operations',
  backendEngagement: 'engagement',
  backendContent: 'content',
  backendPlacement: 'placement',
  backendRecognition: 'recognition',
  backendAccess: 'access',
};

describe('restored management routes', () => {
  it('maps every former module to its complete leadership workspace', () => {
    for (const [former, current] of Object.entries(RESTORED_MODULES)) {
      expect(LEGACY_ROUTES[former]).toBeDefined();
      expect(resolveLegacySegments([former])).toEqual([current]);
    }
  });

  it('preserves tabs and record identifiers that used to become unreachable', () => {
    expect(resolveLegacySegments(['backendContent', 'courses', '42']))
      .toEqual(['content', 'courses', '42']);
    expect(resolveLegacySegments(['backendRecognition', 'achievements', '8']))
      .toEqual(['recognition', 'achievements', '8']);
    expect(resolveLegacySegments(['backendFinance', 'providerConfigs', '17']))
      .toEqual(['finance', 'providerConfigs', '17']);
    expect(resolveLegacySegments(['backendCRM', 'leads', '8']))
      .toEqual(['crm', 'leads', '8']);
    expect(resolveLegacySegments(['backendPayroll', 'periods', '6']))
      .toEqual(['payroll', 'periods', '6']);
    expect(resolveLegacySegments(['backendOperations', 'loans', '3']))
      .toEqual(['operations', 'loans', '3']);
  });

  it('opens student and teacher records in their dedicated full-page views', () => {
    expect(resolveLegacySegments(['backendPeople', 'students', '42']))
      .toEqual(['students', 'directory', '42']);
    expect(resolveLegacySegments(['backendPeople', 'teachers', '9']))
      .toEqual(['teachers', 'directory', '9']);
    expect(resolveLegacySegments(['backendPeople', 'enrollmentReasons']))
      .toEqual(['people', 'enrollmentReasons']);
  });

  it('uses one dedicated workspace for each branch record', () => {
    expect(resolveLegacySegments(['organization', 'branches', '42']))
      .toEqual(['branches', '42', 'overview']);
    expect(resolveLegacySegments(['organization', 'branches']))
      .toEqual(['organization', 'branches']);
  });

  it('keeps links from the consolidated build useful', () => {
    expect(resolveLegacySegments(['learning', 'assignments', '12']))
      .toEqual(['assignments', 'assignments', '12']);
    expect(resolveLegacySegments(['insights', 'report-history', '4']))
      .toEqual(['reports', 'runs', '4']);
    expect(resolveLegacySegments(['communications', 'notices']))
      .toEqual(['engagement', 'notifications']);
    expect(resolveLegacySegments(['governance', 'ai-budget']))
      .toEqual(['ai-governance', 'budget']);
    expect(resolveLegacySegments(['organization', 'tasks', '5']))
      .toEqual(['operations', 'tasks', '5']);
  });

  it('leaves current routes unchanged', () => {
    expect(resolveLegacySegments(['students', 'directory', '42']))
      .toEqual(['students', 'directory', '42']);
    expect(resolveLegacySegments(['content', 'courses', '42']))
      .toEqual(['content', 'courses', '42']);
  });
});
