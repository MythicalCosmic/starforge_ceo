import { cloneElement, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { httpRequest } from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import { Icons } from '../components/Icons.jsx';
import {
  ActionButton,
  SectionNav,
  StatusPill,
  WorkspaceHeader,
  WorkspaceLayout,
  WorkspaceState,
} from '../components/WorkspacePrimitives.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useWorkspaceData, workspaceRoute } from '../hooks/useWorkspaceData.js';
import { useWorkspaceTitle } from '../hooks/useWorkspaceTitle.js';
import { canUseCapability } from '../lib/permissions.js';
import { userFacingError } from '../lib/userFacingError.js';
import { SchedulePage as LegacySchedulePage } from './backendPages.jsx';
import { buildMeetingPeople, combineDirectoryPages, resolveMeetingAudience } from './scheduleAudience.js';
import '../styles/focused-v3.css';
import '../styles/schedule-workspace.css';

const SECTIONS = Object.freeze([
  { id: 'meetings', label: 'Meetings', description: 'Plan and invite colleagues', icon: Icons.cohort },
  { id: 'absenceRequests', label: 'Absence requests', description: 'Review staff reasons', icon: Icons.flag },
  { id: 'lessons', label: 'Lessons', description: 'Scheduled learning', icon: Icons.cal },
  { id: 'rules', label: 'Recurrence rules', description: 'Repeating lessons', icon: Icons.settings },
  { id: 'terms', label: 'Terms', description: 'Academic periods', icon: Icons.folder },
  { id: 'timeslots', label: 'Time slots', description: 'Daily timing', icon: Icons.cal },
  { id: 'lessonTypes', label: 'Lesson types', description: 'Schedule categories', icon: Icons.doc },
]);

const MEETING_AUDIENCE_MODES = Object.freeze([
  { id: 'people', label: 'People', note: 'Choose exact colleagues', icon: Icons.user },
  { id: 'departments', label: 'Departments', note: 'Invite department teams', icon: Icons.folder },
  { id: 'branches', label: 'Branches', note: 'Invite whole branches', icon: Icons.globe },
  { id: 'organization', label: 'Everyone', note: 'All visible colleagues', icon: Icons.brand },
]);

function dateTime(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return 'Time not recorded';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed);
}

function dateKey(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date not recorded';
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(parsed);
}

function timeOnly(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(parsed);
}

