export function effectiveCapabilities(user) {
  if (!user || !Object.prototype.hasOwnProperty.call(user, 'effective_permissions')) {
    return null;
  }
  if (!Array.isArray(user.effective_permissions)) return [];
  return user.effective_permissions.filter((permission) => typeof permission === 'string');
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
