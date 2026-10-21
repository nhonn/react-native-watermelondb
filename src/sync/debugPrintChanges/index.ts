/* eslint-disable no-console */
import toPairs from '../../utils/fp/toPairs'

if (process.env.NODE_ENV === 'production') {
  throw new Error('debugPrintChanges() MUST NOT BE USED IN PRODUCTION!')
}

console.warn(
  'WARNING: DO NOT commit import of react-native-watermelondb/sync/debugPrintChanges!'
)
export default function debugPrintChanges(
  changes: any,
  isPush: boolean
): void {
  if (process.env.NODE_ENV === 'production') {
    return
  }

  console.log(
    '========================================================================'
  )
  console.log(
    '##                                                                    ##'
  )
  isPush &&
    console.log(
      '##                         PUSHING CHANGES                            ##'
    )
  !isPush &&
    console.log(
      '##                             PULLING                                ##'
    )
  console.log(
    '##                                                                    ##'
  )
  console.log(
    '========================================================================'
  )

  toPairs(changes).forEach(([table, tableChanges]: [string, any]) => {
    toPairs(tableChanges).forEach(([changeType, records]: [string, any]) => {
      if (records.length) {
        console.log(
          `| ${isPush ? 'pushing!' : 'PULL'} | ${table} | ${changeType} |`
        )
        console.log(
          '________________________________________________________________________'
        )
        console.table(records)
      }
    })
  })

  console.log('============================')
  console.log('##                        ##')
  console.log('##          DONE          ##')
  console.log('##                        ##')
  console.log('============================')
}