function dateOnly(value) {
  if (!value) return 'Date not provided';
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function localDateTimeInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function attendeeSummary(meeting) {
  const attendees = Array.isArray(meeting.attendees) ? meeting.attendees : [];
  const accepted = attendees.filter((item) => item.response === 'accepted').length;
  return `${accepted} accepted · ${meeting.attendee_count ?? attendees.length} invited`;
}

function MeetingModal({ open, onClose, branches, departments, people, audienceComplete, audienceLoading, audienceError, onCreated }) {
  const toast = useToast();
  const emptyForm = { title: '', agenda: '', location: '', startsAt: '', endsAt: '', branch: '', audienceMode: 'people', targets: [], search: '' };
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose?.(); };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, open]);
  const branchPeople = useMemo(
    () => form.branch ? people.filter((person) => person.branchIds.includes(String(form.branch))) : people,
    [form.branch, people],
  );
  const resolvedPeople = useMemo(
    () => resolveMeetingAudience({ mode: form.audienceMode, targets: form.targets, people, branch: form.branch }),
    [form.audienceMode, form.branch, form.targets, people],
  );
  const options = useMemo(() => {
    if (form.audienceMode === 'people') return branchPeople.map((person) => ({
      id: person.key,
      name: person.name,
      detail: [person.role, ...person.departmentNames, ...person.branchNames].filter(Boolean).join(' · '),
      initials: person.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(),
    }));
    if (form.audienceMode === 'departments') return departments.map((department) => {
      const count = branchPeople.filter((person) => person.departmentIds.includes(String(department.id))).length;
      return { id: String(department.id), name: department.name, detail: `${count} colleague${count === 1 ? '' : 's'}`, count };
    }).filter((item) => item.count > 0);
    if (form.audienceMode === 'branches') return branches.map((branch) => {
      const count = branchPeople.filter((person) => person.branchIds.includes(String(branch.id))).length;
      return { id: String(branch.id), name: branch.name, detail: `${count} colleague${count === 1 ? '' : 's'}`, count };
    }).filter((item) => item.count > 0);
    return [];
  }, [branchPeople, branches, departments, form.audienceMode]);
  const search = form.search.trim().toLowerCase();
  const visibleOptions = options.filter((option) => `${option.name} ${option.detail}`.toLowerCase().includes(search));
  const bulkMode = form.audienceMode !== 'people';
  const audienceTooLarge = resolvedPeople.length > 200;
  const save = useMutation({
    mutationFn: () => {
      const startsAt = new Date(form.startsAt);
      const endsAt = new Date(form.endsAt);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        throw new Error('Choose an end time after the meeting starts.');
      }
      return httpRequest('POST', '/api/v1/meetings/', { body: {
        title: form.title.trim(),
        agenda: form.agenda.trim(),
        location: form.location.trim(),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        branch: form.branch ? Number(form.branch) : null,
        invitees: resolvedPeople.map(({ kind, id }) => ({ kind, id })),
      } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success('Meeting scheduled and invitations sent.');
      setForm(emptyForm);
      setError('');
      onCreated?.();
      onClose?.();
    },
    onError: (failure) => setError(userFacingError(failure, { fallback: failure?.message || 'The meeting could not be scheduled.' })),
  });
  if (!open) return null;
  const toggle = (value) => setForm((current) => ({
    ...current,
    targets: current.targets.includes(value)
      ? current.targets.filter((item) => item !== value)
      : [...current.targets, value],
  }));
  const setMode = (audienceMode) => {
    if (audienceMode !== 'people' && !audienceComplete) return;
    setError('');
    setForm((current) => ({ ...current, audienceMode, targets: [], search: '' }));
  };
  const setStart = (value) => {
    const start = new Date(value);
    const suggestedEnd = Number.isNaN(start.getTime()) ? '' : localDateTimeInputValue(new Date(start.getTime() + 60 * 60 * 1000));
    setForm((current) => ({ ...current, startsAt: value, endsAt: current.endsAt || suggestedEnd }));
  };
  const valid = form.title.trim() && form.startsAt && form.endsAt && resolvedPeople.length > 0 && !audienceTooLarge && (!bulkMode || audienceComplete);
  return createPortal(<div className="schedule-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
    <section className="schedule-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-modal-title">
      <header><div><span>Team coordination</span><h2 id="schedule-modal-title">Schedule meeting</h2><p>Set the time, then choose people, departments, branches, or the full organization.</p></div><button type="button" onClick={onClose} aria-label="Close">{cloneElement(Icons.x, { size: 18 })}</button></header>
      <form onSubmit={(event) => { event.preventDefault(); if (valid) save.mutate(); }}>
        <div className="schedule-form-grid">
          <label className="is-wide"><span>Meeting title</span><input autoFocus required maxLength="200" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="For example, August enrollment review" /></label>
          <label><span>Starts</span><input required type="datetime-local" value={form.startsAt} onChange={(event) => setStart(event.target.value)} /></label>
          <label><span>Ends</span><input required type="datetime-local" min={form.startsAt} value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label>
          <label><span>Meeting scope</span><select value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value, targets: [], search: '' })}><option value="">Entire organization</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>
          <label><span>Location or link</span><input maxLength="200" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Meeting room or video link" /></label>
          <label className="is-wide"><span>Agenda</span><textarea rows="4" maxLength="20000" value={form.agenda} onChange={(event) => setForm({ ...form, agenda: event.target.value })} placeholder="What needs to be discussed or decided?" /></label>
        </div>
        <section className="schedule-invitees">
          <header><div><span>Audience</span><strong>Who should attend?</strong></div><b>{resolvedPeople.length} invitee{resolvedPeople.length === 1 ? '' : 's'}</b></header>
          <div className="schedule-audience-modes">{MEETING_AUDIENCE_MODES.map((mode) => {
            const disabled = mode.id !== 'people' && !audienceComplete;
            return <button type="button" key={mode.id} className={form.audienceMode === mode.id ? 'is-selected' : ''} aria-pressed={form.audienceMode === mode.id} disabled={disabled} onClick={() => setMode(mode.id)}>{cloneElement(mode.icon, { size: 17 })}<span><strong>{mode.id === 'organization' && form.branch ? 'Entire branch' : mode.label}</strong><small>{mode.note}</small></span>{form.audienceMode === mode.id && cloneElement(Icons.check, { size: 14 })}</button>;
          })}</div>
          {form.audienceMode === 'organization' ? <div className="schedule-audience-summary"><span>{cloneElement(Icons.brand, { size: 20 })}</span><div><strong>{form.branch ? 'Invite everyone in this branch' : 'Invite the entire visible organization'}</strong><p>{resolvedPeople.length ? `${resolvedPeople.length} active colleagues will receive an invitation.` : 'No eligible colleagues are available in this scope.'}</p></div></div> : <>
            <label>{cloneElement(Icons.search, { size: 14 })}<input value={form.search} onChange={(event) => setForm({ ...form, search: event.target.value })} placeholder={`Search ${form.audienceMode === 'people' ? 'staff and teachers' : form.audienceMode}`} /></label>
            <div className="schedule-audience-options">{visibleOptions.map((option) => <button type="button" className={form.targets.includes(option.id) ? 'is-selected' : ''} aria-pressed={form.targets.includes(option.id)} onClick={() => toggle(option.id)} key={option.id}><span>{option.initials || cloneElement(form.audienceMode === 'departments' ? Icons.folder : Icons.globe, { size: 15 })}</span><div><strong>{option.name}</strong><small>{option.detail}</small></div>{form.targets.includes(option.id) ? cloneElement(Icons.check, { size: 15 }) : cloneElement(Icons.plus, { size: 15 })}</button>)}</div>
            {!audienceLoading && !visibleOptions.length && <p className="schedule-audience-empty">{search ? 'No audience options match this search.' : 'No eligible colleagues are available in this scope.'}</p>}
          </>}
          {audienceLoading && <p className="schedule-audience-note">Loading the complete staff and teacher directory…</p>}
          {!audienceLoading && !audienceComplete && <p className="schedule-audience-note is-warn">The full directory is not available for bulk selection. You can still choose individual people safely.</p>}
          {audienceError && <p className="schedule-audience-note is-warn">{audienceError}</p>}
          {audienceTooLarge && <p className="schedule-audience-note is-warn">This audience contains {resolvedPeople.length} people. Narrow it to 200 or fewer before scheduling.</p>}
        </section>
        {error && <p className="schedule-error" role="alert">{error}</p>}
        <footer><small>{resolvedPeople.length ? `${resolvedPeople.length} invitation${resolvedPeople.length === 1 ? '' : 's'} will appear immediately.` : 'Choose at least one attendee.'}</small><div><ActionButton onClick={onClose}>Cancel</ActionButton><ActionButton type="submit" tone="primary" icon={Icons.cal} disabled={!valid || save.isPending}>{save.isPending ? 'Scheduling…' : 'Schedule meeting'}</ActionButton></div></footer>
      </form>
    </section>
  </div>, document.body);
}

