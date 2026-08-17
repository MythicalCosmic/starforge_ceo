import { cloneElement, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { httpRequest } from '../api/http.js';
import { queryClient } from '../api/queryClient.js';
import { Icons } from '../components/Icons.jsx';
import {
  ActionButton,
  CoverageBar,
  SectionNav,
  StatusPill,
  WorkspaceHeader,
  WorkspaceLayout,
  WorkspaceState,
} from '../components/WorkspacePrimitives.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useWorkspaceData, workspaceRoute } from '../hooks/useWorkspaceData.js';
import { useWorkspaceTitle } from '../hooks/useWorkspaceTitle.js';
import { formatBusinessNumber, formatOrganizationDate } from '../lib/formatters.js';
import { canUseCapability } from '../lib/permissions.js';
import { userFacingError } from '../lib/userFacingError.js';
import '../styles/focused-v3.css';
import '../styles/engagement-workspace.css';

const SECTIONS = Object.freeze([
  { id: 'overview', label: 'Engagement overview', description: 'Current communication work', icon: Icons.home },
  { id: 'campaigns', label: 'Student outreach', description: 'Prepare and follow SMS updates', icon: Icons.chat },
  { id: 'notifications', label: 'My notifications', description: 'Updates that need attention', icon: Icons.bell },
]);

function activeSection(value) {
  return SECTIONS.some((section) => section.id === value) ? value : 'overview';
}

function BusinessModal({ open, title, description, onClose, children, footer }) {
  if (!open) return null;
  return <div className="engagement-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}><section className="engagement-modal" role="dialog" aria-modal="true" aria-label={title}><header><div><span>Community engagement</span><h2>{title}</h2><p>{description}</p></div><button type="button" aria-label="Close" onClick={onClose}>{cloneElement(Icons.x, { size: 17 })}</button></header>{children}<footer>{footer}</footer></section></div>;
}

function toneForCampaign(status) {
  if (status === 'sent') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'sending') return 'warn';
  return 'neutral';
}

