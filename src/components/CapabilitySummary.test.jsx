import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CapabilitySummary } from './CapabilitySummary.jsx';

describe('CapabilitySummary', () => {
  it('leads with understandable actions and keeps backend codes in a closed technical disclosure', () => {
    const html = renderToStaticMarkup(<CapabilitySummary capabilities={[
      'approvals:disburse',
      'finance:read',
      'loan:collect',
    ]} />);

    expect(html).toContain('3 allowed actions across 3 areas');
    expect(html).toContain('Release approved payouts');
    expect(html).toContain('View financial records');
    expect(html).toContain('Record loan repayments');
    expect(html).toContain('<details class="wf-access-technical">');
    expect(html).not.toContain('<details class="wf-access-technical" open="">');
    expect(html).toContain('Most people do not need these identifiers.');
    expect(html).toContain('<code>approvals:disburse</code>');
  });

  it('shows a calm empty state when no active access exists', () => {
    const html = renderToStaticMarkup(<CapabilitySummary capabilities={[]} />);

    expect(html).toContain('No active access is recorded for this person.');
    expect(html).not.toContain('Technical capability codes');
  });
});
