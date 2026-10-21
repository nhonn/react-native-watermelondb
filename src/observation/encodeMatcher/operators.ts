/* eslint-disable eqeqeq */
import likeToRegexp from '../../utils/fp/likeToRegexp'
import type { Operator } from '../../QueryDescription'
type OperatorFunction = (left: any, right: any) => any

const between: OperatorFunction = (left: any, [lower, upper]: any[]) =>
  left >= lower && left <= upper

export const rawFieldEquals: OperatorFunction = (left: any, right: any) =>
  left == right

const rawFieldNotEquals: OperatorFunction = (left: any, right: any) =>
  !(left == right)

const noNullComparisons: (arg0: OperatorFunction) => OperatorFunction =
  (operator) => (left: any, right: any) => {
    // return false if any operand is null/undefined
    if (left == null || right == null) {
      return false
    }

    return operator(left, right)
  }

// Same as `a > b`, but `5 > undefined` is also true
const weakGt = (left: any, right: any) =>
  left > right || (left != null && right == null)

const handleLikeValue = (v: any, defaultV: string) =>
  typeof v === 'string' ? v : defaultV

export const like: OperatorFunction = (left: any, right: any) => {
  const leftV = handleLikeValue(left, '')
  return likeToRegexp(right).test(leftV)
}
export const notLike: OperatorFunction = (left: any, right: any) => {
  // Mimic SQLite behaviour
  if (left === null) {
    return false
  }

  const leftV = handleLikeValue(left, '')
  return !likeToRegexp(right).test(leftV)
}

const oneOf: OperatorFunction = (value: any, values: any[]) =>
  values.includes(value)

const notOneOf: OperatorFunction = (value: any, values: any[]) =>
  !values.includes(value)

const gt = (a: any, b: any) => a > b

const gte = (a: any, b: any) => a >= b

const lt = (a: any, b: any) => a < b

const lte = (a: any, b: any) => a <= b

const includes = (a: any, b: any) => typeof a === 'string' && a.includes(b)

const operators: Record<Operator, OperatorFunction> = {
  eq: rawFieldEquals,
  notEq: rawFieldNotEquals,
  gt: noNullComparisons(gt),
  gte: noNullComparisons(gte),
  weakGt,
  lt: noNullComparisons(lt),
  lte: noNullComparisons(lte),
  oneOf,
  notIn: noNullComparisons(notOneOf),
  between,
  like,
  notLike,
  includes,
}
export default operators
