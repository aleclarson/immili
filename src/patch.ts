import { isPlainObject } from './shared'

export function applyMergePatch(target: object, patch: object): void {
  for (const key of Object.keys(patch)) {
    const patchValue = (patch as Record<string, unknown>)[key]
    const currentValue = (target as Record<string, unknown>)[key]

    if (isPlainObject(currentValue) && isPlainObject(patchValue)) {
      applyMergePatch(currentValue, patchValue)
      continue
    }

    ;(target as Record<string, unknown>)[key] = patchValue
  }
}
