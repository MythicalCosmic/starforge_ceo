import { cloneElement, useMemo, useState } from 'react';
import { Icons } from '../components/Icons.jsx';
import { ActionButton, RouteLink } from '../components/WorkspacePrimitives.jsx';
import { useWorkspaceData } from '../hooks/useWorkspaceData.js';
import { formatBusinessNumber, toFiniteBusinessNumber } from '../lib/formatters.js';
import {
  effectiveCapabilities,
  effectiveCapabilitiesForBranch,
  hasCapability,
} from '../lib/permissions.js';
import { financeBrief } from '../lib/starAIFinanceBrief.js';
import '../styles/focused-v3.css';
import '../styles/star-ai-v3.css';

const PAGE_100 = Object.freeze({ page_size: 100 });
const SESSION_KEY_PREFIX = 'sf-star-ai-conversations-v2';

const STARTERS = Object.freeze([
  { label: 'Compare branches', prompt: 'Compare branch performance and show me where attention is needed.', icon: Icons.globe },
  { label: 'Review collections', prompt: 'Summarize billing, collections, and outstanding invoices.', icon: Icons.trend },
  { label: 'Teacher capacity', prompt: 'Which teachers and groups appear to have the most capacity pressure?', icon: Icons.user },
  { label: 'Student risks', prompt: 'Summarize the student risk signals currently visible to leadership.', icon: Icons.flag },
]);

function conversationStorageKey(user) {
  const tenant = encodeURIComponent(String(user?.tenant_slug || 'organization'));
  const account = encodeURIComponent(String(user?.id || user?.username || 'anonymous'));
  return `${SESSION_KEY_PREFIX}:${tenant}:${account}`;
}

function safeStoredConversations(storageKey) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && Array.isArray(item.messages)) : [];
  } catch {
    return [];
  }
}

