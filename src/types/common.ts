/**
 * Common utility types and helpers.
 */

/** Generate a unique ID */
export function generateId(): string {
  return 'pa_xxxx-xxxx-xxxx-xxxx'.replace(/x/g, () => {
    const r = Math.floor(Math.random() * 16)
    return r.toString(16)
  })
}

/** Generate a timestamp-based ID */
export function generateTimeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

/** Type-safe exhaustive switch helper */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`)
}

/** Make specific keys required */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>
