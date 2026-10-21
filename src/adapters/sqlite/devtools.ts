import Query from '../../Query'
import encodeQuery from './encodeQuery'
import type { SQL } from './index'

// @ts-expect-error
Query.prototype._sql = function _sql(count: boolean = false): SQL {
  const [sql] = encodeQuery(this.serialize(), count)
  return sql
}
