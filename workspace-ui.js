// Presents legacy local rules and optional connection destinations as one workspace list.
export function workspaceChoices(status) {
  const choices = [
    ...(status.smartGroups || []).map((group) => ({ key: `local:${group.id}`, kind: 'smart', id: String(group.id), name: group.name })),
    ...(status.clientGroups || []).map((group) => ({ key: `saved:${group.epicId}`, kind: 'saved', id: String(group.id),
      workspaceId: String(group.epicId), name: group.name })),
  ];
  return [...new Map(choices.map((choice) => [choice.key, choice])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
