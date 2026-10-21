const getPreciseTimeFunction: () => () => number = () => {
  const g: any = globalThis
  if (g.nativePerformanceNow) {
    return g.nativePerformanceNow
  } else if (g.performance && g.performance.now) {
    return g.performance.now.bind(g.performance)
  }

  return Date.now
}

const getPreciseTime: () => number = getPreciseTimeFunction()
export { getPreciseTime }
export function devMeasureTime<T>(executeBlock: () => T): [T, number] {
  const start = getPreciseTime()
  const result = executeBlock()
  const time = getPreciseTime() - start
  return [result, time]
}
export async function devMeasureTimeAsync<T>(
  executeBlock: () => Promise<T>
): Promise<[T, number]> {
  const start = getPreciseTime()
  const result = await executeBlock()
  const time = getPreciseTime() - start
  return [result, time]
}
