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
import '../styles/focused-v3.css';
import '../styles/schedule-workspace.css';

const SECTIONS = Object.freeze([
  { id: 'meetings', label: 'Meetings', description: 'Plan and invite colleagues', icon: Icons.cohort },
  { id: 'lessons', label: 'Lessons', description: 'Scheduled learning', icon: Icons.cal },
  { id: 'rules', label: 'Recurrence rules', description: 'Repeating lessons', icon: Icons.settings },
  { id: 'terms', label: 'Terms', description: 'Academic periods', icon: Icons.folder },
  { id: 'timeslots', label: 'Time slots', description: 'Daily timing', icon: Icons.cal },
  { id: 'lessonTypes', label: 'Lesson types', description: 'Schedule categories', icon: Icons.doc },
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

function localDateTimeInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function attendeeSummary(meeting) {
  const attendees = Array.isArray(meeting.attendees) ? meeting.attendees : [];
  const accepted = attendees.filter((item) => item.response === 'accepted').length;
  return `${accepted} accepted · ${meeting.attendee_count ?? attendees.length} invited`;
}

function MeetingModal({ open, onClose, branches, contacts, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', agenda: '', location: '', startsAt: '', endsAt: '', branch: '', invitees: [], search: '' });
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
  const eligible = contacts.filter((contact) => ['staff', 'teacher'].includes(contact.principal_kind) && contact.profile_id);
  const visibleContacts = eligible.filter((contact) => `${contact.display_name} ${contact.role_label}`.toLowerCase().includes(form.search.trim().toLowerCase()));
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
        invitees: form.invitees.map((value) => {
          const [kind, id] = value.split(':');
          return { kind, id: Number(id) };
        }),
      } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success('Meeting scheduled and invitations sent.');
      setForm({ title: '', agenda: '', location: '', startsAt: '', endsAt: '', branch: '', invitees: [], search: '' });
      setError('');
      onCreated?.();
      onClose?.();
    },
    onError: (failure) => setError(userFacingError(failure, { fallback: failure?.message || 'The meeting could not be scheduled.' })),
  });
  if (!open) return null;
  const toggle = (value) => setForm((current) => ({ ...current, invitees: current.invitees.includes(value) ? current.invitees.filter((item) => item !== value) : [...current.invitees, value] }));
  const setStart = (value) => {
    const start = new Date(value);
    const suggestedEnd = Number.isNaN(start.getTime()) ? '' : localDateTimeInputValue(new Date(start.getTime() + 60 * 60 * 1000));
    setForm((current) => ({ ...current, startsAt: value, endsAt: current.endsAt || suggestedEnd }));
  };
  const valid = form.title.trim() && form.startsAt && form.endsAt && form.invitees.length;
  return createPortal(<div className="schedule-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
    <section className="schedule-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-modal-title">
      <header><div><span>Team coordination</span><h2 id="schedule-modal-title">Schedule meeting</h2><p>Set the time and invite the exact staff members who should attend.</p></div><button type="button" onClick={onClose} aria-label="Close">{cloneElement(Icons.x, { size: 18 })}</button></header>
      <form onSubmit={(event) => { event.preventDefault(); if (valid) save.mutate(); }}>
        <div className="schedule-form-grid">
          <label className="is-wide"><span>Meeting title</span><input autoFocus required maxLength="200" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="For example, August enrollment review" /></label>
          <label><span>Starts</span><input required type="datetime-local" value={form.startsAt} onChange={(event) => setStart(event.target.value)} /></label>
          <label><span>Ends</span><input required type="datetime-local" min={form.startsAt} value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label>
          <label><span>Branch</span><select value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })}><option value="">Entire organization</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>
          <label><span>Location or link</span><input maxLength="200" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Meeting room or video link" /></label>
          <label className="is-wide"><span>Agenda</span><textarea rows="4" maxLength="20000" value={form.agenda} onChange={(event) => setForm({ ...form, agenda: event.target.value })} placeholder="What needs to be discussed or decided?" /></label>
        </div>
        <section className="schedule-invitees"><header><div><span>Invitees</span><strong>Choose colleagues</strong></div><b>{form.invitees.length} selected</b></header><label>{cloneElement(Icons.search, { size: 14 })}<input value={form.search} onChange={(event) => setForm({ ...form, search: event.target.value })} placeholder="Search staff and teachers" /></label><div>{visibleContacts.map((contact) => {
          const key = `${contact.principal_kind}:${contact.profile_id}`;
          return <button type="button" className={form.invitees.includes(key) ? 'is-selected' : ''} onClick={() => toggle(key)} key={key}><span>{contact.display_name?.slice(0, 2).toUpperCase()}</span><div><strong>{contact.display_name}</strong><small>{contact.role_label || contact.principal_kind}</small></div>{form.invitees.includes(key) ? cloneElement(Icons.check, { size: 15 }) : cloneElement(Icons.plus, { size: 15 })}</button>;
        })}</div></section>
        {error && <p className="schedule-error" role="alert">{error}</p>}
        <footer><small>Invitations appear immediately in each person’s meeting list.</small><div><ActionButton onClick={onClose}>Cancel</ActionButton><ActionButton type="submit" tone="primary" icon={Icons.cal} disabled={!valid || save.isPending}>{save.isPending ? 'Scheduling…' : 'Schedule meeting'}</ActionButton></div></footer>
      </form>
    </section>
  </div>, document.body);
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
  if (!['meetings', 'upcomingMeetings'].includes(requested)) return <LegacySchedulePage user={user} route={route} onNav={onNav} />;
  return <MeetingsWorkspace user={user} route={route} onNav={onNav} upcomingOnly={requested === 'upcomingMeetings'} />;
}

function MeetingsWorkspace({ user, onNav, upcomingOnly }) {
  useWorkspaceTitle('Schedule', 'Meetings');
  const toast = useToast();
  const canWrite = canUseCapability(user, 'meeting:write');
  const meetings = useWorkspaceData(upcomingOnly ? '/api/v1/meetings/upcoming/' : '/api/v1/meetings/', upcomingOnly ? undefined : { page_size: 100, ordering: 'starts_at' }, { refreshMs: 20_000 });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100 }, { enabled: canWrite && canUseCapability(user, 'org:read') });
  const contacts = useWorkspaceData('/api/v1/messaging/contacts/', { page_size: 100, category: 'staff' }, { enabled: canWrite && canUseCapability(user, 'messaging:read') });
  const [composerOpen, setComposerOpen] = useState(false);
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
    <MeetingModal open={composerOpen} onClose={() => setComposerOpen(false)} branches={branches.rows} contacts={contacts.rows} onCreated={meetings.retry} />
  </WorkspaceLayout></main>;
}
