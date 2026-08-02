import { ApiError } from './http.js';

// Deterministic sample-only records for the backend-off design preview. Nothing in
// this file is presented as production information, and every relationship uses
// the same stable IDs so routed detail pages remain honest and navigable.
const PREVIEW_NOW = '2026-08-02';
const CENTRAL_BRANCH_ID = 1;

const ORG_BRANCHES = Object.freeze([
  {
    id: 1,
    name: 'Central Campus',
    code: 'CENTRAL',
    city: 'Tashkent',
    address: '12 Amir Temur Avenue, Tashkent',
    phone: '+998 71 200 10 01',
    timezone: 'Asia/Tashkent',
    is_active: true,
    opened_at: '2021-08-16',
    created_at: '2021-06-01T05:00:00Z',
    sample_only: true,
  },
  {
    id: 2,
    name: 'Riverside Campus',
    code: 'RIVERSIDE',
    city: 'Tashkent',
    address: '8 Shahrisabz Street, Tashkent',
    phone: '+998 71 200 10 02',
    timezone: 'Asia/Tashkent',
    is_active: true,
    opened_at: '2023-01-09',
    created_at: '2022-11-10T05:00:00Z',
    sample_only: true,
  },
]);

const DEPARTMENTS = Object.freeze([
  { id: 31, branch: 1, branch_name: 'Central Campus', name: 'English', code: 'ENG-C', is_active: true, sample_only: true },
  { id: 32, branch: 1, branch_name: 'Central Campus', name: 'Exam Preparation', code: 'EXAM-C', is_active: true, sample_only: true },
  { id: 33, branch: 2, branch_name: 'Riverside Campus', name: 'Mathematics', code: 'MATH-R', is_active: true, sample_only: true },
  { id: 34, branch: 2, branch_name: 'Riverside Campus', name: 'English', code: 'ENG-R', is_active: true, sample_only: true },
]);

const TEACHERS = Object.freeze([
  {
    id: 201,
    first_name: 'Dilshod',
    last_name: 'Rahimov',
    full_name: 'Dilshod Rahimov',
    username: 'd.rahimov',
    phone: '+998 90 000 02 01',
    email: 'dilshod@example.test',
    birthdate: '1990-04-18',
    gender: 'm',
    branch: 1,
    branch_name: 'Central Campus',
    department: 31,
    department_name: 'English',
    subjects: ['Academic English', 'Speaking'],
    qualifications: 'CELTA, IELTS 8.5',
    salary_type: 'hourly',
    is_substitute: false,
    is_active: true,
    hire_date: '2022-08-15',
    last_login_at: '2026-08-01T03:42:00Z',
    created_at: '2022-08-15T03:00:00Z',
    sample_only: true,
  },
  {
    id: 203,
    first_name: 'Kamola',
    last_name: 'Ergasheva',
    full_name: 'Kamola Ergasheva',
    username: 'k.ergasheva',
    phone: '+998 90 000 02 03',
    email: 'kamola.teacher@example.test',
    birthdate: '1993-10-02',
    gender: 'f',
    branch: 1,
    branch_name: 'Central Campus',
    department: 32,
    department_name: 'Exam Preparation',
    subjects: ['General English', 'IELTS'],
    qualifications: 'DELTA Module 1, IELTS 8.0',
    salary_type: 'monthly',
    is_substitute: false,
    is_active: true,
    hire_date: '2023-02-06',
    last_login_at: '2026-08-01T04:12:00Z',
    created_at: '2023-02-06T03:00:00Z',
    sample_only: true,
  },
  {
    id: 204,
    first_name: 'Jasur',
    last_name: 'Tursunov',
    full_name: 'Jasur Tursunov',
    username: 'j.tursunov',
    phone: '+998 90 000 02 04',
    email: 'jasur@example.test',
    birthdate: '1988-07-22',
    gender: 'm',
    branch: 1,
    branch_name: 'Central Campus',
    department: 31,
    department_name: 'English',
    subjects: ['Writing', 'Academic English'],
    qualifications: 'MA Applied Linguistics',
    salary_type: 'hourly',
    is_substitute: true,
    is_active: true,
    hire_date: '2024-01-15',
    last_login_at: '2026-07-31T11:30:00Z',
    created_at: '2024-01-15T03:00:00Z',
    sample_only: true,
  },
  {
    id: 202,
    first_name: 'Nargiza',
    last_name: 'Usmonova',
    full_name: 'Nargiza Usmonova',
    username: 'n.usmonova',
    phone: '+998 90 000 02 02',
    email: 'nargiza@example.test',
    birthdate: '1989-01-28',
    gender: 'f',
    branch: 2,
    branch_name: 'Riverside Campus',
    department: 33,
    department_name: 'Mathematics',
    subjects: ['Mathematics', 'SAT'],
    qualifications: 'MSc Mathematics',
    salary_type: 'monthly',
    is_substitute: false,
    is_active: true,
    hire_date: '2023-01-20',
    last_login_at: '2026-08-01T04:20:00Z',
    created_at: '2023-01-20T03:00:00Z',
    sample_only: true,
  },
  {
    id: 205,
    first_name: 'Farida',
    last_name: 'Mamatova',
    full_name: 'Farida Mamatova',
    username: 'f.mamatova',
    phone: '+998 90 000 02 05',
    email: 'farida@example.test',
    birthdate: '1995-09-11',
    gender: 'f',
    branch: 2,
    branch_name: 'Riverside Campus',
    department: 34,
    department_name: 'English',
    subjects: ['English Foundations', 'Speaking'],
    qualifications: 'TESOL Certificate',
    salary_type: 'hourly',
    is_substitute: false,
    is_active: true,
    hire_date: '2024-08-19',
    last_login_at: '2026-07-30T06:05:00Z',
    created_at: '2024-08-19T03:00:00Z',
    sample_only: true,
  },
]);

const COHORTS = Object.freeze([
  {
    id: 11,
    name: 'Orion · B2',
    branch: 1,
    branch_name: 'Central Campus',
    department: 31,
    department_name: 'English',
    level: 'B2',
    primary_teacher: 201,
    primary_teacher_name: 'Dilshod Rahimov',
    teachers: [
      { id: 1101, teacher: 201, teacher_name: 'Dilshod Rahimov', teacher_type_name: 'Main teacher', teacher_type_slug: 'main-teacher', role: 'main' },
      { id: 1102, teacher: 204, teacher_name: 'Jasur Tursunov', teacher_type_name: 'Writing specialist', teacher_type_slug: 'specialist', role: 'support' },
    ],
    capacity: 18,
    start_date: '2026-01-12',
    end_date: '2026-09-30',
    default_room: 41,
    default_room_name: 'Samarqand',
    is_archived: false,
    created_at: '2025-12-10T05:00:00Z',
    sample_only: true,
  },
  {
    id: 12,
    name: 'Nova · B1',
    branch: 1,
    branch_name: 'Central Campus',
    department: 32,
    department_name: 'Exam Preparation',
    level: 'B1',
    primary_teacher: 203,
    primary_teacher_name: 'Kamola Ergasheva',
    teachers: [{ id: 1201, teacher: 203, teacher_name: 'Kamola Ergasheva', teacher_type_name: 'Main teacher', teacher_type_slug: 'main-teacher', role: 'main' }],
    capacity: 16,
    start_date: '2026-02-02',
    end_date: '2026-10-16',
    default_room: 42,
    default_room_name: 'Bukhara',
    is_archived: false,
    created_at: '2026-01-08T05:00:00Z',
    sample_only: true,
  },
  {
    id: 21,
    name: 'Atlas · C1',
    branch: 2,
    branch_name: 'Riverside Campus',
    department: 33,
    department_name: 'Mathematics',
    level: 'C1',
    primary_teacher: 202,
    primary_teacher_name: 'Nargiza Usmonova',
    teachers: [{ id: 2101, teacher: 202, teacher_name: 'Nargiza Usmonova', teacher_type_name: 'Main teacher', teacher_type_slug: 'main-teacher', role: 'main' }],
    capacity: 14,
    start_date: '2026-01-19',
    end_date: '2026-09-18',
    default_room: 51,
    default_room_name: 'Khiva',
    is_archived: false,
    created_at: '2025-12-18T05:00:00Z',
    sample_only: true,
  },
  {
    id: 22,
    name: 'Aurora · A2',
    branch: 2,
    branch_name: 'Riverside Campus',
    department: 34,
    department_name: 'English',
    level: 'A2',
    primary_teacher: 205,
    primary_teacher_name: 'Farida Mamatova',
    teachers: [{ id: 2201, teacher: 205, teacher_name: 'Farida Mamatova', teacher_type_name: 'Main teacher', teacher_type_slug: 'main-teacher', role: 'main' }],
    capacity: 12,
    start_date: '2025-10-06',
    end_date: '2026-06-30',
    default_room: 52,
    default_room_name: 'Nukus',
    is_archived: true,
    created_at: '2025-09-12T05:00:00Z',
    sample_only: true,
  },
]);

