// Copies non-React statics from source to target (replaces hoist-non-react-statics).
// shortcut: own statics only (no prototype-chain walk) and no forwardRef/memo special-casing, upgrade if wrapping those
const BLACKLIST = new Set<string | symbol>([
  'childContextTypes', 'contextType', 'contextTypes', 'defaultProps', 'displayName', 'getDefaultProps',
  'getDerivedStateFromError', 'getDerivedStateFromProps', 'mixins', 'propTypes', 'type',
  'name', 'length', 'prototype', 'caller', 'callee', 'arguments', 'arity',
])

export type NonReactStatics<S> = {
  [K in Exclude<keyof S, 'childContextTypes' | 'contextType' | 'contextTypes' | 'defaultProps' | 'displayName' | 'getDefaultProps' | 'getDerivedStateFromError' | 'getDerivedStateFromProps' | 'mixins' | 'propTypes' | 'type' | 'name' | 'length' | 'prototype' | 'caller' | 'callee' | 'arguments' | 'arity'>]: S[K]
}

export default function hoistStatics<T, S>(target: T, source: S): T & NonReactStatics<S> {
  for (const key of Reflect.ownKeys(source as object)) {
    if (BLACKLIST.has(key)) continue
    const descriptor = Object.getOwnPropertyDescriptor(source, key)
    try {
      Object.defineProperty(target, key, descriptor as PropertyDescriptor)
    } catch {
      // non-configurable property on target; skip
    }
  }
  return target as T & NonReactStatics<S>
}
