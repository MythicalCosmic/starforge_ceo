import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockHttpRequest } from './mockFixtures.js';

describe('backend-off design preview', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns an explicit sample-data warning for an unprepared collection', async () => {
    const response = await mockHttpRequest('GET', '/api/v1/operations/not-prepared/', {
      withMeta: true,
    });
    expect(response.data).toEqual([]);
    expect(response.warnings).toHaveLength(1);
  });

  it('distinguishes a missing known record from an unprepared collection', async () => {
    await expect(mockHttpRequest('GET', '/api/v1/students/999/'))
      .rejects.toMatchObject({ status: 404 });
  });

  it('keeps routed branch, student, group, and teacher relationships consistent', async () => {
    const branch = await mockHttpRequest('GET', '/api/v1/org/branches/1/');
    const student = await mockHttpRequest('GET', '/api/v1/students/101/');
    const cohort = await mockHttpRequest('GET', `/api/v1/cohorts/${student.current_cohort}/`);
    const teacher = await mockHttpRequest('GET', `/api/v1/teachers/${cohort.primary_teacher}/`);
    const members = await mockHttpRequest('GET', `/api/v1/cohorts/${cohort.id}/members/`);

    expect(branch).toMatchObject({ id: 1, name: 'Central Campus', sample_only: true });
    expect(student).toMatchObject({ branch: branch.id, current_cohort: cohort.id, sample_only: true });
    expect(cohort).toMatchObject({ branch: branch.id, primary_teacher: teacher.id, sample_only: true });
    expect(teacher).toMatchObject({ branch: branch.id, full_name: cohort.primary_teacher_name, sample_only: true });
    expect(members).toEqual(expect.arrayContaining([
      expect.objectContaining({ cohort: cohort.id, student: student.id, student_name: student.full_name }),
    ]));
  });

  it('provides several months of group lessons and attendance with inclusive range filters', async () => {
    const lessons = await mockHttpRequest('GET', '/api/v1/schedule/lessons/', {
      params: { cohort: 11, page_size: 100 },
    });
    const julyAttendance = await mockHttpRequest('GET', '/api/v1/attendance/records/', {
      params: {
        cohort: 11,
        student: 101,
        teacher: 201,
        date_from: '2026-07-01T00:00:00+05:00',
        date_to: '2026-07-31T23:59:59+05:00',
        page_size: 100,
      },
    });
    const dashboard = await mockHttpRequest('GET', '/api/v1/attendance/cohorts/11/dashboard/', {
      params: { date_from: '2026-07-01', date_to: '2026-07-31' },
    });

    expect(new Set(lessons.map((lesson) => lesson.starts_at.slice(0, 7))).size).toBeGreaterThanOrEqual(4);
    expect(julyAttendance).toHaveLength(3);
    expect(julyAttendance.every((row) => row.student === 101 && row.teacher === 201 && row.lesson_starts_at.startsWith('2026-07'))).toBe(true);
    expect(dashboard.students.find((row) => row.student === 101)?.total).toBe(3);
    expect(dashboard.rate).toBeGreaterThan(0);
  });

  it('filters people by branch, group, teacher, status, and enrollment dates', async () => {
    const response = await mockHttpRequest('GET', '/api/v1/students/', {
      params: {
        branch: 1,
        cohort: 11,
        teacher: 201,
        status: 'active',
        joined_after: '2025-09-01',
        joined_before: '2025-12-31',
        page_size: 100,
      },
    });

    expect(response.map((student) => student.id)).toEqual([101, 104]);

    const supportingTeacherStudents = await mockHttpRequest('GET', '/api/v1/students/', {
      params: { teacher: 204, page_size: 100 },
    });
    expect(supportingTeacherStudents.map((student) => student.id)).toEqual([101, 104]);
  });

  it('provides linked academic and financial registers with working filters', async () => {
    const exams = await mockHttpRequest('GET', '/api/v1/academics/exams/', {
      params: { cohort: 11, date_from: '2026-07-01', date_to: '2026-07-31', page_size: 100 },
    });
    const results = await mockHttpRequest('GET', '/api/v1/academics/exams/822/results/');
    const assignments = await mockHttpRequest('GET', '/api/v1/assignments/', {
      params: { cohort: 11, status: 'published', page_size: 100 },
    });
    const invoices = await mockHttpRequest('GET', '/api/v1/finance/invoices/', {
      params: { branch: 1, student: 101, status: 'partially_paid', date_from: '2026-07-01', date_to: '2026-07-31', page_size: 100 },
    });
    const payments = await mockHttpRequest('GET', '/api/v1/payments/', {
      params: { branch: 1, provider: 'bank_transfer', status: 'completed', date_from: '2026-07-01', date_to: '2026-07-31', page_size: 100 },
    });

    expect(exams).toEqual([expect.objectContaining({ id: 822, cohort: 11, subject_name: 'Academic English' })]);
    expect(results).toHaveLength(2);
    expect(assignments).toEqual([expect.objectContaining({ id: 851, cohort: 11 })]);
    expect(invoices).toEqual([expect.objectContaining({ id: 703, student: 101, cohort: 11 })]);
    expect(payments).toEqual([expect.objectContaining({ id: 903, invoice: 703 })]);
  });

  it('provides linked family contacts and branch-safe content relationships', async () => {
    const [parents, guardians, centralLibraries, riversideLibraries] = await Promise.all([
      mockHttpRequest('GET', '/api/v1/parents/', { params: { page_size: 100 } }),
      mockHttpRequest('GET', '/api/v1/parents/guardians/', { params: { student: 101, page_size: 100 } }),
      mockHttpRequest('GET', '/api/v1/content/libraries/', { params: { branch: 1, page_size: 100 } }),
      mockHttpRequest('GET', '/api/v1/content/libraries/', { params: { branch: 2, page_size: 100 } }),
    ]);

    expect(parents).toHaveLength(8);
    expect(guardians).toEqual([expect.objectContaining({ student: 101, parent: 501, parent_name: 'Zarina Karimova' })]);
    expect(parents.find((parent) => parent.id === guardians[0].parent)).toMatchObject({ branch: 1, full_name: guardians[0].parent_name });
    expect(centralLibraries).toEqual([expect.objectContaining({ department: 31, cohort: null })]);
    expect(riversideLibraries).toEqual([expect.objectContaining({ department: null, cohort: 21 })]);
  });

  it('keeps every branch-attributed manager record inside Central Campus', async () => {
    vi.stubGlobal('window', { location: { search: '?role=manager' } });
    const [students, teachers, cohorts, branches, signals, invoices, payments, expenses, exams, lessons] = await Promise.all([
      mockHttpRequest('GET', '/api/v1/students/', { params: { page_size: 100 } }),
      mockHttpRequest('GET', '/api/v1/teachers/', { params: { page_size: 100 } }),
      mockHttpRequest('GET', '/api/v1/cohorts/', { params: { page_size: 100 } }),
      mockHttpRequest('GET', '/api/v1/org/branches/', { params: { page_size: 100 } }),
      mockHttpRequest('GET', '/api/v1/intelligence/branches/', { params: { page_size: 100 } }),
      mockHttpRequest('GET', '/api/v1/finance/invoices/', { params: { page_size: 100 } }),
      mockHttpRequest('GET', '/api/v1/payments/', { params: { page_size: 100 } }),
      mockHttpRequest('GET', '/api/v1/finance/expenses/', { params: { page_size: 100 } }),
      mockHttpRequest('GET', '/api/v1/academics/exams/', { params: { page_size: 100 } }),
      mockHttpRequest('GET', '/api/v1/schedule/lessons/', { params: { page_size: 100 } }),
    ]);
    const centralCohorts = new Set(cohorts.map((cohort) => cohort.id));

    [students, teachers, cohorts, invoices, payments, expenses, lessons].forEach((rows) => {
      expect(rows.every((item) => item.branch === 1)).toBe(true);
    });
    expect(branches).toEqual([expect.objectContaining({ id: 1, name: 'Central Campus' })]);
    expect(signals).toEqual([expect.objectContaining({ branch: 1, name: 'Central Campus' })]);
    expect(exams.every((exam) => centralCohorts.has(exam.cohort))).toBe(true);
    await expect(mockHttpRequest('GET', '/api/v1/org/branches/2/')).rejects.toMatchObject({ status: 404 });
    await expect(mockHttpRequest('GET', '/api/v1/attendance/cohorts/21/dashboard/')).rejects.toMatchObject({ status: 404 });
  });

  it('provides an internally consistent complete decision snapshot', async () => {
    const [response, students, attendance, payments] = await Promise.all([
      mockHttpRequest('GET', '/api/v1/intelligence/executive-summary/', { withMeta: true }),
      mockHttpRequest('GET', '/api/v1/students/', { params: { page_size: 100 } }),
      mockHttpRequest('GET', '/api/v1/attendance/records/', { params: { page_size: 100 } }),
      mockHttpRequest('GET', '/api/v1/payments/', { params: { status: 'completed', page_size: 100 } }),
    ]);
    const denominator = attendance.filter((row) => row.status !== 'excused').length;
    const collectedMinor = payments.reduce((sum, payment) => sum + Number(payment.amount_uzs) * 100, 0);

    expect(response.warnings).toBeUndefined();
    expect(response.data.sample_only).toBe(true);
    expect(response.data.students.total).toBe(students.length);
    expect(response.data.students.active).toBe(students.filter((student) => student.status === 'active').length);
    expect(response.data.attendance.denominator).toBe(denominator);
    expect(response.data.finance.collected).toEqual({ amount_minor: collectedMinor, currency: 'UZS' });
    expect(response.data.coverage.finance.status).toBe('complete');
  });

  it('permission-prunes manager student leadership snapshots', async () => {
    vi.stubGlobal('window', { location: { search: '?role=manager' } });

    const profile = await mockHttpRequest(
      'GET',
      '/api/v1/students/101/leadership-profile/',
    );

    expect(profile.identity.branch).toMatchObject({ id: 1, name: 'Central Campus' });
    expect(profile.coverage.family).toEqual({ status: 'not_authorized' });
    expect(profile.coverage.finance).toEqual({ status: 'not_authorized' });
    expect(profile).not.toHaveProperty('family');
    expect(profile).not.toHaveProperty('finance');
  });
});