const STUDENTS = Object.freeze([
  {
    id: 101,
    student_id: 'SF-2401',
    first_name: 'Aziza',
    middle_name: '',
    last_name: 'Karimova',
    full_name: 'Aziza Karimova',
    username: 'aziza.k',
    phone: '+998 90 000 01 01',
    email: 'aziza@example.test',
    birthdate: '2009-08-04',
    gender: 'f',
    status: 'active',
    branch: 1,
    branch_name: 'Central Campus',
    current_cohort: 11,
    current_cohort_name: 'Orion · B2',
    academic_level: 'B2',
    enrollment_date: '2025-09-02',
    location: 'Yunusabad, Tashkent',
    previous_school: 'School 220',
    is_blocked: false,
    is_active: true,
    emergency_contacts: [{ name: 'Zarina Karimova', relationship: 'Mother', phone: '+998 90 700 01 01' }],
    medical_notes: 'Seasonal allergy noted by guardian.',
    last_login_at: '2026-07-31T13:20:00Z',
    created_at: '2025-09-02T03:30:00Z',
    updated_at: '2026-07-30T04:20:00Z',
    sample_only: true,
  },
  {
    id: 102,
    student_id: 'SF-2417',
    first_name: 'Timur',
    middle_name: 'Akmalovich',
    last_name: 'Abdullayev',
    full_name: 'Timur Abdullayev',
    username: 'timur.a',
    phone: '+998 90 000 01 02',
    email: 'timur@example.test',
    birthdate: '2010-02-19',
    gender: 'm',
    status: 'active',
    branch: 1,
    branch_name: 'Central Campus',
    current_cohort: 12,
    current_cohort_name: 'Nova · B1',
    academic_level: 'B1',
    enrollment_date: '2025-10-14',
    location: 'Mirzo Ulugbek, Tashkent',
    previous_school: 'School 64',
    is_blocked: true,
    blocked_at: '2026-07-25T05:00:00Z',
    block_reason: 'Family follow-up in progress',
    is_active: true,
    emergency_contacts: [{ name: 'Akmal Abdullayev', relationship: 'Father', phone: '+998 90 700 01 02' }],
    last_login_at: '2026-07-29T11:00:00Z',
    created_at: '2025-10-14T06:10:00Z',
    updated_at: '2026-07-29T09:10:00Z',
    sample_only: true,
  },
  {
    id: 104,
    student_id: 'SF-2462',
    first_name: 'Sabina',
    middle_name: '',
    last_name: 'Iskandarova',
    full_name: 'Sabina Iskandarova',
    username: 'sabina.i',
    phone: '+998 90 000 01 04',
    email: 'sabina@example.test',
    birthdate: '2008-11-15',
    gender: 'f',
    status: 'active',
    branch: 1,
    branch_name: 'Central Campus',
    current_cohort: 11,
    current_cohort_name: 'Orion · B2',
    academic_level: 'B2',
    enrollment_date: '2025-12-03',
    location: 'Chilanzar, Tashkent',
    previous_school: 'Academic Lyceum 2',
    is_blocked: false,
    is_active: true,
    created_at: '2025-12-03T04:20:00Z',
    updated_at: '2026-07-31T06:10:00Z',
    sample_only: true,
  },
  {
    id: 105,
    student_id: 'SF-2504',
    first_name: 'Bekzod',
    middle_name: '',
    last_name: 'Toshpulatov',
    full_name: 'Bekzod Toshpulatov',
    username: 'bekzod.t',
    phone: '+998 90 000 01 05',
    email: 'bekzod@example.test',
    birthdate: '2011-06-09',
    gender: 'm',
    status: 'active',
    branch: 1,
    branch_name: 'Central Campus',
    current_cohort: 12,
    current_cohort_name: 'Nova · B1',
    academic_level: 'B1',
    enrollment_date: '2026-02-11',
    location: 'Yakkasaray, Tashkent',
    previous_school: 'School 91',
    is_blocked: false,
    is_active: true,
    created_at: '2026-02-11T05:40:00Z',
    updated_at: '2026-07-28T12:20:00Z',
    sample_only: true,
  },
  {
    id: 107,
    student_id: 'SF-2571',
    first_name: 'Ziyoda',
    middle_name: '',
    last_name: 'Rasulova',
    full_name: 'Ziyoda Rasulova',
    username: 'ziyoda.r',
    phone: '+998 90 000 01 07',
    email: 'ziyoda@example.test',
    birthdate: '2010-12-22',
    gender: 'f',
    status: 'accepted',
    branch: 1,
    branch_name: 'Central Campus',
    current_cohort: null,
    current_cohort_name: '',
    academic_level: 'B1',
    enrollment_date: '2026-07-21',
    location: 'Shaykhantahur, Tashkent',
    previous_school: 'School 110',
    is_blocked: false,
    is_active: true,
    created_at: '2026-07-21T08:15:00Z',
    updated_at: '2026-07-31T07:05:00Z',
    sample_only: true,
  },
  {
    id: 103,
    student_id: 'SF-2488',
    first_name: 'Malika',
    middle_name: '',
    last_name: 'Saidova',
    full_name: 'Malika Saidova',
    username: 'malika.s',
    phone: '+998 90 000 01 03',
    email: 'malika@example.test',
    birthdate: '2008-05-06',
    gender: 'f',
    status: 'active',
    branch: 2,
    branch_name: 'Riverside Campus',
    current_cohort: 21,
    current_cohort_name: 'Atlas · C1',
    academic_level: 'C1',
    enrollment_date: '2026-01-09',
    location: 'Mirabad, Tashkent',
    previous_school: 'Academic Lyceum 1',
    is_blocked: false,
    is_active: true,
    created_at: '2026-01-09T02:45:00Z',
    updated_at: '2026-07-31T02:10:00Z',
    sample_only: true,
  },
  {
    id: 106,
    student_id: 'SF-2518',
    first_name: 'Kamola',
    middle_name: '',
    last_name: 'Yuldasheva',
    full_name: 'Kamola Yuldasheva',
    username: 'kamola.y',
    phone: '+998 90 000 01 06',
    email: 'kamola.student@example.test',
    birthdate: '2009-03-26',
    gender: 'f',
    status: 'active',
    branch: 2,
    branch_name: 'Riverside Campus',
    current_cohort: 21,
    current_cohort_name: 'Atlas · C1',
    academic_level: 'C1',
    enrollment_date: '2026-02-23',
    location: 'Sergeli, Tashkent',
    previous_school: 'School 300',
    is_blocked: false,
    is_active: true,
    created_at: '2026-02-23T04:45:00Z',
    updated_at: '2026-07-30T07:10:00Z',
    sample_only: true,
  },
  {
    id: 108,
    student_id: 'SF-2290',
    first_name: 'Sardor',
    middle_name: '',
    last_name: 'Khalilov',
    full_name: 'Sardor Khalilov',
    username: 'sardor.k',
    phone: '+998 90 000 01 08',
    email: 'sardor@example.test',
    birthdate: '2007-09-12',
    gender: 'm',
    status: 'graduated',
    branch: 2,
    branch_name: 'Riverside Campus',
    current_cohort: 22,
    current_cohort_name: 'Aurora · A2',
    academic_level: 'A2',
    enrollment_date: '2025-10-06',
    location: 'Bektemir, Tashkent',
    previous_school: 'School 289',
    is_blocked: false,
    is_active: true,
    created_at: '2025-10-06T03:00:00Z',
    updated_at: '2026-06-30T11:00:00Z',
    sample_only: true,
  },
]);

const COHORT_MEMBERS = Object.freeze([
  { id: 1001, cohort: 11, student: 101, student_name: 'Aziza Karimova', start_date: '2026-01-12', end_date: null, moved_reason: '', sample_only: true },
  { id: 1002, cohort: 11, student: 104, student_name: 'Sabina Iskandarova', start_date: '2026-01-12', end_date: null, moved_reason: '', sample_only: true },
  { id: 1003, cohort: 12, student: 102, student_name: 'Timur Abdullayev', start_date: '2026-02-02', end_date: null, moved_reason: '', sample_only: true },
  { id: 1004, cohort: 12, student: 105, student_name: 'Bekzod Toshpulatov', start_date: '2026-02-11', end_date: null, moved_reason: '', sample_only: true },
  { id: 1005, cohort: 21, student: 103, student_name: 'Malika Saidova', start_date: '2026-01-19', end_date: null, moved_reason: '', sample_only: true },
  { id: 1006, cohort: 21, student: 106, student_name: 'Kamola Yuldasheva', start_date: '2026-02-23', end_date: null, moved_reason: '', sample_only: true },
  { id: 1007, cohort: 22, student: 108, student_name: 'Sardor Khalilov', start_date: '2025-10-06', end_date: '2026-06-30', moved_reason: 'Program completed', sample_only: true },
]);

const LESSON_DATES = Object.freeze(['2026-05-06', '2026-05-20', '2026-06-03', '2026-06-17', '2026-07-01', '2026-07-15', '2026-07-29', '2026-08-01']);
const LESSON_TOPICS = Object.freeze(['Skills review', 'Applied practice', 'Progress workshop', 'Guided assessment']);
const LESSONS = Object.freeze(COHORTS.flatMap((cohort) => LESSON_DATES.map((date, index) => ({
  id: cohort.id * 100 + index + 1,
  cohort: cohort.id,
  cohort_name: cohort.name,
  branch: cohort.branch,
  branch_name: cohort.branch_name,
  teacher: cohort.primary_teacher,
  teacher_name: cohort.primary_teacher_name,
  title: `${LESSON_TOPICS[index % LESSON_TOPICS.length]} · ${cohort.level}`,
  starts_at: `${date}T04:00:00Z`,
  ends_at: `${date}T05:30:00Z`,
  room: cohort.default_room,
  room_name: cohort.default_room_name,
  lesson_type_name: index % 4 === 2 ? 'Assessment workshop' : 'Core lesson',
  status: 'completed',
  sample_only: true,
}))));

const ATTENDANCE = Object.freeze(LESSONS.flatMap((lesson, lessonIndex) => COHORT_MEMBERS
  .filter((member) => member.cohort === lesson.cohort)
  .filter((member) => !member.end_date || String(lesson.starts_at).slice(0, 10) <= member.end_date)
  .map((member) => {
    const student = STUDENTS.find((item) => item.id === member.student);
    const variant = (lessonIndex + member.student) % 11;
    const status = variant === 0 ? 'absent' : variant === 3 ? 'late' : variant === 7 ? 'excused' : 'present';
    return {
      id: lesson.id * 1000 + member.student,
      lesson: lesson.id,
      lesson_title: lesson.title,
      lesson_starts_at: lesson.starts_at,
      cohort: lesson.cohort,
      cohort_name: lesson.cohort_name,
      branch: lesson.branch,
      branch_name: lesson.branch_name,
      student: member.student,
      student_name: member.student_name,
      student_code: student?.student_id,
      teacher: lesson.teacher,
      teacher_name: lesson.teacher_name,
      status,
      note: status === 'late' ? 'Arrived after the opening activity.' : status === 'excused' ? 'Guardian notice recorded.' : '',
      marked_at: lesson.ends_at,
      created_at: lesson.ends_at,
      sample_only: true,
    };
  })));

const SUBJECTS = Object.freeze([
  { id: 801, name: 'Academic English', code: 'ENG-B2', description: 'Reading, writing, and academic communication.', department: 31, is_active: true, sample_only: true },
  { id: 802, name: 'General English', code: 'ENG-B1', description: 'Integrated language development.', department: 32, is_active: true, sample_only: true },
  { id: 803, name: 'Mathematics', code: 'MATH-C1', description: 'Advanced problem solving and quantitative reasoning.', department: 33, is_active: true, sample_only: true },
  { id: 804, name: 'English Foundations', code: 'ENG-A2', description: 'Foundational communication and grammar.', department: 34, is_active: true, sample_only: true },
]);

