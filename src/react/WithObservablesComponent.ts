import { useRef } from 'react'
import type { Observable } from 'rxjs'
import identicalArrays from '../utils/fp/identicalArrays'
import type { ExtractedObservables } from './withObservables'
import withObservables from './withObservables'
import compose from './compose'
import withHooks from './withHooks'
import type { HOC } from './helpers'
import './helpers'
type ExportProps<ObservableProps> = {
  resetOn: any[]
  observables: ObservableProps
  children: (arg0: ExtractedObservables<ObservableProps>) => React.ReactNode
}
type InitialProps = {
  resetOn: any[]
  observables: Record<string, Observable<any>>
  children: (arg0: Record<string, any>) => React.ReactNode
}

const WithObservables = (props: InitialProps) => {
  const { children } = props
  return children(props)
}

const enhance: HOC<any, InitialProps> = compose(
  withHooks(({ resetOn, observables }: InitialProps) => {
    const triggeringProps = useRef(resetOn)

    if (!identicalArrays(triggeringProps.current, resetOn)) {
      triggeringProps.current = resetOn
    }

    if (process.env.NODE_ENV !== 'production') {
      const keys = Object.keys(observables)

      if (
        keys.includes('resetOn') ||
        keys.includes('observables') ||
        keys.includes('children') ||
        keys.includes('__triggeringProps')
      ) {
        throw new Error(
          `Do not use reserved keys in WithObservables's observables props`
        )
      }
    }

    return {
      __triggeringProps: triggeringProps.current,
    }
  }),
  withObservables(
    ['__triggeringProps'] as any,
    ({ observables }: InitialProps) => observables as any
  )
)
export default enhance(WithObservables) as any as <T>(
  arg0: ExportProps<T>
) => React.ReactNode
