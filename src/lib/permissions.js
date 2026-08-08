export function effectiveCapabilities(user) {
  if (!user || !Object.prototype.hasOwnProperty.call(user, 'effective_permissions')) {
    return null;
  }
  if (!Array.isArray(user.effective_permissions)) return [];
  return user.effective_permissions.filter((permission) => typeof permission === 'string');
}

export function effectiveCapabilitiesForBranch(user, branchId) {
  const union = effectiveCapabilities(user);
  if (union === null || branchId == null || String(branchId).trim() === '') return union;
  if (!Object.prototype.hasOwnProperty.call(user || {}, 'scopes')) return union;
  if (!Array.isArray(user.scopes)) return [];

  const requested = String(branchId);
  const resolved = new Set();
  for (const scope of user.scopes) {
    if (!scope || typeof scope !== 'object' || !Object.hasOwn(scope, 'branch')) continue;
    const scopeBranch = scope.branch;
    const scopeBranchId = scopeBranch && typeof scopeBranch === 'object'
      ? scopeBranch.id
      : scopeBranch;
    if (scopeBranch !== null && String(scopeBranchId) !== requested) continue;
    if (!Array.isArray(scope.effective_permissions)) continue;
    scope.effective_permissions
      .filter((permission) => typeof permission === 'string')
      .forEach((permission) => resolved.add(permission));
  }
  return [...resolved];
}

export function hasCapability(capabilities, permission) {
  const capabilitySet = capabilities instanceof Set
    ? capabilities
    : new Set(Array.isArray(capabilities) ? capabilities : []);
  const [resource] = String(permission || '').split(':');
  return capabilitySet.has(permission) ||
    capabilitySet.has(`${resource}:*`) ||
    capabilitySet.has('*:*');
}

// Older releases do not include the additive effective_permissions field on
// /users/me/. Preserve their UI compatibility only when the field is absent;
// a present but malformed/empty field remains fail-closed.
export function canUseCapability(user, permission) {
  const capabilities = effectiveCapabilities(user);
  return capabilities === null || hasCapability(capabilities, permission);
}

export function declaredPermissions(value) {
  return String(value || '').match(/[\w-]+:(?:read|write|\*)/g) || [];
}

export function hasDeclaredAccess(value, capabilitySet) {
  if (capabilitySet == null) return true;
  const required = declaredPermissions(value);
  if (!required.length) return true;
  return required.some((permission) => hasCapability(capabilitySet, permission));
}