function AbsenceDecisionModal({ request, action, onClose, onSaved }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);
  const mutation = useMutation({
    mutationFn: () => httpRequest('POST', `/api/v1/approvals/requests/${encodeURIComponent(request.id)}/${action}/`, { body: { note: note.trim() } }),
    onSuccess: () => {
      toast.success(action === 'approve' ? 'Absence request approved.' : 'Absence request declined.');
      onSaved?.();
      onClose?.();
    },
    onError: (failure) => setError(userFacingError(failure, { fallback: 'The decision could not be saved.' })),
  });
  const rejecting = action === 'reject';
  return createPortal(<div className="schedule-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}><section className="absence-decision-modal" role="dialog" aria-modal="true" aria-labelledby="absence-decision-title"><header><div><span>Absence review</span><h2 id="absence-decision-title">{rejecting ? 'Decline this request' : 'Approve this request'}</h2><p>{request.title}</p></div><button type="button" onClick={onClose} aria-label="Close">{cloneElement(Icons.x, { size: 18 })}</button></header><form onSubmit={(event) => { event.preventDefault(); if (!rejecting || note.trim()) mutation.mutate(); }}><label><span>{rejecting ? 'Reason for declining' : 'Decision note (optional)'}</span><textarea autoFocus rows="4" maxLength="255" required={rejecting} value={note} onChange={(event) => setNote(event.target.value)} placeholder={rejecting ? 'Explain why this absence cannot be approved…' : 'Add conditions or follow-up for the staff member…'} /></label>{error && <p className="schedule-error" role="alert">{error}</p>}<footer><ActionButton onClick={onClose}>Cancel</ActionButton><ActionButton type="submit" tone={rejecting ? 'danger' : 'primary'} icon={rejecting ? Icons.x : Icons.check} disabled={mutation.isPending || (rejecting && !note.trim())}>{mutation.isPending ? 'Saving…' : rejecting ? 'Decline request' : 'Approve request'}</ActionButton></footer></form></section></div>, document.body);
}