function CampaignComposer({ open, branches, groups, templates, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', message: '', template: '', branch: '', group: '', status: '', scheduled: '' });
  const [issue, setIssue] = useState('');
  const selectedTemplate = templates.find((item) => String(item.id) === form.template);
  const save = useMutation({
    mutationFn: async (sendNow) => {
      const campaign = await httpRequest('POST', '/api/v1/campaigns/', { body: {
        name: form.name.trim(),
        message: form.template ? '' : form.message.trim(),
        template: form.template ? Number(form.template) : null,
        branch: form.branch ? Number(form.branch) : null,
        segment: {
          ...(form.group ? { cohort: Number(form.group) } : {}),
          ...(form.status ? { status: form.status } : {}),
        },
        scheduled_at: form.scheduled ? new Date(form.scheduled).toISOString() : null,
      } });
      if (sendNow) return httpRequest('POST', `/api/v1/campaigns/${campaign.id}/send/`, { body: {} });
      return campaign;
    },
    onSuccess: (_result, sendNow) => {
      queryClient.invalidateQueries({ queryKey: ['api'] });
      toast.success(sendNow ? 'The outreach message is being sent.' : form.scheduled ? 'Outreach scheduled.' : 'Outreach saved as a draft.');
      onClose?.();
    },
    onError: (error) => setIssue(userFacingError(error, { fallback: 'This outreach could not be saved. Check its audience and message, then try again.' })),
  });
  const text = form.template ? selectedTemplate?.body : form.message;
  const canSubmit = form.name.trim() && text?.trim() && (!form.group || form.branch);
  const filteredGroups = groups.filter((group) => !form.branch || String(group.branch) === form.branch);
  return <BusinessModal open={open} title="Create student outreach" description="Write one clear message, choose exactly who should receive it, then send now or schedule it." onClose={onClose} footer={<><p>{form.group ? 'Only active students in the selected group are included.' : form.branch ? 'The selected branch audience will be frozen when this is saved.' : 'Organization-wide outreach is limited to authorized leadership.'}</p><div><ActionButton onClick={onClose}>Cancel</ActionButton><ActionButton disabled={!canSubmit || save.isPending} onClick={() => save.mutate(false)}>{save.isPending ? 'Saving…' : form.scheduled ? 'Schedule' : 'Save draft'}</ActionButton>{!form.scheduled && <ActionButton tone="primary" disabled={!canSubmit || save.isPending} onClick={() => save.mutate(true)}>Send now</ActionButton>}</div></>}>
    <form className="engagement-composer" onSubmit={(event) => event.preventDefault()}>
      <label className="is-wide"><span>Internal title</span><input autoFocus maxLength="200" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="For example, August attendance reminder" /></label>
      <label><span>Branch</span><select value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value, group: '' })}><option value="">Entire permitted organization</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>
      <label><span>Learning group</span><select value={form.group} onChange={(event) => setForm({ ...form, group: event.target.value, branch: event.target.value ? String(groups.find((item) => String(item.id) === event.target.value)?.branch || form.branch) : form.branch })}><option value="">All students in the selected scope</option>{filteredGroups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>
      <label><span>Student status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="">All current statuses</option>{['active', 'enrolled', 'accepted', 'application', 'lead', 'graduated', 'withdrawn'].map((status) => <option value={status} key={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}</select></label>
      <label><span>Send time</span><input type="datetime-local" value={form.scheduled} onChange={(event) => setForm({ ...form, scheduled: event.target.value })} /></label>
      {templates.length > 0 && <label className="is-wide"><span>Reusable message (optional)</span><select value={form.template} onChange={(event) => setForm({ ...form, template: event.target.value })}><option value="">Write a new message</option>{templates.filter((item) => item.is_active !== false).map((item) => <option value={item.id} key={item.id}>{item.name}{item.category ? ` · ${item.category}` : ''}</option>)}</select></label>}
      <label className="is-wide"><span>Message</span><textarea maxLength="1600" rows="6" disabled={Boolean(form.template)} value={text || ''} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Write the exact message students or families should receive." /><small>{String(text || '').length} of 1,600 characters{form.template ? ' · supplied by the selected template' : ''}</small></label>
      {issue && <p className="engagement-error is-wide" role="alert">{issue}</p>}
    </form>
  </BusinessModal>;
}

function CampaignDetail({ campaign, recipients, canSend, onSent }) {
  const toast = useToast();
  const send = useMutation({
    mutationFn: () => httpRequest('POST', `/api/v1/campaigns/${campaign.id}/send/`, { body: {} }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success('The outreach message is being sent.'); onSent?.(); },
    onError: (error) => toast.danger(userFacingError(error, { fallback: 'This outreach could not be sent.' })),
  });
  const delivered = campaign.sent_count || recipients.rows.filter((item) => item.status === 'sent').length;
  const needsAttention = campaign.failed_count || recipients.rows.filter((item) => item.status === 'failed').length;
  return <section className="engagement-detail"><header><div><span>Outreach detail</span><h2>{campaign.name}</h2><p>{campaign.branch_name || 'Entire organization'} · created by {campaign.created_by_name || 'authorized staff'}</p></div><StatusPill value={campaign.status} tone={toneForCampaign(campaign.status)} /></header><div className="engagement-message"><span>{cloneElement(Icons.chat, { size: 19 })}</span><p>{campaign.message || 'This outreach uses a reusable approved message.'}</p></div><div className="engagement-delivery-grid"><article><small>Audience</small><strong>{formatBusinessNumber(campaign.total)}</strong><p>Frozen recipients</p></article><article><small>Delivered</small><strong>{formatBusinessNumber(delivered)}</strong><p>Confirmed messages</p></article><article className={needsAttention ? 'is-danger' : ''}><small>Needs attention</small><strong>{formatBusinessNumber(needsAttention)}</strong><p>Failed deliveries</p></article></div>{campaign.scheduled_at && <div className="engagement-callout">Scheduled for {formatOrganizationDate(campaign.scheduled_at)}</div>}{campaign.status === 'draft' && canSend && <footer><p>Review the exact message and audience before sending.</p><ActionButton tone="primary" disabled={send.isPending} onClick={() => send.mutate()}>{send.isPending ? 'Starting…' : 'Send this outreach'}</ActionButton></footer>}<WorkspaceState state={recipients} empty={!recipients.rows.length} emptyTitle="No recipient rows are available yet" emptyBody="Recipients are frozen when an outreach draft is created."><div className="engagement-recipient-list"><header><span>Recipient delivery</span><b>{recipients.rows.length}</b></header>{recipients.rows.slice(0, 100).map((recipient) => <article key={recipient.id}><span>{cloneElement(Icons.user, { size: 15 })}</span><div><strong>{recipient.student_name || `Student ${recipient.student}`}</strong><small>{recipient.phone || 'No usable phone recorded'}</small></div><StatusPill value={recipient.status} tone={recipient.status === 'sent' ? 'success' : recipient.status === 'failed' ? 'danger' : 'neutral'} /></article>)}</div></WorkspaceState></section>;
}

function EngagementOverviewEmpty({ icon, title, body }) {
  return <div className="engagement-inline-empty">
    <span>{cloneElement(icon, { size: 18 })}</span>
    <div><strong>{title}</strong><small>{body}</small></div>
  </div>;
}

function CampaignsView({ state, recipients, selected, selectedId, setSelectedId, canWrite, canSend, onCreate }) {
  return <section className="engagement-campaigns"><header><div><span>Student and family outreach</span><h2>Messages with delivery accountability</h2><p>Prepare a scoped message and see who received it without opening raw records.</p></div>{canWrite && <ActionButton icon={Icons.plus} tone="primary" onClick={onCreate}>New outreach</ActionButton>}</header><CoverageBar state={state} label="outreach messages" /><WorkspaceState state={state} empty={!state.rows.length} emptyTitle="No outreach has been prepared" emptyBody="Create the first student or family update when there is something useful to communicate."><div className="engagement-campaign-layout"><aside>{state.rows.map((campaign) => <button type="button" className={String(campaign.id) === String(selectedId || selected?.id) ? 'is-active' : ''} onClick={() => setSelectedId(campaign.id)} key={campaign.id}><header><StatusPill value={campaign.status} tone={toneForCampaign(campaign.status)} /><time>{formatOrganizationDate(campaign.created_at, { dateOnly: true })}</time></header><strong>{campaign.name}</strong><p>{campaign.message || 'Reusable approved message'}</p><footer><span>{campaign.branch_name || 'Entire organization'}</span><b>{formatBusinessNumber(campaign.total)} recipients</b></footer></button>)}</aside><main>{selected && <CampaignDetail campaign={selected} recipients={recipients} canSend={canSend} onSent={state.retry} />}</main></div></WorkspaceState></section>;
}

function NotificationFeed({ state }) {
  const toast = useToast();
  const markRead = useMutation({
    mutationFn: (notification) => httpRequest('POST', `/api/v1/notifications/${notification.id}/read/`, { body: {} }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success('Notification marked as read.'); },
    onError: (error) => toast.danger(userFacingError(error)),
  });
  const markAll = useMutation({
    mutationFn: () => httpRequest('POST', '/api/v1/notifications/read-all/', { body: {} }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['api'] }); toast.success('All notifications marked as read.'); },
    onError: (error) => toast.danger(userFacingError(error)),
  });
  const unread = state.rows.filter((item) => !item.read_at).length;
  return <section className="engagement-notifications"><header><div><span>Personal notification center</span><h2>Updates that need your attention</h2><p>This is your own feed, not an organization-wide staff activity register.</p></div>{unread > 0 && <ActionButton disabled={markAll.isPending} onClick={() => markAll.mutate()}>Mark all read</ActionButton>}</header><div className="engagement-notice-summary"><article><span>{cloneElement(Icons.bell, { size: 20 })}</span><div><small>Unread in this loaded view</small><strong>{formatBusinessNumber(unread)}</strong></div></article><article><span>{cloneElement(Icons.check, { size: 20 })}</span><div><small>Read in this loaded view</small><strong>{formatBusinessNumber(state.rows.length - unread)}</strong></div></article></div><WorkspaceState state={state} empty={!state.rows.length} emptyTitle="You are all caught up" emptyBody="New approvals, tasks, reports, and important organization updates will appear here."><div className="engagement-notice-list">{state.rows.map((item) => <article className={!item.read_at ? 'is-unread' : ''} key={item.id}><span>{cloneElement(item.read_at ? Icons.check : Icons.bell, { size: 17 })}</span><div><header><strong>{item.title || String(item.event_type || 'Update').replaceAll('_', ' ')}</strong><time>{formatOrganizationDate(item.created_at)}</time></header><p>{item.body || 'Open the related workspace for more information.'}</p><small>{String(item.event_type || 'organization update').replaceAll('_', ' ')}</small></div>{!item.read_at && <button type="button" disabled={markRead.isPending} onClick={() => markRead.mutate(item)}>Mark read</button>}</article>)}</div></WorkspaceState></section>;
}

