const idText = (value) => value == null ? '' : String(value);

function uniqueIds(values) {
  return [...new Set(values.filter((value) => value != null && value !== '').map(idText))];
}

function staffScope(row) {
  const memberships = Array.isArray(row?.role_memberships) ? row.role_memberships : [];
  return {
    branchIds: uniqueIds(memberships.map((item) => item.branch)),
    departmentIds: uniqueIds(memberships.map((item) => item.department)),
    branchNames: [...new Set(memberships.map((item) => item.branch_name).filter(Boolean))],
    departmentNames: [...new Set(memberships.map((item) => item.department_name).filter(Boolean))],
    known: Boolean(row),
  };
}

function teacherScope(row) {
  return {
    branchIds: uniqueIds([row?.branch]),
    departmentIds: uniqueIds([row?.department]),
    branchNames: row?.branch_name ? [row.branch_name] : [],
    departmentNames: row?.department_name ? [row.department_name] : [],
    known: Boolean(row),
  };
}

export function buildMeetingPeople(contacts = [], staff = [], teachers = []) {
  const staffById = new Map(staff.map((row) => [idText(row.id), row]));
  const teachersById = new Map(teachers.map((row) => [idText(row.id), row]));
  const people = new Map();

  contacts.forEach((contact) => {
    const kind = String(contact?.principal_kind || '');
    const id = idText(contact?.profile_id);
    if (!['staff', 'teacher'].includes(kind) || !id) return;
    const key = `${kind}:${id}`;
    if (people.has(key)) return;
    const directoryRow = kind === 'staff' ? staffById.get(id) : teachersById.get(id);
    const scope = kind === 'staff' ? staffScope(directoryRow) : teacherScope(directoryRow);
    people.set(key, {
      key,
      kind,
      id: Number(id),
      name: contact.display_name || directoryRow?.full_name || `${kind === 'staff' ? 'Staff' : 'Teacher'} #${id}`,
      role: contact.role_label || (kind === 'staff' ? 'Staff' : 'Teacher'),
      ...scope,
    });
  });

  return [...people.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function resolveMeetingAudience({ mode, targets = [], people = [], branch = '' }) {
  const selected = new Set(targets.map(idText));
  const scoped = branch
    ? people.filter((person) => person.branchIds.includes(idText(branch)))
    : people;
  if (mode === 'organization') return scoped;
  if (mode === 'branches') {
    return scoped.filter((person) => person.branchIds.some((id) => selected.has(id)));
  }
  if (mode === 'departments') {
    return scoped.filter((person) => person.departmentIds.some((id) => selected.has(id)));
  }
  return scoped.filter((person) => selected.has(person.key));
}

export function combineDirectoryPages(...pages) {
  const rows = new Map();
  pages.flat().forEach((row) => {
    const key = row?.id == null
      ? `${row?.principal_kind || ''}:${row?.profile_id || ''}`
      : idText(row.id);
    if (key && !rows.has(key)) rows.set(key, row);
  });
  return [...rows.values()];
}
