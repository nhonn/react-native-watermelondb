import unique from './index'
describe('unique', () => {
  it(`returns a list of unique elements, by identity`, () => {
    expect(unique([1, 4, 5, 1, 6, 4, 1, 9])).toEqual([1, 4, 5, 6, 9])
    expect(unique(['a', 'c', 'b', 'c', 'd', 'a'])).toEqual(['a', 'c', 'b', 'd'])
    const o1: any = []
    const o2: any = []
    const o3: any = []
    expect(unique([o1, o2, o3, o2, o1])).toEqual([o1, o2, o3])
  })
})
