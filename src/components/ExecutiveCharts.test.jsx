import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ExecutiveSelect,
  PeriodBars,
  RankedBars,
  SegmentedBreakdown,
} from './ExecutiveCharts.jsx';
import { findEnabledOptionIndex } from '../lib/listboxNavigation.js';

describe('executive chart interactions', () => {
  it('keeps keyboard focus on enabled combobox options at both list edges', () => {
    const options = [
      { value: 'focus', disabled: true },
      { value: 'central' },
      { value: 'riverside', disabled: true },
    ];

    expect(findEnabledOptionIndex(options, 0, 1)).toBe(1);
    expect(findEnabledOptionIndex(options, 2, -1)).toBe(1);
    expect(findEnabledOptionIndex([{ value: 'only', disabled: true }], 0, 1)).toBe(-1);
  });

  it('uses a design-system combobox instead of a browser-native select', () => {
    const html = renderToStaticMarkup(
      <ExecutiveSelect
        label="Period"
        value="90d"
        options={[{ value: '30d', label: 'Last 30 days' }, { value: '90d', label: 'Last 90 days' }]}
        onChange={vi.fn()}
      />,
    );

    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('Last 90 days');
    expect(html).not.toContain('<select');
  });

  it('renders sparse time evidence as discrete focusable periods, not a continuous line', () => {
    const html = renderToStaticMarkup(
      <PeriodBars data={[
        { key: '2026-05', label: 'May 26', value: 100 },
        { key: '2026-06', label: 'Jun 26', value: 120 },
        { key: '2026-07', label: 'Jul 26', value: 380 },
        { key: '2026-08', label: 'Aug 26', value: 120 },
      ]} />,
    );

    expect(html).toContain('Scrollable discrete period comparison');
    expect(html).toContain('May 26');
    expect(html).toContain('Jul 26: 380');
    expect(html).not.toContain('<path');
    expect(html).not.toContain('<svg');
  });

  it('keeps denominators and supporting measures visible on interactive rankings', () => {
    const html = renderToStaticMarkup(
      <RankedBars
        data={[{
          id: 1,
          label: 'Central Campus',
          value: 82,
          detail: '6 active students',
          metrics: [{ label: 'Attendance', value: '87.5%' }, { label: 'At-risk share', value: '16.7%' }],
        }]}
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain('Attendance');
    expect(html).toContain('At-risk share');
    expect(html).toContain('aria-label="Open Central Campus, 82"');
  });

  it('never turns boolean or structured chart values into quantitative evidence', () => {
    const html = renderToStaticMarkup(
      <RankedBars data={[
        { label: 'Boolean true', value: true },
        { label: 'Boolean false', value: false },
        { label: 'Array value', value: [] },
        { label: 'Object value', value: { amount: 4 } },
        { label: 'Genuine zero', value: '0' },
        { label: 'Finite value', value: '5' },
      ]} />,
    );

    expect(html).not.toContain('Boolean true');
    expect(html).not.toContain('Boolean false');
    expect(html).not.toContain('Array value');
    expect(html).not.toContain('Object value');
    expect(html).toContain('Genuine zero');
    expect(html).toContain('Finite value');
  });

  it('uses directly explorable composition rows instead of a decorative donut', () => {
    const html = renderToStaticMarkup(
      <SegmentedBreakdown
        data={[{ label: 'Active', value: 17, color: 'green' }, { label: 'Accepted', value: 3, color: 'gold' }]}
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain('Active: 17, 85 percent');
    expect(html).toContain('Accepted: 3, 15 percent');
    expect(html).not.toContain('ex-donut');
  });
});