const EXAM_TYPES = Object.freeze([
  { id: 811, name: 'Progress check', slug: 'progress-check', color: '#28736d', is_active: true, sample_only: true },
  { id: 812, name: 'Mock exam', slug: 'mock-exam', color: '#b06d35', is_active: true, sample_only: true },
  { id: 813, name: 'Final assessment', slug: 'final-assessment', color: '#6f5a91', is_active: true, sample_only: true },
]);

const EXAMS = Object.freeze([
  { id: 821, title: 'B2 June progress check', cohort: 11, cohort_name: 'Orion · B2', subject: 801, subject_name: 'Academic English', term: 901, term_name: 'Summer 2026', exam_type: 811, exam_type_detail: { id: 811, name: 'Progress check', color: '#28736d' }, exam_date: '2026-06-18', max_score: '100', weight: '0.20', is_published: true, published_at: '2026-06-20T06:00:00Z', sample_only: true },
  { id: 822, title: 'B2 July writing mock', cohort: 11, cohort_name: 'Orion · B2', subject: 801, subject_name: 'Academic English', term: 901, term_name: 'Summer 2026', exam_type: 812, exam_type_detail: { id: 812, name: 'Mock exam', color: '#b06d35' }, exam_date: '2026-07-24', max_score: '100', weight: '0.30', is_published: true, published_at: '2026-07-27T05:00:00Z', sample_only: true },
  { id: 823, title: 'B1 integrated skills review', cohort: 12, cohort_name: 'Nova · B1', subject: 802, subject_name: 'General English', term: 901, term_name: 'Summer 2026', exam_type: 811, exam_type_detail: { id: 811, name: 'Progress check', color: '#28736d' }, exam_date: '2026-07-18', max_score: '80', weight: '0.25', is_published: false, published_at: null, sample_only: true },
  { id: 824, title: 'C1 mathematics mock', cohort: 21, cohort_name: 'Atlas · C1', subject: 803, subject_name: 'Mathematics', term: 901, term_name: 'Summer 2026', exam_type: 812, exam_type_detail: { id: 812, name: 'Mock exam', color: '#b06d35' }, exam_date: '2026-07-22', max_score: '100', weight: '0.30', is_published: true, published_at: '2026-07-24T05:00:00Z', sample_only: true },
  { id: 825, title: 'A2 program final', cohort: 22, cohort_name: 'Aurora · A2', subject: 804, subject_name: 'English Foundations', term: 900, term_name: 'Spring 2026', exam_type: 813, exam_type_detail: { id: 813, name: 'Final assessment', color: '#6f5a91' }, exam_date: '2026-06-25', max_score: '100', weight: '0.50', is_published: true, published_at: '2026-06-28T05:00:00Z', sample_only: true },
]);

const GRADES = Object.freeze([
  { id: 831, student: 101, student_name: 'Aziza Karimova', subject: 801, subject_name: 'Academic English', term: 901, value_raw: '91', value_display: 'A', is_published: true, computed_at: '2026-07-27T05:10:00Z', sample_only: true },
  { id: 832, student: 104, student_name: 'Sabina Iskandarova', subject: 801, subject_name: 'Academic English', term: 901, value_raw: '84', value_display: 'B+', is_published: true, computed_at: '2026-07-27T05:12:00Z', sample_only: true },
  { id: 833, student: 102, student_name: 'Timur Abdullayev', subject: 802, subject_name: 'General English', term: 901, value_raw: '72', value_display: 'B-', is_published: false, computed_at: '2026-07-19T05:00:00Z', sample_only: true },
  { id: 834, student: 105, student_name: 'Bekzod Toshpulatov', subject: 802, subject_name: 'General English', term: 901, value_raw: '78', value_display: 'B', is_published: false, computed_at: '2026-07-19T05:02:00Z', sample_only: true },
  { id: 835, student: 103, student_name: 'Malika Saidova', subject: 803, subject_name: 'Mathematics', term: 901, value_raw: '94', value_display: 'A', is_published: true, computed_at: '2026-07-24T05:10:00Z', sample_only: true },
  { id: 836, student: 106, student_name: 'Kamola Yuldasheva', subject: 803, subject_name: 'Mathematics', term: 901, value_raw: '87', value_display: 'A-', is_published: true, computed_at: '2026-07-24T05:12:00Z', sample_only: true },
  { id: 837, student: 108, student_name: 'Sardor Khalilov', subject: 804, subject_name: 'English Foundations', term: 900, value_raw: '89', value_display: 'A-', is_published: true, computed_at: '2026-06-28T05:10:00Z', sample_only: true },
]);

const EXAM_RESULTS = Object.freeze([
  { id: 841, exam: 822, student: 101, student_name: 'Aziza Karimova', score: '91', note: 'Strong structure and evidence.', graded_at: '2026-07-26T05:00:00Z', sample_only: true },
  { id: 842, exam: 822, student: 104, student_name: 'Sabina Iskandarova', score: '84', note: 'Clear improvement in cohesion.', graded_at: '2026-07-26T05:05:00Z', sample_only: true },
  { id: 843, exam: 823, student: 102, student_name: 'Timur Abdullayev', score: '72', note: 'Vocabulary follow-up recommended.', graded_at: '2026-07-19T05:00:00Z', sample_only: true },
  { id: 844, exam: 823, student: 105, student_name: 'Bekzod Toshpulatov', score: '78', note: '', graded_at: '2026-07-19T05:05:00Z', sample_only: true },
  { id: 845, exam: 824, student: 103, student_name: 'Malika Saidova', score: '94', note: 'Excellent quantitative reasoning.', graded_at: '2026-07-23T05:00:00Z', sample_only: true },
  { id: 846, exam: 824, student: 106, student_name: 'Kamola Yuldasheva', score: '87', note: '', graded_at: '2026-07-23T05:05:00Z', sample_only: true },
]);

const ASSIGNMENTS = Object.freeze([
  { id: 851, cohort: 11, title: 'Comparative essay', description: 'Write a structured comparison using two sources.', status: 'published', due_at: '2026-08-08T13:00:00Z', max_score: '40', max_resubmits: 1, published_at: '2026-07-29T05:00:00Z', created_at: '2026-07-28T05:00:00Z', sample_only: true },
  { id: 852, cohort: 11, title: 'Speaking reflection', description: 'Record a two-minute reflection on the current unit.', status: 'closed', due_at: '2026-07-25T13:00:00Z', max_score: '20', max_resubmits: 1, published_at: '2026-07-15T05:00:00Z', created_at: '2026-07-14T05:00:00Z', sample_only: true },
  { id: 853, cohort: 12, title: 'Integrated reading practice', description: 'Complete the timed reading set and corrections.', status: 'published', due_at: '2026-08-06T13:00:00Z', max_score: '30', max_resubmits: 2, published_at: '2026-07-30T05:00:00Z', created_at: '2026-07-29T05:00:00Z', sample_only: true },
  { id: 854, cohort: 21, title: 'Probability problem set', description: 'Solve and explain ten probability problems.', status: 'published', due_at: '2026-08-09T13:00:00Z', max_score: '50', max_resubmits: 1, published_at: '2026-07-28T05:00:00Z', created_at: '2026-07-27T05:00:00Z', sample_only: true },
  { id: 855, cohort: 22, title: 'Final portfolio', description: 'Submit the end-of-program language portfolio.', status: 'closed', due_at: '2026-06-27T13:00:00Z', max_score: '100', max_resubmits: 0, published_at: '2026-06-10T05:00:00Z', created_at: '2026-06-09T05:00:00Z', sample_only: true },
]);

const GUARDIANS = Object.freeze([
  { id: 861, student: 101, parent: 501, parent_name: 'Zarina Karimova', relationship: 'mother', is_primary: true, custody_notes: 'Primary contact for academic matters.', sample_only: true },
  { id: 862, student: 102, parent: 502, parent_name: 'Akmal Abdullayev', relationship: 'father', is_primary: true, custody_notes: 'Call before schedule changes.', sample_only: true },
  { id: 863, student: 103, parent: 503, parent_name: 'Madina Saidova', relationship: 'mother', is_primary: true, custody_notes: '', sample_only: true },
  { id: 864, student: 104, parent: 504, parent_name: 'Nodira Iskandarova', relationship: 'mother', is_primary: true, custody_notes: 'Preferred contact for learning updates.', sample_only: true },
  { id: 865, student: 105, parent: 505, parent_name: 'Rustam Toshpulatov', relationship: 'father', is_primary: true, custody_notes: '', sample_only: true },
  { id: 866, student: 106, parent: 506, parent_name: 'Saida Yuldasheva', relationship: 'mother', is_primary: true, custody_notes: 'Use the family contact number for schedule changes.', sample_only: true },
  { id: 867, student: 107, parent: 507, parent_name: 'Otabek Rasulov', relationship: 'father', is_primary: true, custody_notes: 'Placement updates requested by phone.', sample_only: true },
  { id: 868, student: 108, parent: 508, parent_name: 'Farrukh Khalilov', relationship: 'father', is_primary: true, custody_notes: 'Program completion contact.', sample_only: true },
]);

