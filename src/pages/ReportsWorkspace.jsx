import { cloneElement, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Icons } from '../components/Icons.jsx';
import {
  ActionButton,
  CoverageBar,
  SectionNav,
  StatusPill,
  WorkspaceHeader,
  WorkspaceLayout,
  WorkspaceState,
  WorkspaceTable,
} from '../components/WorkspacePrimitives.jsx';
import { httpRequest } from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import { useToast } from '../context/ToastContext.jsx';
import { useWorkspaceData, workspaceRoute } from '../hooks/useWorkspaceData.js';
import { useWorkspaceTitle } from '../hooks/useWorkspaceTitle.js';
import {
  formatBusinessNumber,
  formatOrganizationDate,
  organizationDateInput,
} from '../lib/formatters.js';
import { canUseCapability } from '../lib/permissions.js';
import { userFacingError } from '../lib/userFacingError.js';
import '../styles/focused-v3.css';
import '../styles/reports-workspace.css';

const SECTIONS = Object.freeze([
  { id: 'library', label: 'Report library', description: 'Prepare a useful report', icon: Icons.folder },
  { id: 'runs', label: 'Prepared reports', description: 'Status and downloads', icon: Icons.doc },
  { id: 'schedules', label: 'Scheduled delivery', description: 'Recurring reports', icon: Icons.cal },
]);

const REPORT_ICONS = Object.freeze({
  enrollment: Icons.cohort,
  attendance: Icons.check,
  grades: Icons.trend,
  finance: Icons.flag,
  ai_usage: Icons.ai,
  storage_usage: Icons.folder,
});

const WEEKDAYS = Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);

function reportTitle(reports, key) {
  return reports.find((report) => report.key === key)?.title || String(key || 'Report').replaceAll('_', ' ');
}

function reportDescription(report) {
  const descriptions = {
    enrollment: 'A clear enrollment register by branch and learning group.',
    attendance: 'Attendance outcomes for a selected period and learning group.',
    grades: 'Published learning results by subject and academic term.',
    finance: 'Invoice, payment, and outstanding balance position for a period.',
    ai_usage: 'Monthly AI usage for organization planning and governance.',
    storage_usage: 'File storage volume and counts across learning libraries.',
  };
  return descriptions[report?.key] || report?.description || 'Prepare a current, shareable organization report.';
}

