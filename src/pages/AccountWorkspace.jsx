import { cloneElement, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { httpRequest } from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import { Icons } from '../components/Icons.jsx';
import {
  ActionButton,
  DetailGrid,
  DetailSection,
  LinkButton,
  ProfileHero,
  SectionNav,
  StatusPill,
  WorkspaceHeader,
  WorkspaceLayout,
  WorkspaceState,
  WorkspaceTable,
} from '../components/WorkspacePrimitives.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useWorkspaceData, workspaceRoute } from '../hooks/useWorkspaceData.js';
import { formatGender, formatOrganizationDate } from '../lib/formatters.js';
import {
  PASSWORD_MAX_LENGTH,
  passwordChangeFailure,
  validatePasswordChange,
} from '../lib/passwordPolicy.js';
import { userFacingError } from '../lib/userFacingError.js';
import '../styles/account-v3.css';
import '../styles/focused-v3.css';

const SECTIONS = Object.freeze([
  { id: 'profile', label: 'Profile', description: 'Identity and contact', icon: Icons.user },
  { id: 'notifications', label: 'Notifications', description: 'Delivery preferences', icon: Icons.bell },
  { id: 'security', label: 'Security', description: 'Password and session', icon: Icons.shield },
  { id: 'devices', label: 'Devices', description: 'Recognized sign-ins', icon: Icons.globe },
  { id: 'access', label: 'My access', description: 'Roles and leadership scope', icon: Icons.check },
  { id: 'workspace', label: 'Workspace', description: 'Appearance and language', icon: Icons.settings },
]);

const PROFILE_FIELDS = Object.freeze(['first_name', 'last_name', 'middle_name', 'phone', 'email', 'birthdate', 'gender']);
const EMPTY_PROFILE = Object.freeze(Object.fromEntries(PROFILE_FIELDS.map((key) => [key, ''])));
const NOTIFICATION_EVENTS = Object.freeze([
  ['approval.awaiting_disbursement', 'Approved requests awaiting payment', 'Finance'],
  ['approval.approved', 'Request approvals', 'Decisions'],
  ['approval.rejected', 'Request rejections', 'Decisions'],
  ['finance.invoice_issued', 'New invoices', 'Finance'],
  ['finance.payment_reminder', 'Payment reminders', 'Finance'],
  ['payments.payment_completed', 'Completed collections', 'Finance'],
  ['payments.payment_failed', 'Failed collections', 'Finance'],
  ['report.ready', 'Prepared reports', 'Reports'],
  ['print.failed', 'Printing failures', 'Operations'],
  ['auth.new_device_login', 'New device sign-ins', 'Security'],
  ['message.received', 'New leadership messages', 'Communication'],
  ['penalty.escalated', 'Student conduct escalations', 'Students'],
]);
const CHANNELS = Object.freeze([
  ['in_app', 'Workspace'],
  ['push', 'Push'],
  ['email', 'Email'],
  ['sms', 'SMS'],
]);

function defaultNotificationValue(eventType, channel) {
  if (channel === 'in_app' || channel === 'push') return true;
  if (channel === 'email') return eventType.startsWith('finance.') || eventType.startsWith('billing.');
  if (channel === 'sms') return ['attendance.absent', 'payments.payment_completed', 'payments.payment_failed', 'finance.invoice_issued', 'finance.payment_reminder'].includes(eventType);
  return false;
}

function normalizedProfile(form) {
  return {
    first_name: String(form.first_name || '').trim(),
    last_name: String(form.last_name || '').trim(),
    middle_name: String(form.middle_name || '').trim(),
    phone: String(form.phone || '').trim(),
    email: String(form.email || '').trim(),
    birthdate: form.birthdate || null,
    gender: ['m', 'f'].includes(form.gender) ? form.gender : '',
  };
}

function ProfileSection({ profile, onNav, readOnly = false }) {
  const [form, setForm] = useState(EMPTY_PROFILE);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  useEffect(() => {
    if (!profile.data) return;
    setForm(Object.fromEntries(PROFILE_FIELDS.map((key) => [key, profile.data[key] || ''])));
  }, [profile.data]);
  const mutation = useMutation({
    mutationFn: () => httpRequest('PATCH', '/api/v1/users/me/', { body: normalizedProfile(form) }),
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ['api'] });
      setEditing(false);
      setError('');
      toast.success('Your profile has been updated.');
      window.dispatchEvent(new CustomEvent('sf-auth-session-changed', { detail: { reason: 'profile-updated' } }));
      setForm(Object.fromEntries(PROFILE_FIELDS.map((key) => [key, next[key] || ''])));
    },
    onError: (failure) => {
      const message = userFacingError(failure, { fallback: 'Your profile could not be updated.' });
      setError(message);
      toast.danger(message);
    },
  });
  const data = profile.data;
  const responsibility = data?.role_memberships?.[0]?.account_type_name || 'Leadership';
  const workspaceName = String(data?.organization_name || data?.tenant_slug || 'Organization')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return <WorkspaceState state={profile} empty={!data}>{data && <>
    <ProfileHero
      eyebrow="Management profile"
      name={data.full_name || data.username}
      meta={<><StatusPill value={data.is_active ? 'active' : 'inactive'} /><span>@{data.username}</span><span>{responsibility} account</span></>}
      actions={<>{readOnly
        ? <StatusPill value="View only" tone="warn" />
        : editing
          ? <ActionButton onClick={() => setEditing(false)}>Cancel</ActionButton>
          : <ActionButton tone="primary" icon={Icons.user} onClick={() => setEditing(true)}>Edit profile</ActionButton>}<LinkButton to="settings" onNav={onNav} icon={Icons.settings}>Workspace preferences</LinkButton></>}
    />
    {editing && !readOnly ? <form className="account-profile-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <header><div><span>Personal details</span><h2>Keep your leadership profile current</h2><p>These details are used for attribution, communication, and accountable actions.</p></div></header>
      {error && <div className="fw-form-error">{error}</div>}
      <div className="account-form-grid">
        <label>First name<input required autoComplete="given-name" maxLength="150" value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} /></label>
        <label>Last name<input required autoComplete="family-name" maxLength="150" value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} /></label>
        <label>Middle name<input autoComplete="additional-name" maxLength="150" value={form.middle_name} onChange={(event) => setForm({ ...form, middle_name: event.target.value })} /></label>
        <label>Phone<input type="tel" autoComplete="tel" maxLength="32" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label>Email<input type="email" autoComplete="email" maxLength="254" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Date of birth<input type="date" value={form.birthdate} onChange={(event) => setForm({ ...form, birthdate: event.target.value })} /></label>
        <label>Gender<select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="">Prefer not to specify</option><option value="m">Male</option><option value="f">Female</option></select></label>
      </div>
      <footer><ActionButton type="submit" tone="primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save profile'}</ActionButton></footer>
    </form> : <>
      <DetailSection eyebrow="Identity" title="Profile information"><DetailGrid columns={3} fields={[
        { label: 'Full name', value: data.full_name }, { label: 'Username', value: data.username }, { label: 'Responsibility', value: responsibility },
        { label: 'Phone', value: data.phone }, { label: 'Email', value: data.email }, { label: 'Gender', value: formatGender(data.gender) },
        { label: 'Date of birth', value: formatOrganizationDate(data.birthdate, { dateOnly: true }) }, { label: 'Last sign-in', value: formatOrganizationDate(data.last_login_at) },
        { label: 'Workspace', value: workspaceName },
      ]} /></DetailSection>
      <DetailSection eyebrow="Account assurance" title="Sign-in readiness"><div className="account-assurance-grid"><div><span>{cloneElement(Icons.check, { size: 17 })}</span><strong>Active management access</strong><p>Your account is enabled for its assigned responsibilities.</p></div><div><span>{cloneElement(Icons.shield, { size: 17 })}</span><strong>{data.must_change_password ? 'Password update required' : 'Password is up to date'}</strong><p>{data.must_change_password ? 'Choose a new password before continuing sensitive work.' : 'No password update is currently required.'}</p></div></div></DetailSection>
    </>}
  </>}</WorkspaceState>;
}

