/* eslint-disable getter-return */
// Used as a placeholder during reset database to catch illegal
// adapter calls
const throwError = (name: string): never => {
  throw new Error(
    `Cannot call database.adapter.${name} while the database is being reset`
  )
}

export default class ErrorAdapter {
  constructor() {
    ;[
      'find',
      'query',
      'queryIds',
      'count',
      'batch',
      'getDeletedRecords',
      'destroyDeletedRecords',
      'unsafeResetDatabase',
      'getLocal',
      'setLocal',
      'removeLocal',
      'testClone',
    ].forEach((name) => {
      // $FlowFixMe
      (this as any)[name] = () => throwError(name)
    })
  }

  get underlyingAdapter(): never {
    return throwError('underlyingAdapter')
  }

  get schema(): never {
    return throwError('schema')
  }

  get migrations(): never {
    return throwError('migrations')
  }
}