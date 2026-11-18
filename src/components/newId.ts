/** A unique id for a new person or company day. */
export function newId(prefix = 'id'): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