function NotificationSection({ readOnly = false }) {
  const preferences = useWorkspaceData('/api/v1/notifications/preferences/');
  const [savingKey, setSavingKey] = useState('');
  const toast = useToast();
  const preferenceMap = useMemo(() => new Map(preferences.rows.map((item) => [`${item.event_type}:${item.channel}`, item.enabled])), [preferences.rows]);
  const mutation = useMutation({
    mutationFn: ({ eventType, channel, enabled }) => httpRequest('PUT', '/api/v1/notifications/preferences/', { body: { preferences: [{ event_type: eventType, channel, enabled }] } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api'] });
      preferences.retry();
      toast.success('Notification preference saved.');
      setSavingKey('');
    },
    onError: (failure) => {
      toast.danger(userFacingError(failure, { fallback: 'The preference could not be saved.' }));
      setSavingKey('');
    },
  });
  const toggle = (eventType, channel) => {
    const key = `${eventType}:${channel}`;
    const current = preferenceMap.has(key) ? preferenceMap.get(key) : defaultNotificationValue(eventType, channel);
    setSavingKey(key);
    mutation.mutate({ eventType, channel, enabled: !current });
  };
  return <WorkspaceState state={preferences}><section className="account-notifications"><header><div><span>Personal delivery</span><h2>Choose what reaches you</h2><p>Workspace and push notices default on. Finance email and urgent finance SMS have focused defaults. Your choices override those defaults.</p></div><div className="account-channel-legend">{CHANNELS.map(([, label]) => <span key={label}>{label}</span>)}</div></header><div className="account-notification-matrix" role="table" aria-label="Notification preferences">
    {NOTIFICATION_EVENTS.map(([eventType, label, group]) => <div className="account-notification-row" role="row" key={eventType}><div role="rowheader"><span>{group}</span><strong>{label}</strong></div>{CHANNELS.map(([channel, channelLabel]) => {
      const key = `${eventType}:${channel}`;
      const explicit = preferenceMap.has(key);
      const enabled = explicit ? preferenceMap.get(key) : defaultNotificationValue(eventType, channel);
      return <button type="button" role="switch" aria-checked={enabled} aria-label={`${label}: ${channelLabel}`} className={enabled ? 'is-on' : ''} disabled={readOnly || savingKey === key} title={readOnly ? 'View-only session' : explicit ? 'Your saved preference' : 'Organization default'} onClick={() => toggle(eventType, channel)} key={channel}><span className="account-channel-mobile">{channelLabel}</span><i /><small>{explicit ? 'Custom' : 'Default'}</small></button>;
    })}</div>)}
  </div></section></WorkspaceState>;
}

function SecuritySection({ readOnly = false }) {
  const { changePassword } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState(null);
  const toast = useToast();
  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    const issueField = key === 'confirm' ? 'confirmation' : key;
    if (issue?.field === issueField || issue?.field === 'form') setIssue(null);
  };
  const submit = async (event) => {
    event.preventDefault();
    const policyIssue = validatePasswordChange({
      currentPassword: form.current,
      newPassword: form.next,
      confirmation: form.confirm,
    });
    if (policyIssue) {
      setIssue(policyIssue);
      toast.warning(policyIssue.message, { title: 'Check the highlighted field' });
      return;
    }
    setBusy(true); setIssue(null);
    try {
      await changePassword({ oldPassword: form.current, newPassword: form.next });
      setForm({ current: '', next: '', confirm: '' });
      toast.success('Password changed. Other signed-in sessions have ended.');
    } catch (failure) {
      const nextIssue = passwordChangeFailure(failure);
      setIssue(nextIssue);
      toast.danger(nextIssue.message, { title: 'Password not changed' });
    } finally { setBusy(false); }
  };
  if (readOnly) return <div className="fw-safety-block">Password changes are unavailable in a view-only session. Sign in directly to manage account security.</div>;
  return <div className="account-security-grid"><form className="account-security-card" onSubmit={submit} noValidate><header><span>{cloneElement(Icons.shield, { size: 18 })}</span><div><strong>Change password</strong><p>Changing your password ends other sessions and keeps this browser signed in with a renewed credential.</p></div></header>{issue && <div className="fw-form-error" role="alert">{issue.message}</div>}<label>Current password<input id="account-current-password" type="password" autoComplete="current-password" maxLength={PASSWORD_MAX_LENGTH} required aria-invalid={issue?.field === 'current'} value={form.current} onChange={(event) => update('current', event.target.value)} /></label><label>New password<input id="account-new-password" type="password" autoComplete="new-password" minLength="10" maxLength={PASSWORD_MAX_LENGTH} required aria-invalid={issue?.field === 'new'} value={form.next} onChange={(event) => update('next', event.target.value)} /></label><label>Confirm new password<input id="account-confirm-password" type="password" autoComplete="new-password" minLength="10" maxLength={PASSWORD_MAX_LENGTH} required aria-invalid={issue?.field === 'confirmation'} value={form.confirm} onChange={(event) => update('confirm', event.target.value)} /></label><ActionButton type="submit" tone="primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</ActionButton></form><section className="account-security-card is-guidance"><header><span>{cloneElement(Icons.check, { size: 18 })}</span><div><strong>Password guidance</strong><p>Use a unique phrase with at least 10 characters. Avoid names, common phrases, and passwords reused elsewhere.</p></div></header><ul><li>Other sessions are automatically ended after a change.</li><li>Your password is never displayed in this workspace.</li><li>Account recovery uses your verified contact channel.</li></ul></section></div>;
}

