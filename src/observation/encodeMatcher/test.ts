import Query from '../../Query'
import * as Q from '../../QueryDescription'
import encodeMatcher from './index'
import canEncodeMatcher from './canEncode'
import { matchTests, naughtyMatchTests } from '../../__tests__/databaseTests'
const mockModelClass = {
  table: 'tasks',
}
const mockCollection = {
  modelClass: mockModelClass,
}

const makeDescription = (conditions: any) =>
  new Query(mockCollection as any, conditions).description

const makeMatcher = (conditions: any) => encodeMatcher(makeDescription(conditions))

const expectTrue = (matcher: any, raw: any) => expect(matcher(raw)).toBe(true)

const expectFalse = (matcher: any, raw: any) => expect(matcher(raw)).toBe(false)

const unencodableQueries = [
  [Q.on('projects', 'team_id', 'abcdef')],
  [Q.experimentalJoinTables(['foo'])],
  [Q.experimentalNestedJoin('foo', 'bar')],
  [Q.sortBy('left_column', 'asc')],
  [Q.take(100)],
  [Q.take(100)],
  [Q.unsafeSqlQuery('select * from tasks')],
]
describe('SQLite encodeMatcher', () => {
  matchTests.forEach((testCase) => {
    it(`passes db test: ${testCase.name}`, () => {
      if (testCase.skipMatcher) {
        return
      }

      const matcher = makeMatcher(testCase.query)
      testCase.matching.forEach((matchingRaw: any) => {
        expectTrue(matcher, matchingRaw)
      })
      testCase.nonMatching.forEach((nonMatchingRaw: any) => {
        expectFalse(matcher, nonMatchingRaw)
      })
    })
  })
  it('passes big-list-of-naughty-string matches', () => {
    naughtyMatchTests.forEach((testCase) => {
      // console.log(testCase.name)
      const matcher = makeMatcher(testCase.query)
      testCase.matching.forEach((matchingRaw: any) => {
        expectTrue(matcher, matchingRaw)
      })
      testCase.nonMatching.forEach((nonMatchingRaw: any) => {
        expectFalse(matcher, nonMatchingRaw)
      })
    })
  })
  it('throws on queries it cannot encode', () => {
    unencodableQueries.forEach((query) => {
      // console.log(query)
      expect(() => makeMatcher(query)).toThrow(
        `can't be encoded into a matcher`
      )
    })
    expect(() =>
      makeMatcher([Q.or(Q.on('projects', 'team_id', 'abcdef'))])
    ).toThrow('Illegal Q.on')
    expect(() => makeMatcher([Q.or(Q.unsafeSqlExpr(''))])).toThrow('Illegal')
  })
})
describe('canEncodeMatcher', () => {
  it(`can tell you if a query is encodable`, () => {
    expect(canEncodeMatcher(makeDescription([Q.where('foo', 'bar')]))).toBe(
      true
    )
    unencodableQueries.forEach((query) => {
      expect(canEncodeMatcher(makeDescription(query))).toBe(false)
    })
  })
})