const PARENTS = Object.freeze([
  { id: 501, branch: 1, branch_name: 'Central Campus', full_name: 'Zarina Karimova', username: 'zarina.k', phone: '+998 90 700 01 01', email: 'zarina@example.test', workplace: 'Tashkent Medical Academy', notes: 'Primary academic contact for Aziza.', is_active: true, last_login_at: '2026-07-31T15:10:00Z', created_at: '2025-09-02T03:35:00Z', sample_only: true },
  { id: 502, branch: 1, branch_name: 'Central Campus', full_name: 'Akmal Abdullayev', username: 'akmal.a', phone: '+998 90 700 01 02', email: 'akmal@example.test', workplace: 'UzAuto Services', notes: 'Preferred contact for schedule changes.', is_active: true, last_login_at: '2026-07-29T12:20:00Z', created_at: '2025-10-14T06:15:00Z', sample_only: true },
  { id: 503, branch: 2, branch_name: 'Riverside Campus', full_name: 'Madina Saidova', username: 'madina.s', phone: '+998 90 700 01 03', email: 'madina@example.test', workplace: 'National University of Uzbekistan', notes: '', is_active: true, last_login_at: '2026-07-30T10:05:00Z', created_at: '2026-01-09T02:50:00Z', sample_only: true },
  { id: 504, branch: 1, branch_name: 'Central Campus', full_name: 'Nodira Iskandarova', username: 'nodira.i', phone: '+998 90 700 01 04', email: 'nodira@example.test', workplace: 'Academic Lyceum 2', notes: '', is_active: true, last_login_at: '2026-07-28T07:45:00Z', created_at: '2025-12-03T04:25:00Z', sample_only: true },
  { id: 505, branch: 1, branch_name: 'Central Campus', full_name: 'Rustam Toshpulatov', username: 'rustam.t', phone: '+998 90 700 01 05', email: 'rustam@example.test', workplace: 'Tashkent City Transport', notes: '', is_active: true, last_login_at: '2026-07-27T09:30:00Z', created_at: '2026-02-11T05:45:00Z', sample_only: true },
  { id: 506, branch: 2, branch_name: 'Riverside Campus', full_name: 'Saida Yuldasheva', username: 'saida.y', phone: '+998 90 700 01 06', email: 'saida@example.test', workplace: 'School 300', notes: '', is_active: true, last_login_at: '2026-07-29T16:20:00Z', created_at: '2026-02-23T04:50:00Z', sample_only: true },
  { id: 507, branch: 1, branch_name: 'Central Campus', full_name: 'Otabek Rasulov', username: 'otabek.r', phone: '+998 90 700 01 07', email: 'otabek@example.test', workplace: 'Tashkent Architecture Institute', notes: 'Awaiting placement confirmation.', is_active: true, last_login_at: '2026-07-31T08:00:00Z', created_at: '2026-07-21T08:20:00Z', sample_only: true },
  { id: 508, branch: 2, branch_name: 'Riverside Campus', full_name: 'Farrukh Khalilov', username: 'farrukh.k', phone: '+998 90 700 01 08', email: 'farrukh@example.test', workplace: 'Uzbekistan Railways', notes: 'Program completion contact.', is_active: true, last_login_at: '2026-06-30T12:15:00Z', created_at: '2025-10-06T03:05:00Z', sample_only: true },
]);

const PICKUPS = Object.freeze([
  { id: 871, student: 101, full_name: 'Zarina Karimova', relationship: 'Mother', phone: '+998 90 700 01 01', is_active: true, sample_only: true },
  { id: 872, student: 102, full_name: 'Akmal Abdullayev', relationship: 'Father', phone: '+998 90 700 01 02', is_active: true, sample_only: true },
  { id: 873, student: 103, full_name: 'Madina Saidova', relationship: 'Mother', phone: '+998 90 700 01 03', is_active: true, sample_only: true },
  { id: 874, student: 104, full_name: 'Nodira Iskandarova', relationship: 'Mother', phone: '+998 90 700 01 04', is_active: true, sample_only: true },
  { id: 875, student: 105, full_name: 'Rustam Toshpulatov', relationship: 'Father', phone: '+998 90 700 01 05', is_active: true, sample_only: true },
  { id: 876, student: 106, full_name: 'Saida Yuldasheva', relationship: 'Mother', phone: '+998 90 700 01 06', is_active: true, sample_only: true },
  { id: 877, student: 107, full_name: 'Otabek Rasulov', relationship: 'Father', phone: '+998 90 700 01 07', is_active: true, sample_only: true },
  { id: 878, student: 108, full_name: 'Farrukh Khalilov', relationship: 'Father', phone: '+998 90 700 01 08', is_active: true, sample_only: true },
]);

const INVOICES = Object.freeze([
  { id: 701, number: 'INV-2026-0501', branch: 1, branch_name: 'Central Campus', student: 101, student_name: 'Aziza Karimova', cohort: 11, cohort_name: 'Orion · B2', fee_schedule: 951, fee_schedule_name: 'B2 monthly tuition', period: '2026-05', status: 'paid', issue_date: '2026-05-01', due_date: '2026-05-08', total_uzs: '3200000', outstanding_uzs: '0', currency: 'UZS', lines: [{ id: 1, description: 'May tuition', line_type: 'tuition', quantity: '1', unit_price_uzs: '3200000', amount_uzs: '3200000' }], allocations: [{ payment_id: 901, amount_uzs: '3200000', created_at: '2026-05-05T05:00:00Z' }], created_by_name: 'Demo Director', created_at: '2026-05-01T04:00:00Z', sample_only: true },
  { id: 702, number: 'INV-2026-0601', branch: 1, branch_name: 'Central Campus', student: 104, student_name: 'Sabina Iskandarova', cohort: 11, cohort_name: 'Orion · B2', fee_schedule: 951, fee_schedule_name: 'B2 monthly tuition', period: '2026-06', status: 'paid', issue_date: '2026-06-01', due_date: '2026-06-08', total_uzs: '3200000', outstanding_uzs: '0', currency: 'UZS', lines: [{ id: 2, description: 'June tuition', line_type: 'tuition', quantity: '1', unit_price_uzs: '3200000', amount_uzs: '3200000' }], allocations: [{ payment_id: 902, amount_uzs: '3200000', created_at: '2026-06-04T05:00:00Z' }], created_by_name: 'Demo Director', created_at: '2026-06-01T04:00:00Z', sample_only: true },
  { id: 703, number: 'INV-2026-0701', branch: 1, branch_name: 'Central Campus', student: 101, student_name: 'Aziza Karimova', cohort: 11, cohort_name: 'Orion · B2', fee_schedule: 951, fee_schedule_name: 'B2 monthly tuition', period: '2026-07', status: 'partially_paid', issue_date: '2026-07-01', due_date: '2026-07-08', total_uzs: '3200000', outstanding_uzs: '1200000', currency: 'UZS', lines: [{ id: 3, description: 'July tuition', line_type: 'tuition', quantity: '1', unit_price_uzs: '3200000', amount_uzs: '3200000' }], allocations: [{ payment_id: 903, amount_uzs: '2000000', created_at: '2026-07-06T05:00:00Z' }], created_by_name: 'Demo Director', created_at: '2026-07-01T04:00:00Z', sample_only: true },
  { id: 704, number: 'INV-2026-0702', branch: 1, branch_name: 'Central Campus', student: 102, student_name: 'Timur Abdullayev', cohort: 12, cohort_name: 'Nova · B1', fee_schedule: 952, fee_schedule_name: 'B1 monthly tuition', period: '2026-07', status: 'overdue', issue_date: '2026-07-01', due_date: '2026-07-08', total_uzs: '2800000', outstanding_uzs: '2800000', currency: 'UZS', lines: [{ id: 4, description: 'July tuition', line_type: 'tuition', quantity: '1', unit_price_uzs: '2800000', amount_uzs: '2800000' }], allocations: [], created_by_name: 'Demo Director', created_at: '2026-07-01T04:05:00Z', sample_only: true },
  { id: 705, number: 'INV-2026-0801', branch: 1, branch_name: 'Central Campus', student: 105, student_name: 'Bekzod Toshpulatov', cohort: 12, cohort_name: 'Nova · B1', fee_schedule: 952, fee_schedule_name: 'B1 monthly tuition', period: '2026-08', status: 'issued', issue_date: '2026-08-01', due_date: '2026-08-08', total_uzs: '2800000', outstanding_uzs: '2800000', currency: 'UZS', lines: [{ id: 5, description: 'August tuition', line_type: 'tuition', quantity: '1', unit_price_uzs: '2800000', amount_uzs: '2800000' }], allocations: [], created_by_name: 'Demo Director', created_at: '2026-08-01T04:00:00Z', sample_only: true },
  { id: 706, number: 'INV-2026-0502', branch: 2, branch_name: 'Riverside Campus', student: 103, student_name: 'Malika Saidova', cohort: 21, cohort_name: 'Atlas · C1', fee_schedule: 953, fee_schedule_name: 'C1 mathematics tuition', period: '2026-05', status: 'paid', issue_date: '2026-05-01', due_date: '2026-05-08', total_uzs: '3600000', outstanding_uzs: '0', currency: 'UZS', lines: [{ id: 6, description: 'May tuition', line_type: 'tuition', quantity: '1', unit_price_uzs: '3600000', amount_uzs: '3600000' }], allocations: [{ payment_id: 904, amount_uzs: '3600000', created_at: '2026-05-07T05:00:00Z' }], created_by_name: 'Demo Director', created_at: '2026-05-01T04:10:00Z', sample_only: true },
  { id: 707, number: 'INV-2026-0602', branch: 2, branch_name: 'Riverside Campus', student: 106, student_name: 'Kamola Yuldasheva', cohort: 21, cohort_name: 'Atlas · C1', fee_schedule: 953, fee_schedule_name: 'C1 mathematics tuition', period: '2026-06', status: 'paid', issue_date: '2026-06-01', due_date: '2026-06-08', total_uzs: '3600000', outstanding_uzs: '0', currency: 'UZS', lines: [{ id: 7, description: 'June tuition', line_type: 'tuition', quantity: '1', unit_price_uzs: '3600000', amount_uzs: '3600000' }], allocations: [{ payment_id: 905, amount_uzs: '3600000', created_at: '2026-06-06T05:00:00Z' }], created_by_name: 'Demo Director', created_at: '2026-06-01T04:10:00Z', sample_only: true },
  { id: 708, number: 'INV-2026-0703', branch: 2, branch_name: 'Riverside Campus', student: 103, student_name: 'Malika Saidova', cohort: 21, cohort_name: 'Atlas · C1', fee_schedule: 953, fee_schedule_name: 'C1 mathematics tuition', period: '2026-07', status: 'paid', issue_date: '2026-07-01', due_date: '2026-07-08', total_uzs: '3600000', outstanding_uzs: '0', currency: 'UZS', lines: [{ id: 8, description: 'July tuition', line_type: 'tuition', quantity: '1', unit_price_uzs: '3600000', amount_uzs: '3600000' }], allocations: [{ payment_id: 906, amount_uzs: '3600000', created_at: '2026-07-05T05:00:00Z' }], created_by_name: 'Demo Director', created_at: '2026-07-01T04:10:00Z', sample_only: true },
  { id: 709, number: 'INV-2026-0802', branch: 2, branch_name: 'Riverside Campus', student: 106, student_name: 'Kamola Yuldasheva', cohort: 21, cohort_name: 'Atlas · C1', fee_schedule: 953, fee_schedule_name: 'C1 mathematics tuition', period: '2026-08', status: 'issued', issue_date: '2026-08-01', due_date: '2026-08-08', total_uzs: '3600000', outstanding_uzs: '3600000', currency: 'UZS', lines: [{ id: 9, description: 'August tuition', line_type: 'tuition', quantity: '1', unit_price_uzs: '3600000', amount_uzs: '3600000' }], allocations: [], created_by_name: 'Demo Director', created_at: '2026-08-01T04:10:00Z', sample_only: true },
  { id: 710, number: 'INV-2026-0603', branch: 2, branch_name: 'Riverside Campus', student: 108, student_name: 'Sardor Khalilov', cohort: 22, cohort_name: 'Aurora · A2', fee_schedule: 954, fee_schedule_name: 'A2 completion fee', period: '2026-06', status: 'paid', issue_date: '2026-06-15', due_date: '2026-06-22', total_uzs: '1800000', outstanding_uzs: '0', currency: 'UZS', lines: [{ id: 10, description: 'Completion assessment and certificate', line_type: 'assessment', quantity: '1', unit_price_uzs: '1800000', amount_uzs: '1800000' }], allocations: [{ payment_id: 907, amount_uzs: '1800000', created_at: '2026-06-18T05:00:00Z' }], created_by_name: 'Demo Director', created_at: '2026-06-15T04:10:00Z', sample_only: true },
]);