function SessionsSection({ readOnly = false }) {
  const sessions = useWorkspaceData('/api/v1/users/sessions/', { page_size: 100 });
  const { logout } = useAuth();
  const [pendingRevocation, setPendingRevocation] = useState(null);
  const toast = useToast();
  const revoke = useMutation({
    mutationFn: (sessionId) => httpRequest('DELETE', `/api/v1/users/sessions/${sessionId}/`),
    onSuccess: (_data, sessionId) => {
      setPendingRevocation(null);
      const endedCurrentSession = sessions.rows.some(
        (row) => String(row.id) === String(sessionId) && row.current_session,
      );
      if (endedCurrentSession) {
        void logout();
        return;
      }
      sessions.retry();
      toast.success('The sign-in has been ended.');
    },
    onError: (failure) => {
      setPendingRevocation(null);
      toast.danger(userFacingError(failure, { fallback: 'The other sign-in could not be ended.' }));
    },
  });
  const description = readOnly
    ? 'Review coarse device and browser labels from the authenticated session register. Sign in directly to end another session.'
    : 'Review coarse device and browser labels from the authenticated session register. End an unfamiliar sign-in without exposing its credential.';
  const endSession = (row) => {
    if (row.current_session) {
      void logout();
      return;
    }
    revoke.mutate(row.id);
  };
  return <WorkspaceState state={sessions} empty={!sessions.rows.length} emptyTitle="No active sign-ins" emptyBody="Active browser and mobile sessions appear here without exposing credentials, network addresses, or full device fingerprints."><DetailSection eyebrow="Session security" title="Active sign-ins" description={description}><WorkspaceTable label="Active sign-ins" rows={sessions.rows} rowClassName={(row) => row.current_session ? 'is-current-session' : ''} columns={[
    { key: 'device', label: 'Device' },
    { key: 'browser', label: 'Browser' },
    { key: 'platform', label: 'Platform', render: (row) => <StatusPill value={row.platform} /> },
    { key: 'last_activity_at', label: 'Last activity', render: (row) => formatOrganizationDate(row.last_activity_at) },
    { key: 'idle_expires_at', label: 'Idle expiry', render: (row) => formatOrganizationDate(row.idle_expires_at) },
    { key: 'policy', label: 'Policy', render: (row) => row.current_session
      ? <StatusPill value={row.read_only || readOnly ? 'Current · view only' : 'Current session'} tone={row.read_only || readOnly ? 'warn' : 'success'} />
      : row.read_only ? <StatusPill value="View only" tone="warn" /> : 'Standard' },
    { key: 'revoke', label: 'Actions', render: (row) => readOnly
        ? 'View only'
        : String(pendingRevocation) === String(row.id)
          ? <span className="fw-row-actions"><ActionButton icon={Icons.x} tone="ghost" title="Keep sign-in" aria-label="Keep sign-in" disabled={revoke.isPending} onClick={() => setPendingRevocation(null)}><span className="fw-sr">Cancel</span></ActionButton><ActionButton icon={Icons.logout} tone="danger" title="Confirm end sign-in" aria-label="Confirm end sign-in" disabled={revoke.isPending} onClick={() => endSession(row)}><span className="fw-sr">{revoke.isPending ? 'Ending sign-in' : 'Confirm end sign-in'}</span></ActionButton></span>
          : <ActionButton icon={Icons.logout} tone="ghost" title={row.current_session ? 'Sign out this device' : 'End sign-in'} disabled={revoke.isPending} onClick={() => setPendingRevocation(row.id)} aria-label={row.current_session ? 'Sign out this current device' : `End ${row.device || 'other'} sign-in`}><span className="fw-sr">{row.current_session ? 'Sign out this device' : 'End sign-in'}</span></ActionButton> },
  ]} /></DetailSection></WorkspaceState>;
}

