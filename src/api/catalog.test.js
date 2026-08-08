import { describe, expect, it } from 'vitest';
import { BACKEND_CATALOG, BACKEND_PAGE_ROUTE_IDS, backendModule } from './catalog.js';

describe('backend management catalog', () => {
  it('publishes a stable route id for every module', () => {
    expect(BACKEND_PAGE_ROUTE_IDS).toEqual(Object.keys(BACKEND_CATALOG));
    expect(new Set(BACKEND_PAGE_ROUTE_IDS).size).toBe(BACKEND_PAGE_ROUTE_IDS.length);

    BACKEND_PAGE_ROUTE_IDS.forEach((routeId) => {
      expect(backendModule(routeId)).toBe(BACKEND_CATALOG[routeId]);
    });
    expect(backendModule('not-a-module')).toBeNull();
  });

  it('defines explicit, read-only list and detail fields for every tab', () => {
    const listPaths = [];
    const allPaths = [];

    Object.values(BACKEND_CATALOG).forEach((module) => {
      expect(module.title).toBeTruthy();
      expect(module.description).toBeTruthy();
      expect(module.tabs.length).toBeGreaterThan(0);
      expect(new Set(module.tabs.map((tab) => tab.id)).size).toBe(module.tabs.length);

      module.tabs.forEach((tab) => {
        expect(tab.path).toMatch(/^\/api\/v1\/.+\/$/);
        expect(tab.columns.length).toBeGreaterThan(0);
        expect(tab.detail.length).toBeGreaterThan(0);
        expect(tab.pageSize).toBeGreaterThan(0);
        expect(tab.actions).toBeUndefined();

        [...tab.columns, ...tab.detail].forEach((field) => {
          expect(field.key).toBeTruthy();
          expect(field.label).toBeTruthy();
          expect(field.format).toBeTruthy();
        });

        listPaths.push(tab.path);
        allPaths.push(tab.path);
        if (tab.detailPath) {
          expect(tab.detailPath).toMatch(/^\/api\/v1\/.+\/$/);
          allPaths.push(tab.detailPath);
        }

        const relations = tab.related || [];
        expect(new Set(relations.map((relation) => relation.id)).size).toBe(relations.length);
        relations.forEach((relation) => {
          expect(relation.path).toMatch(/^\/api\/v1\/.+\{[^}]+\}.*\/$/);
          expect(relation.columns.length).toBeGreaterThan(0);
          expect(['none', 'page']).toContain(relation.pagination);
          expect(relation.actions).toBeUndefined();
          relation.columns.forEach((relationField) => {
            expect(relationField.key).toBeTruthy();
            expect(relationField.label).toBeTruthy();
            expect(relationField.format).toBeTruthy();
          });
          (relation.summaryFields || []).forEach((summaryField) => {
            expect(summaryField.key).toBeTruthy();
            expect(summaryField.label).toBeTruthy();
            expect(summaryField.format).toBeTruthy();
          });
          allPaths.push(relation.path);
        });
      });
    });

    expect(listPaths).toHaveLength(112);
    expect(new Set(allPaths).size).toBe(allPaths.length);
    expect(allPaths).toHaveLength(221);
  });

  it('does not issue a false GET for access assignment detail', () => {
    const access = BACKEND_CATALOG.backendAccess;
    const assignments = access.tabs.find((tab) => tab.id === 'assignments');

    expect(assignments.path).toBe('/api/v1/access/types/assignments/');
    expect(assignments.detailPath).toBeUndefined();
  });

  it('does not turn side-effecting or falsely documented GET routes into read panels', () => {
    const configuredPaths = Object.values(BACKEND_CATALOG).flatMap((module) =>
      module.tabs.flatMap((resource) => [
        resource.path,
        ...(resource.detailPath ? [resource.detailPath] : []),
        ...(resource.related || []).map((relation) => relation.path),
      ]),
    );

    expect(configuredPaths).not.toContain('/api/v1/cards/wallets/{id}/');
    expect(configuredPaths).not.toContain('/api/v1/achievements/{id}/approve/');
    expect(configuredPaths).not.toContain('/api/v1/achievements/{id}/reject/');
  });

  it('uses only clear GET contracts for CRM and payroll and excludes unsafe generic workflows', () => {
    const crm = BACKEND_CATALOG.backendCRM;
    const payroll = BACKEND_CATALOG.backendPayroll;
    const configuredPaths = [...crm.tabs, ...payroll.tabs].flatMap((resource) => [
      resource.path,
      ...(resource.detailPath ? [resource.detailPath] : []),
      ...(resource.related || []).map((relation) => relation.path),
    ]);

    expect(crm.permission).toBe('crm:read');
    expect(payroll.permission).toBe('compensation:read');
    expect(configuredPaths).toEqual(expect.arrayContaining([
      '/api/v1/crm/leads/',
      '/api/v1/crm/leads/{id}/stage-history/',
      '/api/v1/payroll/periods/',
      '/api/v1/payroll/periods/{id}/lines/',
      '/api/v1/payroll/adjustments/',
    ]));
    expect(configuredPaths).not.toContain('/api/v1/crm/funnel/');
    expect(configuredPaths).not.toContain('/api/v1/payroll/periods/{id}/run/');
    expect(configuredPaths).not.toContain('/api/v1/payroll/periods/{id}/approve/');
    expect(configuredPaths).not.toContain('/api/v1/payroll/periods/{id}/exports/');
  });
});