function initialDates() {
  const to = organizationDateInput();
  const start = new Date(`${to}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 30);
  return { from: start.toISOString().slice(0, 10), to };
}

function emptyComposer() {
  const dates = initialDates();
  return {
    reportKey: '',
    format: 'pdf',
    branch: '',
    cohort: '',
    term: '',
    subject: '',
    from: dates.from,
    to: dates.to,
    month: dates.to.slice(0, 7),
    includeUnpublished: false,
    recipientIds: [],
    delivery: 'once',
    cadence: 'weekly',
    weekday: '0',
    dayOfMonth: '1',
    hour: '7',
  };
}

function reportParams(form) {
  const params = {};
  if (['enrollment', 'attendance', 'grades', 'finance'].includes(form.reportKey) && form.branch) {
    params.branch_id = Number(form.branch);
  }
  if (['enrollment', 'attendance'].includes(form.reportKey) && form.cohort) {
    params.cohort_id = Number(form.cohort);
  }
  if (['attendance', 'finance'].includes(form.reportKey)) {
    if (form.from) params.date_from = form.from;
    if (form.to) params.date_to = form.to;
  }
  if (form.reportKey === 'grades') {
    if (form.term) params.term_id = Number(form.term);
    if (form.subject) params.subject_id = Number(form.subject);
    if (form.includeUnpublished) params.include_unpublished = true;
  }
  if (form.reportKey === 'ai_usage' && form.month) params.month = form.month;
  return params;
}

function RecipientPicker({ contacts, selected, onChange }) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const rows = contacts.filter((contact) => !normalized || [
    contact.display_name,
    contact.role_label,
    contact.username,
  ].some((value) => String(value || '').toLowerCase().includes(normalized)));
  const toggle = (id) => onChange(selected.includes(id)
    ? selected.filter((value) => value !== id)
    : [...selected, id]);
  return (
    <div className="reports-recipient-picker">
      <header>
        <div><strong>Share when ready</strong><small>The requester always receives a copy. Add authorized managers or colleagues here.</small></div>
        <span>{selected.length} selected</span>
      </header>
      <input aria-label="Find a report recipient" placeholder="Find a staff member…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="reports-recipient-list">
        {rows.length ? rows.map((contact) => {
          const id = Number(contact.user_id);
          return (
            <label key={id}>
              <input type="checkbox" checked={selected.includes(id)} onChange={() => toggle(id)} />
              <span><strong>{contact.display_name || contact.username || `Staff ${id}`}</strong><small>{contact.role_label || 'Staff member'}</small></span>
            </label>
          );
        }) : <p>No staff members match this search.</p>}
      </div>
    </div>
  );
}

function ScopeFields({ form, setForm, branches, cohorts, terms, subjects }) {
  const change = (key, value) => setForm((current) => ({
    ...current,
    [key]: value,
    ...(key === 'branch' ? { cohort: '' } : {}),
  }));
  const branchScope = ['enrollment', 'attendance', 'grades', 'finance'].includes(form.reportKey);
  const cohortScope = ['enrollment', 'attendance'].includes(form.reportKey);
  const dated = ['attendance', 'finance'].includes(form.reportKey);
  return (
    <div className="reports-scope-fields">
      {branchScope && <label><span>Branch</span><select value={form.branch} onChange={(event) => change('branch', event.target.value)}><option value="">Entire permitted scope</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>}
      {cohortScope && <label><span>Learning group</span><select value={form.cohort} onChange={(event) => change('cohort', event.target.value)}><option value="">All permitted groups</option>{cohorts.filter((cohort) => !form.branch || String(cohort.branch) === form.branch).map((cohort) => <option value={cohort.id} key={cohort.id}>{cohort.name}</option>)}</select></label>}
      {dated && <><label><span>From</span><input type="date" value={form.from} max={form.to || undefined} onChange={(event) => change('from', event.target.value)} /></label><label><span>To</span><input type="date" value={form.to} min={form.from || undefined} onChange={(event) => change('to', event.target.value)} /></label></>}
      {form.reportKey === 'grades' && <><label><span>Academic term</span><select value={form.term} onChange={(event) => change('term', event.target.value)}><option value="">All terms</option>{terms.map((term) => <option value={term.id} key={term.id}>{term.name}</option>)}</select></label><label><span>Subject</span><select value={form.subject} onChange={(event) => change('subject', event.target.value)}><option value="">All subjects</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label><label className="reports-check-field"><input type="checkbox" checked={form.includeUnpublished} onChange={(event) => change('includeUnpublished', event.target.checked)} /><span><strong>Include unpublished results</strong><small>Only available where your responsibility permits it.</small></span></label></>}
      {form.reportKey === 'ai_usage' && <label><span>Usage month</span><input type="month" value={form.month} max={organizationDateInput().slice(0, 7)} onChange={(event) => change('month', event.target.value)} /></label>}
      {form.reportKey === 'storage_usage' && <div className="reports-no-scope"><span>{cloneElement(Icons.shield, { size: 18 })}</span><p><strong>Organization storage position</strong><small>This report uses the complete permitted storage register and needs no extra filters.</small></p></div>}
    </div>
  );
}

function ReportStudio({ reports, selectedKey, branches, cohorts, terms, subjects, contacts, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ ...emptyComposer(), reportKey: selectedKey || reports[0]?.key || '' }));
  const [formError, setFormError] = useState('');
  useEffect(() => {
    if (!selectedKey) return;
    const report = reports.find((item) => item.key === selectedKey);
    setForm((current) => ({ ...current, reportKey: selectedKey, format: report?.default_format || current.format }));
  }, [reports, selectedKey]);
  const selectedReport = reports.find((report) => report.key === form.reportKey);
  const submit = useMutation({
    mutationFn: () => {
      const common = {
        report_key: form.reportKey,
        format: form.format,
        params: reportParams(form),
        recipient_ids: form.recipientIds,
      };
      if (form.delivery === 'once') return httpRequest('POST', '/api/v1/reports/runs/', { body: common });
      return httpRequest('POST', '/api/v1/reports/schedules/', {
        body: {
          ...common,
          cadence: form.cadence,
          weekday: form.cadence === 'weekly' ? Number(form.weekday) : null,
          day_of_month: form.cadence === 'monthly' ? Number(form.dayOfMonth) : null,
          hour: Number(form.hour),
          is_active: true,
        },
      });
    },
    onSuccess: () => {
      setFormError('');
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success(form.delivery === 'once' ? 'Your report is being prepared.' : 'Report delivery has been scheduled.', { title: form.delivery === 'once' ? 'Report started' : 'Schedule saved' });
      onClose?.(form.delivery === 'once' ? 'runs' : 'schedules');
    },
    onError: (error) => setFormError(userFacingError(error, { fallback: 'This report could not be prepared. Check the selected scope and recipients, then try again.' })),
  });
  const valid = Boolean(form.reportKey) && (!['attendance', 'finance'].includes(form.reportKey) || (!form.from || !form.to || form.from <= form.to));
  return (
    <section className="reports-studio" aria-label="Report builder">
      <header>
        <div className="reports-studio-icon">{cloneElement(REPORT_ICONS[form.reportKey] || Icons.doc, { size: 22 })}</div>
        <div><span>Report studio</span><h2>{selectedReport?.title || 'Prepare a report'}</h2><p>{reportDescription(selectedReport)}</p></div>
        <button type="button" onClick={() => onClose?.()} aria-label="Close report builder">{cloneElement(Icons.x, { size: 18 })}</button>
      </header>
      <div className="reports-studio-body">
        <div className="reports-studio-main">
          <div className="reports-mode-row">
            <label><span>Report</span><select value={form.reportKey} onChange={(event) => { const report = reports.find((item) => item.key === event.target.value); setForm((current) => ({ ...current, reportKey: event.target.value, format: report?.default_format || current.format, branch: '', cohort: '', term: '', subject: '' })); }}><option value="">Choose a report</option>{reports.map((report) => <option value={report.key} key={report.key}>{report.title}</option>)}</select></label>
            <label><span>File format</span><select value={form.format} onChange={(event) => setForm((current) => ({ ...current, format: event.target.value }))}><option value="pdf">PDF document</option><option value="xlsx">Excel workbook</option></select></label>
            <fieldset><legend>Delivery</legend><button type="button" className={form.delivery === 'once' ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, delivery: 'once' }))}>Prepare now</button><button type="button" className={form.delivery === 'schedule' ? 'is-active' : ''} onClick={() => setForm((current) => ({ ...current, delivery: 'schedule' }))}>Schedule</button></fieldset>
          </div>
          <ScopeFields form={form} setForm={setForm} branches={branches} cohorts={cohorts} terms={terms} subjects={subjects} />
          {form.delivery === 'schedule' && <div className="reports-schedule-fields"><label><span>Frequency</span><select value={form.cadence} onChange={(event) => setForm((current) => ({ ...current, cadence: event.target.value }))}><option value="weekly">Every week</option><option value="monthly">Every month</option></select></label>{form.cadence === 'weekly' ? <label><span>Delivery day</span><select value={form.weekday} onChange={(event) => setForm((current) => ({ ...current, weekday: event.target.value }))}>{WEEKDAYS.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label> : <label><span>Day of month</span><input type="number" min="1" max="31" value={form.dayOfMonth} onChange={(event) => setForm((current) => ({ ...current, dayOfMonth: event.target.value }))} /></label>}<label><span>Delivery hour</span><select value={form.hour} onChange={(event) => setForm((current) => ({ ...current, hour: event.target.value }))}>{Array.from({ length: 24 }, (_, hour) => <option value={hour} key={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select></label></div>}
        </div>
        <RecipientPicker contacts={contacts} selected={form.recipientIds} onChange={(recipientIds) => setForm((current) => ({ ...current, recipientIds }))} />
      </div>
      {formError && <p className="reports-form-error" role="alert">{formError}</p>}
      <footer><p>{form.delivery === 'once' ? 'You can leave this page while the report is prepared.' : 'Recipients will receive each completed report automatically.'}</p><ActionButton disabled={!valid || submit.isPending} icon={form.delivery === 'once' ? Icons.trend : Icons.cal} tone="primary" onClick={() => submit.mutate()}>{submit.isPending ? 'Saving…' : form.delivery === 'once' ? 'Prepare report' : 'Save schedule'}</ActionButton></footer>
    </section>
  );
}

function ReportLibrary({ state, canWrite, onPrepare }) {
  return <WorkspaceState state={state} empty={!state.rows.length} emptyTitle="No reports are available" emptyBody="Your visible report library will appear here when access is available."><div className="reports-library-grid">{state.rows.map((report) => <article className="reports-library-card" key={report.id || report.key}><div>{cloneElement(REPORT_ICONS[report.key] || Icons.doc, { size: 21 })}</div><span>{String(report.default_format || 'pdf').toUpperCase()}</span><h2>{report.title}</h2><p>{reportDescription(report)}</p><footer><small>Prepared from your permitted organization records</small>{canWrite && <ActionButton icon={Icons.plus} tone="primary" onClick={() => onPrepare(report.key)}>Prepare</ActionButton>}</footer></article>)}</div></WorkspaceState>;
}

function RunsRegister({ state, reports }) {
  return <><CoverageBar state={state} label="prepared reports" /><WorkspaceState state={state} empty={!state.rows.length} emptyTitle="No reports have been prepared yet" emptyBody="Choose a report from the library and prepare it when you need a shareable record."><WorkspaceTable label="Prepared reports" rows={state.rows} columns={[
    { key: 'report_key', label: 'Report', render: (row) => reportTitle(reports, row.report_key) },
    { key: 'created_at', label: 'Requested', render: (row) => formatOrganizationDate(row.created_at) || '—' },
    { key: 'format', label: 'Format', render: (row) => String(row.format || '').toUpperCase() },
    { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} tone={row.status === 'done' ? 'success' : row.status === 'failed' ? 'danger' : 'warn'} /> },
    { key: 'file_bytes', label: 'Size', render: (row) => row.status === 'done' ? `${formatBusinessNumber(Math.max(0, Number(row.file_bytes) || 0))} bytes` : '—' },
    { key: 'download_url', label: 'File', render: (row) => row.download_url ? <a className="reports-download" href={row.download_url} target="_blank" rel="noreferrer">Download {cloneElement(Icons.chevR, { size: 13 })}</a> : row.status === 'failed' ? 'Could not prepare' : 'Preparing…' },
  ]} /></WorkspaceState></>;
}

function SchedulesRegister({ state, reports, canWrite }) {
  const toast = useToast();
  const toggle = useMutation({
    mutationFn: (schedule) => httpRequest('PATCH', `/api/v1/reports/schedules/${schedule.id}/`, { body: { is_active: !schedule.is_active } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success('Report schedule updated.'); },
    onError: (error) => toast.danger(userFacingError(error, { fallback: 'The report schedule could not be updated.' })),
  });
  return <><CoverageBar state={state} label="report schedules" /><WorkspaceState state={state} empty={!state.rows.length} emptyTitle="No recurring reports are scheduled" emptyBody="Open the report builder, choose Schedule, and select when the report should arrive."><WorkspaceTable label="Scheduled reports" rows={state.rows} columns={[
    { key: 'report_key', label: 'Report', render: (row) => reportTitle(reports, row.report_key) },
    { key: 'cadence', label: 'Delivery', render: (row) => row.cadence === 'weekly' ? `Weekly · ${WEEKDAYS[row.weekday] || 'day not recorded'} · ${String(row.hour).padStart(2, '0')}:00` : `Monthly · day ${row.day_of_month} · ${String(row.hour).padStart(2, '0')}:00` },
    { key: 'format', label: 'Format', render: (row) => String(row.format || '').toUpperCase() },
    { key: 'recipient_ids', label: 'Shared with', render: (row) => `${formatBusinessNumber(row.recipient_ids?.length || 0)} additional recipient${row.recipient_ids?.length === 1 ? '' : 's'}` },
    { key: 'last_run_at', label: 'Last prepared', render: (row) => formatOrganizationDate(row.last_run_at) || 'Not yet' },
    { key: 'is_active', label: 'State', render: (row) => canWrite ? <button className={`reports-schedule-toggle${row.is_active ? ' is-active' : ''}`} type="button" disabled={toggle.isPending} onClick={() => toggle.mutate(row)}><i />{row.is_active ? 'Active' : 'Paused'}</button> : <StatusPill value={row.is_active ? 'active' : 'paused'} /> },
  ]} /></WorkspaceState></>;
}

export function ReportsPage({ user, route = 'reports/library', onNav }) {
  useWorkspaceTitle('Reports');
  const { segments } = workspaceRoute(route);
  const requested = segments[1];
  const active = SECTIONS.some((section) => section.id === requested) ? requested : 'library';
  const canWrite = canUseCapability(user, 'reports:write');
  const library = useWorkspaceData('/api/v1/reports/', { page_size: 100 });
  const runs = useWorkspaceData('/api/v1/reports/runs/', { page_size: 100, ordering: '-created_at' }, { enabled: active === 'runs', refreshMs: 8_000 });
  const schedules = useWorkspaceData('/api/v1/reports/schedules/', { page_size: 100, ordering: '-created_at' }, { enabled: active === 'schedules' });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100, ordering: 'name' }, { enabled: canWrite });
  const cohorts = useWorkspaceData('/api/v1/cohorts/', { page_size: 100, is_archived: false, ordering: 'name' }, { enabled: canWrite });
  const terms = useWorkspaceData('/api/v1/schedule/terms/', { page_size: 100, ordering: '-start_date' }, { enabled: canWrite });
  const subjects = useWorkspaceData('/api/v1/academics/subjects/', { page_size: 100, is_active: true, ordering: 'name' }, { enabled: canWrite });
  const contacts = useWorkspaceData('/api/v1/messaging/contacts/', { page_size: 100, category: 'staff' }, { enabled: canWrite && canUseCapability(user, 'messaging:read') });
  const [studioKey, setStudioKey] = useState('');
  const reportRows = library.rows;
  const readyRuns = runs.rows.filter((run) => run.status === 'done').length;
  const preparingRuns = runs.rows.filter((run) => ['queued', 'running'].includes(run.status)).length;
  const activeSchedules = schedules.rows.filter((schedule) => schedule.is_active).length;
  const navigate = (section) => {
    setStudioKey('');
    onNav?.(`reports/${section}`, { scroll: false });
  };
  const navigation = <SectionNav label="Reports" items={SECTIONS} active={active} basePath="reports" onNav={onNav} />;
  const summary = useMemo(() => [
    { label: 'Available reports', value: library.pending ? '…' : formatBusinessNumber(library.total), detail: 'Visible to your responsibility', icon: Icons.folder },
    { label: 'Ready to download', value: runs.enabled ? formatBusinessNumber(readyRuns) : 'Open history', detail: 'Prepared files in this view', icon: Icons.doc },
    { label: 'Preparing now', value: runs.enabled ? formatBusinessNumber(preparingRuns) : 'Open history', detail: 'Queued or being built', icon: Icons.trend },
    { label: 'Active schedules', value: schedules.enabled ? formatBusinessNumber(activeSchedules) : 'Open schedules', detail: 'Recurring deliveries in this view', icon: Icons.cal },
  ], [activeSchedules, library.pending, library.total, preparingRuns, readyRuns, runs.enabled, schedules.enabled]);
  return <main className="fw-page reports-page">
    <WorkspaceHeader eyebrow="Decision support" title="Reports" description="Prepare clear reports, share them with the right leaders, schedule recurring delivery, and download completed files without technical setup." actions={canWrite && <ActionButton icon={Icons.plus} tone="primary" onClick={() => setStudioKey(reportRows[0]?.key || 'attendance')}>Prepare report</ActionButton>} />
    <WorkspaceLayout navigation={navigation}>
      <div className="reports-summary">{summary.map((item) => <article key={item.label}><span>{cloneElement(item.icon, { size: 18 })}</span><div><small>{item.label}</small><strong>{item.value}</strong><p>{item.detail}</p></div></article>)}</div>
      {studioKey && <ReportStudio reports={reportRows} selectedKey={studioKey} branches={branches.rows} cohorts={cohorts.rows} terms={terms.rows} subjects={subjects.rows} contacts={contacts.rows} onClose={(section) => section ? navigate(section) : setStudioKey('')} />}
      {!studioKey && active === 'library' && <ReportLibrary state={library} canWrite={canWrite} onPrepare={setStudioKey} />}
      {!studioKey && active === 'runs' && <RunsRegister state={runs} reports={reportRows} />}
      {!studioKey && active === 'schedules' && <SchedulesRegister state={schedules} reports={reportRows} canWrite={canWrite} />}
    </WorkspaceLayout>
  </main>;
}
