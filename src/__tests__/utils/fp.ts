export const omit = (keys: string[], obj: any): any =>
  Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)))

export const times = <T>(fn: (i: number) => T, n: number): T[] => Array.from({ length: n }, (_, i) => fn(i))

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export const last = <T>(list: T[]): T => list[list.length - 1] as T

export const pluck = (key: string, list: any[]): any[] => list.map((item) => item[key])

export function shuffle<T>(list: T[]): T[] {
  const copy = list.slice()
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j] as T, copy[i] as T]
  }
  return copy
}
