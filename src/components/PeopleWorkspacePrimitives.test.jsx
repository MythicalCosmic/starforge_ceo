import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalRouteFilterValue,
  createDeferredRouteCommitter,
  DeferredFilterInput,
} from './PeopleWorkspacePrimitives.jsx';

describe('DeferredFilterInput', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps exact interior text while removing URL-only edge whitespace', () => {
    expect(canonicalRouteFilterValue('  Mohira   Olimova  ')).toBe('Mohira   Olimova');
    expect(canonicalRouteFilterValue(null)).toBe('');
  });

  it('coalesces rapid edits and commits through the newest route callback', () => {
    vi.useFakeTimers();
    const staleCommit = vi.fn();
    const currentCommit = vi.fn();
    const committer = createDeferredRouteCommitter(staleCommit, 320);

    committer.schedule('Mo');
    vi.advanceTimersByTime(120);
    committer.schedule('Mohira');
    committer.update(currentCommit);
    vi.advanceTimersByTime(319);

    expect(staleCommit).not.toHaveBeenCalled();
    expect(currentCommit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(currentCommit).toHaveBeenCalledTimes(1);
    expect(currentCommit).toHaveBeenCalledWith('Mohira');
  });

  it('flushes normalized text once and cancels abandoned work', () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const committer = createDeferredRouteCommitter(commit, 320);

    committer.schedule('  INV-2026-18  ');
    committer.flush('  INV-2026-18  ');
    vi.runAllTimers();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('INV-2026-18');

    committer.flush('INV-2026-18');
    expect(commit).toHaveBeenCalledTimes(1);

    committer.schedule('abandoned');
    committer.cancel();
    vi.runAllTimers();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('renders a bounded native search field with an accessible timing hint', () => {
    const html = renderToStaticMarkup(
      <DeferredFilterInput
        type="search"
        maxLength={120}
        value="Mohira"
        onCommit={vi.fn()}
      />,
    );

    expect(html).toContain('type="search"');
    expect(html).toContain('maxLength="120"');
    expect(html).toContain('value="Mohira"');
    expect(html).toContain('aria-describedby=');
    expect(html).toContain('Press Enter or leave this field to update now.');
  });
});
