import type { Descriptor } from '../../utils/common/makeDecorator'
// Wraps function calls in `database.write(() => { ... })`. See docs for more details
// You can use this on Model subclass methods (or methods of any object that has a `database` property)
export function writer(
  target: Record<string, any>,
  key: string,
  descriptor: Descriptor
): Descriptor {
  const actionName = `${target.table || target.constructor.name}.${key}`
  return {
    ...descriptor,

    value(this: any, ...args: any[]): Promise<any> {
      return this.database.write(
        () => descriptor.value.apply(this, args),
        actionName
      )
    },
  }
}
// Wraps function calls in `database.read(() => { ... })`. See docs for more details
// You can use this on Model subclass methods (or methods of any object that has a `database` property)
export function reader(
  target: Record<string, any>,
  key: string,
  descriptor: Descriptor
): Descriptor {
  const actionName = `${target.table || target.constructor.name}.${key}`
  return {
    ...descriptor,

    value(this: any, ...args: any[]): Promise<any> {
      return this.database.read(
        () => descriptor.value.apply(this, args),
        actionName
      )
    },
  }
}