function DevicesSection({ readOnly = false }) {
  const devices = useWorkspaceData('/api/v1/users/devices/', { page_size: 100 });
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const toast = useToast();
  const revoke = useMutation({
    mutationFn: (deviceId) => httpRequest('DELETE', `/api/v1/users/devices/${deviceId}/`),
    onSuccess: () => { setPendingRemoval(null); devices.retry(); toast.success('The recognized device has been removed.'); },
    onError: (failure) => { setPendingRemoval(null); toast.danger(userFacingError(failure, { fallback: 'The device could not be removed.' })); },
  });
  return <><SessionsSection readOnly={readOnly} /><WorkspaceState state={devices} empty={!devices.rows.length} emptyTitle="No recognized devices" emptyBody="Devices appear here after they register for secure notices."><DetailSection eyebrow="Security" title="Recognized devices" description="Remove a device you no longer use or recognize. This list does not expose any private delivery credential."><WorkspaceTable label="Recognized devices" rows={devices.rows} columns={[
    { key: 'platform', label: 'Platform', render: (row) => <StatusPill value={row.platform} /> }, { key: 'device_id', label: 'Device identifier' }, { key: 'user_agent', label: 'Browser' },
    { key: 'last_seen_at', label: 'Last seen', render: (row) => formatOrganizationDate(row.last_seen_at) }, { key: 'created_at', label: 'First recognized', render: (row) => formatOrganizationDate(row.created_at) },
    { key: 'remove', label: 'Actions', render: (row) => readOnly ? 'View only' : String(pendingRemoval) === String(row.id)
      ? <span className="fw-row-actions"><ActionButton icon={Icons.x} tone="ghost" title="Keep device" aria-label="Keep device" disabled={revoke.isPending} onClick={() => setPendingRemoval(null)}><span className="fw-sr">Cancel</span></ActionButton><ActionButton icon={Icons.logout} tone="danger" title="Confirm remove device" aria-label="Confirm remove device" disabled={revoke.isPending} onClick={() => revoke.mutate(row.id)}><span className="fw-sr">{revoke.isPending ? 'Removing device' : 'Confirm remove device'}</span></ActionButton></span>
      : <ActionButton icon={Icons.logout} tone="ghost" title="Remove device" disabled={revoke.isPending} onClick={() => setPendingRemoval(row.id)} aria-label={`Remove ${row.platform || 'recognized'} device`}><span className="fw-sr">Remove device</span></ActionButton> },
  ]} /></DetailSection></WorkspaceState></>;
}

