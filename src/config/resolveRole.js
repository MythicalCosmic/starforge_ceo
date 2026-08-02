import { API_CONFIG } from '../api/config.js';

const CONSOLE_ROLES = new Set(['ceo', 'manager']);

function membershipSlug(membership) {
  return String(membership?.account_type_slug || membership?.legacy_role || '').trim().toLowerCase();
}

function isActiveStaffMembership(membership) {
  if (!membership || membership.revoked_at) return false;
  const accountKind = String(membership.account_kind || '').trim().toLowerCase();
  return !accountKind || accountKind === 'staff';
}

export function managementMemberships(profile, role) {
  const memberships = Array.isArray(profile?.role_memberships) ? profile.role_memberships : [];
  const slug = role === 'ceo' ? 'director' : 'head_of_dept';
  return memberships.filter(
    (membership) =>
      isActiveStaffMembership(membership) &&
      membershipSlug(membership) === slug,
  );
}

export function managementMembership(profile, role) {
  const memberships = managementMemberships(profile, role);
  if (role === 'ceo') {
    return memberships[0] || null;
  }
  return memberships[0] || null;
}

function resolveMockRole() {
  if (!API_CONFIG.useMock) return null;
  const fromEnv = String(import.meta.env.VITE_ROLE || '').trim().toLowerCase();
  const fromQuery =
    import.meta.env.DEV && typeof window !== 'undefined'
      ? String(new URLSearchParams(window.location.search).get('role') || '').trim().toLowerCase()
      : '';
  const candidate = fromQuery || fromEnv || 'ceo';
  return CONSOLE_ROLES.has(candidate) ? candidate : 'ceo';
}

// The backend represents both audiences with the broad technical `staff`
// principal kind, so the membership slug is the actual product boundary:
// director = CEO and head_of_dept = manager. Every other account type fails
// closed. URL role switching exists only in an explicitly enabled dev mock.
export function resolveRole(profile) {
  if (!profile) return resolveMockRole();
  if (profile.is_active === false) return null;
  if (profile.principal_kind !== 'staff') return null;
  if (managementMembership(profile, 'ceo')) return 'ceo';
  if (managementMembership(profile, 'manager')) return 'manager';
  return null;
}