const PAYMENT_RELATIONSHIPS = Object.freeze({
  901: { invoice_number: 'INV-2026-0501', student_name: 'Aziza Karimova', payer_name: 'Zarina Karimova', cashier_name: 'Madina Aliyeva' },
  902: { invoice_number: 'INV-2026-0601', student_name: 'Sabina Iskandarova', payer_name: 'Nodira Iskandarova', cashier_name: '' },
  903: { invoice_number: 'INV-2026-0701', student_name: 'Aziza Karimova', payer_name: 'Zarina Karimova', cashier_name: '' },
  904: { invoice_number: 'INV-2026-0502', student_name: 'Malika Saidova', payer_name: 'Madina Saidova', cashier_name: '' },
  905: { invoice_number: 'INV-2026-0602', student_name: 'Kamola Yuldasheva', payer_name: 'Saida Yuldasheva', cashier_name: 'Rustam Qodirov' },
  906: { invoice_number: 'INV-2026-0703', student_name: 'Malika Saidova', payer_name: 'Madina Saidova', cashier_name: '' },
  907: { invoice_number: 'INV-2026-0603', student_name: 'Sardor Khalilov', payer_name: 'Farrukh Khalilov', cashier_name: 'Rustam Qodirov' },
  908: { invoice_number: 'INV-2026-0801', student_name: 'Bekzod Toshpulatov', payer_name: 'Rustam Toshpulatov', cashier_name: '' },
});

const PAYMENTS = Object.freeze([
  { id: 901, branch: 1, branch_name: 'Central Campus', invoice: 701, student: 101, provider: 'cash', amount_uzs: '3200000', currency: 'UZS', status: 'completed', allocation_status: 'allocated', paid_at: '2026-05-05T05:00:00Z', provider_txn_id: 'SAMPLE-CASH-901', account_ref: 'INV-2026-0501', cashier_shift: 10001, payer: 501, created_at: '2026-05-05T05:00:00Z', updated_at: '2026-05-05T05:00:00Z', sample_only: true },
  { id: 902, branch: 1, branch_name: 'Central Campus', invoice: 702, student: 104, provider: 'click', amount_uzs: '3200000', currency: 'UZS', status: 'completed', allocation_status: 'auto', paid_at: '2026-06-04T05:00:00Z', provider_txn_id: 'SAMPLE-CLICK-902', account_ref: 'INV-2026-0601', cashier_shift: null, payer: 504, created_at: '2026-06-04T05:00:00Z', updated_at: '2026-06-04T05:00:00Z', sample_only: true },
  { id: 903, branch: 1, branch_name: 'Central Campus', invoice: 703, student: 101, provider: 'bank_transfer', amount_uzs: '2000000', currency: 'UZS', status: 'completed', allocation_status: 'allocated', paid_at: '2026-07-06T05:00:00Z', provider_txn_id: 'SAMPLE-BANK-903', account_ref: 'INV-2026-0701', cashier_shift: null, payer: 501, created_at: '2026-07-06T05:00:00Z', updated_at: '2026-07-06T05:00:00Z', sample_only: true },
  { id: 904, branch: 2, branch_name: 'Riverside Campus', invoice: 706, student: 103, provider: 'payme', amount_uzs: '3600000', currency: 'UZS', status: 'completed', allocation_status: 'auto', paid_at: '2026-05-07T05:00:00Z', provider_txn_id: 'SAMPLE-PAYME-904', account_ref: 'INV-2026-0502', cashier_shift: null, payer: 503, created_at: '2026-05-07T05:00:00Z', updated_at: '2026-05-07T05:00:00Z', sample_only: true },
  { id: 905, branch: 2, branch_name: 'Riverside Campus', invoice: 707, student: 106, provider: 'cash', amount_uzs: '3600000', currency: 'UZS', status: 'completed', allocation_status: 'allocated', paid_at: '2026-06-06T05:00:00Z', provider_txn_id: 'SAMPLE-CASH-905', account_ref: 'INV-2026-0602', cashier_shift: 10002, payer: 506, created_at: '2026-06-06T05:00:00Z', updated_at: '2026-06-06T05:00:00Z', sample_only: true },
  { id: 906, branch: 2, branch_name: 'Riverside Campus', invoice: 708, student: 103, provider: 'uzum', amount_uzs: '3600000', currency: 'UZS', status: 'completed', allocation_status: 'auto', paid_at: '2026-07-05T05:00:00Z', provider_txn_id: 'SAMPLE-UZUM-906', account_ref: 'INV-2026-0703', cashier_shift: null, payer: 503, created_at: '2026-07-05T05:00:00Z', updated_at: '2026-07-05T05:00:00Z', sample_only: true },
  { id: 907, branch: 2, branch_name: 'Riverside Campus', invoice: 710, student: 108, provider: 'cash', amount_uzs: '1800000', currency: 'UZS', status: 'completed', allocation_status: 'allocated', paid_at: '2026-06-18T05:00:00Z', provider_txn_id: 'SAMPLE-CASH-907', account_ref: 'INV-2026-0603', cashier_shift: 10002, payer: 508, created_at: '2026-06-18T05:00:00Z', updated_at: '2026-06-18T05:00:00Z', sample_only: true },
  { id: 908, branch: 1, branch_name: 'Central Campus', invoice: 705, student: 105, provider: 'click', amount_uzs: '2800000', currency: 'UZS', status: 'pending', allocation_status: 'manual_review', paid_at: null, provider_txn_id: 'SAMPLE-PENDING-908', account_ref: 'INV-2026-0801', cashier_shift: null, payer: 505, created_at: '2026-08-01T08:30:00Z', updated_at: '2026-08-01T08:30:00Z', sample_only: true },
].map((payment) => Object.freeze({ ...payment, ...PAYMENT_RELATIONSHIPS[payment.id] })));

const EXPENSES = Object.freeze([
  { id: 921, branch: 1, branch_name: 'Central Campus', description: 'Central Campus classroom rent', category: 'rent', amount_uzs: '18000000', status: 'paid', created_by_name: 'Demo Director', created_at: '2026-05-02T05:00:00Z', sample_only: true },
  { id: 922, branch: 1, branch_name: 'Central Campus', description: 'Interactive display maintenance', category: 'equipment', amount_uzs: '4200000', status: 'approved', created_by_name: 'Operations Lead', created_at: '2026-07-22T05:00:00Z', sample_only: true },
  { id: 923, branch: 1, branch_name: 'Central Campus', description: 'August utilities provision', category: 'utilities', amount_uzs: '3100000', status: 'pending', created_by_name: 'Operations Lead', created_at: '2026-08-01T05:00:00Z', sample_only: true },
  { id: 924, branch: 2, branch_name: 'Riverside Campus', description: 'Riverside Campus classroom rent', category: 'rent', amount_uzs: '14000000', status: 'paid', created_by_name: 'Demo Director', created_at: '2026-05-03T05:00:00Z', sample_only: true },
  { id: 925, branch: 2, branch_name: 'Riverside Campus', description: 'Mathematics laboratory supplies', category: 'supplies', amount_uzs: '2800000', status: 'approved', created_by_name: 'Branch Manager', created_at: '2026-07-24T05:00:00Z', sample_only: true },
  { id: 926, branch: 2, branch_name: 'Riverside Campus', description: 'Printer replacement request', category: 'equipment', amount_uzs: '6500000', status: 'rejected', created_by_name: 'Branch Manager', created_at: '2026-07-11T05:00:00Z', sample_only: true },
]);

const REFUNDS = Object.freeze([
  { id: 931, branch: 1, branch_name: 'Central Campus', invoice: 702, payment: 902, student: 104, provider: 'click', reason: 'Approved schedule adjustment', amount_uzs: '400000', state: 'completed', created_at: '2026-06-12T05:00:00Z', sample_only: true },
  { id: 932, branch: 2, branch_name: 'Riverside Campus', invoice: 708, payment: 906, student: 103, provider: 'uzum', reason: 'Duplicate family payment review', amount_uzs: '600000', state: 'approved', created_at: '2026-07-12T05:00:00Z', sample_only: true },
]);

const LOANS = Object.freeze([
  { id: 941, branch: 1, branch_name: 'Central Campus', title: 'Teacher laptop advance', description: 'Teaching equipment purchase', amount_uzs: '6000000', repaid_uzs: '2000000', outstanding_uzs: '4000000', status: 'disbursed', created_at: '2026-04-10T05:00:00Z', sample_only: true },
  { id: 942, branch: 2, branch_name: 'Riverside Campus', title: 'Professional course advance', description: 'Certified mathematics training', amount_uzs: '4000000', repaid_uzs: '4000000', outstanding_uzs: '0', status: 'repaid', created_at: '2025-11-18T05:00:00Z', sample_only: true },
]);

const FEE_SCHEDULES = Object.freeze([
  { id: 951, branch: 1, name: 'B2 monthly tuition', cohort: 11, cohort_name: 'Orion · B2', amount_uzs: '3200000', billing_period: 'monthly', due_day_of_month: 8, is_active: true, sample_only: true },
  { id: 952, branch: 1, name: 'B1 monthly tuition', cohort: 12, cohort_name: 'Nova · B1', amount_uzs: '2800000', billing_period: 'monthly', due_day_of_month: 8, is_active: true, sample_only: true },
  { id: 953, branch: 2, name: 'C1 mathematics tuition', cohort: 21, cohort_name: 'Atlas · C1', amount_uzs: '3600000', billing_period: 'monthly', due_day_of_month: 8, is_active: true, sample_only: true },
  { id: 954, branch: 2, name: 'A2 completion fee', cohort: 22, cohort_name: 'Aurora · A2', amount_uzs: '1800000', billing_period: 'one_time', due_day_of_month: 22, is_active: false, sample_only: true },
]);

