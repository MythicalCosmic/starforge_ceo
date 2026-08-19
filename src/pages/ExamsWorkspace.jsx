import { cloneElement, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Icons } from '../components/Icons.jsx';
import { UnloadedSelectionOption } from '../components/SelectionScopeOption.jsx';
import {
  ActionButton,
  CoverageBar,
  DetailGrid,
  DetailSection,
  FilterField,
  FilterPanel,
  LinkButton,
  RouteLink,
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
import { formatBusinessNumber, formatOrganizationDate } from '../lib/formatters.js';
import { canUseCapability } from '../lib/permissions.js';
import { userFacingError } from '../lib/userFacingError.js';
import { readableValidationDetails } from '../lib/validationPresentation.js';
import '../styles/focused-v3.css';
import '../styles/financial-academic-v4.css';
import '../styles/financial-academic-v5.css';

const SECTIONS = Object.freeze([
  { id: 'overview', label: 'Overview', description: 'Schedule and readiness', icon: Icons.home },
  { id: 'exams', label: 'Exam register', description: 'All assessments', icon: Icons.cal },
  { id: 'grades', label: 'Results & grades', description: 'Published outcomes', icon: Icons.trend },
  { id: 'transcripts', label: 'Transcripts', description: 'Generated records', icon: Icons.doc },
  { id: 'subjects', label: 'Subjects', description: 'Academic catalogue', icon: Icons.folder },
  { id: 'types', label: 'Exam types', description: 'Assessment definitions', icon: Icons.settings },
]);

function pathId(value) {
  return /^\d+$/.test(String(value || '')) ? String(value) : null;
}

function relationId(value) {
  return String(value?.id ?? value ?? '');
}

function finiteScore(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function validExamScore(value, maximum) {
  const score = finiteScore(value);
  const max = finiteScore(maximum);
  return score != null && max != null && max >= 0 && score >= 0 && score <= max
    ? score
    : null;
}

function positiveVersion(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function equivalentNumber(left, right) {
  const first = finiteScore(left);
  const second = finiteScore(right);
  return first != null && second != null && first === second;
}

function publicationStatus(exam) {
  if (exam?.requires_republish) return 'Correction pending';
  return exam?.is_published ? 'Published' : 'Draft';
}

function correctionChanges(exam, source) {
  const changes = {};
  const title = String(source?.title || '').trim();
  const examDate = String(source?.exam_date || '').trim();
  const maxScore = String(source?.max_score ?? '').trim();
  const weight = String(source?.weight ?? '').trim();

  if (title !== String(exam?.title || '')) changes.title = title;
  if (examDate !== String(exam?.exam_date || '')) changes.exam_date = examDate;
  if (!equivalentNumber(maxScore, exam?.max_score)) changes.max_score = maxScore;
  if (!equivalentNumber(weight, exam?.weight)) changes.weight = weight;
  return changes;
}

function relationParam(params, key) {
  const value = String(params.get(key) || '');
  return /^\d{1,20}$/.test(value) ? value : '';
}

function examListFilters(params) {
  const published = String(params.get('published') || '');
  return {
    cohort: relationParam(params, 'cohort'),
    subject: relationParam(params, 'subject'),
    term: relationParam(params, 'term'),
    type: relationParam(params, 'type'),
    published: ['true', 'false'].includes(published) ? published : '',
  };
}

function examFilterParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
  return params;
}

function branchExamRows(rows, cohorts, branchId) {
  if (!branchId) return rows;
  const cohortIds = new Set(cohorts.map((cohort) => relationId(cohort.id)));
  return rows.filter((exam) => cohortIds.has(relationId(exam.cohort)));
}

function examDirectoryPath(branchId) {
  return branchId ? `branches/${branchId}/exams` : 'exams/exams';
}

function examRegisterPath(branchId) {
  return branchId ? `branches/${branchId}/exams/exams` : 'exams/exams';
}

function examRecordPath(branchId, id) {
  return `${examRegisterPath(branchId)}/${id}`;
}

function useBranchExamScope(examState, branchId) {
  const cohortId = examState.data?.cohort;
  const required = Boolean(branchId && examState.data);
  const cohort = useWorkspaceData(required && cohortId ? `/api/v1/cohorts/${cohortId}/` : null, undefined, { enabled: Boolean(required && cohortId) });
  const pending = required && Boolean(cohortId) && cohort.pending;
  const allowed = !required || Boolean(cohortId && cohort.data && !cohort.error && String(cohort.data.branch) === String(branchId));
  return { required, pending, allowed, error: cohort.error };
}

function BranchExamBoundary({ scope, branchId, onNav }) {
  if (scope.pending) return <WorkspaceState state={{ pending: true }} />;
  return <div className="fw-safety-block">{scope.error ? 'This assessment’s branch could not be verified, so its record and controls remain closed in this branch workspace.' : 'This assessment belongs to another branch, so its record and controls remain closed here.'} <LinkButton to={`branches/${branchId}/exams`} onNav={onNav}>Back to branch assessments</LinkButton></div>;
}

function mutationMessage(error, fallback) {
  return error?.safeMessage || userFacingError(error, { fallback });
}

function updateFilters(current, key, value, base, onNav) {
  const next = new URLSearchParams(current);
  if (value) next.set(key, value); else next.delete(key);
  onNav(next.toString() ? `${base}?${next}` : base, { scroll: false });
}

function examDateBadge(value) {
  const parsed = new Date(`${String(value || '').slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return { month: 'Date', day: '—' };
  return {
    month: new Intl.DateTimeFormat('en', { month: 'short' }).format(parsed),
    day: new Intl.DateTimeFormat('en', { day: '2-digit' }).format(parsed),
  };
}

function stateMetric(state, value) {
  if (state.pending) return '…';
  if (state.error || state.paused) return '—';
  return formatBusinessNumber(value);
}

function ExamsOverview({ onNav, branchId }) {
  const overview = useWorkspaceData('/api/v1/academics/exams/overview/', { branch: branchId || undefined });
  const data = overview.data || {};
  const scheduleRows = Array.isArray(data.schedule) ? data.schedule : [];
  const attentionRows = Array.isArray(data.attention) ? data.attention : [];
  const typeRows = Array.isArray(data.type_distribution) ? data.type_distribution : [];
  const subjectRows = Array.isArray(data.subject_distribution) ? data.subject_distribution : [];
  const maxDistribution = Math.max(1, ...typeRows.map((row) => row.value), ...subjectRows.map((row) => row.value));
  const drafts = Number(data.drafts || 0);
  const corrections = Number(data.corrections_due || 0);
  const nextTwoWeeks = Number(data.next_14_days || 0);
  return <>
    <section className="fa5-metric-rail fa5-academic-rail" aria-label="Assessment readiness">
      <article><span>{branchId ? 'Branch exams' : 'Visible exams'}</span><strong>{stateMetric(overview, data.total_exams)}</strong><small>{branchId ? 'Exact branch assessment scope' : 'Exact current academic scope'}</small></article>
      <article><span>Next 14 days</span><strong>{stateMetric(overview, nextTwoWeeks)}</strong><small>{nextTwoWeeks === 1 ? 'One assessment approaching' : 'Today plus the next 13 dates'}</small></article>
      <article className={drafts ? 'is-attention' : ''}><span>Drafts</span><strong>{stateMetric(overview, drafts)}</strong><small>{drafts ? 'Definitions still need publication' : 'No unpublished definitions'}</small></article>
      <article className={corrections ? 'is-danger' : ''}><span>Corrections due</span><strong>{stateMetric(overview, corrections)}</strong><small>{corrections ? 'Corrected records need republishing' : 'No correction backlog'}</small></article>
      <article><span>Published</span><strong>{stateMetric(overview, data.published_exams)}</strong><small>{formatBusinessNumber(data.subjects_used || 0)} subjects represented</small></article>
    </section>
    <div className={`fw-coverage${overview.complete ? '' : ' is-partial'}`} role="status">
      <span>{cloneElement(overview.complete ? Icons.check : Icons.flag, { size: 13 })}</span>
      <span><strong>{overview.pending ? 'Loading exact assessment scope' : overview.error || overview.paused ? 'Assessment overview unavailable' : 'Assessment overview is exact'}</strong><small>{overview.complete ? 'Metrics, schedule, and distributions are calculated by the server across the full permitted register.' : 'No complete conclusion is drawn until the server aggregate is available.'}</small></span>
      {data.as_of && <time>{formatOrganizationDate(data.as_of, { dateOnly: true })}</time>}
    </div>
    <WorkspaceState state={overview}><><div className="fa5-exam-overview">
      <section className="fa5-panel fa5-schedule-panel" aria-labelledby="assessment-calendar-title">
        <header><div><h2 id="assessment-calendar-title">Assessment schedule</h2><p>{data.schedule_kind === 'recent' ? 'No future assessment is recorded; these are the most recent completed dates.' : 'The next assessment dates across the complete permitted register.'}</p></div><LinkButton to={examRegisterPath(branchId)} onNav={onNav}>Open exam register</LinkButton></header>
        <div className="fa5-schedule-list">{scheduleRows.map((exam) => {
          const badge = examDateBadge(exam.exam_date);
          return <RouteLink key={exam.id} to={examRecordPath(branchId, exam.id)} onNav={onNav}>
            <time dateTime={exam.exam_date}><span>{badge.month}</span><strong>{badge.day}</strong></time>
            <span><strong>{exam.title}</strong><small>{exam.subject_name || 'Subject not recorded'} · {exam.cohort_name || 'Group not recorded'}</small></span>
            <span className="fa5-exam-type">{exam.exam_type_detail?.name || 'Assessment'}</span>
            <StatusPill value={publicationStatus(exam)} tone={exam.requires_republish ? 'warn' : undefined} />
            {cloneElement(Icons.chevR, { size: 15 })}
          </RouteLink>;
        })}{!scheduleRows.length && <div className="fa5-quiet-empty">No assessment dates are recorded in this scope.</div>}</div>
      </section>
      <section className="fa5-panel fa5-attention-panel">
        <header><div><h2>Needs attention</h2><p>Definitions that are not ready to stay on the published academic record.</p></div><span>{formatBusinessNumber(attentionRows.length)} visible</span></header>
        {attentionRows.length ? <div className="fa5-attention-list">{attentionRows.map((exam) => <RouteLink key={exam.id} to={examRecordPath(branchId, exam.id)} onNav={onNav}>
          <span className={exam.requires_republish ? 'is-danger' : ''}>{cloneElement(exam.requires_republish ? Icons.shield : Icons.doc, { size: 15 })}</span>
          <span><strong>{exam.title}</strong><small>{exam.requires_republish ? 'Correction pending publication' : 'Draft definition'} · {formatOrganizationDate(exam.exam_date, { dateOnly: true })}</small></span>
          {cloneElement(Icons.chevR, { size: 15 })}
        </RouteLink>)}</div> : <div className="fa5-quiet-empty is-success">Every visible exam definition is published and current.</div>}
      </section>
    </div>
    <div className="fa5-secondary-grid fa5-academic-distribution">
      <section className="fa5-panel"><header><div><h2>Assessments by subject</h2><p>Exact distribution across the current scope.</p></div></header>{subjectRows.length ? <div className="fa5-distribution-list">{subjectRows.map((row) => <div key={row.id ?? row.label}><span><strong>{row.label}</strong><small>{formatBusinessNumber(row.value)} exam{row.value === 1 ? '' : 's'}</small></span><i style={{ '--fa5-fill': `${(row.value / maxDistribution) * 100}%` }} /></div>)}</div> : <div className="fa5-quiet-empty">No subject distribution is available.</div>}</section>
      <section className="fa5-panel"><header><div><h2>Assessment types</h2><p>Exact mix of tests, reviews, and formal exams.</p></div></header>{typeRows.length ? <div className="fa5-distribution-list">{typeRows.map((row) => <div key={row.id ?? row.label}><span><strong>{row.label}</strong><small>{formatBusinessNumber(row.value)} exam{row.value === 1 ? '' : 's'}</small></span><i style={{ '--fa5-fill': `${(row.value / maxDistribution) * 100}%` }} /></div>)}</div> : <div className="fa5-quiet-empty">No assessment type distribution is available.</div>}</section>
    </div></></WorkspaceState>
  </>;
}

function ExamList({ route, onNav, canWrite, branchId }) {
  const filters = examListFilters(workspaceRoute(route).params);
  const params = examFilterParams(filters);
  const base = branchId ? `branches/${branchId}/exams/exams` : 'exams/exams';
  const cohorts = useWorkspaceData('/api/v1/cohorts/', { page_size: 100, branch: branchId || undefined });
  const branchCohortIds = new Set(cohorts.rows.map((cohort) => relationId(cohort.id)));
  const requestedCohort = filters.cohort;
  const cohortInLoadedBranch = branchCohortIds.has(relationId(requestedCohort));
  const needsExactCohort = Boolean(branchId && requestedCohort && !cohortInLoadedBranch && !cohorts.complete);
  const exactCohort = useWorkspaceData(needsExactCohort ? `/api/v1/cohorts/${requestedCohort}/` : null, undefined, { enabled: needsExactCohort && !cohorts.pending && !cohorts.error });
  const exactCohortBelongs = Boolean(needsExactCohort && exactCohort.data && !exactCohort.error && String(exactCohort.data.branch) === String(branchId));
  const exactCohortPending = needsExactCohort && (cohorts.pending || (!cohorts.error && exactCohort.pending));
  const validBranchCohort = !branchId || !requestedCohort || cohortInLoadedBranch || exactCohortBelongs;
  const branchScopeReady = !branchId || (!cohorts.pending && !cohorts.error && !exactCohortPending);
  const safeCohort = validBranchCohort ? requestedCohort : '';
  const subjects = useWorkspaceData('/api/v1/academics/subjects/', { page_size: 100 });
  const terms = useWorkspaceData('/api/v1/schedule/terms/', { page_size: 100 });
  const types = useWorkspaceData('/api/v1/academics/exam-types/', { page_size: 100 });
  const exams = useWorkspaceData('/api/v1/academics/exams/', {
    page_size: 100,
    cohort: safeCohort || undefined,
    subject: filters.subject || undefined,
    term: filters.term || undefined,
    exam_type: filters.type || undefined,
    is_published: filters.published || undefined,
  }, { enabled: branchScopeReady && validBranchCohort });
  const attributionCohorts = exactCohortBelongs ? [...cohorts.rows, exactCohort.data] : cohorts.rows;
  const visibleExams = validBranchCohort ? branchExamRows(exams.rows, attributionCohorts, branchId) : [];
  const scopedExams = {
    ...exams,
    rows: visibleExams,
    total: branchId && exams.complete && cohorts.complete ? visibleExams.length : exams.total,
    complete: exams.complete && (!branchId || cohorts.complete),
  };
  return <>
    <section className="fa5-section-intro">
      <div><h2>Exam register</h2><p>One operational list for exam dates, groups, subjects, scoring rules, and publication readiness.</p></div>
      {canWrite && <LinkButton to={`${base}/new`} onNav={onNav} tone="primary" icon={Icons.plus}>Create exam</LinkButton>}
    </section>
    <nav className="fa5-state-switch" aria-label="Exam publication state">
      <RouteLink className={!filters.published ? 'is-active' : ''} to={base} onNav={onNav}>All exams</RouteLink>
      <RouteLink className={filters.published === 'false' ? 'is-active' : ''} to={`${base}?published=false`} onNav={onNav}>Drafts</RouteLink>
      <RouteLink className={filters.published === 'true' ? 'is-active' : ''} to={`${base}?published=true`} onNav={onNav}>Published</RouteLink>
    </nav>
    <FilterPanel title="Exam filters" activeCount={[...params.keys()].length} advancedCount={['subject', 'term', 'type'].filter((key) => params.get(key)).length} actions={<ActionButton tone="ghost" onClick={() => onNav(base)}>Clear</ActionButton>} primary={<>
      <FilterField label="Group"><select value={filters.cohort} onChange={(event) => updateFilters(params, 'cohort', event.target.value, base, onNav)}><option value="">All groups</option><UnloadedSelectionOption value={filters.cohort} options={cohorts.rows} label="group" />{cohorts.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField>
      <FilterField label="Publication"><select value={filters.published} onChange={(event) => updateFilters(params, 'published', event.target.value, base, onNav)}><option value="">All publication states</option><option value="true">Published</option><option value="false">Draft</option></select></FilterField>
    </>}>
      <FilterField label="Subject"><select value={filters.subject} onChange={(event) => updateFilters(params, 'subject', event.target.value, base, onNav)}><option value="">All subjects</option><UnloadedSelectionOption value={filters.subject} options={subjects.rows} label="subject" />{subjects.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField>
      <FilterField label="Term"><select value={filters.term} onChange={(event) => updateFilters(params, 'term', event.target.value, base, onNav)}><option value="">All terms</option><UnloadedSelectionOption value={filters.term} options={terms.rows} label="term" />{terms.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField>
      <FilterField label="Exam type"><select value={filters.type} onChange={(event) => updateFilters(params, 'type', event.target.value, base, onNav)}><option value="">All types</option><UnloadedSelectionOption value={filters.type} options={types.rows} label="exam type" />{types.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></FilterField>
    </FilterPanel>
    {!validBranchCohort && <div className="fw-safety-block">The selected group does not belong to this branch, so no assessment records were opened.</div>}
    {branchId && cohorts.error && <div className="fw-safety-block">Branch group relationships could not be verified. Assessment records remain closed in this branch workspace.</div>}
    <CoverageBar state={scopedExams} label={branchId ? 'branch-linked exams' : 'exams'} filtered={params.size > 0} />
    <WorkspaceState state={scopedExams} empty={!visibleExams.length}><WorkspaceTable label="Exams" rows={visibleExams} columns={[
      { key: 'title', label: 'Exam', render: (row) => <span className="fw-person-cell"><strong>{row.title || 'Untitled exam'}</strong><small>{row.exam_type_detail?.name || 'Assessment type not recorded'}</small></span> },
      { key: 'subject_name', label: 'Subject' }, { key: 'cohort_name', label: 'Group' },
      { key: 'term_name', label: 'Term' },
      { key: 'exam_date', label: 'Date', render: (row) => formatOrganizationDate(row.exam_date, { dateOnly: true }) },
      { key: 'max_score', label: 'Scoring', render: (row) => <span className="fw-person-cell"><strong>{row.max_score ?? '—'} points</strong><small>{row.weight == null ? 'Weight not recorded' : `${row.weight} weight`}</small></span> },
      { key: 'is_published', label: 'Readiness', render: (row) => <StatusPill value={publicationStatus(row)} /> },
    ]} onOpen={(row) => onNav(`${base}/${row.id}`)} /></WorkspaceState>
  </>;
}

function ExamEditor({ id, onNav, branchId }) {
  const editing = Boolean(id);
  const directoryPath = examDirectoryPath(branchId);
  const detailPath = editing ? examRecordPath(branchId, id) : directoryPath;
  const record = useWorkspaceData(editing ? `/api/v1/academics/exams/${id}/` : null, undefined, { enabled: editing });
  const branchScope = useBranchExamScope(record, branchId);
  const branchDataAllowed = !branchId || (branchScope.required && !branchScope.pending && branchScope.allowed);
  const results = useWorkspaceData(editing && record.data ? `/api/v1/academics/exams/${id}/results/` : null, { page_size: 1 }, { enabled: editing && Boolean(record.data) && branchDataAllowed });
  const cohorts = useWorkspaceData('/api/v1/cohorts/', { page_size: 100, branch: branchId || undefined });
  const subjects = useWorkspaceData('/api/v1/academics/subjects/', { page_size: 100, is_active: true });
  const terms = useWorkspaceData('/api/v1/schedule/terms/', { page_size: 100 });
  const types = useWorkspaceData('/api/v1/academics/exam-types/', { page_size: 100, is_active: true });
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const toast = useToast();
  const source = form || record.data || { title: '', subject: '', cohort: '', term: '', exam_type: '', exam_date: '', max_score: '100', weight: '1' };
  const change = (key, value) => setForm((current) => ({ ...(current || source), [key]: value }));
  const mutation = useMutation({ mutationFn: () => httpRequest(editing ? 'PATCH' : 'POST', editing ? `/api/v1/academics/exams/${id}/` : '/api/v1/academics/exams/', { body: {
    title: source.title, subject: Number(source.subject), cohort: Number(source.cohort), term: Number(source.term), exam_type: Number(source.exam_type), exam_date: source.exam_date, max_score: source.max_score, weight: source.weight,
  } }), onSuccess: (saved) => { setError(''); queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success(editing ? 'Exam changes saved.' : 'Exam created.', { title: 'Assessment saved' }); onNav(examRecordPath(branchId, saved.id || id)); }, onError: (failure) => { const message = mutationMessage(failure, 'The exam could not be saved.'); setError(message); toast.danger(message, { title: 'Assessment not saved' }); } });
  if (editing && (record.pending || record.error || !record.data)) return <div className="fw-page"><WorkspaceHeader eyebrow="Academic assessment" title="Edit exam" description="Preparing the assessment definition and its current publication state." actions={<LinkButton to={detailPath} onNav={onNav}>Cancel</LinkButton>} /><WorkspaceState state={record} empty={!record.pending && !record.error && !record.data} emptyTitle="Exam not found" emptyBody="This assessment may be outside your current responsibilities." /></div>;
  if (editing && branchScope.required && (branchScope.pending || !branchScope.allowed)) return <div className="fw-page"><WorkspaceHeader eyebrow="Branch assessment" title="Assessment verification" description="Confirming that this assessment belongs to the selected branch before opening edit controls." /><BranchExamBoundary scope={branchScope} branchId={branchId} onNav={onNav} /></div>;
  if (record.data?.is_published || record.data?.requires_republish) return <div className="fw-page"><WorkspaceHeader eyebrow={record.data?.requires_republish ? 'Correction pending' : 'Published assessment'} title="Editing is held for review" description="Released assessment definitions stay unchanged here because altering their group, subject, weighting, or maximum score can invalidate visible outcomes." actions={<><LinkButton to={`${detailPath}/results`} onNav={onNav}>Review results</LinkButton>{record.data?.is_published && <LinkButton to={`${detailPath}/correct`} onNav={onNav} tone="danger">Correct published exam</LinkButton>}<LinkButton to={detailPath} onNav={onNav}>Back to exam</LinkButton></>} /><div className="fw-safety-block">{record.data?.requires_republish ? 'This correction is awaiting a current readiness review and explicit republish. Further edits remain closed.' : 'Use the controlled correction workflow to preserve the prior publication, its audit trail, and the required republish review.'}</div></div>;
  const structuralLocked = editing && (results.pending || Boolean(results.error) || results.total > 0);
  return <div className="fw-page"><WorkspaceHeader eyebrow="Academic assessment" title={editing ? 'Edit exam' : 'Create exam'} description="Create a complete assessment record on its own page; result entry and publishing remain controlled actions." actions={<LinkButton to={detailPath} onNav={onNav}>Cancel</LinkButton>} />{structuralLocked && <div className="fw-data-note">{results.pending ? 'Checking the result register before structural fields can be changed.' : results.error ? 'Result coverage could not be confirmed, so structural fields remain protected.' : `${formatBusinessNumber(results.total)} result record${results.total === 1 ? '' : 's'} already exist. Group, subject, term, weighting, and maximum score remain protected.`}</div>}<form className="fw-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>{error && <div className="fw-form-error" role="alert">{error}</div>}<section className="fw-form-section"><header><h2>Exam definition</h2><p>These fields make up the organization’s official assessment record.</p></header>
    <label className="is-wide">Title<input required maxLength="200" value={source.title || ''} onChange={(event) => change('title', event.target.value)} /></label>
    <label>Subject<select required disabled={structuralLocked} value={source.subject || ''} onChange={(event) => change('subject', event.target.value)}><option value="">Select subject</option><UnloadedSelectionOption value={source.subject} options={subjects.rows} label="subject" />{subjects.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Group<select required disabled={structuralLocked} value={source.cohort || ''} onChange={(event) => change('cohort', event.target.value)}><option value="">Select group</option><UnloadedSelectionOption value={source.cohort} options={cohorts.rows} label="group" />{cohorts.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Term<select required disabled={structuralLocked} value={source.term || ''} onChange={(event) => change('term', event.target.value)}><option value="">Select term</option><UnloadedSelectionOption value={source.term} options={terms.rows} label="term" />{terms.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Exam type<select required value={source.exam_type || ''} onChange={(event) => change('exam_type', event.target.value)}><option value="">Select type</option><UnloadedSelectionOption value={source.exam_type} options={types.rows} label="exam type" />{types.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Date<input required type="date" value={source.exam_date || ''} onChange={(event) => change('exam_date', event.target.value)} /></label>
    <label>Maximum score<input required type="number" disabled={structuralLocked} inputMode="decimal" min="0.01" max="9999.99" step="0.01" value={source.max_score || ''} onChange={(event) => change('max_score', event.target.value)} /></label>
    <label>Weight<input required type="number" disabled={structuralLocked} inputMode="decimal" min="0.001" max="9.999" step="0.001" value={source.weight || ''} onChange={(event) => change('weight', event.target.value)} /></label>
  </section><div className="fw-form-actions"><ActionButton type="submit" tone="primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save exam'}</ActionButton></div></form></div>;
}

function ExamDetail({ id, onNav, canWrite, branchId }) {
  const exam = useWorkspaceData(`/api/v1/academics/exams/${id}/`);
  const branchScope = useBranchExamScope(exam, branchId);
  const branchDataAllowed = !branchId || (branchScope.required && !branchScope.pending && branchScope.allowed);
  const readiness = useWorkspaceData(
    canWrite && exam.data && !exam.data.is_published ? `/api/v1/academics/exams/${id}/readiness/` : null,
    undefined,
    { enabled: Boolean(canWrite && exam.data && !exam.data.is_published && branchDataAllowed) },
  );
  const history = useWorkspaceData(
    canWrite && exam.data ? `/api/v1/academics/exams/${id}/history/` : null,
    { page_size: 25 },
    { enabled: Boolean(canWrite && exam.data && branchDataAllowed) },
  );
  useWorkspaceTitle(exam.data?.title, 'Exams', `exam-${id}`);
  const [publishError, setPublishError] = useState('');
  const [publishArmed, setPublishArmed] = useState(false);
  const toast = useToast();
  const recordPath = examRecordPath(branchId, id);
  const readinessData = readiness.data && typeof readiness.data === 'object' ? readiness.data : null;
  const recordVersion = positiveVersion(exam.data?.version);
  const readinessVersion = positiveVersion(readinessData?.version);
  const readinessCurrent = Boolean(readinessData && readinessVersion && recordVersion && readinessVersion === recordVersion);
  const readyToPublish = Boolean(readinessCurrent && readinessData.ready === true);
  const correctionPending = Boolean(exam.data?.requires_republish);
  const publicationLocked = Boolean(exam.data?.is_published || correctionPending);
  const publishLabel = correctionPending ? 'Republish correction' : 'Publish exam';
  const publish = useMutation({
    mutationFn: () => httpRequest('POST', `/api/v1/academics/exams/${id}/publish/`, {
      body: { expected_version: readinessVersion, confirmed: true },
    }),
    onSuccess: () => {
      setPublishError('');
      setPublishArmed(false);
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success('The assessment and its recorded outcomes are now published.', { title: 'Assessment published' });
    },
    onError: (failure) => { const message = mutationMessage(failure, 'The exam could not be published.'); setPublishArmed(false); setPublishError(message); queryClient.invalidateQueries({ queryKey: ['api'] }); toast.danger(message, { title: 'Assessment not published' }); },
  });
  if (branchScope.required && (branchScope.pending || !branchScope.allowed)) return <BranchExamBoundary scope={branchScope} branchId={branchId} onNav={onNav} />;
  const publishStatus = publishError
    ? <span className="fw-form-error" role="alert">{publishError}</span>
    : publishArmed
      ? <span className="fw-data-note" role="status">You reviewed the current readiness snapshot. Confirming releases the recorded outcomes and records this exact version.</span>
      : canWrite && !exam.data?.is_published && readiness.pending
        ? <span className="fw-data-note" role="status">Checking publication readiness before release controls are opened.</span>
        : canWrite && !exam.data?.is_published && readiness.error
          ? <span className="fw-form-error" role="alert">Publication stays blocked until its readiness snapshot can be verified.</span>
          : canWrite && !exam.data?.is_published && !readinessCurrent
            ? <span className="fw-form-error" role="alert">Publication stays blocked until the current assessment version has a readiness snapshot.</span>
            : canWrite && !exam.data?.is_published && !readyToPublish
              ? <span className="fw-data-note" role="status">Publication stays blocked while candidates, grades, or group coverage are incomplete.</span>
              : null;
  return <WorkspaceState state={exam} empty={!exam.data} emptyTitle="Exam not found" emptyBody="This assessment may be outside your current responsibilities.">{exam.data && <><WorkspaceHeader eyebrow="Exam record" title={exam.data.title} description="Assessment definition, connected learning context, and publication controls." status={publishStatus} actions={<><LinkButton to={examDirectoryPath(branchId)} onNav={onNav}>Back</LinkButton>{canWrite && <LinkButton to={`${recordPath}/results`} onNav={onNav}>Review results</LinkButton>}{canWrite && !publicationLocked && <LinkButton to={`${recordPath}/import`} onNav={onNav}>Import CSV</LinkButton>}{canWrite && exam.data.is_published && <LinkButton to={`${recordPath}/correct`} onNav={onNav} tone="danger">Correct published exam</LinkButton>}{canWrite && !publicationLocked && !publishArmed && <LinkButton to={`${recordPath}/edit`} onNav={onNav}>Edit</LinkButton>}{canWrite && !exam.data.is_published && readyToPublish && (publishArmed ? <><ActionButton tone="ghost" onClick={() => setPublishArmed(false)} disabled={publish.isPending}>Cancel</ActionButton><ActionButton tone="danger" onClick={() => publish.mutate()} disabled={publish.isPending}>{publish.isPending ? 'Publishing…' : `Confirm ${publishLabel.toLowerCase()}`}</ActionButton></> : <ActionButton tone="primary" onClick={() => { setPublishError(''); setPublishArmed(true); }}>{publishLabel}</ActionButton>)}</>} />
    <div className="fw-summary-grid">
      <div className="fw-summary-card"><span>Publication</span><strong><StatusPill value={publicationStatus(exam.data)} /></strong><small>{correctionPending ? 'Correction is awaiting a new readiness review and republish.' : exam.data.published_at ? `Released ${formatOrganizationDate(exam.data.published_at)}` : 'Not released to outcomes yet'}</small></div>
      <div className="fw-summary-card"><span>Assessment date</span><strong>{formatOrganizationDate(exam.data.exam_date, { dateOnly: true }) || '—'}</strong><small>{exam.data.term_name || 'Term not recorded'}</small></div>
      <div className="fw-summary-card"><span>Maximum score</span><strong>{formatBusinessNumber(exam.data.max_score)}</strong><small>Highest permitted result</small></div>
      <div className="fw-summary-card"><span>Weight</span><strong>{formatBusinessNumber(exam.data.weight, { maximumFractionDigits: 3 })}</strong><small>Recorded grade contribution</small></div>
    </div>
    {canWrite && !exam.data.is_published && <DetailSection eyebrow="Publication gate" title="Readiness review" description="The backend validates this snapshot again when you publish, using the version you reviewed."><div className="fw-summary-grid">
      <div className="fw-summary-card"><span>Eligible candidates</span><strong>{readiness.pending || readiness.error ? '—' : formatBusinessNumber(readinessData?.eligible)}</strong><small>{readiness.pending ? 'Calculating current group coverage' : readiness.error ? 'Readiness is unavailable' : 'Current active group members'}</small></div>
      <div className="fw-summary-card"><span>Graded</span><strong>{readiness.pending || readiness.error ? '—' : formatBusinessNumber(readinessData?.graded)}</strong><small>{readiness.pending ? 'Calculating result coverage' : readiness.error ? 'Publication remains blocked' : `${formatBusinessNumber(readinessData?.missing)} missing`}</small></div>
      <div className="fw-summary-card"><span>Outside group</span><strong>{readiness.pending || readiness.error ? '—' : formatBusinessNumber(readinessData?.excluded)}</strong><small>{readiness.pending ? 'Checking roster alignment' : readiness.error ? 'Publication remains blocked' : 'Recorded results outside current group'}</small></div>
      <div className="fw-summary-card"><span>Readiness</span><strong><StatusPill value={readiness.pending ? 'Checking' : readyToPublish ? 'Ready' : 'Not ready'} /></strong><small>{readinessData?.generated_at ? `Reviewed ${formatOrganizationDate(readinessData.generated_at)}` : 'No current snapshot'}</small></div>
    </div></DetailSection>}
    <DetailSection eyebrow="Connected learning record" title="Assessment context" description="Use these links to continue into the group or a filtered assessment register."><DetailGrid columns={3} fields={[
      { label: 'Subject', value: <RouteLink to={`${examRegisterPath(branchId)}?subject=${exam.data.subject}`} onNav={onNav}>{exam.data.subject_name || 'Subject not recorded'}</RouteLink> },
      { label: 'Group', value: exam.data.cohort ? <RouteLink to={`${branchId ? `branches/${branchId}/groups` : 'groups'}/${exam.data.cohort}/exams`} onNav={onNav}>{exam.data.cohort_name || 'Open group'}</RouteLink> : exam.data.cohort_name },
      { label: 'Term', value: exam.data.term_name },
      { label: 'Exam type', value: exam.data.exam_type ? <RouteLink to={`${examRegisterPath(branchId)}?type=${exam.data.exam_type}`} onNav={onNav}>{exam.data.exam_type_detail?.name || 'Assessment type'}</RouteLink> : exam.data.exam_type_detail?.name },
      { label: 'Assessment date', value: formatOrganizationDate(exam.data.exam_date, { dateOnly: true }) },
      { label: 'Published at', value: formatOrganizationDate(exam.data.published_at) },
      { label: 'Assessment version', value: recordVersion || '—' },
    ]} /></DetailSection>
    {canWrite && <DetailSection eyebrow="Audit trail" title="Publication and correction history" description="Lifecycle events are append-only evidence for this assessment version."><CoverageBar state={history} label="assessment history" /><WorkspaceState state={history} empty={!history.pending && !history.error && !history.rows.length} emptyTitle="No lifecycle events yet" emptyBody="This assessment has not been published or corrected yet."><WorkspaceTable label="Assessment history" rows={history.rows} columns={[
      { key: 'event_type', label: 'Event', render: (row) => <StatusPill value={row.event_type} /> },
      { key: 'exam_version', label: 'Version' }, { key: 'reason', label: 'Reason' }, { key: 'actor_name', label: 'Actor' },
      { key: 'created_at', label: 'Recorded', render: (row) => formatOrganizationDate(row.created_at) },
    ]} /></WorkspaceState></DetailSection>}
    {exam.data.is_published && canWrite && <div className="fw-safety-block">Published definitions and results can only change through the correction workflow. A successful correction withdraws the publication, preserves its history, and requires a fresh readiness-confirmed republish.</div>}
    {correctionPending && canWrite && <div className="fw-safety-block">This corrected assessment is held until its current readiness snapshot is complete and explicitly republished. Further edits and imports remain closed.</div>}
  </>}</WorkspaceState>;
}

function ExamCorrection({ id, onNav, branchId }) {
  const exam = useWorkspaceData(`/api/v1/academics/exams/${id}/`);
  const branchScope = useBranchExamScope(exam, branchId);
  const branchDataAllowed = !branchId || (branchScope.required && !branchScope.pending && branchScope.allowed);
  const results = useWorkspaceData(
    exam.data ? `/api/v1/academics/exams/${id}/results/` : null,
    { page_size: 100 },
    { enabled: Boolean(exam.data && branchDataAllowed) },
  );
  const [form, setForm] = useState(null);
  const [reason, setReason] = useState('');
  const [resultDrafts, setResultDrafts] = useState({});
  const [saveError, setSaveError] = useState(null);
  const toast = useToast();
  const recordPath = examRecordPath(branchId, id);
  const source = form || exam.data || {};
  const resultsByStudent = new Map(results.rows.map((row) => [String(row.student), row]));
  const change = (key, value) => setForm((current) => ({ ...(current || source), [key]: value }));
  const setResultDraft = (student, key, value) => setResultDrafts((current) => ({
    ...current,
    [student]: { ...(current[student] || {}), [key]: value },
  }));
  const mutation = useMutation({
    mutationFn: (payload) => httpRequest('POST', `/api/v1/academics/exams/${id}/correct/`, { body: payload }),
    onSuccess: () => {
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success('The correction was recorded. Review readiness before republishing.', { title: 'Assessment corrected' });
      onNav(recordPath);
    },
    onError: (failure) => {
      setSaveError(failure);
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.danger(mutationMessage(failure, 'The assessment correction could not be recorded.'), { title: 'Correction not recorded' });
    },
  });
  const submit = (event) => {
    event.preventDefault();
    setSaveError(null);
    const normalizedReason = reason.trim();
    const maximum = finiteScore(source.max_score);
    const weight = finiteScore(source.weight);
    const expectedVersion = positiveVersion(exam.data?.version);
    if (!normalizedReason) {
      const message = 'Explain why this published assessment needs correction.';
      setSaveError({ safeMessage: message });
      toast.warning(message, { title: 'Correction reason required' });
      return;
    }
    if (normalizedReason.length > 500) {
      const message = 'Keep the correction reason to 500 characters or fewer.';
      setSaveError({ safeMessage: message });
      toast.warning(message, { title: 'Correction reason is too long' });
      return;
    }
    if (maximum == null || maximum <= 0 || weight == null || weight <= 0 || !expectedVersion) {
      const message = 'The corrected maximum score, weight, or assessment version is invalid.';
      setSaveError({ safeMessage: message });
      toast.warning(message, { title: 'Correction not ready' });
      return;
    }
    const changedResults = Object.entries(resultDrafts).flatMap(([student, draft]) => {
      const current = resultsByStudent.get(String(student));
      if (!current) return [];
      const score = String(draft.score ?? current.score ?? '').trim();
      const note = String(draft.note ?? current.note ?? '').trim();
      const unchanged = equivalentNumber(score, current.score) && note === String(current.note || '');
      return unchanged ? [] : [{ student: Number(student), score, note }];
    });
    if (changedResults.some((row) => validExamScore(row.score, maximum) == null)) {
      const message = `Every corrected score must be a number from 0 to ${source.max_score}.`;
      setSaveError({ safeMessage: message });
      toast.warning(message, { title: 'Check corrected scores' });
      return;
    }
    const changes = correctionChanges(exam.data, source);
    if (!Object.keys(changes).length && !changedResults.length) {
      const message = 'Change an assessment field or recorded result before submitting a correction.';
      setSaveError({ safeMessage: message });
      toast.warning(message, { title: 'Nothing to correct' });
      return;
    }
    mutation.mutate({
      expected_version: expectedVersion,
      reason: normalizedReason,
      changes,
      results: changedResults,
    });
  };
  const errorLines = readableValidationDetails(saveError);
  if (branchScope.required && (branchScope.pending || !branchScope.allowed)) return <div className="fw-page"><WorkspaceHeader eyebrow="Branch assessment" title="Correction verification" description="Confirming the selected branch before a published assessment can be corrected." /><BranchExamBoundary scope={branchScope} branchId={branchId} onNav={onNav} /></div>;
  return <div className="fw-page"><WorkspaceState state={exam} empty={!exam.data} emptyTitle="Exam not found" emptyBody="This assessment may be outside your current responsibilities.">{exam.data && <>
    {!exam.data.is_published || exam.data.requires_republish ? <><WorkspaceHeader eyebrow="Assessment correction" title="Correction is not available" description="Only a currently published assessment can begin a correction workflow." actions={<LinkButton to={recordPath} onNav={onNav}>Back to exam</LinkButton>} /><div className="fw-safety-block">{exam.data.requires_republish ? 'This assessment already has a correction awaiting republish. Review its current readiness from the exam record.' : 'Draft assessments can be edited directly; published assessments need this controlled correction path.'}</div></> : <><WorkspaceHeader eyebrow="Published assessment" title={`Correct ${exam.data.title}`} description="Record the reason and exact changes. This withdraws the current publication, preserves the lifecycle history, and requires a fresh readiness-confirmed republish." actions={<><LinkButton to={`${recordPath}/results`} onNav={onNav}>Review results</LinkButton><LinkButton to={recordPath} onNav={onNav}>Cancel</LinkButton></>} />
      <form className="fw-form" onSubmit={submit}>
        {saveError && <div className="fw-form-error" role="alert"><strong>{mutationMessage(saveError, 'The assessment correction could not be recorded.')}</strong>{errorLines.length ? <ul>{errorLines.map((line) => <li key={line}>{line}</li>)}</ul> : null}</div>}
        <section className="fw-form-section"><header><h2>Correction reason</h2><p>This reason is retained in the immutable assessment lifecycle history.</p></header>
          <label className="is-wide">Reason<textarea required maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        </section>
        <section className="fw-form-section"><header><h2>Assessment definition</h2><p>Only changed fields are sent. Group, subject, term, and type remain protected here because moving released evidence needs a separately reviewed workflow.</p></header>
          <label className="is-wide">Title<input required maxLength="200" value={source.title || ''} onChange={(event) => change('title', event.target.value)} /></label>
          <label>Date<input required type="date" value={source.exam_date || ''} onChange={(event) => change('exam_date', event.target.value)} /></label>
          <label>Maximum score<input required type="number" inputMode="decimal" min="0.01" max="9999.99" step="0.01" value={source.max_score || ''} onChange={(event) => change('max_score', event.target.value)} /></label>
          <label>Weight<input required type="number" inputMode="decimal" min="0.001" max="9.999" step="0.001" value={source.weight || ''} onChange={(event) => change('weight', event.target.value)} /></label>
        </section>
        <section className="fw-form-section"><header><h2>Recorded outcomes</h2><p>Update only the released results that need correction. Every submitted score is checked against the corrected maximum.</p></header>
          <CoverageBar state={results} label="recorded results" />
          <WorkspaceState state={results} empty={!results.pending && !results.error && !results.rows.length} emptyTitle="No recorded outcomes" emptyBody="You can still correct the assessment definition with a documented reason.">{results.rows.length ? <div className="fw-table-wrap"><table><caption>Published result corrections</caption><thead><tr><th>Student</th><th>Released score</th><th>Corrected score</th><th>Corrected note</th></tr></thead><tbody>{results.rows.map((result) => {
            const key = String(result.student);
            const draft = resultDrafts[key] || {};
            return <tr key={key}><td><span className="fw-person-cell"><strong>{result.student_name || 'Student'}</strong><small>{result.student_code || `Student ${result.student}`}</small></span></td><td>{formatBusinessNumber(result.score, { maximumFractionDigits: 2 }) || '—'}</td><td><input aria-label={`Corrected score for ${result.student_name || 'student'}`} type="number" inputMode="decimal" min="0" max={source.max_score || undefined} step="0.01" disabled={mutation.isPending} value={Object.prototype.hasOwnProperty.call(draft, 'score') ? draft.score : result.score ?? ''} onChange={(event) => setResultDraft(key, 'score', event.target.value)} /></td><td><input aria-label={`Corrected note for ${result.student_name || 'student'}`} maxLength="255" disabled={mutation.isPending} value={Object.prototype.hasOwnProperty.call(draft, 'note') ? draft.note : result.note ?? ''} onChange={(event) => setResultDraft(key, 'note', event.target.value)} /></td></tr>;
          })}</tbody></table></div> : null}</WorkspaceState>
        </section>
        <div className="fw-safety-block">Submitting records the correction against version {positiveVersion(exam.data.version) || '—'}, withdraws publication, and makes the corrected assessment read-only until it is ready and explicitly republished.</div>
        <div className="fw-form-actions"><ActionButton type="submit" tone="danger" disabled={mutation.isPending}>{mutation.isPending ? 'Recording correction…' : 'Record correction'}</ActionButton></div>
      </form>
    </>}</>}</WorkspaceState></div>;
}

function ExamResults({ id, onNav, branchId, canViewCohorts }) {
  const exam = useWorkspaceData(`/api/v1/academics/exams/${id}/`);
  const branchScope = useBranchExamScope(exam, branchId);
  const branchDataAllowed = !branchId || (branchScope.required && !branchScope.pending && branchScope.allowed);
  const results = useWorkspaceData(exam.data ? `/api/v1/academics/exams/${id}/results/` : null, { page_size: 100 }, { enabled: Boolean(exam.data) && branchDataAllowed });
  const members = useWorkspaceData(exam.data?.cohort ? `/api/v1/cohorts/${exam.data.cohort}/members/` : null, undefined, { enabled: canViewCohorts && Boolean(exam.data?.cohort) && branchDataAllowed });
  const [drafts, setDrafts] = useState({});
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(null);
  const toast = useToast();
  const recordPath = examRecordPath(branchId, id);
  const resultsByStudent = new Map(results.rows.map((result) => [String(result.student), result]));
  const roster = [];
  const included = new Set();
  members.rows.forEach((member) => {
    const key = String(member.student);
    included.add(key);
    roster.push({ student: member.student, student_name: member.student_name, result: resultsByStudent.get(key), current: true });
  });
  results.rows.forEach((result) => {
    const key = String(result.student);
    if (!included.has(key)) roster.push({ student: result.student, student_name: result.student_name, result, current: false });
  });
  const setDraft = (student, key, value) => setDrafts((current) => ({ ...current, [student]: { ...(current[student] || {}), [key]: value } }));
  const changedCount = Object.keys(drafts).length;
  const mutation = useMutation({
    mutationFn: (rows) => httpRequest('POST', `/api/v1/academics/exams/${id}/results/`, { body: rows }),
    onSuccess: (summary) => {
      setSaveError(null);
      setSaved(summary);
      setDrafts({});
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success('The changed result rows were saved.', { title: 'Results updated' });
    },
    onError: (failure) => {
      setSaved(null);
      setSaveError(failure);
      toast.danger(mutationMessage(failure, 'The changed results could not be saved.'), { title: 'Results not saved' });
    },
  });
  const saveResults = (event) => {
    event.preventDefault();
    setSaveError(null);
    setSaved(null);
    const rows = Object.entries(drafts).map(([student, draft]) => {
      const current = resultsByStudent.get(String(student));
      return {
        student: Number(student),
        score: String(draft.score ?? current?.score ?? '').trim(),
        note: String(draft.note ?? current?.note ?? '').trim(),
      };
    });
    if (!rows.length) {
      const message = 'Change at least one score or note before saving.';
      setSaveError({ safeMessage: message });
      toast.warning(message, { title: 'Nothing to save' });
      return;
    }
    if (rows.some((row) => row.score === '')) {
      const message = 'Every changed row needs a score.';
      setSaveError({ safeMessage: message });
      toast.warning(message, { title: 'Check changed rows' });
      return;
    }
    if (finiteScore(exam.data.max_score) == null || finiteScore(exam.data.max_score) < 0) {
      const message = 'The recorded maximum score is unavailable, so results cannot be checked safely.';
      setSaveError({ safeMessage: message });
      toast.warning(message, { title: 'Results not saved' });
      return;
    }
    if (rows.some((row) => validExamScore(row.score, exam.data.max_score) == null)) {
      const message = `Every score must be a number from 0 to ${exam.data.max_score}.`;
      setSaveError({ safeMessage: message });
      toast.warning(message, { title: 'Check changed rows' });
      return;
    }
    mutation.mutate(rows);
  };
  const loadedScores = results.rows.map((result) => validExamScore(result.score, exam.data?.max_score)).filter((score) => score != null);
  const average = loadedScores.length ? loadedScores.reduce((total, score) => total + score, 0) / loadedScores.length : null;
  const currentResultCount = members.rows.filter((member) => resultsByStudent.has(String(member.student))).length;
  const candidateCoverage = canViewCohorts && members.complete && results.complete && members.total
    ? currentResultCount / members.total * 100
    : null;
  const errorLines = readableValidationDetails(saveError);
  if (branchScope.required && (branchScope.pending || !branchScope.allowed)) return <div className="fw-page"><WorkspaceHeader eyebrow="Branch assessment" title="Result register verification" description="Confirming the selected branch before any student outcomes are opened or changed." /><BranchExamBoundary scope={branchScope} branchId={branchId} onNav={onNav} /></div>;
  return <div className="fw-page"><WorkspaceState state={exam} empty={!exam.data} emptyTitle="Exam not found" emptyBody="This assessment may be outside your current responsibilities.">{exam.data && <><WorkspaceHeader eyebrow="Result register" title={exam.data.title} description={`Review recorded outcomes and enter scores for ${exam.data.cohort_name || 'this group'}. Only changed rows are submitted.`} actions={<><LinkButton to={recordPath} onNav={onNav}>Back to exam</LinkButton><LinkButton to={`${recordPath}/import`} onNav={onNav}>Import CSV</LinkButton></>} />
    <div className="fw-summary-grid">
      <div className="fw-summary-card"><span>Results recorded</span><strong>{results.pending || results.error ? '—' : formatBusinessNumber(results.total)}</strong><small>{results.complete ? 'Complete result register' : 'Across loaded coverage'}</small></div>
      {canViewCohorts && <div className="fw-summary-card"><span>Group candidates</span><strong>{members.pending || members.error ? '—' : formatBusinessNumber(members.total)}</strong><small>Current group membership</small></div>}
      <div className="fw-summary-card"><span>Average loaded score</span><strong>{average == null ? '—' : formatBusinessNumber(average, { maximumFractionDigits: 2 })}</strong><small>Not an organization-wide conclusion when coverage is partial</small></div>
      {canViewCohorts && <div className="fw-summary-card"><span>Current roster coverage</span><strong>{candidateCoverage == null ? '—' : `${formatBusinessNumber(candidateCoverage, { maximumFractionDigits: 1 })}%`}</strong><small>Current members with a result</small></div>}
    </div>
    <CoverageBar state={results} label="exam results" />
    {canViewCohorts ? <CoverageBar state={members} label="current group members" /> : <div className="fw-data-note">The current group roster is outside this role’s responsibilities. Existing results remain reviewable, but new candidates cannot be added from this page.</div>}
    {(exam.data.is_published || exam.data.requires_republish) ? <div className="fw-safety-block">{exam.data.requires_republish ? 'This correction is awaiting republish, so results remain held for review.' : 'Published results are review-only here. Use the explicit, auditable correction workflow so a released score is never silently overwritten.'}</div> : <div className="fw-data-note">Saving is all-or-nothing: if any changed row is invalid, no score in that batch is recorded. Scores must be between 0 and {exam.data.max_score}.</div>}
    {saveError && <div className="fw-form-error" role="alert"><strong>{mutationMessage(saveError, 'The changed results could not be saved.')}</strong>{errorLines.length ? <ul>{errorLines.map((line) => <li key={line}>{line}</li>)}</ul> : null}</div>}
    {saved && <div className="fw-form-success">Saved {formatBusinessNumber(saved.created)} new and {formatBusinessNumber(saved.updated)} updated result records.</div>}
    <WorkspaceState state={results} empty={!results.pending && !results.error && !roster.length} emptyTitle="No candidates are available" emptyBody={canViewCohorts ? 'The group has no current members and no earlier result records.' : 'No result records are currently available.'}>{!results.pending && !results.error && roster.length ? <form className="fw-form" onSubmit={saveResults}><div className="fw-table-wrap"><table><caption>Exam result entry</caption><thead><tr><th>Student</th><th>Recorded score</th><th>Score</th><th>Note</th><th>Last updated</th></tr></thead><tbody>{roster.map((row) => {
      const key = String(row.student);
      const draft = drafts[key] || {};
      const recordedScore = validExamScore(row.result?.score, exam.data.max_score);
      const score = Object.prototype.hasOwnProperty.call(draft, 'score') ? draft.score : recordedScore == null ? '' : String(row.result.score);
      const note = Object.prototype.hasOwnProperty.call(draft, 'note') ? draft.note : row.result?.note || '';
      return <tr key={key}><td><span className="fw-person-cell"><strong>{row.student_name || 'Student'}</strong><small>{row.current ? 'Current group member' : 'Earlier result record'}</small></span></td><td>{recordedScore == null ? '—' : formatBusinessNumber(recordedScore, { maximumFractionDigits: 2 })}</td><td><input aria-label={`Score for ${row.student_name || 'student'}`} type="number" inputMode="decimal" min="0" max={exam.data.max_score} step="0.01" disabled={exam.data.is_published || exam.data.requires_republish || mutation.isPending} value={score} onChange={(event) => setDraft(key, 'score', event.target.value)} /></td><td><input aria-label={`Note for ${row.student_name || 'student'}`} maxLength="255" disabled={exam.data.is_published || exam.data.requires_republish || mutation.isPending} value={note} onChange={(event) => setDraft(key, 'note', event.target.value)} /></td><td>{formatOrganizationDate(row.result?.graded_at) || '—'}</td></tr>;
    })}</tbody></table></div>{!exam.data.is_published && !exam.data.requires_republish && <div className="fw-form-actions"><ActionButton type="submit" tone="primary" disabled={!changedCount || mutation.isPending}>{mutation.isPending ? 'Saving…' : `Save ${formatBusinessNumber(changedCount)} changed row${changedCount === 1 ? '' : 's'}`}</ActionButton></div>}</form> : null}</WorkspaceState>
  </>}</WorkspaceState></div>;
}

function downloadResultsTemplate() {
  const blob = new Blob(['student_id,score,note\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'exam-results-template.csv';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function ExamResultsImport({ id, onNav, branchId }) {
  const exam = useWorkspaceData(`/api/v1/academics/exams/${id}/`);
  const branchScope = useBranchExamScope(exam, branchId);
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [importError, setImportError] = useState(null);
  const [summary, setSummary] = useState(null);
  const toast = useToast();
  const recordPath = examRecordPath(branchId, id);
  const mutation = useMutation({
    mutationFn: (upload) => {
      const body = new FormData();
      body.append('file', upload);
      return httpRequest('POST', `/api/v1/academics/exams/${id}/results/import-csv/`, { body });
    },
    onSuccess: (result) => {
      setImportError(null);
      setSummary(result);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success('The result file passed validation and was imported.', { title: 'Import complete' });
    },
    onError: (failure) => {
      setSummary(null);
      setImportError(failure);
      toast.danger(mutationMessage(failure, 'The results could not be imported.'), { title: 'Import not completed' });
    },
  });
  const submit = (event) => {
    event.preventDefault();
    setImportError(null);
    setSummary(null);
    if (!file) {
      const message = 'Choose a CSV file before importing.';
      setImportError({ safeMessage: message });
      toast.warning(message, { title: 'Choose a file' });
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      const message = 'Choose a file with a .csv extension.';
      setImportError({ safeMessage: message });
      toast.warning(message, { title: 'Unsupported file' });
      return;
    }
    if (!file.size) {
      const message = 'The selected CSV file is empty.';
      setImportError({ safeMessage: message });
      toast.warning(message, { title: 'Empty file' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      const message = 'Choose a CSV file no larger than 2 MB.';
      setImportError({ safeMessage: message });
      toast.warning(message, { title: 'File is too large' });
      return;
    }
    mutation.mutate(file);
  };
  const errorLines = readableValidationDetails(importError);
  if (branchScope.required && (branchScope.pending || !branchScope.allowed)) return <div className="fw-page"><WorkspaceHeader eyebrow="Branch assessment" title="Import verification" description="Confirming the selected branch before any score file can be processed." /><BranchExamBoundary scope={branchScope} branchId={branchId} onNav={onNav} /></div>;
  return <div className="fw-page"><WorkspaceState state={exam} empty={!exam.data} emptyTitle="Exam not found" emptyBody="This assessment may be outside your current responsibilities.">{exam.data && <><WorkspaceHeader eyebrow="Result import" title={exam.data.title} description={`Import scores for ${exam.data.cohort_name || 'this group'} from a validated, all-or-nothing CSV file.`} actions={<><LinkButton to={`${recordPath}/results`} onNav={onNav}>Review results</LinkButton><LinkButton to={recordPath} onNav={onNav}>Back to exam</LinkButton></>} />
    {(exam.data.is_published || exam.data.requires_republish) ? <div className="fw-safety-block">{exam.data.requires_republish ? 'Imports remain held while this correction awaits republish.' : 'Imports are held after publication. Use the explicit correction workflow so released outcomes are never silently overwritten.'} Existing results remain available for review.</div> : <form className="fw-form" onSubmit={submit}>
      {importError && <div className="fw-form-error" role="alert"><strong>{mutationMessage(importError, 'The results could not be imported.')}</strong>{errorLines.length ? <ul>{errorLines.map((line) => <li key={line}>{line}</li>)}</ul> : null}</div>}
      {summary && <div className="fw-form-success">Import complete: {formatBusinessNumber(summary.created)} new and {formatBusinessNumber(summary.updated)} updated result records.</div>}
      <section className="fw-form-section"><header><h2>CSV file</h2><p>Use UTF-8 CSV with the required student_id and score columns. note is optional. Student IDs are the public codes shown in the student directory.</p></header>
        <label className="is-wide">Results file<input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
        <div className="fw-data-note">Up to 5,000 rows can be processed. Any unknown student, duplicate student, invalid score, or out-of-group student rejects the entire file, so partial imports cannot occur.</div>
      </section>
      <div className="fw-form-actions"><ActionButton onClick={downloadResultsTemplate}>Download template</ActionButton><ActionButton type="submit" tone="primary" disabled={!file || mutation.isPending}>{mutation.isPending ? 'Importing…' : 'Validate and import'}</ActionButton></div>
    </form>}
  </>}</WorkspaceState></div>;
}

function DefinitionEditor({ kind, id, onNav, branchId }) {
  const subject = kind === 'subjects';
  const api = subject ? '/api/v1/academics/subjects/' : '/api/v1/academics/exam-types/';
  const label = subject ? 'Subject' : 'Exam type';
  const listPath = `${branchId ? `branches/${branchId}/exams` : 'exams'}/${kind}`;
  const record = useWorkspaceData(id ? `${api}${id}/` : null, undefined, { enabled: Boolean(id) });
  const departments = useWorkspaceData('/api/v1/org/departments/', { page_size: 100 }, { enabled: subject });
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const toast = useToast();
  const source = form || record.data || (subject ? { name: '', code: '', description: '', department: '', is_active: true } : { name: '', slug: '', color: '#5f7d4d', is_active: true });
  const change = (key, value) => setForm((current) => ({ ...(current || source), [key]: value }));
  const mutation = useMutation({ mutationFn: () => httpRequest(id ? 'PATCH' : 'POST', id ? `${api}${id}/` : api, { body: subject ? { name: source.name, code: source.code, description: source.description || '', department: source.department ? Number(source.department) : null, is_active: Boolean(source.is_active) } : { name: source.name, slug: source.slug || undefined, color: source.color || '', is_active: Boolean(source.is_active) } }), onSuccess: () => { setError(''); queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success(`${label} saved.`, { title: 'Academic catalogue updated' }); onNav(listPath); }, onError: (failure) => { const message = mutationMessage(failure, `${label} could not be saved.`); setError(message); toast.danger(message, { title: `${label} not saved` }); } });
  if (id && (record.pending || record.error || !record.data)) return <div className="fw-page"><WorkspaceHeader eyebrow="Academic configuration" title={`Edit ${label.toLowerCase()}`} description="Preparing the existing definition before edit controls are opened." actions={<LinkButton to={listPath} onNav={onNav}>Cancel</LinkButton>} /><WorkspaceState state={record} empty={!record.pending && !record.error && !record.data} emptyTitle={`${label} not found`} emptyBody="This definition may have been removed or may be outside your current responsibilities." /></div>;
  return <div className="fw-page"><WorkspaceHeader eyebrow="Academic configuration" title={`${id ? 'Edit' : 'Add'} ${label.toLowerCase()}`} description={`Manage this ${label.toLowerCase()} as a dedicated record.`} actions={<LinkButton to={listPath} onNav={onNav}>Cancel</LinkButton>} /><form className="fw-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>{error && <div className="fw-form-error" role="alert">{error}</div>}<section className="fw-form-section"><header><h2>{label} information</h2></header>
    <label>Name<input required maxLength={subject ? 200 : 64} value={source.name || ''} onChange={(event) => change('name', event.target.value)} /></label>
    {subject ? <><label>Code<input required maxLength="50" pattern="[-a-zA-Z0-9_]+" value={source.code || ''} onChange={(event) => change('code', event.target.value)} /></label><label>Department<select value={source.department || ''} onChange={(event) => change('department', event.target.value)}><option value="">Organization-wide</option><UnloadedSelectionOption value={source.department} options={departments.rows} label="department" />{departments.rows.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="is-wide">Description<textarea maxLength="2000" value={source.description || ''} onChange={(event) => change('description', event.target.value)} /></label></> : <><label>Slug<input maxLength="64" pattern="[-a-zA-Z0-9_]+" value={source.slug || ''} onChange={(event) => change('slug', event.target.value)} /></label><label>Color<input type="color" value={source.color || '#5f7d4d'} onChange={(event) => change('color', event.target.value)} /></label></>}
    <label>Status<select value={source.is_active ? 'active' : 'inactive'} onChange={(event) => change('is_active', event.target.value === 'active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
  </section><div className="fw-form-actions"><ActionButton type="submit" tone="primary" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : `Save ${label.toLowerCase()}`}</ActionButton></div></form></div>;
}

function DefinitionList({ kind, onNav, canManageCatalogue, branchId }) {
  const subject = kind === 'subjects';
  const api = subject ? '/api/v1/academics/subjects/' : '/api/v1/academics/exam-types/';
  const label = subject ? 'Subject' : 'Exam type';
  const state = useWorkspaceData(api, { page_size: 100 });
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const toast = useToast();
  const base = `${branchId ? `branches/${branchId}/exams` : 'exams'}/${kind}`;
  const remove = useMutation({ mutationFn: (id) => httpRequest('DELETE', `${api}${id}/`), onSuccess: () => { setPendingRemoval(null); queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success(`${subject ? 'Subject' : 'Exam type'} removed.`); }, onError: (failure) => { setPendingRemoval(null); toast.danger(mutationMessage(failure, `This ${label.toLowerCase()} could not be removed.`)); } });
  const rowActions = (row) => <span className="fw-row-actions"><LinkButton to={`${base}/${row.id}/edit`} onNav={onNav}>Edit</LinkButton>{String(pendingRemoval) === String(row.id) ? <><ActionButton tone="ghost" disabled={remove.isPending} onClick={() => setPendingRemoval(null)}>Cancel</ActionButton><ActionButton tone="danger" disabled={remove.isPending} onClick={() => remove.mutate(row.id)} aria-label={`Confirm removal of ${row.name}`}>{remove.isPending ? 'Removing…' : 'Confirm remove'}</ActionButton></> : <ActionButton tone="danger" disabled={remove.isPending} onClick={() => setPendingRemoval(row.id)} aria-label={`Remove ${row.name}`}>Remove</ActionButton>}</span>;
  return <><div className="fw-inline-actions">{canManageCatalogue && <LinkButton to={`${base}/new`} onNav={onNav} tone="primary" icon={Icons.doc}>Add {subject ? 'subject' : 'exam type'}</LinkButton>}</div><CoverageBar state={state} label={subject ? 'subjects' : 'exam types'} /><WorkspaceState state={state} empty={!state.rows.length}><WorkspaceTable label={subject ? 'Subjects' : 'Exam types'} rows={state.rows} columns={subject ? [
    { key: 'code', label: 'Code' }, { key: 'name', label: 'Subject' }, { key: 'department', label: 'Department reference' },
    { key: 'description', label: 'Description' }, { key: 'is_active', label: 'Status', render: (row) => <StatusPill value={row.is_active ? 'Active' : 'Inactive'} /> },
    ...(canManageCatalogue ? [{ key: 'actions', label: 'Actions', render: rowActions }] : []),
  ] : [
    { key: 'name', label: 'Exam type' }, { key: 'slug', label: 'Slug' }, { key: 'color', label: 'Color', render: (row) => <span className="fw-color"><i style={{ background: row.color }} />{row.color || '\u2014'}</span> },
    { key: 'is_active', label: 'Status', render: (row) => <StatusPill value={row.is_active ? 'Active' : 'Inactive'} /> },
    ...(canManageCatalogue ? [{ key: 'actions', label: 'Actions', render: rowActions }] : []),
  ]} /></WorkspaceState></>;
}

function SimpleAcademicList({ kind }) {
  const grades = kind === 'grades';
  const state = useWorkspaceData(grades ? '/api/v1/academics/grades/' : '/api/v1/academics/transcripts/', { page_size: 100 });
  return <><CoverageBar state={state} label={kind} /><WorkspaceState state={state} empty={!state.rows.length}><WorkspaceTable label={kind} rows={state.rows} columns={grades ? [
    { key: 'student_name', label: 'Student' }, { key: 'subject_name', label: 'Subject' }, { key: 'value_display', label: 'Grade' },
    { key: 'is_published', label: 'Published', render: (row) => <StatusPill value={row.is_published ? 'Published' : 'Draft'} /> }, { key: 'computed_at', label: 'Computed', render: (row) => formatOrganizationDate(row.computed_at) },
  ] : [
    { key: 'student', label: 'Student reference' }, { key: 'term', label: 'Term reference' }, { key: 'status', label: 'Status', render: (row) => <StatusPill value={row.status} /> },
    { key: 'generated_at', label: 'Generated', render: (row) => formatOrganizationDate(row.generated_at) }, { key: 'created_at', label: 'Requested', render: (row) => formatOrganizationDate(row.created_at) },
  ]} /></WorkspaceState></>;
}

export function ExamsPage({ route, onNav, user, branchId }) {
  const routed = workspaceRoute(route);
  const relative = branchId ? routed.segments.slice(3) : routed.segments.slice(1);
  const canWrite = canUseCapability(user, 'academics:write');
  const canManageCatalogue = canUseCapability(user, 'academics:catalogue');
  const canViewCohorts = canUseCapability(user, 'cohorts:read');
  if (relative[0] === 'exams' && relative[1] === 'new' && canWrite) return <ExamEditor onNav={onNav} branchId={branchId} />;
  const examId = relative[0] === 'exams' ? pathId(relative[1]) : null;
  if (examId && relative[2] === 'edit' && canWrite) return <ExamEditor id={examId} onNav={onNav} branchId={branchId} />;
  if (examId && relative[2] === 'correct' && canWrite) return <ExamCorrection id={examId} onNav={onNav} branchId={branchId} />;
  if (examId && relative[2] === 'results' && canWrite) return <ExamResults id={examId} onNav={onNav} branchId={branchId} canViewCohorts={canViewCohorts} />;
  if (examId && relative[2] === 'import' && canWrite) return <ExamResultsImport id={examId} onNav={onNav} branchId={branchId} />;
  if (examId) return <div className="fw-page"><ExamDetail id={examId} onNav={onNav} canWrite={canWrite} branchId={branchId} /></div>;
  if (!branchId && canManageCatalogue && ['subjects', 'types'].includes(relative[0]) && (relative[1] === 'new' || (pathId(relative[1]) && relative[2] === 'edit'))) return <DefinitionEditor kind={relative[0]} id={pathId(relative[1])} onNav={onNav} branchId={branchId} />;
  const availableSections = branchId ? new Set(['overview', 'exams']) : new Set(SECTIONS.map((item) => item.id));
  const section = availableSections.has(relative[0]) ? relative[0] : 'overview';
  const base = branchId ? `branches/${branchId}/exams` : 'exams';
  return <div className="fw-page fa5-workspace">{!branchId && <WorkspaceHeader eyebrow="Learning outcomes" title="Exams" description="Plan assessment dates, see what is ready to publish, review outcomes, and keep the academic catalogue connected to every exam." actions={section === 'overview' && canWrite && <LinkButton to={`${examDirectoryPath(branchId)}/new`} onNav={onNav} tone="primary" icon={Icons.plus}>Create exam</LinkButton>} />}<WorkspaceLayout navigation={!branchId ? <SectionNav label="Exams" items={SECTIONS} active={section} basePath={base} onNav={onNav} /> : null}>
    {section === 'overview' && <ExamsOverview onNav={onNav} branchId={branchId} />}
    {section === 'exams' && <ExamList route={route} onNav={onNav} canWrite={canWrite} branchId={branchId} />}
    {section === 'subjects' && <DefinitionList kind="subjects" onNav={onNav} canManageCatalogue={canManageCatalogue} branchId={branchId} />}
    {section === 'types' && <DefinitionList kind="types" onNav={onNav} canManageCatalogue={canManageCatalogue} branchId={branchId} />}
    {section === 'grades' && <SimpleAcademicList kind="grades" />}
    {section === 'transcripts' && <SimpleAcademicList kind="transcripts" />}
  </WorkspaceLayout></div>;
}
