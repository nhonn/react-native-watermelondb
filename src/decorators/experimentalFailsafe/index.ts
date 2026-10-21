import { isObj } from '../../utils/fp'
import { catchError, of } from '../../utils/rx'
type FailsafeDecorator = (
  fallback?: any
) => (
  target: Record<string, any>,
  key: string,
  descriptor: Record<string, any>
) => Record<string, any>

const failsafe: FailsafeDecorator =
  (fallback = undefined) =>
  (_target, key, descriptor) => {
    return {
      ...descriptor,

      get(this: any): any {
        let value

        if ('value' in descriptor) {
          value = descriptor.value
        } else if ('get' in descriptor) {
          value = descriptor.get.call(this)
        } else if ('initializer' in descriptor) {
          value = descriptor.initializer.call(this)
        }

        if (value && isObj(value)) {
          const originalFetch = value.fetch
          const originalObserve = value.observe

          if (typeof originalFetch === 'function') {
            value.fetch = function fetch(...args: any[]): any {
              const result = originalFetch.apply(value, args)

              if (isObj(result) && typeof result.catch === 'function') {
                return result.catch(() => fallback)
              }

              return result
            }
          }

          if (typeof originalObserve === 'function') {
            value.observe = function observe(...args: any[]): any {
              const result = originalObserve.apply(value, args)

              if (isObj(result) && typeof result.pipe === 'function') {
                return result.pipe(catchError(() => of(fallback)))
              }

              return result
            }
          }
        }

        Object.defineProperty(this, key, {
          value,
          enumerable: descriptor.enumerable,
        })
        return value
      },
    }
  }

export default failsafe
