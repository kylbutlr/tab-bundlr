export function trainingPatternForUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    return pathname === '/' ? url.origin : `${url.origin}${pathname}`;
  } catch {
    return null;
  }
}

function rulePatternMatchesUrl(rule, value, caseInsensitive = false) {
  const pattern = trainingPatternForUrl(value);
  if (!pattern || !rule?.pattern) return false;
  const storedPattern = String(rule.pattern).replace(/\/+$/, '') || String(rule.pattern);
  const candidate = caseInsensitive ? pattern.toLocaleLowerCase('en-US') : pattern;
  const rulePattern = caseInsensitive ? storedPattern.toLocaleLowerCase('en-US') : storedPattern;
  return candidate === rulePattern
    || candidate.startsWith(`${rulePattern}/`)
    || (rulePattern.endsWith('-') && candidate.startsWith(rulePattern));
}

export function clientRulePatternKey(value) {
  return trainingPatternForUrl(value)?.toLocaleLowerCase('en-US') || null;
}

export function trainedRuleMatchesUrl(rule, value) {
  return rulePatternMatchesUrl(rule, value, true);
}

export function bestTrainedRuleForUrl(rules, value) {
  return (Array.isArray(rules) ? rules : [])
    .filter((rule) => trainedRuleMatchesUrl(rule, value))
    .sort((left, right) => String(right.pattern).length - String(left.pattern).length)[0] || null;
}

export function smartGroupPatterns(group) {
  const patterns = Array.isArray(group?.patterns) ? group.patterns : group?.pattern ? [group.pattern] : [];
  return [...new Set(patterns.filter(Boolean).map(String))];
}

export function smartGroupMatchesUrl(group, value) {
  return smartGroupPatterns(group).some((pattern) => rulePatternMatchesUrl({ pattern }, value));
}

// All assignment consumers use the same ranked candidates, including the URL tester.
function matchingAssignments(smartGroups, trainedRules, value, enabledTypes = {}) {
  const enabled = enabledTypes || {};
  const candidates = [
    ...(Array.isArray(smartGroups) ? smartGroups : [])
      .filter((group) => enabled[group.focusMode ? 'focus-smart' : 'smart'] !== false)
      .flatMap((group) => smartGroupPatterns(group).map((pattern) => ({ type: 'smart', rule: { ...group, pattern } }))),
    ...(enabled.client === false ? [] : Array.isArray(trainedRules) ? trainedRules : [])
      .map((rule) => ({ type: 'learned', rule })),
  ];
  return candidates.filter(({ type, rule }) => type === 'learned'
    ? trainedRuleMatchesUrl(rule, value) : rulePatternMatchesUrl(rule, value))
    .sort((left, right) => String(right.rule.pattern).length - String(left.rule.pattern).length
      || Number(right.type === 'smart') - Number(left.type === 'smart')
      || (left.type === 'smart' && right.type === 'smart'
        ? String(left.rule.id).localeCompare(String(right.rule.id)) : 0));
}

export function bestSmartGroupRuleForUrl(groups, value) {
  return matchingAssignments(groups, [], value)[0]?.rule || null;
}

export function bestUrlAssignmentForUrl(smartGroups, trainedRules, value, enabledTypes = null) {
  return matchingAssignments(smartGroups, trainedRules, value, enabledTypes)[0] || null;
}

export function urlRuleEntries(smartGroups, trainedRules) {
  return [
    ...(Array.isArray(smartGroups) ? smartGroups : []).flatMap((group) => smartGroupPatterns(group).map((pattern) => ({
      type: 'smart',
      id: String(group.id),
      name: group.name || 'Unnamed Smart Group',
      pattern,
    }))),
    ...(Array.isArray(trainedRules) ? trainedRules : []).map((rule) => ({
      type: 'learned',
      id: String(rule.epicId || ''),
      name: rule.epicName || 'Unnamed Workspace',
      pattern: rule.pattern,
    })),
  ].filter((rule) => rule.id && rule.pattern);
}

export function analyzeUrlRules(smartGroups, trainedRules, value, enabledTypes = null) {
  const normalizedUrl = trainingPatternForUrl(value);
  if (!normalizedUrl) {
    return { state: 'unsupported', normalizedUrl: null, assignment: null, matches: [], reason: 'Use an http or https URL.' };
  }
  const matches = matchingAssignments(smartGroups, trainedRules, normalizedUrl, enabledTypes)
    .map(({ type, rule }) => ({ type, id: String(type === 'smart' ? rule.id : rule.epicId),
      name: type === 'smart' ? rule.name : rule.epicName, pattern: rule.pattern }));
  const assignment = matches[0] || null;
  return { state: assignment ? 'matched' : 'unassigned', normalizedUrl, assignment, matches,
    reason: assignment ? `Workspace ${assignment.name} wins with ${assignment.pattern}.`
      : 'No enabled workspace URL rule matches this URL.' };
}

export function overlappingUrlRules(patternValue, smartGroups, trainedRules, exclude = {}) {
  const pattern = trainingPatternForUrl(patternValue);
  if (!pattern) return [];
  const candidateIsLearned = exclude.type === 'learned';
  return urlRuleEntries(smartGroups, trainedRules)
    .filter((rule) => !(
      rule.type === exclude.type
      && String(rule.id) === String(exclude.id)
      && (!exclude.pattern || (
        rule.type === 'learned'
          ? clientRulePatternKey(rule.pattern) === clientRulePatternKey(exclude.pattern)
          : rule.pattern === exclude.pattern
      ))
    ))
    .map((rule) => {
      const equal = rule.type === 'learned' && candidateIsLearned
        ? clientRulePatternKey(rule.pattern) === clientRulePatternKey(pattern)
        : rule.pattern === pattern;
      if (equal) return { ...rule, relation: 'equal' };
      const existingMatches = rule.type === 'learned'
        ? trainedRuleMatchesUrl(rule, pattern)
        : rulePatternMatchesUrl(rule, pattern);
      if (existingMatches) return { ...rule, relation: 'existing-broader' };
      const candidateMatches = candidateIsLearned
        ? trainedRuleMatchesUrl({ pattern }, rule.pattern)
        : rulePatternMatchesUrl({ pattern }, rule.pattern);
      if (candidateMatches) return { ...rule, relation: 'existing-narrower' };
      return null;
    })
    .filter(Boolean)
    .sort((left, right) => String(right.pattern).length - String(left.pattern).length);
}
