import { describe, expect, it } from 'vitest';
import { buildMeetingPeople, resolveMeetingAudience } from './scheduleAudience.js';

const contacts = [
  { principal_kind: 'staff', profile_id: 1, display_name: 'Branch Manager', role_label: 'Manager' },
  { principal_kind: 'teacher', profile_id: 2, display_name: 'English Teacher', role_label: 'Teacher' },
  { principal_kind: 'teacher', profile_id: 3, display_name: 'Math Teacher', role_label: 'Teacher' },
];
const staff = [{ id: 1, role_memberships: [{ branch: 10, department: 20, branch_name: 'Central', department_name: 'Operations' }] }];
const teachers = [
  { id: 2, branch: 10, department: 30, branch_name: 'Central', department_name: 'English' },
  { id: 3, branch: 11, department: 31, branch_name: 'North', department_name: 'Maths' },
];

describe('meeting audience resolution', () => {
  const people = buildMeetingPeople(contacts, staff, teachers);

  it('resolves exact people without duplicate principals', () => {
    const duplicated = buildMeetingPeople([...contacts, contacts[0]], staff, teachers);
    expect(duplicated).toHaveLength(3);
    expect(resolveMeetingAudience({ mode: 'people', targets: ['staff:1'], people })).toMatchObject([{ key: 'staff:1' }]);
  });

  it('expands departments and branches to real principal selectors', () => {
    expect(resolveMeetingAudience({ mode: 'departments', targets: ['30'], people }).map((item) => item.key)).toEqual(['teacher:2']);
    expect(resolveMeetingAudience({ mode: 'branches', targets: ['10'], people }).map((item) => item.key)).toEqual(['staff:1', 'teacher:2']);
  });

  it('honors the meeting branch for organization-wide audiences', () => {
    expect(resolveMeetingAudience({ mode: 'organization', people, branch: '11' }).map((item) => item.key)).toEqual(['teacher:3']);
  });
});