function AccessSection({ profile }) {
  const memberships = profile.data?.role_memberships || [];
  const workspaceName = String(profile.data?.organization_name || profile.data?.tenant_slug || 'Organization')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return <WorkspaceState state={profile} empty={!profile.data}>{profile.data && <><DetailSection eyebrow="Effective responsibility" title="Leadership memberships" description="This is the scope attached to your signed-in identity. Individual actions are still checked against their exact responsibility."><WorkspaceTable label="Leadership memberships" rows={memberships} rowKey="id" columns={[
    { key: 'account_type_name', label: 'Responsibility' }, { key: 'branch_name', label: 'Branch', render: (row) => row.branch_name || (row.branch ? `Branch ${row.branch}` : 'Organization-wide') }, { key: 'department_name', label: 'Department', render: (row) => row.department_name || (row.department ? `Department ${row.department}` : 'All departments') }, { key: 'account_kind', label: 'Account kind' },
  ]} /></DetailSection><DetailSection eyebrow="Identity" title="Account status"><DetailGrid columns={3} fields={[{ label: 'Username', value: profile.data.username }, { label: 'Account active', value: <StatusPill value={profile.data.is_active ? 'active' : 'inactive'} /> }, { label: 'Workspace', value: workspaceName }, { label: 'Account type', value: memberships[0]?.account_type_name || 'Leadership' }, { label: 'Last sign-in', value: formatOrganizationDate(profile.data.last_login_at) }, { label: 'Memberships', value: memberships.length }]} /></DetailSection></>}</WorkspaceState>;
}

