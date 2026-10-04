let nextId = 1;

/** Stable id for gun-stream tracking and missile locks. */
export function nextCombatId(prefix: string): string {
  const id = `${prefix}-${nextId}`;
  nextId += 1;
  return id;
}