function AbsenceRequestsWorkspace({ user, onNav }) {
  useWorkspaceTitle('Schedule', 'Absence requests');
  const canApprove = canUseCapability(user, 'approvals:approve');
  const requests = useWorkspaceData('/api/v1/approvals/requests/', { page_size: 100, kind: 'leave_request', ordering: '-created_at' }, { refreshMs: 20_000 });
  const contacts = useWorkspaceData('/api/v1/messaging/contacts/', { page_size: 100, category: 'staff' }, { enabled: canUseCapability(user, 'messaging:read'), staleTime: 60_000 });
  const requesterNames = useMemo(() => new Map(contacts.rows.map((contact) => [String(contact.user_id), contact.display_name])), [contacts.rows]);
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [decision, setDecision] = useState(null);
  const rows = useMemo(() => requests.rows.filter((request) => {
    if (status !== 'all' && request.status !== status) return false;
    const reason = request.payload?.reason || request.description || '';
    return `${request.title} ${reason} ${request.requested_by} ${requesterNames.get(String(request.requested_by)) || ''}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [requesterNames, requests.rows, search, status]);
  const pending = requests.rows.filter((request) => request.status === 'pending').length;
  const approved = requests.rows.filter((request) => request.status === 'approved').length;
  const declined = requests.rows.filter((request) => request.status === 'rejected').length;
  const navigation = <SectionNav label="Schedule" items={SECTIONS} active="absenceRequests" basePath="schedule" onNav={onNav} />;
  return <main className="fw-page schedule-page"><WorkspaceHeader eyebrow="Attendance accountability" title="Absence requests" description="Review when staff cannot attend, read the stated reason, and record a clear decision." actions={<ActionButton icon={Icons.settings} onClick={() => requests.retry()}>Refresh</ActionButton>} /><WorkspaceLayout navigation={navigation}>
    <section className="absence-summary"><article><small>Waiting for review</small><strong>{pending}</strong><p>Requests needing a decision</p></article><article><small>Approved</small><strong>{approved}</strong><p>Excused absences</p></article><article><small>Declined</small><strong>{declined}</strong><p>Requests not approved</p></article></section>
    <section className="schedule-controls"><label>{cloneElement(Icons.search, { size: 15 })}<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search request, reason, or staff ID" /></label><div>{['pending', 'approved', 'rejected', 'all'].map((item) => <button type="button" className={status === item ? 'is-active' : ''} onClick={() => setStatus(item)} key={item}>{item === 'all' ? 'All requests' : item[0].toUpperCase() + item.slice(1)}</button>)}</div></section>
    <WorkspaceState state={requests} empty={!rows.length} emptyTitle={search ? 'No absence requests match this search' : status === 'pending' ? 'No absence requests need review' : 'No requests in this status'} emptyBody="New staff absence requests and their reasons will appear here automatically."><section className="absence-list">{rows.map((request) => {
      const reason = request.payload?.reason || request.description || 'No reason was provided.';
      const startsOn = request.payload?.starts_on;
      const endsOn = request.payload?.ends_on;
      const requesterName = requesterNames.get(String(request.requested_by));
      return <article key={request.id}><header><span>{cloneElement(Icons.flag, { size: 17 })}</span><div><small>{requesterName || `Staff account #${request.requested_by || '—'}`}</small><h2>{request.title}</h2></div><StatusPill value={request.status} /></header><div className="absence-reason"><span>Reason</span><p>{reason}</p></div><dl><div><dt>From</dt><dd>{dateOnly(startsOn)}</dd></div><div><dt>Through</dt><dd>{dateOnly(endsOn || startsOn)}</dd></div><div><dt>Submitted</dt><dd>{dateTime(request.created_at)}</dd></div></dl>{request.decision_note && <p className="absence-decision-note"><strong>Decision note</strong>{request.decision_note}</p>}{request.status === 'pending' && canApprove && <footer><ActionButton tone="danger" icon={Icons.x} onClick={() => setDecision({ request, action: 'reject' })}>Decline</ActionButton><ActionButton tone="primary" icon={Icons.check} onClick={() => setDecision({ request, action: 'approve' })}>Approve absence</ActionButton></footer>}</article>;
    })}</section></WorkspaceState>
    {decision && <AbsenceDecisionModal {...decision} onClose={() => setDecision(null)} onSaved={requests.retry} />}
  </WorkspaceLayout></main>;
}

