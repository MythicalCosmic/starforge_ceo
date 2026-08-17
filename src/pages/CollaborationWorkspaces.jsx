import { cloneElement, useEffect, useMemo, useState } from 'react';
import { httpRequest } from '../api/http.js';
import { Icons } from '../components/Icons.jsx';
import { SfAvatar } from '../components/primitives.jsx';
import {
  ActionButton,
  StatusPill,
  WorkspaceHeader,
  WorkspaceState,
} from '../components/WorkspacePrimitives.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useWorkspaceData, workspaceRoute } from '../hooks/useWorkspaceData.js';
import { canUseCapability } from '../lib/permissions.js';
import { userFacingError } from '../lib/userFacingError.js';
import '../styles/collaboration-v1.css';
import '../styles/focused-v3.css';

const TASK_COLUMNS = Object.freeze([
  { id: 'open', label: 'To do', tone: 'neutral' },
  { id: 'in_progress', label: 'In progress', tone: 'warn' },
  { id: 'blocked', label: 'Needs attention', tone: 'danger' },
  { id: 'done', label: 'Done', tone: 'success' },
]);

const TASK_TARGET_MODES = Object.freeze([
  { id: 'self', label: 'Myself', note: 'Keep this in my own worklist', icon: Icons.user },
  { id: 'people', label: 'People', note: 'Choose one or several owners', icon: Icons.cohort },
  { id: 'departments', label: 'Departments', note: 'Create shared department work', icon: Icons.folder },
  { id: 'branches', label: 'Branches', note: 'Create work for selected branches', icon: Icons.globe },
  { id: 'organization', label: 'Everyone', note: 'Assign a copy to every available staff member', icon: Icons.brand },
]);

const FIELD_TYPES = Object.freeze([
  ['text', 'Short answer'],
  ['textarea', 'Long answer'],
  ['number', 'Number'],
  ['boolean', 'Yes / no'],
  ['single_choice', 'Single choice'],
  ['multi_choice', 'Multiple choice'],
  ['rating', 'Rating (1–5)'],
  ['date', 'Date'],
]);

const AUDIENCE_ROLES = Object.freeze([
  ['student', 'Students'],
  ['teacher', 'Teachers'],
  ['parent', 'Parents'],
  ['head_of_dept', 'Department heads'],
  ['registrar', 'Reception and enrollment'],
  ['accountant', 'Accountants'],
  ['cashier', 'Cashiers'],
  ['librarian', 'Librarians'],
  ['support', 'Support staff'],
]);

function rowsOf(state) {
  return Array.isArray(state?.rows) ? state.rows : [];
}

