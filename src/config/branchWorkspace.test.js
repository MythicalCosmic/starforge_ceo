import { describe, expect, it } from 'vitest';
import { availableBranchSections, branchWorkspaceRoute } from './branchWorkspace.js';

describe('branch workspace routing', () => {
  it('accepts only positive canonical branch identifiers', () => {
    expect(branchWorkspaceRoute('branches/2/students')).toMatchObject({
      branchId: '2',
      section: 'students',
    });
    expect(branchWorkspaceRoute('branches/0/students')).toBeNull();
    expect(branchWorkspaceRoute('branches/0002/students')).toBeNull();
    expect(branchWorkspaceRoute('branches/-2/students')).toBeNull();
  });

  it('filters shared branch destinations by their exact capability', () => {
    const cfg = {
      destinations: [
        { id: 'content' },
        { id: 'finance' },
        { id: 'schedule' },
      ],
    };
    const printingOnly = availableBranchSections(cfg, ['printing:read']).map((item) => item.id);
    expect(printingOnly).toContain('printers');
    expect(printingOnly).not.toContain('content');
    expect(printingOnly).not.toContain('finance');
    expect(printingOnly).not.toContain('meetings');
  });
});