function MeetingCard({ meeting, canWrite, user, onCancel, onRespond, busy }) {
  const attendees = meeting.attendees || [];
  const selfAttendee = attendees.find((item) => String(item.principal?.kind) === String(user?.principal_kind) && String(item.principal?.id) === String(user?.id))
    || (attendees.length === 1 && !attendees[0].principal ? attendees[0] : null);
  const cancelled = meeting.status === 'cancelled';
  const endTime = timeOnly(meeting.ends_at);
  return <article className={`schedule-card${cancelled ? ' is-cancelled' : ''}`}>
    <time dateTime={meeting.starts_at}><span>{new Date(meeting.starts_at).toLocaleDateString(undefined, { month: 'short' })}</span><strong>{new Date(meeting.starts_at).getDate()}</strong></time>
    <div><header><StatusPill value={meeting.status || 'scheduled'} /><small>{meeting.branch_name || 'Entire organization'}</small></header><h3>{meeting.title}</h3><p>{meeting.agenda || 'No agenda was added.'}</p><dl><div>{cloneElement(Icons.cal, { size: 14 })}<span>{dateTime(meeting.starts_at)}{endTime ? ` – ${endTime}` : ''}</span></div><div>{cloneElement(Icons.globe, { size: 14 })}<span>{meeting.location || 'Location not set'}</span></div><div>{cloneElement(Icons.cohort, { size: 14 })}<span>{attendeeSummary(meeting)}</span></div></dl></div>
    {!cancelled && <footer>{selfAttendee && selfAttendee.response === 'invited' ? <><button type="button" disabled={busy} onClick={() => onRespond(meeting.id, 'accepted')}>Accept</button><button type="button" disabled={busy} onClick={() => onRespond(meeting.id, 'declined')}>Decline</button></> : null}{canWrite ? <button type="button" className="is-danger" disabled={busy} onClick={() => onCancel(meeting)}>Cancel meeting</button> : null}</footer>}
  </article>;
}

export function ScheduleWorkspacePage({ user, route = 'schedule', onNav }) {
  const { segments } = workspaceRoute(route);
  const requested = segments[1] || 'meetings';
  if (requested === 'absenceRequests') return <AbsenceRequestsWorkspace user={user} onNav={onNav} />;
  if (!['meetings', 'upcomingMeetings'].includes(requested)) return <LegacySchedulePage user={user} route={route} onNav={onNav} />;
  return <MeetingsWorkspace user={user} route={route} onNav={onNav} upcomingOnly={requested === 'upcomingMeetings'} />;
}

