/** Component-local lock: synchronous acquisition also protects guest saves. */
export function createSaveLock() {
  const active = new Map<string, number>();
  return {
    acquire(key: string): (() => void) | null {
      if ((active.get(key) ?? 0) > Date.now()) return null;
      active.set(key, Infinity);
      return () => { active.set(key, Date.now() + 400); };
    },
  };
}