const RISKS = Object.freeze([
  { student: 102, name: 'Timur Abdullayev', cohort: 12, cohort_name: 'Nova · B1', branch: 1, branch_name: 'Central Campus', level: 'high', score: 84, flags: [{ code: 'attendance', reason: 'Attendance changed this month' }], sample_only: true },
  { student: 106, name: 'Kamola Yuldasheva', cohort: 21, cohort_name: 'Atlas · C1', branch: 2, branch_name: 'Riverside Campus', level: 'medium', score: 58, flags: [{ code: 'engagement', reason: 'Follow-up recommended' }], sample_only: true },
]);

const NOTICES = Object.freeze([
  { id: 301, title: 'July enrollment review is ready', body: 'The latest enrollment overview is available for leadership review.', event_type: 'report_ready', user_name: 'Demo Director', read_at: null, created_at: '2026-07-31T06:30:00Z', sample_only: true },
  { id: 302, title: 'Academic term planning', body: 'Term planning notes were updated by the academic team.', event_type: 'planning', user_name: 'Demo Director', read_at: '2026-07-31T07:00:00Z', created_at: '2026-07-30T12:00:00Z', sample_only: true },
]);

const MEETINGS = Object.freeze([
  { id: 601, branch: 1, branch_name: 'Central Campus', title: 'Academic leadership review', status: 'scheduled', starts_at: '2026-08-03T04:00:00Z', created_at: '2026-07-29T05:00:00Z', sample_only: true },
  { id: 602, branch: 2, branch_name: 'Riverside Campus', title: 'Riverside monthly review', status: 'scheduled', starts_at: '2026-08-04T05:00:00Z', created_at: '2026-07-29T05:00:00Z', sample_only: true },
]);

const CASHIER_SHIFTS = Object.freeze([
  { id: 10001, branch: 1, branch_name: 'Central Campus', cashier_name: 'Madina Aliyeva', status: 'closed', opened_at: '2026-07-31T03:00:00Z', closed_at: '2026-07-31T14:00:00Z', opening_cash_uzs: '1000000', discrepancy_uzs: '0', sample_only: true },
  { id: 10002, branch: 2, branch_name: 'Riverside Campus', cashier_name: 'Rustam Qodirov', status: 'open', opened_at: '2026-08-02T03:00:00Z', closed_at: null, opening_cash_uzs: '750000', discrepancy_uzs: '0', sample_only: true },
]);

const TEACHER_SIGNALS = Object.freeze([
  { teacher: 201, name: 'Dilshod Rahimov', engagement_score: 94, attendance_rate: 96, lessons_delivered: 31, students_reached: 42, marks_sampled: 184, sample_only: true },
  { teacher: 203, name: 'Kamola Ergasheva', engagement_score: 89, attendance_rate: 91, lessons_delivered: 28, students_reached: 36, marks_sampled: 168, sample_only: true },
  { teacher: 204, name: 'Jasur Tursunov', engagement_score: 86, attendance_rate: 90, lessons_delivered: 12, students_reached: 24, marks_sampled: 72, sample_only: true },
  { teacher: 202, name: 'Nargiza Usmonova', engagement_score: 92, attendance_rate: 94, lessons_delivered: 30, students_reached: 38, marks_sampled: 176, sample_only: true },
  { teacher: 205, name: 'Farida Mamatova', engagement_score: 85, attendance_rate: 88, lessons_delivered: 24, students_reached: 27, marks_sampled: 119, sample_only: true },
]);

const BRANCH_SIGNALS = Object.freeze([
  { branch: 1, rank: 1, name: 'Central Campus', score: 91, active_students: 4, attendance_rate: 0.93, avg_grade_pct: 84, at_risk: 1, at_risk_rate: 0.25, overdue_students: 1, suppressed: false, sample_only: true },
  { branch: 2, rank: 2, name: 'Riverside Campus', score: 87, active_students: 2, attendance_rate: 0.9, avg_grade_pct: 90, at_risk: 1, at_risk_rate: 0.5, overdue_students: 0, suppressed: false, sample_only: true },
]);

const COLLECTIONS = Object.freeze({
  '/api/v1/org/branches/': ORG_BRANCHES,
  '/api/v1/org/departments/': DEPARTMENTS,
  '/api/v1/students/': STUDENTS,
  '/api/v1/students/birthdays/': [{ id: 101, branch: 1, full_name: 'Aziza Karimova', birthdate: '2009-08-04', days_until: 2, sample_only: true }],
  '/api/v1/cohorts/': COHORTS,
  '/api/v1/teachers/': TEACHERS,
  '/api/v1/intelligence/teachers/': TEACHER_SIGNALS,
  '/api/v1/intelligence/branches/': BRANCH_SIGNALS,
  '/api/v1/intelligence/risk/': RISKS,
  '/api/v1/notifications/': NOTICES,
  '/api/v1/approvals/requests/': [{ id: 401, branch: 1, title: 'Learning-space equipment', kind: 'procurement', status: 'pending', amount_uzs: '4850000', created_at: '2026-07-30T10:15:00Z', sample_only: true }],
  '/api/v1/tasks/': [{ id: 501, branch: 1, title: 'Confirm September cohort capacity', status: 'in_progress', priority: 'high', assignee: 12, due_at: '2026-08-02T12:00:00Z', sample_only: true }],
  '/api/v1/meetings/': MEETINGS,
  '/api/v1/meetings/upcoming/': MEETINGS,
  '/api/v1/schedule/lessons/': LESSONS,
  '/api/v1/attendance/records/': ATTENDANCE,
  '/api/v1/academics/subjects/': SUBJECTS,
  '/api/v1/academics/exam-types/': EXAM_TYPES,
  '/api/v1/academics/exams/': EXAMS,
  '/api/v1/academics/grades/': GRADES,
  '/api/v1/academics/transcripts/': [{ id: 881, student: 108, term: 900, status: 'generated', generated_at: '2026-06-30T05:00:00Z', created_at: '2026-06-29T05:00:00Z', sample_only: true }],
  '/api/v1/assignments/': ASSIGNMENTS,
  '/api/v1/parents/': PARENTS,
  '/api/v1/parents/guardians/': GUARDIANS,
  '/api/v1/parents/pickups/': PICKUPS,
  '/api/v1/finance/invoices/': INVOICES,
  '/api/v1/payments/': PAYMENTS,
  '/api/v1/finance/expenses/': EXPENSES,
  '/api/v1/finance/refunds/': REFUNDS,
  '/api/v1/loans/': LOANS,
  '/api/v1/finance/fee-schedules/': FEE_SCHEDULES,
  '/api/v1/finance/payment-methods/': [
    { id: 961, name: 'Cash', slug: 'cash', is_active: true, sample_only: true },
    { id: 962, name: 'Bank transfer', slug: 'bank-transfer', is_active: true, sample_only: true },
    { id: 963, name: 'Click', slug: 'click', is_active: true, sample_only: true },
  ],
  '/api/v1/finance/cashier-shifts/': CASHIER_SHIFTS,
  '/api/v1/content/libraries/': [
    { id: 971, branch: 1, branch_name: 'Central Campus', department: 31, department_name: 'English', cohort: null, cohort_name: '', name: 'Central learning library', description: 'Shared academic English resources for Central Campus faculty.', visibility: 'department', allowed_roles: ['teacher', 'student'], is_active: true, sample_only: true },
    { id: 972, branch: 2, branch_name: 'Riverside Campus', department: null, department_name: '', cohort: 21, cohort_name: 'Atlas · C1', name: 'Riverside learning library', description: 'Focused mathematics and C1 study resources for Atlas.', visibility: 'cohort', allowed_roles: ['teacher', 'student'], is_active: true, sample_only: true },
  ],
  '/api/v1/printing/printers/': [
    { id: 981, branch: 1, branch_name: 'Central Campus', name: 'Central faculty printer', status: 'online', sample_only: true },
    { id: 982, branch: 2, branch_name: 'Riverside Campus', name: 'Riverside reception printer', status: 'online', sample_only: true },
  ],
  '/api/v1/printing/jobs/': [
    { id: 991, branch: 1, branch_name: 'Central Campus', title: 'B2 writing packs', status: 'completed', created_at: '2026-08-01T05:00:00Z', sample_only: true },
    { id: 992, branch: 2, branch_name: 'Riverside Campus', title: 'C1 mock papers', status: 'queued', created_at: '2026-08-02T03:00:00Z', sample_only: true },
  ],
  '/api/v1/printing/agents/': [
    { id: 993, branch: 1, branch_name: 'Central Campus', name: 'Central print service', status: 'online', sample_only: true },
    { id: 994, branch: 2, branch_name: 'Riverside Campus', name: 'Riverside print service', status: 'online', sample_only: true },
  ],
});

const STATIC = Object.freeze({
  '/api/v1/users/me/': {
    id: 'mock-ceo',
    full_name: 'Demo Director',
    username: 'demo.director',
    email: 'director@example.test',
    phone: '+998 90 000 00 01',
    preferred_language: 'en',
    is_active: true,
    last_login_at: '2026-08-02T00:45:00Z',
    sample_only: true,
  },
  '/api/v1/users/devices/': [
    { id: 'preview-device', platform: 'web', device_name: 'Design preview', is_current: true, last_seen_at: '2026-08-02T01:00:00Z', sample_only: true },
  ],
  '/api/v1/notifications/unread-count/': { count: 1, sample_only: true },
});

function previewRole() {
  const fromQuery = typeof window !== 'undefined'
    ? new URLSearchParams(window.location?.search || '').get('role')
    : '';
  return String(fromQuery || import.meta.env.VITE_ROLE || 'ceo').trim().toLowerCase();
}

function cohortById(value) {
  return COHORTS.find((item) => String(item.id) === String(value));
}

function studentById(value) {
  return STUDENTS.find((item) => String(item.id) === String(value));
}

function teacherById(value) {
  return TEACHERS.find((item) => String(item.id) === String(value));
}

