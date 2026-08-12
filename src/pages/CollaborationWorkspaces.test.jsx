import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../context/ToastContext.jsx', () => ({
  useToast: () => ({ success: vi.fn(), warning: vi.fn(), danger: vi.fn() }),
}));

vi.mock('../hooks/useWorkspaceData.js', () => ({
  useWorkspaceData(path, _params, options = {}) {
    const rowsByPath = {
      '/api/v1/tasks/': [{
        id: 4,
        title: 'Review the August learning plan',
        description: 'Confirm the final milestones with every department.',
        status: 'in_progress',
        priority: 'high',
        assignee_name: 'Demo Director',
        due_at: '2026-08-20T09:00:00Z',
      }],
      '/api/v1/org/staff/': [{ id: 8, full_name: 'Operations Lead' }],
      '/api/v1/teachers/': [{ id: 9, full_name: 'Lead Teacher', branch: 2, department: 3 }],
      '/api/v1/org/departments/': [{ id: 3, name: 'English', branch: 2, branch_name: 'Main Branch' }],
      '/api/v1/org/branches/': [{ id: 2, name: 'Main Branch' }],
      '/api/v1/messaging/contacts/': [
        { user_id: 1, principal_kind: 'staff', profile_id: 1, display_name: 'Demo Director', role_label: 'Director' },
        { user_id: 22, principal_kind: 'teacher', profile_id: 9, display_name: 'Lead Teacher', role_label: 'Teacher' },
      ],
      '/api/v1/messaging/threads/': [{
        id: 12,
        subject: 'Leadership team',
        participants: [{ user: 1 }, { user: 22 }],
        unread_count: 2,
        notifications_muted: false,
        archived: false,
        created_at: '2026-08-13T08:00:00Z',
      }],
      '/api/v1/messaging/threads/12/messages/': [{
        id: 18,
        sender: 22,
        body: 'The branch update is ready.',
        attachments: [],
        created_at: '2026-08-13T08:05:00Z',
      }],
      '/api/v1/forms/': [{
        id: 30,
        title: 'Family experience pulse',
        description: 'Monthly service feedback.',
        status: 'published',
        is_anonymous: false,
        audience_roles: ['parent'],
        form_fields: [{ id: 41, label: 'How was your experience?', field_type: 'rating' }],
        created_at: '2026-08-12T08:00:00Z',
      }],
      '/api/v1/forms/30/responses/': [{
        id: 51,
        respondent_principal: { kind: 'teacher', id: 9 },
        answers: [{ field: 41, value: 5 }],
        created_at: '2026-08-13T08:10:00Z',
      }],
    };
    const detailByPath = {
      '/api/v1/forms/30/summary/': {
        response_count: 1,
        fields: [{
          field: 41,
          label: 'How was your experience?',
          field_type: 'rating',
          summary: { answered: 1, avg: 5, min: 5, max: 5 },
        }],
      },
    };
    const enabled = options.enabled ?? Boolean(path);
    const rows = enabled ? rowsByPath[path] || [] : [];
    const data = enabled
      ? detailByPath[path] || { count: rows.length, results: rows }
      : null;
    return {
      enabled,
      data,
      rows,
      total: rows.length,
      pagination: path === '/api/v1/messaging/contacts/' ? { self_user_id: 1 } : null,
      pending: false,
      paused: false,
      error: null,
      complete: true,
      retry: vi.fn(),
    };
  },
}));

import { FormsPage, MessagesPage, TasksPage } from './CollaborationWorkspaces.jsx';

const director = {
  id: 1,
  principal_kind: 'staff',
  effective_permissions: [
    'tasks:read',
    'tasks:write',
    'users:read',
    'teachers:read',
    'org:read',
    'messaging:read',
    'messaging:write',
    'forms:read',
    'forms:write',
  ],
};

describe('leadership collaboration workspaces', () => {
  it('renders the visible task workflow instead of a generic record inspector', () => {
    const html = renderToStaticMarkup(<TasksPage user={director} />);

    expect(html).toContain('Review the August learning plan');
    expect(html).toContain('In progress');
    expect(html).toContain('Create task');
    expect(html).toContain('task-board');
    expect(html).not.toContain('API payload');
  });

  it('renders a conversation and respects view-only messaging grants', () => {
    const writable = renderToStaticMarkup(<MessagesPage user={director} />);
    const viewOnly = renderToStaticMarkup(<MessagesPage user={{ effective_permissions: ['messaging:read'] }} />);

    expect(writable).toContain('Leadership team');
    expect(writable).toContain('The branch update is ready.');
    expect(writable).toContain('Write a message');
    expect(writable).toContain('New conversation');
    expect(viewOnly).toContain('available for viewing only');
    expect(viewOnly).not.toContain('Write a message');
    expect(viewOnly).not.toContain('New conversation');
  });

  it('shows identified form results in a human-readable review surface', () => {
    const html = renderToStaticMarkup(<FormsPage user={director} />);

    expect(html).toContain('Family experience pulse');
    expect(html).toContain('Individual responses');
    expect(html).toContain('Lead Teacher');
    expect(html).toContain('<b>5</b> average');
    expect(html).toContain('Create form');
    expect(html).not.toContain('JSON');
  });
});
