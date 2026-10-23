export const FIRST_USE_GUIDANCE_DISMISSED_STORAGE_KEY = 'firstUseGuidanceDismissed';

export function shouldShowFirstUseGuidance(storedValue, status = {}) {
  if (storedValue === true) return false;
  return Number(status.smartGroupCount || 0) === 0
    && Number(status.focusGroupCount || 0) === 0
    && Number(status.trainedRuleCount || 0) === 0
    && Number(status.workspaceSourceCount || 0) === 0;
}

export function sourceAccessDisclosure(source, accessGranted) {
  const origins = Array.isArray(source?.permissionOrigins)
    ? source.permissionOrigins.filter(Boolean)
    : [];
  return {
    required: accessGranted !== true && origins.length > 0,
    name: String(source?.name || 'This connection'),
    origins,
  };
}
