/* eslint-disable no-restricted-syntax */

/* eslint-disable guard-for-in */
type FilterFn = (value: any, key: string, obj: any) => boolean
type FilterObj = ((fn: FilterFn, obj: any) => any) &
  ((fn: FilterFn) => (obj: any) => any)

function filterObj(predicate: FilterFn, obj?: any): any {
  if (arguments.length === 1) {
    return (_obj: any) => filterObj(predicate, _obj)
  }

  const result: Record<string, any> = {}
  let value

  for (const prop in obj) {
    value = obj[prop]

    if (predicate(value, prop, obj)) {
      result[prop] = value
    }
  }

  return result
}

export default filterObj as FilterObj
