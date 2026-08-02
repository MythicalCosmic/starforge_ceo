import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { managementQueryState } from '../lib/managementQuery.js';
import { RenderedValue } from './BackendModule.jsx';

function renderField(format, value, extra = {}) {
  return renderToStaticMarkup(
    <RenderedValue field={{ key: 'value', format, ...extra }} row={{ value }} />,
  );
}

describe('management record numeric presentation', () => {
  it.each(['number', 'percent', 'count', 'bytes', 'minutes'])(
    'shows unavailable instead of coercing booleans for %s fields',
    (format) => {
      const falseValue = renderField(format, false);
      const trueValue = renderField(format, true);

      expect(falseValue).toContain('—');
      expect(trueValue).toContain('—');
      expect(falseValue).not.toMatch(/>0(?:%| B| min)?</);
      expect(trueValue).not.toMatch(/>1(?:%| B| min)?</);
    },
  );

  it('keeps genuine boolean status fields readable', () => {
    expect(renderField('boolean', false)).toContain('No');
    expect(renderField('boolean', true)).toContain('Yes');
  });

  it('shows malformed numeric text as unavailable', () => {
    expect(renderField('number', 'not-a-number')).toContain('—');
    expect(renderField('percent', 'not-a-rate')).toContain('—');
  });
});

describe('management register query boundary', () => {
  it('bounds and trims searches and cursors before any request uses them', () => {
    const query = new URLSearchParams({
      q: `  ${'q'.repeat(300)}\u0000  `,
      cursor: `  ${'c'.repeat(900)}\u0007  `,
      page: '3',
    }).toString();
    const state = managementQueryState(query);

    expect(state.search).toBe('q'.repeat(160));
    expect(state.cursor).toBe('c'.repeat(512));
    expect(state.page).toBe(3);
  });

  it('rejects unsafe page coercion', () => {
    expect(managementQueryState('page=true').page).toBe(1);
    expect(managementQueryState('page=2.5').page).toBe(1);
    expect(managementQueryState(`page=${Number.MAX_SAFE_INTEGER + 1}`).page).toBe(1);
  });
});