function displayName(value, fallback = 'Team member') {
  const full = String(value?.full_name || value?.display_name || '').trim();
  if (full) return full;
  const composed = [value?.first_name, value?.middle_name, value?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  return composed || value?.username || fallback;
}

function dateTime(value, fallback = 'No deadline') {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function dateOnly(value, fallback = 'No deadline') {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: parsed.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(parsed);
}

function taskPrincipalMatches(principal, user) {
  return Boolean(principal && user &&
    String(principal.kind) === String(user.principal_kind) &&
    String(principal.id) === String(user.id));
}

function taskIsMine(task, user) {
  if (taskPrincipalMatches(task?.assignee_principal, user)) return true;
  return !task?.assignee_principal && Boolean(task?.assignee_name) &&
    task.assignee_name.trim().toLowerCase() === displayName(user).trim().toLowerCase();
}

function taskWasCreatedByMe(task, user) {
  if (taskPrincipalMatches(task?.created_by, user)) return true;
  return !task?.created_by && Boolean(task?.created_by_name) &&
    task.created_by_name.trim().toLowerCase() === displayName(user).trim().toLowerCase();
}

function taskIsFinished(task) {
  return ['done', 'cancelled'].includes(task?.status);
}

function taskIsOverdue(task) {
  const due = task?.due_at ? new Date(task.due_at) : null;
  return Boolean(!taskIsFinished(task) && due && !Number.isNaN(due.getTime()) && due.getTime() < Date.now());
}

function taskDuePresentation(task) {
  if (!task?.due_at) return { label: 'No deadline', tone: 'neutral' };
  if (taskIsFinished(task)) return { label: dateOnly(task.due_at), tone: 'neutral' };
  const due = new Date(task.due_at);
  if (Number.isNaN(due.getTime())) return { label: 'No deadline', tone: 'neutral' };
  const remaining = due.getTime() - Date.now();
  if (remaining < 0) return { label: `Overdue · ${dateOnly(task.due_at)}`, tone: 'danger' };
  if (remaining < 72 * 60 * 60 * 1000) return { label: `Due soon · ${dateOnly(task.due_at)}`, tone: 'warn' };
  return { label: dateOnly(task.due_at), tone: 'neutral' };
}

function taskScopeLabel(task) {
  return [task?.branch_name, task?.department_name].filter(Boolean).join(' · ') ||
    (task?.assignee_name ? 'Individual task' : 'Organization-wide');
}

function taskOwnerLabel(task) {
  return task?.assignee_name || task?.department_name || task?.branch_name || 'Shared worklist';
}

function taskCreatorLabel(task) {
  return task?.created_by_name || task?.created_by?.display_name || 'Not recorded';
}

function personScope(person) {
  const membership = (person?.role_memberships || person?.account_type_assignments || [])
    .find((item) => item?.branch || item?.department) || {};
  return {
    branch: person?.branch ?? membership.branch ?? null,
    department: person?.department ?? membership.department ?? null,
  };
}

function Modal({ open, title, subtitle, onClose, children, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);
  if (!open) return null;
  return (
    <div className="collab-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section className={`collab-modal${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="collab-modal-title">
        <header>
          <div><span>StarForge workspace</span><h2 id="collab-modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button type="button" onClick={onClose} aria-label="Close">{cloneElement(Icons.x, { size: 17 })}</button>
        </header>
        {children}
      </section>
    </div>
  );
}

function stateSummary(states) {
  const errorState = states.find((state) => state.error && !state.rows?.length);
  const pending = states.some((state) => state.pending);
  return {
    pending,
    error: errorState?.error || null,
    rows: states.flatMap((state) => state.rows || []),
    data: pending ? null : {},
    retry: () => Promise.all(states.map((state) => state.retry?.())),
  };
}

function targetPeople(staff, teachers) {
  const people = [
    ...staff.map((person) => ({ ...person, principalKind: 'staff' })),
    ...teachers.map((person) => ({ ...person, principalKind: 'teacher' })),
  ].filter((person) => person.is_active !== false);
  const deduped = new Map();
  people.forEach((person) => deduped.set(`${person.principalKind}:${person.id}`, person));
  return [...deduped.values()];
}

function TaskComposer({ open, onClose, user, staff, teachers, departments, branches, onSaved }) {
  const toast = useToast();
  const [draft, setDraft] = useState({
    title: '', description: '', priority: 'normal', dueAt: '', targetMode: 'self', targets: [],
  });
  const [audienceQuery, setAudienceQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => targetPeople(staff, teachers), [staff, teachers]);
  const audienceOptions = useMemo(() => {
    if (draft.targetMode === 'people') return people.map((person) => ({
      key: `${person.principalKind}:${person.id}`,
      label: displayName(person),
      note: [
        person.account_type_name || (person.principalKind === 'teacher' ? 'Teacher' : 'Staff'),
        person.department_name,
        person.branch_name,
      ].filter(Boolean).join(' · '),
    }));
    if (draft.targetMode === 'departments') return departments.map((department) => ({
      key: String(department.id),
      label: department.name,
      note: department.branch_name || 'Department worklist',
    }));
    if (draft.targetMode === 'branches') return branches.map((branch) => ({
      key: String(branch.id),
      label: branch.name,
      note: 'Branch worklist',
    }));
    return [];
  }, [branches, departments, draft.targetMode, people]);
  const visibleAudienceOptions = audienceOptions.filter((option) =>
    `${option.label} ${option.note}`.toLowerCase().includes(audienceQuery.trim().toLowerCase()));

  const toggleAudience = (key) => setDraft((current) => ({
    ...current,
    targets: current.targets.includes(key)
      ? current.targets.filter((item) => item !== key)
      : [...current.targets, key],
  }));

  const selectTargetMode = (targetMode) => {
    setAudienceQuery('');
    setDraft((current) => ({ ...current, targetMode, targets: [] }));
  };

  const resolveTargets = () => {
    const targets = new Map();
    const addPerson = (person) => {
      const scope = personScope(person);
      targets.set(`${person.principalKind}:${person.id}`, {
        assignee_principal: { kind: person.principalKind, id: Number(person.id) },
        ...(scope.branch ? { branch: Number(scope.branch) } : {}),
        ...(scope.department ? { department: Number(scope.department) } : {}),
      });
    };
    if (draft.targetMode === 'self') {
      const scope = personScope(user);
      targets.set(`${user.principal_kind}:${user.id}`, {
        assignee_principal: { kind: user.principal_kind, id: Number(user.id) },
        ...(scope.branch ? { branch: Number(scope.branch) } : {}),
        ...(scope.department ? { department: Number(scope.department) } : {}),
      });
    } else if (draft.targetMode === 'organization') {
      people.forEach(addPerson);
    } else if (draft.targetMode === 'people') {
      draft.targets.forEach((key) => {
        const person = people.find((candidate) => `${candidate.principalKind}:${candidate.id}` === key);
        if (person) addPerson(person);
      });
    } else if (draft.targetMode === 'departments') {
      draft.targets.forEach((key) => {
        const department = departments.find((candidate) => String(candidate.id) === key);
        if (department) targets.set(`department:${key}`, {
          department: Number(department.id),
          ...(department.branch ? { branch: Number(department.branch) } : {}),
        });
      });
    } else if (draft.targetMode === 'branches') {
      draft.targets.forEach((key) => targets.set(`branch:${key}`, { branch: Number(key) }));
    }
    return [...targets.values()];
  };

  const selectedCount = draft.targetMode === 'self'
    ? 1
    : draft.targetMode === 'organization'
      ? people.length
      : draft.targets.length;

  const submit = async (event) => {
    event.preventDefault();
    const title = draft.title.trim();
    const targets = resolveTargets();
    if (!title || !targets.length) return;
    setBusy(true);
    try {
      const common = {
        title,
        description: draft.description.trim(),
        priority: draft.priority,
        due_at: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
      };
      for (let index = 0; index < targets.length; index += 12) {
        await Promise.all(targets.slice(index, index + 12).map((target) =>
          httpRequest('POST', '/api/v1/tasks/', { body: { ...common, ...target } })));
      }
      toast.success(targets.length === 1 ? 'Task created.' : `${targets.length} coordinated tasks created.`);
      setDraft({ title: '', description: '', priority: 'normal', dueAt: '', targetMode: 'self', targets: [] });
      setAudienceQuery('');
      onSaved?.();
      onClose?.();
    } catch (error) {
      toast.danger(userFacingError(error, { fallback: 'The task could not be created.' }));
    } finally {
      setBusy(false);
    }
  };

  return <Modal open={open} onClose={onClose} title="Create task" subtitle="Set one clear outcome, then choose exactly who owns it. Multiple people receive individual trackable tasks." wide>
    <form className="collab-composer" onSubmit={submit}>
      <div className="collab-form-grid">
        <label className="is-wide"><span>Task title</span><input autoFocus required maxLength="200" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What needs to be completed?" /></label>
        <label className="is-wide"><span>Notes</span><textarea rows="4" maxLength="20000" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Add context, a checklist, links, or the expected result…" /></label>
        <label><span>Priority</span><select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        <label><span>Deadline</span><input type="datetime-local" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label>
      </div>
      <section className="collab-targets">
        <header><div><span>Ownership</span><strong>Who should receive this task?</strong></div><b>{selectedCount} {selectedCount === 1 ? 'task' : 'tasks'}</b></header>
        <div className="collab-target-modes">{TASK_TARGET_MODES.map((mode) => <button type="button" key={mode.id} className={draft.targetMode === mode.id ? 'is-selected' : ''} onClick={() => selectTargetMode(mode.id)}><span>{cloneElement(mode.icon, { size: 16 })}</span><strong>{mode.label}</strong><small>{mode.id === 'organization' ? `${people.length} available people` : mode.note}</small></button>)}</div>
        {draft.targetMode === 'self' && <div className="collab-target-summary"><SfAvatar name={displayName(user, 'My account')} size={38} decorative /><span><strong>{displayName(user, 'My account')}</strong><small>This task will stay in your personal worklist.</small></span>{cloneElement(Icons.check, { size: 18 })}</div>}
        {draft.targetMode === 'organization' && <div className="collab-target-summary"><span className="collab-target-summary-icon">{cloneElement(Icons.globe, { size: 19 })}</span><span><strong>Every available staff member</strong><small>A separate, individually trackable task will be created for each of {people.length} people.</small></span>{cloneElement(Icons.check, { size: 18 })}</div>}
        {audienceOptions.length > 0 && <div className="collab-audience-picker is-embedded">
          <label className="collab-audience-search"><span aria-hidden="true">{cloneElement(Icons.search, { size: 14 })}</span><input value={audienceQuery} onChange={(event) => setAudienceQuery(event.target.value)} placeholder={`Find ${draft.targetMode}`} /></label>
          <div>{visibleAudienceOptions.map((option) => <label key={option.key} className={draft.targets.includes(option.key) ? 'is-selected' : ''}><input type="checkbox" checked={draft.targets.includes(option.key)} onChange={() => toggleAudience(option.key)} /><span><strong>{option.label}</strong><small>{option.note}</small></span></label>)}</div>
        </div>}
      </section>
      <footer><span className="collab-submit-note">{selectedCount ? `${selectedCount} ${selectedCount === 1 ? 'task' : 'tasks'} will be created` : 'Choose at least one owner'}</span><ActionButton onClick={onClose}>Cancel</ActionButton><ActionButton type="submit" tone="primary" disabled={busy || !draft.title.trim() || !selectedCount} icon={Icons.plus}>{busy ? 'Creating…' : selectedCount > 1 ? `Create ${selectedCount} tasks` : 'Create task'}</ActionButton></footer>
    </form>
  </Modal>;
}

function TaskDetail({ task, open, onClose, onTransition, canTransition, moving }) {
  if (!task) return null;
  const due = taskDuePresentation(task);
  const actions = [
    ...TASK_COLUMNS,
    { id: 'cancelled', label: 'Cancel task', tone: 'danger' },
  ];
  return <Modal open={open} onClose={onClose} title={task.title} subtitle="Everything needed to understand ownership, timing, and progress." wide>
    <div className="task-detail">
      <header>
        <div><StatusPill value={task.priority} tone={task.priority === 'urgent' ? 'danger' : task.priority === 'high' ? 'warn' : 'neutral'} /><StatusPill value={task.status} /></div>
        <span className={`task-due is-${due.tone}`}>{cloneElement(Icons.cal, { size: 14 })}{due.label}</span>
      </header>
      <section className="task-detail-people">
        <article><SfAvatar name={taskOwnerLabel(task)} size={40} decorative /><span><small>Owner</small><strong>{taskOwnerLabel(task)}</strong><em>{taskScopeLabel(task)}</em></span></article>
        <article><span className="task-detail-icon">{cloneElement(Icons.user, { size: 18 })}</span><span><small>Created by</small><strong>{taskCreatorLabel(task)}</strong><em>{dateTime(task.created_at, 'Date not recorded')}</em></span></article>
      </section>
      <section className="task-detail-notes"><span>Task notes</span><p>{task.description || 'No additional notes were added to this task.'}</p></section>
      {canTransition && <section className="task-detail-progress"><header><span>Progress</span><strong>Update the task directly</strong></header><div>{actions.map((action) => <button type="button" key={action.id} className={`is-${action.tone}${task.status === action.id ? ' is-current' : ''}`} disabled={moving || task.status === action.id} onClick={() => onTransition(task, action.id)}><i />{action.label}{task.status === action.id && cloneElement(Icons.check, { size: 14 })}</button>)}</div></section>}
    </div>
  </Modal>;
}

export function TasksPage({ user }) {
  const toast = useToast();
  const tasks = useWorkspaceData('/api/v1/tasks/', { page_size: 100 }, { refreshMs: 20_000 });
  const canWrite = canUseCapability(user, 'tasks:write');
  const staff = useWorkspaceData('/api/v1/org/staff/', { page_size: 100 }, { enabled: canWrite && canUseCapability(user, 'users:read') });
  const teachers = useWorkspaceData('/api/v1/teachers/', { page_size: 100 }, { enabled: canWrite && canUseCapability(user, 'teachers:read') });
  const departments = useWorkspaceData('/api/v1/org/departments/', { page_size: 100 }, { enabled: canWrite && canUseCapability(user, 'org:read') });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100 }, { enabled: canWrite && canUseCapability(user, 'org:read') });
  const [view, setView] = useState('board');
  const [perspective, setPerspective] = useState('all');
  const [scope, setScope] = useState('active');
  const [query, setQuery] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [moving, setMoving] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [statusOverrides, setStatusOverrides] = useState({});
  const taskRows = rowsOf(tasks);
  const effectiveTasks = taskRows.map((task) => statusOverrides[String(task.id)]
    ? { ...task, status: statusOverrides[String(task.id)] }
    : task);
  useEffect(() => {
    setStatusOverrides((current) => {
      const next = { ...current };
      let changed = false;
      taskRows.forEach((task) => {
        const id = String(task.id);
        if (next[id] && next[id] === task.status) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [taskRows]);
  const normalizedQuery = query.trim().toLowerCase();
  const visible = effectiveTasks.filter((task) => {
    if (perspective === 'mine' && !taskIsMine(task, user)) return false;
    if (perspective === 'created' && !taskWasCreatedByMe(task, user)) return false;
    if (perspective === 'shared' && (task.assignee_principal || task.assignee_name)) return false;
    if (scope === 'active' && taskIsFinished(task)) return false;
    if (scope === 'overdue' && !taskIsOverdue(task)) return false;
    if (scope === 'done' && task.status !== 'done') return false;
    if (normalizedQuery && ![
      task.title,
      task.description,
      taskOwnerLabel(task),
      taskCreatorLabel(task),
      taskScopeLabel(task),
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery))) return false;
    return true;
  }).sort((left, right) => {
    const overdueDifference = Number(taskIsOverdue(right)) - Number(taskIsOverdue(left));
    if (overdueDifference) return overdueDifference;
    const leftDue = left.due_at ? new Date(left.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    const rightDue = right.due_at ? new Date(right.due_at).getTime() : Number.MAX_SAFE_INTEGER;
    return leftDue - rightDue;
  });
  const metrics = {
    active: effectiveTasks.filter((task) => !taskIsFinished(task)).length,
    mine: effectiveTasks.filter((task) => taskIsMine(task, user) && !taskIsFinished(task)).length,
    overdue: effectiveTasks.filter(taskIsOverdue).length,
    blocked: effectiveTasks.filter((task) => task.status === 'blocked').length,
  };
  const canTransitionAny = canUseCapability(user, 'tasks:transition_any') || canUseCapability(user, 'tasks:assign_any');
  const canTransitionTask = (task) => canTransitionAny || taskIsMine(task, user);
  const transition = async (task, status) => {
    const id = String(task.id);
    setMoving(task.id);
    setStatusOverrides((current) => ({ ...current, [id]: status }));
    try {
      const updated = await httpRequest('POST', `/api/v1/tasks/${task.id}/transition/`, { body: { status } });
      setStatusOverrides((current) => ({ ...current, [id]: updated?.status || status }));
      await tasks.retry();
      toast.success('Task status updated.');
    } catch (error) {
      setStatusOverrides((current) => {
        const next = { ...current };
        if (current[id] === status) delete next[id];
        return next;
      });
      toast.danger(userFacingError(error, { fallback: 'The task could not be updated.' }));
    } finally {
      setMoving(null);
    }
  };
  const selectedTask = effectiveTasks.find((task) => String(task.id) === String(selectedTaskId)) || null;
  return <div className="fw-page collab-page">
    <WorkspaceHeader eyebrow="Execution workspace" title="Tasks" description="Plan your own work, assign clear ownership, and follow every commitment without mixing tasks with technical records." actions={<>{canWrite && <ActionButton tone="primary" icon={Icons.plus} onClick={() => setComposerOpen(true)}>Create task</ActionButton>}</>} />
    <section className="task-overview" aria-label="Task overview">
      <article><span>{cloneElement(Icons.check, { size: 17 })}</span><div><small>Active work</small><strong>{metrics.active}</strong><p>Open commitments in the loaded register</p></div></article>
      <article><span>{cloneElement(Icons.user, { size: 17 })}</span><div><small>Assigned to me</small><strong>{metrics.mine}</strong><p>Your current personal worklist</p></div></article>
      <article className={metrics.overdue ? 'is-danger' : ''}><span>{cloneElement(Icons.cal, { size: 17 })}</span><div><small>Overdue</small><strong>{metrics.overdue}</strong><p>Needs a decision or a new deadline</p></div></article>
      <article className={metrics.blocked ? 'is-warn' : ''}><span>{cloneElement(Icons.flag, { size: 17 })}</span><div><small>Blocked</small><strong>{metrics.blocked}</strong><p>Waiting for help or a dependency</p></div></article>
    </section>
    <section className="task-controls">
      <div className="task-perspectives"><span>Worklist</span><div>{[['all', 'All work'], ['mine', 'Assigned to me'], ['created', 'Created by me'], ['shared', 'Shared work']].map(([id, label]) => <button type="button" className={perspective === id ? 'is-active' : ''} onClick={() => setPerspective(id)} key={id}>{label}</button>)}</div></div>
      <label className="task-search"><span>{cloneElement(Icons.search, { size: 15 })}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, owners, or departments" /></label>
      <div className="collab-segments is-view"><button type="button" className={view === 'board' ? 'is-active' : ''} onClick={() => setView('board')}>Board</button><button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}>List</button></div>
      <div className="collab-segments task-state-filter">{[['active', 'Active'], ['overdue', 'Overdue'], ['done', 'Completed'], ['all', 'All states']].map(([id, label]) => <button type="button" className={scope === id ? 'is-active' : ''} onClick={() => setScope(id)} key={id}>{label}</button>)}</div>
    </section>
    <WorkspaceState state={tasks} empty={!visible.length} emptyTitle="No tasks in this view" emptyBody="Create a task or choose another filter.">
      {view === 'board' ? <div className="task-board">{TASK_COLUMNS.map((column) => {
        const columnTasks = visible.filter((task) => task.status === column.id || (column.id === 'done' && task.status === 'cancelled'));
        return <section className="task-column" key={column.id}><header><span><i className={`is-${column.tone}`} />{column.label}</span><b>{columnTasks.length}</b></header><div>{columnTasks.length ? columnTasks.map((task) => {
          const due = taskDuePresentation(task);
          const transitionAllowed = canTransitionTask(task);
          return <article className={`task-note is-${task.priority}${taskIsOverdue(task) ? ' is-overdue' : ''}`} key={task.id}>
            <header><StatusPill value={task.priority} tone={task.priority === 'urgent' ? 'danger' : task.priority === 'high' ? 'warn' : 'neutral'} /><span className={`task-due is-${due.tone}`}>{cloneElement(Icons.cal, { size: 12 })}{due.label}</span></header>
            <button type="button" className="task-note-open" onClick={() => setSelectedTaskId(task.id)}><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}</button>
            <div className="task-note-scope"><small>{taskScopeLabel(task)}</small><span>Created by {taskCreatorLabel(task)}</span></div>
            <footer><span><SfAvatar name={taskOwnerLabel(task)} size={26} decorative /><small>{taskOwnerLabel(task)}</small></span>{transitionAllowed ? <select aria-label={`Update ${task.title} status`} disabled={String(moving) === String(task.id)} value={task.status === 'cancelled' ? 'done' : task.status} onChange={(event) => transition(task, event.target.value)}>{TASK_COLUMNS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select> : <StatusPill value={task.status} />}</footer>
          </article>;
        }) : <div className="task-column-empty"><span>{cloneElement(Icons.check, { size: 16 })}</span><small>Nothing here</small></div>}</div></section>;
      })}</div> : <div className="task-list"><header><span aria-hidden="true" /><span>Task</span><span>Owner &amp; scope</span><span>Priority</span><span>Deadline</span><span>Status</span></header>{visible.map((task) => {
        const due = taskDuePresentation(task);
        return <article key={task.id}><button type="button" disabled={!canTransitionTask(task) || String(moving) === String(task.id)} className={task.status === 'done' ? 'is-complete' : ''} onClick={() => transition(task, task.status === 'done' ? 'open' : 'done')} aria-label={`Toggle ${task.title}`}>{task.status === 'done' && cloneElement(Icons.check, { size: 13 })}</button><button type="button" className="task-list-title" onClick={() => setSelectedTaskId(task.id)}><strong>{task.title}</strong><small>{task.description || `Created by ${taskCreatorLabel(task)}`}</small></button><div className="task-list-owner"><SfAvatar name={taskOwnerLabel(task)} size={25} decorative /><span><strong>{taskOwnerLabel(task)}</strong><small>{taskScopeLabel(task)}</small></span></div><StatusPill value={task.priority} /><time className={`is-${due.tone}`}>{due.label}</time><StatusPill value={task.status} /></article>;
      })}</div>}
    </WorkspaceState>
    <TaskComposer open={composerOpen} onClose={() => setComposerOpen(false)} user={user} staff={rowsOf(staff)} teachers={rowsOf(teachers)} departments={rowsOf(departments)} branches={rowsOf(branches)} onSaved={tasks.retry} />
    <TaskDetail task={selectedTask} open={Boolean(selectedTask)} onClose={() => setSelectedTaskId(null)} onTransition={transition} canTransition={selectedTask ? canTransitionTask(selectedTask) : false} moving={selectedTask ? String(moving) === String(selectedTask.id) : false} />
  </div>;
}

function contactName(contact) {
  return contact.display_name || contact.username || `Contact ${contact.user_id}`;
}

function threadPresentation(thread, contactByUser, selfUserId) {
  const participantIds = (thread.participants || []).map((participant) => participant.user).filter((id) => String(id) !== String(selfUserId));
  const people = participantIds.map((id) => contactByUser.get(String(id))).filter(Boolean);
  return {
    ...thread,
    participantIds,
    people,
    name: thread.subject || (people.length === 1 ? contactName(people[0]) : people.map(contactName).slice(0, 3).join(', ')) || `Conversation ${thread.id}`,
    subtitle: people.length > 1 ? `${people.length + 1} members` : people[0]?.role_label || 'Direct conversation',
  };
}

function ConversationComposer({ open, contacts, onClose, onCreated }) {
  const toast = useToast();
  const [selected, setSelected] = useState([]);
  const [subject, setSubject] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const filtered = contacts.filter((contact) => `${contactName(contact)} ${contact.role_label || ''}`.toLowerCase().includes(query.toLowerCase()));
  const submit = async (event) => {
    event.preventDefault();
    if (!selected.length) return;
    setBusy(true);
    try {
      const thread = await httpRequest('POST', '/api/v1/messaging/threads/', { body: {
        participant_ids: selected.map(Number),
        subject: (selected.length > 1 ? subject.trim() : '') || '',
        first_body: firstMessage.trim(),
      } });
      toast.success(selected.length > 1 ? 'Group conversation created.' : 'Conversation created.');
      setSelected([]); setSubject(''); setFirstMessage(''); setQuery('');
      onCreated?.(thread);
      onClose?.();
    } catch (error) {
      toast.danger(userFacingError(error, { fallback: 'The conversation could not be created.' }));
    } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title="New conversation" subtitle="Choose one person for a direct chat or several people for a group." wide><form className="chat-composer" onSubmit={submit}>
    <label className="chat-contact-search"><span>{cloneElement(Icons.search, { size: 15 })}</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students, teachers, or staff" /></label>
    <div className="chat-contact-picker">{filtered.map((contact) => <label key={contact.user_id} className={selected.includes(contact.user_id) ? 'is-selected' : ''}><input type="checkbox" checked={selected.includes(contact.user_id)} onChange={() => setSelected((current) => current.includes(contact.user_id) ? current.filter((id) => id !== contact.user_id) : [...current, contact.user_id])} /><SfAvatar name={contactName(contact)} size={34} decorative /><span><strong>{contactName(contact)}</strong><small>{contact.role_label || contact.category}</small></span></label>)}</div>
    {selected.length > 1 && <label className="chat-group-name"><span>Group name</span><input required maxLength="200" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Leadership team, Main Branch teachers…" /></label>}
    <label className="chat-group-name"><span>First message <small>(optional)</small></span><textarea rows="3" maxLength="10000" value={firstMessage} onChange={(event) => setFirstMessage(event.target.value)} placeholder="Start the conversation with context…" /></label>
    <footer><ActionButton onClick={onClose}>Cancel</ActionButton><ActionButton type="submit" tone="primary" icon={Icons.chat} disabled={busy || !selected.length || (selected.length > 1 && !subject.trim())}>{busy ? 'Creating…' : selected.length > 1 ? 'Create group' : 'Start chat'}</ActionButton></footer>
  </form></Modal>;
}

function ChatPane({ thread, selfUserId, onRefreshThreads, canWrite }) {
  const toast = useToast();
  const messages = useWorkspaceData(thread ? `/api/v1/messaging/threads/${thread.id}/messages/` : null, { page_size: 100 }, { enabled: Boolean(thread), refreshMs: 4_000 });
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [optimistic, setOptimistic] = useState([]);
  const [busy, setBusy] = useState(false);
  const persistedMessages = messages.rows;
  const visibleMessages = useMemo(() => {
    const persistedIds = new Set(persistedMessages.map((message) => String(message.id)));
    return [
      ...persistedMessages,
      ...optimistic.filter((message) => !persistedIds.has(String(message.id))),
    ];
  }, [persistedMessages, optimistic]);
  useEffect(() => {
    setOptimistic([]);
  }, [thread?.id]);
  useEffect(() => {
    if (!thread) return;
    void httpRequest('POST', `/api/v1/messaging/threads/${thread.id}/read/`, { body: {} }).then(onRefreshThreads).catch(() => {});
  }, [onRefreshThreads, thread]);
  const send = async (event) => {
    event.preventDefault();
    if (!text.trim() && !file) return;
    const draftText = text.trim();
    const draftFile = file;
    const clientId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setOptimistic((current) => [...current, {
      id: clientId,
      sender: selfUserId,
      body: draftText,
      attachments: draftFile ? [draftFile.name] : [],
      created_at: new Date().toISOString(),
      pending: true,
    }]);
    setText('');
    setFile(null);
    setBusy(true);
    try {
      const attachments = [];
      if (draftFile) {
        const grant = await httpRequest('POST', '/api/v1/messaging/attachments/upload-url/', { body: { filename: draftFile.name, size_bytes: draftFile.size, content_type: draftFile.type || 'application/octet-stream' } });
        const upload = new FormData();
        Object.entries(grant.fields || {}).forEach(([key, value]) => upload.append(key, String(value)));
        upload.append('file', draftFile);
        const response = await fetch(grant.url, { method: grant.method || 'POST', body: upload });
        if (!response.ok) throw new Error('upload_failed');
        attachments.push(grant.key);
      }
      const saved = await httpRequest('POST', `/api/v1/messaging/threads/${thread.id}/messages/`, { body: { body: draftText, attachments } });
      setOptimistic((current) => current.map((message) => message.id === clientId ? saved : message));
      await Promise.all([messages.retry(), onRefreshThreads?.()]);
    } catch (error) {
      setOptimistic((current) => current.filter((message) => message.id !== clientId));
      setText(draftText);
      setFile(draftFile);
      toast.danger(error?.message === 'upload_failed' ? 'The attachment could not be uploaded.' : userFacingError(error, { fallback: 'The message could not be sent.' }));
    } finally { setBusy(false); }
  };
  return <section className="chat-pane">
    <header><SfAvatar name={thread.name} size={40} decorative /><div><h2>{thread.name}</h2><p>{thread.subtitle}</p></div><span>{thread.notifications_muted ? 'Muted' : 'Notifications on'}</span></header>
    <WorkspaceState state={messages} empty={!visibleMessages.length} emptyTitle="No messages yet" emptyBody="Send the first message to begin this conversation.">
      <div className="chat-transcript">{visibleMessages.map((message) => {
        const mine = String(message.sender) === String(selfUserId);
        return <article className={mine ? 'is-mine' : ''} key={message.id}><div>{message.body && <p>{message.body}</p>}{(message.attachments || []).map((attachment) => <span className="chat-attachment" key={attachment}>{cloneElement(Icons.doc, { size: 14 })}{decodeURIComponent(String(attachment).split('/').at(-1) || 'Attachment')}</span>)}<time>{message.pending ? 'Sending…' : dateTime(message.created_at, '')}</time></div></article>;
      })}</div>
    </WorkspaceState>
    {canWrite ? <form className="chat-input" onSubmit={send}><label title="Attach a file"><input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /><span>{cloneElement(Icons.folder, { size: 18 })}</span></label><div>{file && <small>{file.name}<button type="button" onClick={() => setFile(null)} aria-label="Remove attachment">×</button></small>}<textarea rows="1" maxLength="10000" value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a message…" /></div><button type="submit" disabled={busy || (!text.trim() && !file)} aria-label="Send message">{cloneElement(Icons.chevR, { size: 18 })}</button></form> : <div className="chat-readonly">This conversation is available for viewing only.</div>}
  </section>;
}

export function MessagesPage({ user }) {
  const toast = useToast();
  const threads = useWorkspaceData('/api/v1/messaging/threads/', { page_size: 100 }, { refreshMs: 5_000 });
  const contacts = useWorkspaceData('/api/v1/messaging/contacts/', { page_size: 100 }, { refreshMs: 60_000 });
  const [activeId, setActiveId] = useState(null);
  const [filter, setFilter] = useState('inbox');
  const [query, setQuery] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const canWrite = canUseCapability(user, 'messaging:write');
  const contactByUser = new Map(rowsOf(contacts).map((contact) => [String(contact.user_id), contact]));
  const selfUserId = contacts.pagination?.self_user_id;
  const presented = rowsOf(threads).map((thread) => threadPresentation(thread, contactByUser, selfUserId));
  const visible = presented.filter((thread) => (filter === 'archived' ? thread.archived : !thread.archived) && `${thread.name} ${thread.subtitle}`.toLowerCase().includes(query.toLowerCase()));
  const active = presented.find((thread) => String(thread.id) === String(activeId)) || visible[0] || null;
  useEffect(() => {
    if (active && String(active.id) !== String(activeId)) setActiveId(active.id);
  }, [active, activeId]);
  const updatePreference = async (key, value) => {
    if (!active) return;
    try {
      await httpRequest('PATCH', `/api/v1/messaging/threads/${active.id}/preferences/`, { body: { [key]: value } });
      await threads.retry();
    } catch (error) { toast.danger(userFacingError(error)); }
  };
  const remove = async () => {
    if (!active || !window.confirm(`Remove “${active.name}” from your conversations?`)) return;
    try {
      await httpRequest('DELETE', `/api/v1/messaging/threads/${active.id}/`);
      setActiveId(null);
      await threads.retry();
      toast.success('Conversation removed from your list.');
    } catch (error) { toast.danger(userFacingError(error)); }
  };
  return <div className="fw-page collab-page">
    <WorkspaceHeader eyebrow="Connected workspace" title="Messages" description="Direct and group conversations with the students, staff, and leadership contacts available to your role." actions={canWrite && <ActionButton tone="primary" icon={Icons.plus} onClick={() => setComposeOpen(true)}>New conversation</ActionButton>} />
    <WorkspaceState state={stateSummary([threads, contacts])}>
      <div className="messages-shell">
        <aside className="chat-sidebar"><header><label><span>{cloneElement(Icons.search, { size: 14 })}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" /></label><div className="collab-segments"><button type="button" className={filter === 'inbox' ? 'is-active' : ''} onClick={() => setFilter('inbox')}>Inbox</button><button type="button" className={filter === 'archived' ? 'is-active' : ''} onClick={() => setFilter('archived')}>Archived</button></div></header><div>{visible.map((thread) => <button type="button" className={String(thread.id) === String(active?.id) ? 'is-active' : ''} onClick={() => setActiveId(thread.id)} key={thread.id}><SfAvatar name={thread.name} size={38} decorative /><span><strong>{thread.name}</strong><small>{thread.subtitle}</small></span><time>{dateTime(thread.last_message_at || thread.created_at, '')}</time>{thread.unread_count > 0 && <b>{thread.unread_count}</b>}</button>)}{!visible.length && <div className="chat-list-empty">No conversations in this view.</div>}</div></aside>
        <main className="chat-main">{active ? <><nav><button type="button" onClick={() => updatePreference('notifications_muted', !active.notifications_muted)}>{cloneElement(Icons.bell, { size: 15 })}{active.notifications_muted ? 'Unmute' : 'Mute'}</button><button type="button" onClick={() => updatePreference('archived', !active.archived)}>{cloneElement(Icons.folder, { size: 15 })}{active.archived ? 'Restore' : 'Archive'}</button><button type="button" className="is-danger" onClick={remove}>{cloneElement(Icons.x, { size: 15 })}Remove</button></nav><ChatPane thread={active} selfUserId={selfUserId} onRefreshThreads={threads.retry} canWrite={canWrite} /></> : <div className="chat-welcome"><span>{cloneElement(Icons.chat, { size: 28 })}</span><h2>Your conversations</h2><p>Choose a conversation{canWrite ? ' or create a new direct or group chat.' : '.'}</p>{canWrite && <ActionButton tone="primary" icon={Icons.plus} onClick={() => setComposeOpen(true)}>New conversation</ActionButton>}</div>}</main>
      </div>
    </WorkspaceState>
    <ConversationComposer open={canWrite && composeOpen} contacts={rowsOf(contacts)} onClose={() => setComposeOpen(false)} onCreated={(thread) => { setActiveId(thread.id); void threads.retry(); }} />
  </div>;
}

function newField() {
  return { key: globalThis.crypto?.randomUUID?.() || `field-${Date.now()}-${Math.random()}`, label: '', type: 'text', required: false, helpText: '', options: '' };
}

function FormComposer({ open, contacts, branches, onClose, onSaved }) {
  const toast = useToast();
  const [draft, setDraft] = useState({ title: '', description: '', anonymous: false, multiple: false, closesAt: '', branch: '', roles: ['student'], users: [], publish: true, fields: [newField()] });
  const [busy, setBusy] = useState(false);
  const updateField = (key, patch) => setDraft((current) => ({ ...current, fields: current.fields.map((field) => field.key === key ? { ...field, ...patch } : field) }));
  const submit = async (event) => {
    event.preventDefault();
    const fields = draft.fields.filter((field) => field.label.trim());
    if (!draft.title.trim() || !fields.length) return;
    setBusy(true);
    try {
      const form = await httpRequest('POST', '/api/v1/forms/', { body: {
        title: draft.title.trim(), description: draft.description.trim(), is_anonymous: draft.anonymous, allow_multiple: draft.multiple,
        branch: draft.branch ? Number(draft.branch) : null, opens_at: null, closes_at: draft.closesAt ? new Date(draft.closesAt).toISOString() : null,
        audience_roles: draft.roles, audience_user_ids: draft.users.map(Number),
      } });
      for (const [order, field] of fields.entries()) {
        await httpRequest('POST', `/api/v1/forms/${form.id}/fields/`, { body: {
          label: field.label.trim(), field_type: field.type, required: field.required, order,
          options: ['single_choice', 'multi_choice'].includes(field.type) ? field.options.split(/[\n,]/).map((item) => item.trim()).filter(Boolean) : [], help_text: field.helpText.trim(),
        } });
      }
      if (draft.publish) await httpRequest('POST', `/api/v1/forms/${form.id}/publish/`, { body: {} });
      toast.success(draft.publish ? 'Form created and published.' : 'Form saved as a draft.');
      setDraft({ title: '', description: '', anonymous: false, multiple: false, closesAt: '', branch: '', roles: ['student'], users: [], publish: true, fields: [newField()] });
      onSaved?.(); onClose?.();
    } catch (error) { toast.danger(userFacingError(error, { fallback: 'The form could not be created.' })); }
    finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title="Create form" subtitle="Build a polished questionnaire without technical fields or configuration text." wide><form className="form-builder" onSubmit={submit}>
    <section className="form-builder-basics"><label><span>Title</span><input autoFocus required maxLength="200" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Parent feedback, term review, staff pulse…" /></label><label><span>Description</span><textarea rows="3" maxLength="4000" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Explain why this form matters and how answers will be used." /></label><div><label><span>Branch</span><select value={draft.branch} onChange={(event) => setDraft({ ...draft, branch: event.target.value })}><option value="">Entire organization</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label><label><span>Closing time</span><input type="datetime-local" value={draft.closesAt} onChange={(event) => setDraft({ ...draft, closesAt: event.target.value })} /></label></div><div className="form-switches"><label><input type="checkbox" checked={draft.anonymous} onChange={(event) => setDraft({ ...draft, anonymous: event.target.checked })} /><span><strong>Anonymous answers</strong><small>Respondent identity is not stored.</small></span></label><label><input type="checkbox" checked={draft.multiple} onChange={(event) => setDraft({ ...draft, multiple: event.target.checked })} /><span><strong>Allow repeat responses</strong><small>A person may answer more than once.</small></span></label></div></section>
    <section className="form-audience"><header><span>Audience</span><h3>Who should receive it?</h3></header><div className="form-role-grid">{AUDIENCE_ROLES.map(([role, label]) => <label className={draft.roles.includes(role) ? 'is-selected' : ''} key={role}><input type="checkbox" checked={draft.roles.includes(role)} onChange={() => setDraft((current) => ({ ...current, roles: current.roles.includes(role) ? current.roles.filter((item) => item !== role) : [...current.roles, role] }))} />{label}</label>)}</div><details><summary>Choose specific people <b>{draft.users.length}</b></summary><div className="form-person-grid">{contacts.map((contact) => <label key={contact.user_id}><input type="checkbox" checked={draft.users.includes(contact.user_id)} onChange={() => setDraft((current) => ({ ...current, users: current.users.includes(contact.user_id) ? current.users.filter((id) => id !== contact.user_id) : [...current.users, contact.user_id] }))} /><span><strong>{contactName(contact)}</strong><small>{contact.role_label || contact.category}</small></span></label>)}</div></details></section>
    <section className="form-questions"><header><div><span>Questions</span><h3>Build the form</h3></div><b>{draft.fields.length}</b></header>{draft.fields.map((field, index) => <article key={field.key}><span>{index + 1}</span><div><input required value={field.label} onChange={(event) => updateField(field.key, { label: event.target.value })} placeholder="Write a clear question" /><div><select value={field.type} onChange={(event) => updateField(field.key, { type: event.target.value })}>{FIELD_TYPES.map(([type, label]) => <option value={type} key={type}>{label}</option>)}</select><label><input type="checkbox" checked={field.required} onChange={(event) => updateField(field.key, { required: event.target.checked })} />Required</label></div>{['single_choice', 'multi_choice'].includes(field.type) && <textarea rows="2" value={field.options} onChange={(event) => updateField(field.key, { options: event.target.value })} placeholder="Choices, one per line" />}</div><button type="button" disabled={draft.fields.length === 1} onClick={() => setDraft((current) => ({ ...current, fields: current.fields.filter((item) => item.key !== field.key) }))} aria-label="Remove question">{cloneElement(Icons.x, { size: 15 })}</button></article>)}<button type="button" className="form-add-question" onClick={() => setDraft((current) => ({ ...current, fields: [...current.fields, newField()] }))}>{cloneElement(Icons.plus, { size: 15 })}Add question</button></section>
    <footer><label><input type="checkbox" checked={draft.publish} onChange={(event) => setDraft({ ...draft, publish: event.target.checked })} />Publish immediately</label><div><ActionButton onClick={onClose}>Cancel</ActionButton><ActionButton type="submit" tone="primary" icon={Icons.plus} disabled={busy || !draft.title.trim()}>{busy ? 'Saving…' : draft.publish ? 'Create and publish' : 'Save draft'}</ActionButton></div></footer>
  </form></Modal>;
}

function ResultsPanel({ form, contacts }) {
  const summary = useWorkspaceData(form ? `/api/v1/forms/${form.id}/summary/` : null, undefined, { enabled: Boolean(form) });
  const responses = useWorkspaceData(form ? `/api/v1/forms/${form.id}/responses/` : null, { page_size: 100 }, { enabled: Boolean(form) });
  const contactByPrincipal = useMemo(() => new Map(contacts.map((contact) => [`${contact.principal_kind}:${contact.profile_id}`, contact])), [contacts]);
  if (!form) return <div className="forms-results-empty"><span>{cloneElement(Icons.trend, { size: 28 })}</span><h2>Detailed results</h2><p>Select a published or closed form to review response totals and every answer.</p></div>;
  return <div className="forms-results"><header><div><span>Results</span><h2>{form.title}</h2><p>{form.is_anonymous ? 'Anonymous collection · respondent identities were not stored.' : 'Identified collection · authorized reviewers can see respondents.'}</p></div><strong>{summary.data?.response_count ?? rowsOf(responses).length}<small>responses</small></strong></header><WorkspaceState state={stateSummary([summary, responses])}><div className="forms-summary-grid">{(summary.data?.fields || []).map((field) => <article key={field.field}><strong>{field.label}</strong><small>{field.summary.answered || 0} answered</small>{field.summary.counts && <div>{Object.entries(field.summary.counts).map(([label, count]) => <span key={label}><i style={{ width: `${Math.max(3, summary.data.response_count ? (count / summary.data.response_count) * 100 : 0)}%` }} /><b>{label}</b><em>{count}</em></span>)}</div>}{Object.hasOwn(field.summary, 'avg') && <p><b>{field.summary.avg}</b> average · {field.summary.min}–{field.summary.max}</p>}{Object.hasOwn(field.summary, 'true') && <p><b>{field.summary.true}</b> yes · <b>{field.summary.false}</b> no</p>}</article>)}</div><section className="forms-response-list"><header><span>Individual responses</span><b>{rowsOf(responses).length}</b></header>{rowsOf(responses).map((response, index) => {
    const principal = response.respondent_principal;
    const contact = principal ? contactByPrincipal.get(`${principal.kind}:${principal.id}`) : null;
    return <article key={response.id}><header><SfAvatar name={form.is_anonymous ? `Anonymous ${index + 1}` : contactName(contact || {})} size={32} decorative /><div><strong>{form.is_anonymous ? `Anonymous response ${index + 1}` : contactName(contact || { display_name: `${principal?.kind || 'Account'} ${principal?.id || ''}` })}</strong><small>{dateTime(response.created_at, '')}</small></div></header><dl>{(response.answers || []).map((answer) => { const field = (form.form_fields || []).find((item) => String(item.id) === String(answer.field)); return <div key={answer.field}><dt>{field?.label || `Question ${answer.field}`}</dt><dd>{Array.isArray(answer.value) ? answer.value.join(', ') : typeof answer.value === 'boolean' ? answer.value ? 'Yes' : 'No' : String(answer.value ?? '—')}</dd></div>; })}</dl></article>;
  })}</section></WorkspaceState></div>;
}

export function FormsPage({ user, route = 'forms', onNav }) {
  const toast = useToast();
  const { segments } = workspaceRoute(route);
  const routedFormId = /^\d+$/.test(String(segments[1] || '')) ? segments[1] : null;
  const forms = useWorkspaceData('/api/v1/forms/', { page_size: 100 }, { refreshMs: 30_000 });
  const contacts = useWorkspaceData('/api/v1/messaging/contacts/', { page_size: 100 }, { enabled: canUseCapability(user, 'messaging:read') });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100 }, { enabled: canUseCapability(user, 'org:read') });
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(routedFormId);
  const [composerOpen, setComposerOpen] = useState(false);
  const canWrite = canUseCapability(user, 'forms:write');
  const managed = rowsOf(forms).filter((form) => Object.hasOwn(form, 'audience_roles'));
  const visible = managed.filter((form) => filter === 'all' || form.status === filter);
  const selected = managed.find((form) => String(form.id) === String(selectedId)) || visible[0] || null;
  useEffect(() => {
    if (routedFormId) setSelectedId(routedFormId);
  }, [routedFormId]);
  const lifecycle = async (form, action) => {
    try {
      const formId = Number(form.id);
      const path = action === 'delete'
        ? `/api/v1/forms/${formId}/`
        : action === 'publish'
          ? `/api/v1/forms/${formId}/publish/`
          : action === 'close'
            ? `/api/v1/forms/${formId}/close/`
            : null;
      if (!path) throw new Error('This form action is unavailable.');
      await httpRequest(action === 'delete' ? 'DELETE' : 'POST', path, action === 'delete' ? {} : { body: {} });
      if (action === 'delete') {
        setSelectedId(null);
        onNav?.('forms');
      }
      await forms.retry();
      toast.success(action === 'publish' ? 'Form published.' : action === 'close' ? 'Form closed.' : 'Draft removed.');
    } catch (error) { toast.danger(userFacingError(error)); }
  };
  return <div className="fw-page collab-page">
    <WorkspaceHeader eyebrow="Feedback and decisions" title="Forms & surveys" description="Create clear questionnaires, choose an exact audience, publish them, and review detailed or anonymous results in one place." actions={canWrite && <ActionButton tone="primary" icon={Icons.plus} onClick={() => setComposerOpen(true)}>Create form</ActionButton>} />
    <section className="forms-kpis"><article><span>All forms</span><strong>{managed.length}</strong></article><article><span>Published</span><strong>{managed.filter((form) => form.status === 'published').length}</strong></article><article><span>Drafts</span><strong>{managed.filter((form) => form.status === 'draft').length}</strong></article><article><span>Closed</span><strong>{managed.filter((form) => form.status === 'closed').length}</strong></article></section>
    <section className="collab-toolbar"><div className="collab-segments">{[['all', 'All'], ['published', 'Published'], ['draft', 'Drafts'], ['closed', 'Closed']].map(([id, label]) => <button type="button" className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)} key={id}>{label}</button>)}</div></section>
    <WorkspaceState state={forms} empty={!visible.length} emptyTitle="No forms in this view" emptyBody="Create the first form with the visual builder.">
      <div className="forms-layout"><aside className="forms-directory">{visible.map((form) => <article className={String(form.id) === String(selected?.id) ? 'is-active' : ''} key={form.id}><button type="button" onClick={() => { setSelectedId(form.id); onNav?.(`forms/${form.id}`); }}><header><StatusPill value={form.status} /><span>{form.is_anonymous ? 'Anonymous' : 'Identified'}</span></header><h2>{form.title}</h2><p>{form.description || 'No description added.'}</p><footer><time>{form.closes_at ? `Closes ${dateTime(form.closes_at)}` : 'No closing time'}</time><b>{(form.form_fields || []).length} questions</b></footer></button><nav>{form.status === 'draft' && <><button type="button" onClick={() => lifecycle(form, 'delete')}>Remove</button><button type="button" onClick={() => lifecycle(form, 'publish')}>Publish</button></>}{form.status === 'published' && <button type="button" onClick={() => lifecycle(form, 'close')}>Close form</button>}</nav></article>)}</aside><main><ResultsPanel form={selected?.status === 'draft' ? null : selected} contacts={rowsOf(contacts)} />{selected?.status === 'draft' && <div className="forms-results-empty"><span>{cloneElement(Icons.doc, { size: 28 })}</span><h2>{selected.title}</h2><p>This draft has not been published, so there are no responses yet.</p><ActionButton tone="primary" onClick={() => lifecycle(selected, 'publish')}>Publish form</ActionButton></div>}</main></div>
    </WorkspaceState>
    <FormComposer open={composerOpen} contacts={rowsOf(contacts)} branches={rowsOf(branches)} onClose={() => setComposerOpen(false)} onSaved={forms.retry} />
  </div>;
}