function EngagementOverview({ campaigns, notifications, forms, canWrite, onNav, onCreate }) {
  const sent = campaigns.rows.filter((item) => item.status === 'sent').length;
  const drafts = campaigns.rows.filter((item) => item.status === 'draft').length;
  const unread = notifications.rows.filter((item) => !item.read_at).length;
  const responseForms = forms.rows.filter((item) => item.status === 'published').length;
  const states = { pending: campaigns.pending || notifications.pending || forms.pending, error: campaigns.error || notifications.error || forms.error, rows: [...campaigns.rows, ...notifications.rows, ...forms.rows], data: campaigns.data || notifications.data || forms.data, retry: () => Promise.all([campaigns.retry(), notifications.retry(), forms.retry()]) };
  return <WorkspaceState state={states}><section className="engagement-overview"><div className="engagement-kpis"><article><span>{cloneElement(Icons.chat, { size: 19 })}</span><small>Outreach sent</small><strong>{formatBusinessNumber(sent)}</strong><p>Completed messages in this view</p></article><article><span>{cloneElement(Icons.doc, { size: 19 })}</span><small>Open surveys</small><strong>{formatBusinessNumber(responseForms)}</strong><p>Collecting responses now</p></article><article className={drafts ? 'is-warn' : ''}><span>{cloneElement(Icons.flag, { size: 19 })}</span><small>Draft outreach</small><strong>{formatBusinessNumber(drafts)}</strong><p>Waiting for review or send time</p></article><article className={unread ? 'is-danger' : ''}><span>{cloneElement(Icons.bell, { size: 19 })}</span><small>Unread updates</small><strong>{formatBusinessNumber(unread)}</strong><p>Personal notifications in this view</p></article></div><div className="engagement-overview-grid"><section><header><div><span>Forms and surveys</span><h2>Feedback with readable results</h2></div><ActionButton onClick={() => onNav?.('forms')}>Open forms</ActionButton></header><div>{forms.rows.slice(0, 4).map((form) => <button type="button" onClick={() => onNav?.(`forms/${form.id}`)} key={form.id}><span>{cloneElement(Icons.flag, { size: 16 })}</span><div><strong>{form.title}</strong><small>{form.is_anonymous ? 'Anonymous answers' : 'Identified answers'} · {(form.form_fields || []).length} questions</small></div><StatusPill value={form.status} /></button>)}{!forms.rows.length && <EngagementOverviewEmpty icon={Icons.flag} title="No forms yet" body="Published forms and response progress will appear here." />}</div></section><section><header><div><span>Outreach</span><h2>Recent student communication</h2></div>{canWrite && <ActionButton icon={Icons.plus} onClick={onCreate}>Create</ActionButton>}</header><div>{campaigns.rows.slice(0, 4).map((campaign) => <button type="button" onClick={() => onNav?.('engagement/campaigns')} key={campaign.id}><span>{cloneElement(Icons.chat, { size: 16 })}</span><div><strong>{campaign.name}</strong><small>{campaign.branch_name || 'Entire organization'} · {formatBusinessNumber(campaign.total)} recipients</small></div><StatusPill value={campaign.status} tone={toneForCampaign(campaign.status)} /></button>)}{!campaigns.rows.length && <EngagementOverviewEmpty icon={Icons.chat} title="No outreach prepared" body="New student and family updates will be listed here." />}</div></section></div></section></WorkspaceState>;
}