function WorkspaceSection({ onNav }) {
  return <section className="account-workspace-link"><span>{cloneElement(Icons.settings, { size: 24 })}</span><div><small>Personal workspace</small><h2>Appearance, language, and information density</h2><p>Choose your navigation layout, theme, color, language, and the amount of information shown on screen.</p><LinkButton to="settings" onNav={onNav} tone="primary">Open workspace preferences</LinkButton></div></section>;
}

export function AccountPage({ route = 'account/profile', onNav, user }) {
  const profile = useWorkspaceData('/api/v1/users/me/');
  const readOnly = user?.read_only_session === true || profile.data?.read_only_session === true;
  const section = workspaceRoute(route).segments[1] || 'profile';
  const active = SECTIONS.some((item) => item.id === section) ? section : 'profile';
  const current = SECTIONS.find((item) => item.id === active);
  const navigation = <SectionNav label="My account" items={SECTIONS} active={active} basePath="account" onNav={onNav} />;
  return <WorkspaceLayout navigation={navigation}><div className="fw-page account-workspace">{active !== 'profile' && <WorkspaceHeader eyebrow="My account" title={current.label} description={current.description} />}{active === 'profile' && <ProfileSection profile={profile} onNav={onNav} readOnly={readOnly} />}{active === 'notifications' && <NotificationSection readOnly={readOnly} />}{active === 'security' && <SecuritySection readOnly={readOnly} />}{active === 'devices' && <DevicesSection readOnly={readOnly} />}{active === 'access' && <AccessSection profile={profile} />}{active === 'workspace' && <WorkspaceSection onNav={onNav} />}</div></WorkspaceLayout>;
}
