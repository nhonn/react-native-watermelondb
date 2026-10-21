/* eslint-disable no-use-before-define */
import allPass from '../../utils/fp/allPass'
import anyPass from '../../utils/fp/anyPass'
import invariant from '../../utils/common/invariant'
import type {
  QueryDescription,
  WhereDescription,
  Where,
} from '../../QueryDescription'
import type { RawRecord } from '../../RawRecord'
import type Model from '../../Model'
import operators from './operators'
import canEncodeMatcher, { forbiddenError } from './canEncode'
// eslint-disable-next-line no-unused-vars
export type Matcher<_Element extends Model> = (arg0: RawRecord) => boolean

const encodeWhereDescription: (arg0: WhereDescription) => Matcher<Model> =
  (description) => (rawRecord) => {
    const left = (rawRecord as Record<string, any>)[description.left]
    const { comparison } = description
    const operator = operators[comparison.operator]
    const compRight = comparison.right
    let right

    // TODO: What about `undefined`s ?
    if (compRight.value !== undefined) {
      right = compRight.value
    } else if (compRight.values) {
      right = compRight.values
    } else if (compRight.column) {
      right = (rawRecord as Record<string, any>)[compRight.column]
    } else {
      throw new Error('Invalid comparisonRight')
    }

    return operator(left, right)
  }

const encodeWhere: (arg0: Where) => Matcher<Model> = (where) => {
  switch (where.type) {
    case 'where':
      return encodeWhereDescription(where)

    case 'and':
      return allPass(where.conditions.map(encodeWhere))

    case 'or':
      return anyPass(where.conditions.map(encodeWhere))

    case 'on':
      throw new Error(
        'Illegal Q.on found -- nested Q.ons require explicit Q.experimentalJoinTables declaration'
      )

    default:
      throw new Error(`Illegal clause ${where.type}`)
  }
}

const encodeConditions: (arg0: Array<Where>) => Matcher<Model> = (conditions) =>
  allPass(conditions.map(encodeWhere))

export default function encodeMatcher<Element extends Model>(
  query: QueryDescription
): Matcher<Element> {
  invariant(canEncodeMatcher(query), forbiddenError)
  return encodeConditions(query.where) as any
}
