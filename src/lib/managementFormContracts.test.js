import { describe, expect, it } from 'vitest';
import { lookupForField, operationContract } from './managementFormContracts.js';

const post = (path) => ({ method: 'post', path });

describe('management form contracts', () => {
  it('publishes typed fields for organization actions whose legacy schema is empty', () => {
    const branch = operationContract(post('/api/v1/org/branches/'));
    const department = operationContract(post('/api/v1/org/departments/'));
    const room = operationContract(post('/api/v1/org/rooms/'));

    expect(branch.schema.required).toEqual(['name', 'slug']);
    expect(Object.keys(branch.schema.properties)).toEqual(expect.arrayContaining([
      'name', 'slug', 'timezone', 'max_students', 'max_teachers',
    ]));
    expect(department.schema.required).toEqual(['branch', 'name', 'slug']);
    expect(department.schema.properties.head['x-lookup']).toBe('teachers');
    expect(room.workflow).toBe('create-room');
    expect(room.schema.properties.assignment_group['x-client-only']).toBe(true);
    expect(room.schema.properties.responsible_teacher['x-visible-when']).toEqual({
      field: 'assignment_group',
      present: true,
    });
  });

  it('keeps achievement creation typed and does not invent unknown contracts', () => {
    const achievement = operationContract(post('/api/v1/achievements/'));

    expect(achievement.schema.required).toEqual(['name', 'scope']);
    expect(achievement.schema.properties.scope.enum).toEqual(['global', 'group']);
    expect(operationContract(post('/api/v1/unknown/'))).toBeNull();
  });

  it('resolves role-native lookup collections', () => {
    expect(lookupForField('head', { 'x-lookup': 'teachers' })).toEqual(expect.objectContaining({
      path: '/api/v1/teachers/',
    }));
    expect(lookupForField('assignment_group', { 'x-lookup': 'cohorts' })).toEqual(expect.objectContaining({
      path: '/api/v1/cohorts/',
    }));
  });
});