function branchOf(item, path = '') {
  if (!item || typeof item !== 'object') return null;
  if (path === '/api/v1/org/branches/') return Number(item.id) || null;
  if (path === '/api/v1/intelligence/branches/') return Number(item.branch) || null;
  const direct = item.branch ?? item.branch_id;
  if (direct != null && direct !== '') return Number(direct) || null;
  if (item.department != null) return DEPARTMENTS.find((department) => String(department.id) === String(item.department))?.branch || null;
  if (item.cohort != null) return cohortById(item.cohort)?.branch || null;
  if (item.current_cohort != null) return cohortById(item.current_cohort)?.branch || null;
  if (item.student != null) return studentById(item.student)?.branch || null;
  if (item.teacher != null) return teacherById(item.teacher)?.branch || null;
  if (item.invoice != null) return INVOICES.find((invoice) => String(invoice.id) === String(item.invoice))?.branch || null;
  return null;
}

function scopedRows(items, path) {
  if (previewRole() !== 'manager') return items;
  return items.filter((item) => {
    const branch = branchOf(item, path);
    return branch == null || branch === CENTRAL_BRANCH_ID;
  });
}

function recordDate(item, path) {
  if (path === '/api/v1/students/') return item.enrollment_date;
  if (path === '/api/v1/teachers/') return item.hire_date;
  if (path === '/api/v1/schedule/lessons/') return item.starts_at;
  if (path === '/api/v1/attendance/records/') return item.lesson_starts_at || item.marked_at;
  if (path === '/api/v1/academics/exams/') return item.exam_date;
  if (path === '/api/v1/finance/invoices/') return item.issue_date || item.created_at;
  if (path === '/api/v1/payments/') return item.paid_at || item.created_at;
  return item.created_at || item.due_at || item.starts_at || item.updated_at;
}

function truthyParam(value) {
  if (value === true || String(value).toLowerCase() === 'true') return true;
  if (value === false || String(value).toLowerCase() === 'false') return false;
  return null;
}

