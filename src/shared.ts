export function deepFreezeObject<T extends object>(value: T): T {
  for (const nested of Object.values(value)) {
    if (isObjectRecord(nested) && !Object.isFrozen(nested)) {
      deepFreezeObject(nested)
    }
  }

  return Object.freeze(value)
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObjectRecord(value) || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  )
}