function conversationId() {
  return globalThis.crypto?.randomUUID?.() || `conversation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function freshConversation() {
  return {
    id: conversationId(),
    title: 'New leadership brief',
    createdAt: new Date().toISOString(),
    messages: [{
      id: conversationId(),
      role: 'assistant',
      headline: 'What would you like to understand?',
      body: 'I can turn the organization records currently loaded in this workspace into a concise leadership brief. Choose a starting point or ask in your own words.',
      note: 'Preview workspace · replies remain in this browser tab',
    }],
  };
}

function persist(storageKey, conversations) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(conversations.slice(0, 12)));
  } catch {
    // The conversation still works in memory if private browsing blocks storage.
  }
}

function readable(state) {
  return Boolean(state && !state.pending && !state.error && !state.paused && state.data !== null);
}

function stateTotal(state) {
  const total = readable(state) ? toFiniteBusinessNumber(state.total) : null;
  return total !== null && Number.isSafeInteger(total) && total >= 0 ? formatBusinessNumber(total) : '—';
}

function unavailableBrief(headline, body, actions) {
  return {
    headline,
    body,
    bullets: ['No zero or complete conclusion is drawn while the supporting information is unavailable.'],
    actions,
    evidenceIncomplete: true,
  };
}

function relationId(value) {
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? value.id : value;
  return /^\d+$/.test(String(candidate ?? '')) ? String(candidate) : '';
}

function scopedRisks(context, branchId) {
  if (!branchId) return context.risks.rows;
  const cohortIds = new Set(context.cohorts.rows.map((cohort) => relationId(cohort.id)).filter(Boolean));
  const resolved = [];
  for (const risk of context.risks.rows) {
    const directBranch = relationId(risk.branch);
    const cohort = relationId(risk.cohort);
    const throughCohort = cohortIds.has(cohort);
    if (!directBranch && !cohort) return null;
    if (directBranch && throughCohort && directBranch !== String(branchId)) return null;
    if (directBranch === String(branchId) || throughCohort) resolved.push(risk);
  }
  return resolved;
}

function useLeadershipContext(user, branchId) {
  const unionCapabilities = effectiveCapabilities(user);
  const scopedCapabilities = effectiveCapabilitiesForBranch(user, branchId);
  // An absent permission field is retained only for compatibility with older
  // profiles. A present array is authoritative and prevents speculative 403s,
  // unnecessary fan-out, and accidental requests for sensitive registers.
  const allowsUnion = (permission) => unionCapabilities === null || hasCapability(unionCapabilities, permission);
  const allowsScope = (permission) => scopedCapabilities === null || hasCapability(scopedCapabilities, permission);
  const branches = useWorkspaceData('/api/v1/org/branches/', PAGE_100, { enabled: allowsUnion('org:read') });
  const students = useWorkspaceData('/api/v1/students/', { ...PAGE_100, branch: branchId || undefined }, { enabled: allowsScope('students:read') });
  const teachers = useWorkspaceData('/api/v1/teachers/', { ...PAGE_100, branch: branchId || undefined }, { enabled: allowsScope('teachers:read') });
  const cohorts = useWorkspaceData('/api/v1/cohorts/', { ...PAGE_100, branch: branchId || undefined }, { enabled: allowsScope('cohorts:read') });
  const invoices = useWorkspaceData('/api/v1/finance/invoices/', { ...PAGE_100, branch: branchId || undefined }, { enabled: allowsScope('finance:read') });
  const payments = useWorkspaceData('/api/v1/payments/', { ...PAGE_100, branch: branchId || undefined }, { enabled: allowsScope('payments:read') });
  const risks = useWorkspaceData('/api/v1/intelligence/risk/', PAGE_100, { enabled: allowsScope('intelligence:read') });
  return { branches, students, teachers, cohorts, invoices, payments, risks };
}

function visibleInvoices(context) {
  return context.invoices.rows;
}

function branchBrief(context, branchId) {
  const sources = [context.branches, context.students, context.teachers, context.cohorts];
  if (sources.some((state) => !readable(state) || state.complete !== true)) {
    return unavailableBrief(
      'Branch comparison is temporarily unavailable',
      'Complete branch, student, teacher, and group registers are required for a trustworthy comparison; one or more are partial or unavailable.',
      [{ label: 'Open branch comparisons', to: 'branches' }],
    );
  }
  const branches = branchId
    ? context.branches.rows.filter((branch) => String(branch.id) === String(branchId))
    : context.branches.rows;
  const branchIds = new Set(context.branches.rows.map((branch) => relationId(branch.id)).filter(Boolean));
  const relationshipCoverage = branchId || [context.students, context.teachers, context.cohorts]
    .every((state) => state.rows.every((item) => branchIds.has(relationId(item.branch))));
  if (!relationshipCoverage) {
    return unavailableBrief(
      'Branch comparison needs clearer ownership',
      'One or more people or group records cannot be matched to a visible branch, so no branch is ranked from incomplete relationships.',
      [{ label: 'Open branch comparisons', to: 'branches' }],
    );
  }
  const rows = branches.map((branch) => {
    const id = String(branch.id);
    const selected = branchId && String(branchId) === id;
    const students = selected ? context.students.rows.length : context.students.rows.filter((item) => relationId(item.branch) === id).length;
    const teachers = selected ? context.teachers.rows.length : context.teachers.rows.filter((item) => relationId(item.branch) === id).length;
    const groups = selected ? context.cohorts.rows.length : context.cohorts.rows.filter((item) => relationId(item.branch) === id).length;
    return { id: branch.id, label: branch.name, students, teachers, groups };
  }).sort((a, b) => (b.students ?? -1) - (a.students ?? -1));
  const leader = rows[0];
  return {
    headline: 'Branch footprint at a glance',
    body: leader && context.students.rows.length
      ? `${leader.label} has the largest verified student footprint with ${formatBusinessNumber(leader.students)} students across ${formatBusinessNumber(leader.groups)} groups.`
      : rows.length
        ? 'No students are recorded in the complete branch comparison scope.'
        : 'There are no branch records in the current verified view.',
    bullets: rows.slice(0, 5).map((item) => `${item.label}: ${item.students == null ? '—' : formatBusinessNumber(item.students)} students · ${item.teachers == null ? '—' : formatBusinessNumber(item.teachers)} teachers · ${item.groups == null ? '—' : formatBusinessNumber(item.groups)} groups`),
    actions: [{ label: 'Open branch comparisons', to: 'branches' }],
  };
}

function teacherBrief(context) {
  if (!readable(context.teachers) || !readable(context.cohorts) || !context.teachers.complete || !context.cohorts.complete) {
    return unavailableBrief(
      'Teaching capacity cannot be ranked yet',
      'Complete teacher and group assignment registers are required for a trustworthy workload comparison, and one is partial or unavailable.',
      [{ label: 'Open teacher workspace', to: 'teachers' }, { label: 'Review groups', to: 'groups' }],
    );
  }
  const teacherGroups = new Map();
  context.cohorts.rows.forEach((cohort) => {
    const ids = new Set([
      relationId(cohort.primary_teacher ?? cohort.teacher),
      ...(Array.isArray(cohort.teachers) ? cohort.teachers : []).map((assignment) => relationId(assignment?.teacher ?? assignment)),
    ].filter(Boolean));
    ids.forEach((teacher) => teacherGroups.set(teacher, (teacherGroups.get(teacher) || 0) + 1));
  });
  const ranked = context.teachers.rows.map((teacher) => ({
    id: teacher.id,
    label: teacher.full_name || teacher.name || `Teacher ${teacher.id}`,
    groups: teacherGroups.get(String(teacher.id)) || 0,
  })).sort((a, b) => b.groups - a.groups);
  const leader = ranked[0];
  return {
    headline: 'Teaching capacity view',
    body: leader && leader.groups
      ? `${leader.label} is connected to the most groups in the loaded register (${formatBusinessNumber(leader.groups)}). This is a workload signal, not a performance rating.`
      : 'No teacher-to-group assignments are visible in the current scope.',
    bullets: ranked.slice(0, 5).map((item) => `${item.label}: ${formatBusinessNumber(item.groups)} connected groups`),
    actions: [{ label: 'Open teacher workspace', to: 'teachers' }, { label: 'Review groups', to: 'groups' }],
  };
}

function riskBrief(context, branchId) {
  if (!readable(context.risks) || !context.risks.complete || (branchId && (!readable(context.cohorts) || !context.cohorts.complete))) {
    return unavailableBrief(
      'Student attention signals are temporarily unavailable',
      'The current risk register could not be verified, so I cannot conclude that there are no student concerns.',
      [{ label: 'Open intelligence', to: 'intelligence' }, { label: 'Review students', to: 'students' }],
    );
  }
  const risks = scopedRisks(context, branchId);
  if (risks === null) {
    return unavailableBrief(
      'Student attention scope cannot be verified',
      'One or more risk signals cannot be matched to the selected branch, so I cannot state a branch-level concern count.',
      [{ label: 'Open intelligence', to: 'intelligence' }, { label: 'Review students', to: 'students' }],
    );
  }
  const counts = risks.reduce((map, item) => {
    const label = String(item.risk_level || item.level || item.severity || 'unclassified').toLowerCase();
    map[label] = (map[label] || 0) + 1;
    return map;
  }, {});
  const ordered = Object.entries(counts).sort(([, a], [, b]) => b - a);
  return {
    headline: 'Student attention signals',
    body: risks.length
      ? `${formatBusinessNumber(risks.length)} leadership risk signals are visible in the current intelligence window and selected branch scope.`
      : 'No student risk signals are visible in the current intelligence window.',
    bullets: ordered.length ? ordered.map(([label, count]) => `${label.replaceAll('_', ' ')}: ${formatBusinessNumber(count)}`) : ['No risk breakdown is available to summarize.'],
    actions: [{ label: 'Open intelligence', to: 'intelligence' }, { label: 'Review students', to: 'students' }],
  };
}

function generalBrief(context) {
  const students = stateTotal(context.students);
  const teachers = stateTotal(context.teachers);
  const groups = stateTotal(context.cohorts);
  const available = [students, teachers, groups].some((value) => value !== '—');
  return {
    headline: 'Organization pulse',
    body: available
      ? `The verified portions of the current view contain ${students} students, ${teachers} teachers, and ${groups} groups.`
      : 'The people and group registers are temporarily unavailable, so no organization totals are stated.',
    metrics: [
      { label: 'Students', value: students },
      { label: 'Teachers', value: teachers },
      { label: 'Groups', value: groups },
    ],
    bullets: ['Ask about branches, collections, teacher capacity, or student risks for a focused brief.'],
    actions: [{ label: 'Open executive overview', to: 'overview' }],
  };
}

// Exported for deterministic evidence-contract regression tests alongside the UI.
// eslint-disable-next-line react-refresh/only-export-components
export function createLeadershipReply(prompt, context, branchId, branchName) {
  const normalized = prompt.toLowerCase();
  let reply;
  if (/finance|money|income|invoice|payment|collection|cash|outstanding/.test(normalized)) reply = financeBrief(context);
  else if (/teacher|capacity|workload|staff/.test(normalized)) reply = teacherBrief(context);
  else if (/risk|attention|student|attendance|drop/.test(normalized)) reply = riskBrief(context, branchId);
  else if (/branch|campus|location|compare/.test(normalized)) reply = branchBrief(context, branchId);
  else reply = generalBrief(context);
  const incomplete = Object.values(context).filter((state) => state && typeof state.complete === 'boolean').some((state) => state.error || state.paused || !state.complete);
  const coverageNote = incomplete
    ? 'partial coverage'
    : reply.evidenceIncomplete || reply.amountEvidenceIncomplete
      ? 'complete registers; incomplete field evidence'
      : 'complete loaded registers';
  return {
    id: conversationId(),
    role: 'assistant',
    ...reply,
    note: `${branchName || 'Entire organization'} · ${coverageNote} · preview analysis`,
  };
}

function Message({ message, onNav }) {
  if (message.role === 'user') return <div className="ai-message is-user"><div><p>{message.body}</p></div></div>;
  return (
    <div className="ai-message is-assistant">
      <span className="ai-message-mark" aria-hidden="true">{cloneElement(Icons.ai, { size: 17 })}</span>
      <div>
        {message.headline && <h2>{message.headline}</h2>}
        <p>{message.body}</p>
        {message.metrics?.length > 0 && <div className="ai-message-metrics">{message.metrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div>}
        {message.bullets?.length > 0 && <ul>{message.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
        {message.actions?.length > 0 && <div className="ai-message-actions">{message.actions.map((action) => <RouteLink key={action.to} to={action.to} onNav={onNav}>{action.label}{cloneElement(Icons.chevR, { size: 13 })}</RouteLink>)}</div>}
        {message.note && <small>{message.note}</small>}
      </div>
    </div>
  );
}

export function StarAIPage({ user, onNav }) {
  const storageKey = conversationStorageKey(user);
  const stored = useMemo(() => safeStoredConversations(storageKey), [storageKey]);
  const initial = useMemo(() => stored.length ? stored : [freshConversation()], [stored]);
  const [conversations, setConversations] = useState(initial);
  const [activeId, setActiveId] = useState(initial[0].id);
  const [input, setInput] = useState('');
  const [branchId, setBranchId] = useState('');
  const context = useLeadershipContext(user, branchId);
  const active = conversations.find((item) => item.id === activeId) || conversations[0];
  const branchName = context.branches.rows.find((item) => String(item.id) === branchId)?.name || '';
  const preparing = Object.values(context).some((state) => state.pending);
  const evidenceCount = context.students.rows.length + context.teachers.rows.length + context.cohorts.rows.length;
  const incompleteEvidence = Object.values(context).some((state) => !readable(state) || !state.complete);

  const updateConversations = (next) => {
    setConversations(next);
    persist(storageKey, next);
  };

  const newConversation = () => {
    const next = freshConversation();
    updateConversations([next, ...conversations]);
    setActiveId(next.id);
    setInput('');
  };

  const submit = (promptValue) => {
    if (preparing) return;
    const prompt = String(promptValue || input).trim();
    if (!prompt || !active) return;
    const userMessage = { id: conversationId(), role: 'user', body: prompt };
    const assistantMessage = createLeadershipReply(prompt, context, branchId, branchName);
    const next = conversations.map((conversation) => conversation.id === active.id ? {
      ...conversation,
      title: conversation.messages.length <= 1 ? prompt.slice(0, 54) : conversation.title,
      messages: [...conversation.messages, userMessage, assistantMessage],
    } : conversation);
    updateConversations(next);
    setInput('');
  };

  return (
    <div className="ai-workspace">
      <h1 className="fw-sr">StarAI leadership copilot</h1>
      <div className="ai-shell">
        <aside className="ai-history" aria-label="StarAI conversations">
          <div className="ai-brand">
            <span aria-hidden="true">{cloneElement(Icons.ai, { size: 18 })}</span>
            <div><strong>StarAI</strong><small>Leadership copilot</small></div>
            <i title="Preview mode" aria-label="Preview mode" />
          </div>
          <ActionButton tone="primary" icon={Icons.ai} onClick={newConversation}>New brief</ActionButton>
          <div className="ai-history-list">
            <span>Recent in this tab</span>
            {conversations.map((conversation) => <button type="button" className={conversation.id === active.id ? 'is-active' : ''} key={conversation.id} onClick={() => setActiveId(conversation.id)}><span>{cloneElement(Icons.chat, { size: 14 })}</span><strong>{conversation.title}</strong></button>)}
          </div>
          <div className="ai-privacy-note"><span>{cloneElement(Icons.shield, { size: 16 })}</span><p><strong>Private preview</strong>Conversation history is separated by signed-in account, stays in this browser tab, and ends with the tab session.</p></div>
        </aside>

        <section className="ai-conversation" aria-label="Active StarAI conversation">
          <header className="ai-conversation-head">
            <div><span>Conversation</span><strong>{active.title}</strong></div>
            <div className="ai-conversation-tools">
              <label><span className="fw-sr">Choose branch scope</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Entire organization</option>{context.branches.rows.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>
              <details className="ai-evidence">
                <summary>{cloneElement(Icons.shield, { size: 14 })}<span>{formatBusinessNumber(evidenceCount)} records</span></summary>
                <div>
                  <span>Current evidence</span>
                  <strong>{branchName || 'Entire organization'}</strong>
                  <dl>
                    <div><dt>Students</dt><dd>{stateTotal(context.students)}</dd></div>
                    <div><dt>Teachers</dt><dd>{stateTotal(context.teachers)}</dd></div>
                    <div><dt>Groups</dt><dd>{stateTotal(context.cohorts)}</dd></div>
                    <div><dt>Invoices loaded</dt><dd>{readable(context.invoices) ? formatBusinessNumber(visibleInvoices(context).length) : '—'}</dd></div>
                  </dl>
                  <p>Answers distinguish loaded evidence from authoritative totals.</p>
                  <RouteLink to="overview" onNav={onNav}>Open executive overview{cloneElement(Icons.chevR, { size: 13 })}</RouteLink>
                </div>
              </details>
            </div>
          </header>
          <div className="ai-messages" role="log" aria-live="polite" aria-relevant="additions text">
            {active.messages.map((message) => <Message message={message} onNav={onNav} key={message.id} />)}
            {active.messages.length === 1 && <div className="ai-starters">{STARTERS.map((starter) => <button type="button" disabled={preparing} onClick={() => submit(starter.prompt)} key={starter.label}><span>{cloneElement(starter.icon, { size: 16 })}</span><strong>{starter.label}</strong><small>{starter.prompt}</small></button>)}</div>}
          </div>
          <form className="ai-composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <textarea rows="2" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={`Ask about ${branchName || 'your organization'}…`} aria-label="Ask StarAI" />
            <div><span>{preparing ? 'Preparing organization context…' : `${formatBusinessNumber(evidenceCount)} people and group records loaded${incompleteEvidence ? ' · partial coverage' : ''}`}</span><button type="submit" disabled={!input.trim() || preparing} aria-label="Send question">{cloneElement(Icons.trend, { size: 17 })}</button></div>
          </form>
        </section>
      </div>
    </div>
  );
}
