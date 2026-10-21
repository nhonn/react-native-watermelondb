/* eslint-disable no-restricted-syntax */

/* eslint-disable guard-for-in */
type MapFn = (value: any, key: string, obj: any) => any
type MapObj = ((fn: MapFn, obj: any) => any) & ((fn: MapFn) => (obj: any) => any)

function mapObj(fn: MapFn, obj?: any): any {
  if (arguments.length === 1) {
    return (_obj: any) => mapObj(fn, _obj)
  }

  const result: Record<string, any> = {}

  for (const prop in obj) {
    result[prop] = fn(obj[prop], prop, obj)
  }

  return result
}

export default mapObj as MapObj
