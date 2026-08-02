const STUDENT_STATUS = Object.freeze({
  lead: { label: 'Prospective student', tone: 'neutral' },
  application: { label: 'Application in review', tone: 'warn' },
  accepted: { label: 'Ready for placement', tone: 'warn' },
  enrolled: { label: 'Enrolled', tone: 'success' },
  active: { label: 'Active student', tone: 'success' },
  graduated: { label: 'Graduated', tone: 'success' },
  withdrawn: { label: 'No longer enrolled', tone: 'neutral' },
  expelled: { label: 'Enrollment ended', tone: 'danger' },
});

export function studentStatusPresentation(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return STUDENT_STATUS[normalized] || {
    label: normalized ? normalized.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()) : 'Status not recorded',
    tone: 'neutral',
  };
}