export function EngagementPage({ user, route = 'engagement/overview', onNav }) {
  useWorkspaceTitle('Community engagement');
  const { segments } = workspaceRoute(route);
  const active = activeSection(segments[1]);
  const canCampaignRead = canUseCapability(user, 'campaign:read');
  const canCampaignWrite = canUseCapability(user, 'campaign:write');
  const canCampaignSend = canUseCapability(user, 'campaign:send');
  const canFormsRead = canUseCapability(user, 'forms:read');
  const campaigns = useWorkspaceData('/api/v1/campaigns/', { page_size: 100, ordering: '-created_at' }, { enabled: canCampaignRead });
  const notifications = useWorkspaceData('/api/v1/notifications/', undefined, { enabled: canUseCapability(user, 'notifications:read') });
  const forms = useWorkspaceData('/api/v1/forms/', { page_size: 100, ordering: '-created_at' }, { enabled: canFormsRead });
  const branches = useWorkspaceData('/api/v1/org/branches/', { page_size: 100, ordering: 'name' }, { enabled: canCampaignWrite });
  const groups = useWorkspaceData('/api/v1/cohorts/', { page_size: 100, is_archived: false, ordering: 'name' }, { enabled: canCampaignWrite });
  const templates = useWorkspaceData('/api/v1/campaigns/templates/', { page_size: 100, is_active: true }, { enabled: canCampaignWrite });
  const [selectedId, setSelectedId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const selected = useMemo(() => campaigns.rows.find((item) => String(item.id) === String(selectedId)) || campaigns.rows[0] || null, [campaigns.rows, selectedId]);
  const recipients = useWorkspaceData(selected ? `/api/v1/campaigns/${selected.id}/recipients/` : null, { page_size: 100 }, { enabled: active === 'campaigns' && Boolean(selected) && canCampaignRead });
  const navigation = <SectionNav label="Community engagement" items={SECTIONS} active={active} basePath="engagement" onNav={onNav} />;
  return <main className="fw-page engagement-page"><WorkspaceHeader eyebrow="Community connection" title="Community engagement" description="Create purposeful outreach, review feedback in the Forms workspace, and keep personal updates clear—without technical records or configuration screens." actions={<>{canFormsRead && <ActionButton icon={Icons.flag} onClick={() => onNav?.('forms')}>Forms & surveys</ActionButton>}{canCampaignWrite && <ActionButton icon={Icons.plus} tone="primary" onClick={() => setComposerOpen(true)}>New outreach</ActionButton>}</>} /><WorkspaceLayout navigation={navigation}>{active === 'overview' && <EngagementOverview campaigns={campaigns} notifications={notifications} forms={forms} canWrite={canCampaignWrite} onNav={onNav} onCreate={() => setComposerOpen(true)} />}{active === 'campaigns' && <CampaignsView state={campaigns} recipients={recipients} selected={selected} selectedId={selectedId} setSelectedId={setSelectedId} canWrite={canCampaignWrite} canSend={canCampaignSend} onCreate={() => setComposerOpen(true)} />}{active === 'notifications' && <NotificationFeed state={notifications} />}</WorkspaceLayout><CampaignComposer open={composerOpen} branches={branches.rows} groups={groups.rows} templates={templates.rows} onClose={() => setComposerOpen(false)} /></main>;
}
