import type { HOC } from './helpers'
import { createFactory } from './helpers'
type Props$Merge<A, B> = A & B
type EnhancedProps<PropsInput, NewProps> = Props$Merge<PropsInput, NewProps>
export default function withHooks<PropsInput extends {}, NewProps extends {}>(
  hookTransformer: (props: PropsInput) => NewProps
): HOC<EnhancedProps<PropsInput, NewProps>, PropsInput> {
  return (BaseComponent) => {
    const factory = createFactory(BaseComponent)

    const enhanced = function WithHooks(props: any): any {
      const newProps = hookTransformer(props)
      return factory({ ...props, ...newProps })
    }

    if (process.env.NODE_ENV !== 'production') {
      const baseName = BaseComponent.displayName || BaseComponent.name || 'anon'
      ;(enhanced as any).displayName = `withHooks[${baseName}]`
    }

    return enhanced
  }
}