function MeetingsWorkspace({ user, onNav, upcomingOnly }) {
  useWorkspaceTitle('Schedule', 'Meetings');
  const toast = useToast();
  const canWrite = canUseCapability(user, 'meeting:write');
  const [composerOpen, setComposerOpen] = useState(false);
  const meetings = useWorkspaceData(upcomingOnly ? '/api/v1/meetings/upcoming/' : '/api/v1/meetings/', upcomingOnly ? undefined : { page_size: 100, ordering: 'starts_at' }, { refreshMs: 20_000 });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100 }, { enabled: canWrite && canUseCapability(user, 'org:read') });
  const departments = useWorkspaceData('/api/v1/org/departments/', { page_size: 100 }, { enabled: composerOpen && canWrite && canUseCapability(user, 'org:read') });
  const canReadContacts = canWrite && canUseCapability(user, 'messaging:read');
  const canReadDirectory = canWrite && canUseCapability(user, 'users:read');
  const contactsOne = useWorkspaceData('/api/v1/messaging/contacts/', { page_size: 100, page: 1, category: 'staff' }, { enabled: composerOpen && canReadContacts });
  const contactsTwo = useWorkspaceData('/api/v1/messaging/contacts/', { page_size: 100, page: 2, category: 'staff' }, { enabled: composerOpen && canReadContacts && contactsOne.totalKnown && contactsOne.total > 100 });
  const staffOne = useWorkspaceData('/api/v1/org/staff/', { page_size: 100, page: 1 }, { enabled: composerOpen && canReadDirectory });
  const staffTwo = useWorkspaceData('/api/v1/org/staff/', { page_size: 100, page: 2 }, { enabled: composerOpen && canReadDirectory && staffOne.totalKnown && staffOne.total > 100 });
  const teachersOne = useWorkspaceData('/api/v1/teachers/', { page_size: 100, page: 1 }, { enabled: composerOpen && canReadDirectory });
  const teachersTwo = useWorkspaceData('/api/v1/teachers/', { page_size: 100, page: 2 }, { enabled: composerOpen && canReadDirectory && teachersOne.totalKnown && teachersOne.total > 100 });
  const contacts = useMemo(() => combineDirectoryPages(contactsOne.rows, contactsTwo.rows), [contactsOne.rows, contactsTwo.rows]);
  const staff = useMemo(() => combineDirectoryPages(staffOne.rows, staffTwo.rows), [staffOne.rows, staffTwo.rows]);
  const teachers = useMemo(() => combineDirectoryPages(teachersOne.rows, teachersTwo.rows), [teachersOne.rows, teachersTwo.rows]);
  const meetingPeople = useMemo(() => buildMeetingPeople(contacts, staff, teachers), [contacts, staff, teachers]);
  const contactsComplete = contactsOne.totalKnown ? contacts.length >= contactsOne.total : contactsOne.complete;
  const scopeComplete = meetingPeople.every((person) => person.known);
  const audienceComplete = Boolean(contactsComplete && scopeComplete && canReadDirectory);
  const audienceLoading = [contactsOne, contactsTwo, staffOne, staffTwo, teachersOne, teachersTwo, departments].some((state) => state.enabled && state.loading);
  const audienceFailure = [contactsOne, contactsTwo, staffOne, staffTwo, teachersOne, teachersTwo, departments].find((state) => state.enabled && state.error)?.error;
  const [filter, setFilter] = useState(upcomingOnly ? 'upcoming' : 'all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null);
  const now = Date.now();
  const rows = useMemo(() => meetings.rows.filter((meeting) => {
    const starts = new Date(meeting.starts_at).getTime();
    if (filter === 'upcoming' && (starts < now || meeting.status === 'cancelled')) return false;
    if (filter === 'past' && starts >= now) return false;
    if (filter === 'cancelled' && meeting.status !== 'cancelled') return false;
    if (filter !== 'cancelled' && meeting.status === 'cancelled' && filter !== 'all') return false;
    return `${meeting.title} ${meeting.agenda} ${meeting.location} ${meeting.branch_name}`.toLowerCase().includes(search.trim().toLowerCase());
  }).sort((left, right) => new Date(left.starts_at) - new Date(right.starts_at)), [filter, meetings.rows, now, search]);
  const grouped = useMemo(() => rows.reduce((result, meeting) => {
    const key = dateKey(meeting.starts_at);
    if (!result[key]) result[key] = [];
    result[key].push(meeting);
    return result;
  }, {}), [rows]);
  const cancel = async (meeting) => {
    if (!window.confirm(`Cancel “${meeting.title}”? Invitees will see that it was cancelled.`)) return;
    setBusy(meeting.id);
    try { await httpRequest('POST', `/api/v1/meetings/${meeting.id}/cancel/`, { body: {} }); await meetings.retry(); toast.success('Meeting cancelled.'); }
    catch (failure) { toast.danger(userFacingError(failure, { fallback: 'The meeting could not be cancelled.' })); }
    finally { setBusy(null); }
  };
  const respond = async (id, response) => {
    setBusy(id);
    try { await httpRequest('POST', `/api/v1/meetings/${id}/respond/`, { body: { response } }); await meetings.retry(); toast.success(response === 'accepted' ? 'Meeting accepted.' : 'Meeting declined.'); }
    catch (failure) { toast.danger(userFacingError(failure)); }
    finally { setBusy(null); }
  };
  const upcoming = meetings.rows.filter((meeting) => meeting.status !== 'cancelled' && new Date(meeting.starts_at).getTime() >= now).length;
  const today = meetings.rows.filter((meeting) => new Date(meeting.starts_at).toDateString() === new Date().toDateString()).length;
  const invited = meetings.rows.reduce((count, meeting) => count + (meeting.attendees || []).filter((item) => item.response === 'invited').length, 0);
  const navigation = <SectionNav label="Schedule" items={SECTIONS} active="meetings" basePath="schedule" onNav={onNav} />;
  return <main className="fw-page schedule-page"><WorkspaceHeader eyebrow="Time and coordination" title="Schedule" description="Plan staff meetings, invite the right colleagues, and keep academic timing in one clear workspace." actions={<><ActionButton icon={Icons.settings} onClick={() => meetings.retry()}>Refresh</ActionButton>{canWrite && <ActionButton tone="primary" icon={Icons.plus} onClick={() => setComposerOpen(true)}>Schedule meeting</ActionButton>}</>} /><WorkspaceLayout navigation={navigation}>
    <section className="schedule-summary"><article><span>{cloneElement(Icons.cal, { size: 18 })}</span><div><small>Upcoming</small><strong>{upcoming}</strong><p>Scheduled meetings ahead</p></div></article><article><span>{cloneElement(Icons.sun, { size: 18 })}</span><div><small>Today</small><strong>{today}</strong><p>Meetings on today’s calendar</p></div></article><article><span>{cloneElement(Icons.cohort, { size: 18 })}</span><div><small>Awaiting reply</small><strong>{invited}</strong><p>Open invitations across visible meetings</p></div></article></section>
    <section className="schedule-controls"><label>{cloneElement(Icons.search, { size: 15 })}<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, agenda, location, or branch" /></label><div>{['all', 'upcoming', 'past', 'cancelled'].map((item) => <button type="button" className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)} key={item}>{item === 'all' ? 'All meetings' : item[0].toUpperCase() + item.slice(1)}</button>)}</div></section>
    <WorkspaceState state={meetings} empty={!rows.length} emptyTitle={search ? 'No meetings match this search' : 'No meetings scheduled yet'} emptyBody={canWrite ? 'Schedule the first meeting and invite the colleagues who need to attend.' : 'New invitations and scheduled meetings will appear here.'}>{Object.entries(grouped).map(([date, dateMeetings]) => <section className="schedule-day" key={date}><header><span>{date}</span><b>{dateMeetings.length}</b></header><div>{dateMeetings.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} user={user} canWrite={canWrite} busy={String(busy) === String(meeting.id)} onCancel={cancel} onRespond={respond} />)}</div></section>)}</WorkspaceState>
    <MeetingModal open={composerOpen} onClose={() => setComposerOpen(false)} branches={branches.rows} departments={departments.rows} people={meetingPeople} audienceComplete={audienceComplete} audienceLoading={audienceLoading} audienceError={audienceFailure ? userFacingError(audienceFailure, { fallback: 'Part of the audience directory could not be loaded.' }) : ''} onCreated={meetings.retry} />
  </WorkspaceLayout></main>;
}
