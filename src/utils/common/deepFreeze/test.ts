import deepFreeze from './index'
describe('deepFreeze', () => {
  it('can deep freeze an object', () => {
    const obj = {
      foo: {
        bar: [],
        baz: {
          blah: 1,
        },
      },
    }
    const second = deepFreeze(obj)
    expect(second).toBe(obj)
    expect(obj.foo.baz.blah).toBe(1)
    expect(() => {
      // @ts-expect-error ported Flow test code is not type-safe here
      obj.foo = {}
    }).toThrow()
    expect(() => {
      // @ts-expect-error ported Flow test code is not type-safe here
      obj.foo.bar.push(1 as any)
    }).toThrow()
    expect(() => {
      obj.foo.baz.blah = 2
    }).toThrow()
    expect(obj.foo.baz.blah).toBe(1)
    expect(obj.foo.bar.length).toBe(0)
  })
})