function ageAtPreview(birthdate) {
  if (!birthdate) return null;
  const birth = new Date(`${birthdate}T12:00:00Z`);
  const now = new Date(`${PREVIEW_NOW}T12:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function teachersFor(item, path) {
  if (path === '/api/v1/teachers/') return [item.id];
  if (item.teacher != null) return [item.teacher];
  const cohort = cohortById(item.cohort ?? item.current_cohort);
  if (!cohort) return [];
  return [...new Set([
    cohort.primary_teacher,
    ...(cohort.teachers || []).map((assignment) => assignment.teacher),
  ].filter(Boolean))];
}

function applyParams(items, path, params = {}) {
  const term = String(params.search || params.q || '').trim().toLocaleLowerCase();
  let rows = items.filter((item) => {
    if (term && !JSON.stringify(item).toLocaleLowerCase().includes(term)) return false;
    if (params.branch != null && params.branch !== '' && String(branchOf(item, path)) !== String(params.branch)) return false;
    if (params.cohort != null && params.cohort !== '') {
      const cohort = path === '/api/v1/cohorts/' ? item.id : item.cohort ?? item.current_cohort;
      if (String(cohort) !== String(params.cohort)) return false;
    }
    if (params.student != null && params.student !== '') {
      const student = path === '/api/v1/students/' ? item.id : item.student;
      if (String(student) !== String(params.student)) return false;
    }
    if (params.teacher != null && params.teacher !== '' && !teachersFor(item, path).some((teacher) => String(teacher) === String(params.teacher))) return false;
    if (params.status != null && params.status !== '' && String(item.status) !== String(params.status)) return false;
    if (params.state != null && params.state !== '' && String(item.state) !== String(params.state)) return false;
    if (params.provider != null && params.provider !== '' && String(item.provider) !== String(params.provider)) return false;
    if (params.allocation_status != null && params.allocation_status !== '' && String(item.allocation_status) !== String(params.allocation_status)) return false;
    if (params.category != null && params.category !== '' && !String(item.category || '').toLocaleLowerCase().includes(String(params.category).toLocaleLowerCase())) return false;
    if (params.fee_schedule != null && params.fee_schedule !== '' && String(item.fee_schedule) !== String(params.fee_schedule)) return false;
    if (params.department != null && params.department !== '' && String(item.department) !== String(params.department)) return false;
    if (params.level != null && params.level !== '' && String(item.academic_level ?? item.level) !== String(params.level)) return false;
    if (params.gender != null && params.gender !== '' && String(item.gender) !== String(params.gender)) return false;
    if (params.location != null && params.location !== '' && !String(item.location || '').toLocaleLowerCase().includes(String(params.location).toLocaleLowerCase())) return false;
    if (params.subject != null && params.subject !== '') {
      const subjects = Array.isArray(item.subjects) ? item.subjects : [item.subject];
      if (!subjects.some((subject) => String(subject).toLocaleLowerCase() === String(params.subject).toLocaleLowerCase())) return false;
    }
    if (params.exam_type != null && params.exam_type !== '' && String(item.exam_type) !== String(params.exam_type)) return false;

    const active = truthyParam(params.is_active);
    if (active != null && Boolean(item.is_active) !== active) return false;
    const archived = truthyParam(params.is_archived);
    if (archived != null && Boolean(item.is_archived) !== archived) return false;
    const substitute = truthyParam(params.is_substitute);
    if (substitute != null && Boolean(item.is_substitute) !== substitute) return false;
    const blocked = truthyParam(params.blocked);
    if (blocked != null && Boolean(item.is_blocked) !== blocked) return false;
    const hasCohort = truthyParam(params.has_cohort);
    if (hasCohort != null && Boolean(item.current_cohort) !== hasCohort) return false;

    const date = String(recordDate(item, path) || '').slice(0, 10);
    const dateFrom = String(params.date_from || '').slice(0, 10);
    const dateTo = String(params.date_to || '').slice(0, 10);
    if (dateFrom && (!date || date < dateFrom)) return false;
    if (dateTo && (!date || date > dateTo)) return false;
    if (params.joined_after && String(item.enrollment_date || '') < String(params.joined_after)) return false;
    if (params.joined_before && String(item.enrollment_date || '') > String(params.joined_before)) return false;
    if (params.hired_after && String(item.hire_date || '') < String(params.hired_after)) return false;
    if (params.hired_before && String(item.hire_date || '') > String(params.hired_before)) return false;
    const age = ageAtPreview(item.birthdate);
    if (params.age_min && (age == null || age < Number(params.age_min))) return false;
    if (params.age_max && (age == null || age > Number(params.age_max))) return false;
    return true;
  });

  const ordering = String(params.ordering || '');
  if (ordering) {
    const descending = ordering.startsWith('-');
    const field = descending ? ordering.slice(1) : ordering;
    rows = rows.slice().sort((left, right) => String(left?.[field] ?? '').localeCompare(String(right?.[field] ?? '')) * (descending ? -1 : 1));
  }
  return rows;
}

function page(items, params = {}) {
  const pageSize = Math.max(1, Number(params.page_size) || 25);
  const current = Math.max(1, Number(params.page) || 1);
  const start = (current - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    pagination: {
      total: items.length,
      page: current,
      page_size: pageSize,
      pages: Math.max(1, Math.ceil(items.length / pageSize)),
      has_next: start + pageSize < items.length,
      has_prev: current > 1,
    },
  };
}

function visibleCollection(path, params = {}, items = COLLECTIONS[path] || []) {
  return applyParams(scopedRows(items, path), path, params);
}

function studentStats(branchId = null) {
  const students = STUDENTS.filter((student) => branchId == null || student.branch === branchId);
  return {
    total: students.length,
    with_cohort: students.filter((student) => student.current_cohort).length,
    without_cohort: students.filter((student) => !student.current_cohort).length,
    blocked: students.filter((student) => student.is_blocked).length,
    updated_at: '2026-08-02T01:00:00Z',
    sample_only: true,
  };
}

function attendanceSummary(rows) {
  const counted = rows.filter((row) => row.status !== 'excused');
  const attended = counted.filter((row) => ['present', 'late'].includes(row.status));
  return {
    attended: attended.length,
    absent: counted.filter((row) => row.status === 'absent').length,
    excused: rows.filter((row) => row.status === 'excused').length,
    denominator: counted.length,
    attendance_rate_fraction: counted.length ? attended.length / counted.length : null,
  };
}

function amountMinor(rows, key, predicate = () => true) {
  return Math.round(rows.filter(predicate).reduce((total, row) => total + Number(row[key] || 0), 0) * 100);
}

function buildExecutiveSnapshot(params = {}) {
  const roleBranch = previewRole() === 'manager' ? CENTRAL_BRANCH_ID : null;
  const parsedBranch = Number(params.branch) || null;
  const branchId = roleBranch || parsedBranch;
  const dateFrom = String(params.date_from || '2026-05-05').slice(0, 10);
  const dateTo = String(params.date_to || PREVIEW_NOW).slice(0, 10);
  const inWindow = (item, path) => {
    const date = String(recordDate(item, path) || '').slice(0, 10);
    return Boolean(date && date >= dateFrom && date <= dateTo);
  };
  const branches = ORG_BRANCHES.filter((branch) => branchId == null || branch.id === branchId);
  const students = STUDENTS.filter((student) => branchId == null || student.branch === branchId);
  const attendance = ATTENDANCE.filter((row) => (branchId == null || row.branch === branchId) && inWindow(row, '/api/v1/attendance/records/'));
  const invoices = INVOICES.filter((row) => (branchId == null || row.branch === branchId) && inWindow(row, '/api/v1/finance/invoices/'));
  const payments = PAYMENTS.filter((row) => (branchId == null || row.branch === branchId) && inWindow(row, '/api/v1/payments/'));
  const refunds = REFUNDS.filter((row) => (branchId == null || row.branch === branchId) && inWindow(row, '/api/v1/finance/refunds/'));
  const expenses = EXPENSES.filter((row) => (branchId == null || row.branch === branchId) && inWindow(row, '/api/v1/finance/expenses/'));
  const attendanceTotals = attendanceSummary(attendance);
  const branchRows = branches.map((branch) => {
    const branchAttendance = attendanceSummary(attendance.filter((row) => row.branch === branch.id));
    return {
      id: branch.id,
      name: branch.name,
      student_count: students.filter((student) => student.branch === branch.id).length,
      attendance_numerator: branchAttendance.attended,
      attendance_denominator: branchAttendance.denominator,
      attendance_rate_fraction: branchAttendance.attendance_rate_fraction,
    };
  });
  const billable = new Set(['issued', 'partially_paid', 'paid', 'overdue']);
  const billed = invoices.filter((invoice) => billable.has(invoice.status));
  return {
    generated_at: '2026-08-02T01:00:00+05:00',
    locale: 'en',
    window: { date_from: dateFrom, date_to: dateTo, timezone: 'Asia/Tashkent', inclusive: 'both' },
    scope: {
      branches: branches.map(({ id, name }) => ({ id, name })),
      departments: [],
      applied_filters: { branch: branchId, department: null },
    },
    students: {
      total: students.length,
      active: students.filter((student) => student.status === 'active').length,
      leads: students.filter((student) => ['lead', 'application', 'accepted'].includes(student.status)).length,
      graduated: students.filter((student) => student.status === 'graduated').length,
      withdrawn: students.filter((student) => student.status === 'withdrawn').length,
      blocked: students.filter((student) => student.is_blocked).length,
      with_cohort: students.filter((student) => student.current_cohort).length,
      ungrouped: students.filter((student) => !student.current_cohort).length,
      joined_in_window: students.filter((student) => student.enrollment_date >= dateFrom && student.enrollment_date <= dateTo).length,
    },
    attendance: attendanceTotals,
    branches: branchRows,
    finance: {
      billed: { amount_minor: amountMinor(billed, 'total_uzs'), currency: 'UZS' },
      collected: { amount_minor: amountMinor(payments, 'amount_uzs', (payment) => payment.status === 'completed'), currency: 'UZS' },
      outstanding_for_invoices_issued_in_window: { amount_minor: amountMinor(billed, 'outstanding_uzs'), currency: 'UZS' },
      overdue_invoice_count: billed.filter((invoice) => invoice.status === 'overdue').length,
      refunded: { amount_minor: amountMinor(refunds, 'amount_uzs', (refund) => refund.state === 'completed'), currency: 'UZS' },
      approved_expense: { amount_minor: amountMinor(expenses, 'amount_uzs', (expense) => expense.status === 'approved'), currency: 'UZS' },
      paid_expense: { amount_minor: amountMinor(expenses, 'amount_uzs', (expense) => expense.status === 'paid'), currency: 'UZS' },
    },
    coverage: {
      students: { status: 'complete', required_permission: 'students:read', sample_size: students.length },
      attendance: { status: 'complete', required_permission: 'attendance:read', sample_size: attendance.length },
      finance: { status: 'complete', required_permission: 'finance:read', currency: 'UZS' },
      branches: { status: 'complete', derived_from: ['students', 'attendance'] },
    },
    warnings: [],
    sample_only: true,
  };
}

function attendanceDashboard(cohortId, params) {
  const rows = visibleCollection('/api/v1/attendance/records/', { ...params, cohort: cohortId });
  const students = COHORT_MEMBERS.filter((member) => String(member.cohort) === String(cohortId)).map((member) => {
    const memberRows = rows.filter((row) => String(row.student) === String(member.student));
    const present = memberRows.filter((row) => row.status === 'present').length;
    const absent = memberRows.filter((row) => row.status === 'absent').length;
    const late = memberRows.filter((row) => row.status === 'late').length;
    const excused = memberRows.filter((row) => row.status === 'excused').length;
    return {
      student: member.student,
      name: member.student_name,
      student_code: studentById(member.student)?.student_id,
      present,
      absent,
      late,
      excused,
      total: memberRows.length,
      percent_present: memberRows.length ? present / memberRows.length * 100 : 0,
      sample_only: true,
    };
  });
  const present = rows.filter((row) => row.status === 'present').length;
  return { rate: rows.length ? present / rows.length * 100 : 0, students, sample_only: true };
}

function fixtureFor(path, params = {}) {
  if (path === '/api/v1/intelligence/executive-summary/') return buildExecutiveSnapshot(params);
  if (path === '/api/v1/students/stats/') return studentStats(previewRole() === 'manager' ? CENTRAL_BRANCH_ID : Number(params.branch) || null);
  if (path === '/api/v1/students/comparison/') {
    return previewRole() === 'manager'
      ? [{ period: '2026-05', total: 4, active: 4 }, { period: '2026-06', total: 4, active: 4 }, { period: '2026-07', total: 5, active: 4 }]
      : [{ period: '2026-05', total: 7, active: 6 }, { period: '2026-06', total: 7, active: 6 }, { period: '2026-07', total: 8, active: 6 }];
  }
  if (path === '/api/v1/payments/reconciliation/') {
    const payments = visibleCollection('/api/v1/payments/', params);
    const completed = payments.filter((payment) => payment.status === 'completed');
    return { total_paid_uzs: completed.reduce((sum, payment) => sum + Number(payment.amount_uzs), 0), total_allocated_uzs: completed.filter((payment) => ['auto', 'allocated'].includes(payment.allocation_status)).reduce((sum, payment) => sum + Number(payment.amount_uzs), 0), mismatch_count: payments.filter((payment) => payment.allocation_status === 'manual_review').length, sample_only: true };
  }

  const cohortMembers = path.match(/^\/api\/v1\/cohorts\/(\d+)\/members\/$/);
  if (cohortMembers) {
    const cohort = scopedRows(COHORTS, '/api/v1/cohorts/').find((item) => String(item.id) === cohortMembers[1]);
    return cohort ? COHORT_MEMBERS.filter((item) => item.cohort === cohort.id) : null;
  }
  const cohortTeachers = path.match(/^\/api\/v1\/cohorts\/(\d+)\/teachers\/$/);
  if (cohortTeachers) {
    const cohort = scopedRows(COHORTS, '/api/v1/cohorts/').find((item) => String(item.id) === cohortTeachers[1]);
    return cohort?.teachers || null;
  }
  const cohortDashboard = path.match(/^\/api\/v1\/attendance\/cohorts\/(\d+)\/dashboard\/$/);
  if (cohortDashboard) {
    const cohort = scopedRows(COHORTS, '/api/v1/cohorts/').find((item) => String(item.id) === cohortDashboard[1]);
    return cohort ? attendanceDashboard(cohort.id, params) : null;
  }
  const examResults = path.match(/^\/api\/v1\/academics\/exams\/(\d+)\/results\/$/);
  if (examResults) {
    const exam = scopedRows(EXAMS, '/api/v1/academics/exams/').find((item) => String(item.id) === examResults[1]);
    return exam ? EXAM_RESULTS.filter((result) => result.exam === exam.id) : null;
  }
  const payout = path.match(/^\/api\/v1\/teachers\/(\d+)\/payout-policy\/$/);
  if (payout) {
    const teacher = scopedRows(TEACHERS, '/api/v1/teachers/').find((item) => String(item.id) === payout[1]);
    if (!teacher) return null;
    return teacher.salary_type === 'hourly'
      ? { teacher: teacher.id, method: 'hourly', hourly_rate_uzs: '185000', flat_amount_uzs: null, tuition_percent: null, is_active: true, sample_only: true }
      : { teacher: teacher.id, method: 'flat_monthly', hourly_rate_uzs: null, flat_amount_uzs: '12500000', tuition_percent: null, is_active: true, sample_only: true };
  }
  const studentEvents = path.match(/^\/api\/v1\/students\/(\d+)\/events\/$/);
  if (studentEvents) {
    const student = scopedRows(STUDENTS, '/api/v1/students/').find((item) => String(item.id) === studentEvents[1]);
    if (!student) return null;
    return [
      { id: Number(`${student.id}01`), from_status: null, to_status: 'accepted', reason_code: 'application_reviewed', note: 'Application accepted for placement.', created_at: `${student.enrollment_date}T05:00:00Z`, sample_only: true },
      ...(student.current_cohort ? [{ id: Number(`${student.id}02`), from_status: 'accepted', to_status: student.status, reason_code: 'placement_confirmed', note: `Placed in ${student.current_cohort_name}.`, created_at: `${cohortById(student.current_cohort)?.start_date}T05:00:00Z`, sample_only: true }] : []),
    ];
  }
  const journey = path.match(/^\/api\/v1\/intelligence\/journey\/(\d+)\/$/);
  if (journey) {
    const student = scopedRows(STUDENTS, '/api/v1/students/').find((item) => String(item.id) === journey[1]);
    if (!student) return null;
    return { events: [
      { at: `${student.enrollment_date}T05:00:00Z`, type: 'enrollment', title: 'Joined the learning center', detail: student.branch_name },
      ...(student.current_cohort ? [{ at: `${cohortById(student.current_cohort)?.start_date}T05:00:00Z`, type: 'placement', title: `Placed in ${student.current_cohort_name}`, detail: `${cohortById(student.current_cohort)?.primary_teacher_name} · ${student.academic_level}` }] : []),
      { at: '2026-07-18T09:00:00Z', type: 'milestone', title: 'Learning review', detail: 'Placement and current progress were reviewed.' },
    ], sample_only: true };
  }
  const risk = path.match(/^\/api\/v1\/intelligence\/risk\/(\d+)\/$/);
  if (risk) {
    const student = scopedRows(STUDENTS, '/api/v1/students/').find((item) => String(item.id) === risk[1]);
    if (!student) return null;
    return scopedRows(RISKS, '/api/v1/intelligence/risk/').find((item) => String(item.student) === risk[1]) || { student: student.id, name: student.full_name, cohort: student.current_cohort, branch: student.branch, level: 'low', score: 18, flags: [], sample_only: true };
  }

  if (Object.prototype.hasOwnProperty.call(COLLECTIONS, path)) return COLLECTIONS[path];
  if (Object.prototype.hasOwnProperty.call(STATIC, path)) return STATIC[path];

  const detail = path.match(/^(\/api\/v1\/.+\/)(\d+)\/$/);
  if (detail && Object.prototype.hasOwnProperty.call(COLLECTIONS, detail[1])) {
    return scopedRows(COLLECTIONS[detail[1]], detail[1]).find((item) => String(item.id) === detail[2]) || null;
  }
  return undefined;
}

export async function mockHttpRequest(method, path, { params, withMeta = false } = {}) {
  if (method !== 'GET') {
    throw new ApiError(405, 'This action is not available in the design preview.');
  }

  const fixture = fixtureFor(path, params);
  if (fixture === undefined) {
    const empty = page([], params);
    return withMeta
      ? { ...empty, warnings: ['Sample information is not prepared for this preview area.'] }
      : empty.data;
  }
  if (fixture === null) throw new ApiError(404, 'This preview record is no longer available.');
  const value = Array.isArray(fixture) ? applyParams(scopedRows(fixture, path), path, params) : fixture;
  const result = Array.isArray(value) ? page(value, params) : { data: value, pagination: undefined };
  return withMeta ? result : result.data;
}
