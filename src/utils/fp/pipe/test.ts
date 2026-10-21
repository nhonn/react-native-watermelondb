import pipe from './index'
describe('pipe', () => {
  it(`works correctly`, () => {
    const add = (a: any, b: any) => a + b

    const plus10 = (a: any) => a + 10

    const times5 = (a: any) => a * 5

    // @ts-expect-error ported Flow test code is not type-safe here
    expect(pipe()()).toBe(undefined)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(pipe()(1, 2)).toBe(undefined)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(pipe(add as any)(1, 2)).toBe(3)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(pipe(add as any, plus10)(1, 2)).toBe(13)
    // @ts-expect-error ported Flow test code is not type-safe here
    expect(pipe(add as any, times5, (x) => x - 5, plus10)(3, 4)).toBe(40)
  })
})