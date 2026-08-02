import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  RouteLink,
  WorkspacePagination,
  WorkspaceState,
  WorkspaceTable,
} from './WorkspacePrimitives.jsx';
import { DataTable } from './common.jsx';

function clickEvent(overrides = {}) {
  const event = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    preventDefault: vi.fn(() => { event.defaultPrevented = true; }),
    ...overrides,
  };
  return event;
}

describe('RouteLink', () => {
  it('runs the caller handler before same-tab workspace navigation', () => {
    const onClick = vi.fn();
    const onNav = vi.fn();
    const anchor = RouteLink({ to: 'finance/overview', onNav, onClick, children: 'Finance' });
    const event = clickEvent();

    anchor.props.onClick(event);

    expect(onClick).toHaveBeenCalledWith(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onNav).toHaveBeenCalledWith('finance/overview');
  });

  it('respects cancellation and new-tab navigation', () => {
    const onNav = vi.fn();
    const cancel = RouteLink({ to: 'groups', onNav, onClick: (event) => event.preventDefault(), children: 'Groups' });
    const cancelledEvent = clickEvent();
    cancel.props.onClick(cancelledEvent);

    const externalTab = RouteLink({ to: 'groups', onNav, target: '_blank', children: 'Groups' });
    const newTabEvent = clickEvent();
    externalTab.props.onClick(newTabEvent);

    expect(onNav).not.toHaveBeenCalled();
    expect(newTabEvent.preventDefault).not.toHaveBeenCalled();
  });
});

describe('WorkspacePagination', () => {
  it('stays out of one-page registers', () => {
    expect(renderToStaticMarkup(<WorkspacePagination label="students" page={1} pages={1} total={8} onPage={vi.fn()} />)).toBe('');
  });

  it('exposes a compact, named page window for large registers', () => {
    const html = renderToStaticMarkup(<WorkspacePagination label="students" page={50} pages={100} total={2400} onPage={vi.fn()} />);

    expect(html).toContain('aria-label="students pages"');
    expect(html).toContain('Page 50 of 100');
    expect(html).toContain('2,400 students');
    expect(html).toContain('aria-label="Previous students page"');
    expect(html).toContain('aria-label="Next students page"');
    expect(html).toContain('aria-current="page"');
    expect((html.match(/aria-hidden="true">…/g) || [])).toHaveLength(2);
  });
});

describe('workspace accessibility primitives', () => {
  it('announces asynchronous loading and failure states', () => {
    const loading = renderToStaticMarkup(<WorkspaceState state={{ pending: true }} />);
    const failed = renderToStaticMarkup(
      <WorkspaceState state={{ error: new Error('failed'), rows: [], data: null, retry: vi.fn() }} />,
    );

    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-label="Preparing this view"');
    expect(failed).toContain('role="alert"');
  });

  it('makes horizontally scrollable tables a named keyboard region', () => {
    const html = renderToStaticMarkup(
      <WorkspaceTable
        label="Teachers"
        rows={[{ id: 1, name: 'Kamola' }]}
        columns={[{ key: 'name', label: 'Teacher' }]}
      />,
    );

    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Teachers, scrollable table"');
    expect(html).toContain('tabindex="0"');
  });

  it('gives legacy management tables their own accessible name', () => {
    const html = renderToStaticMarkup(
      <DataTable cols={[{ key: 'name', label: 'Name' }]} label="Academic records">
        <tr><td>Published result</td></tr>
      </DataTable>,
    );

    expect(html).toContain('<table class="ad-table" aria-label="Academic records">');
  });
});
