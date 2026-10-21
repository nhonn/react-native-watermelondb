export type Descriptor = Record<string, any>
export type RawDecorator = (
  target: any,
  key: string,
  descriptor: Descriptor
) => any
export type Decorator = (...any: any[]) => any // Converts a function with signature `(args) => (target, key, descriptor)` to a decorator
// that works both when called `@decorator foo` and with arguments, like `@decorator(arg) foo`

export default function makeDecorator(
  decorator: (...any: any[]) => RawDecorator
): Decorator {
  return (...args) => {
    // Decorator called with an argument, JS expects a decorator function
    if (args.length < 3) {
      return decorator(...args)
    }

    // Decorator called without an argument, JS expects a descriptor object
    return (decorator() as any)(...args)
  }
}
