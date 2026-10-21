import { createElement } from 'react'
import type React from 'react'
export type HOC<Base, Enhanced> = (
  arg0: React.ComponentType<Base>
) => React.ComponentType<Enhanced>

let _createFactory: any = (Component: any) => {
  // eslint-disable-next-line react/function-component-definition, react/display-name
  return (props: any) => createElement(Component, props)
}

// undocumented binding for NT perf hack
export function _setCreateFactory(newCreateFactory: any): void {
  _createFactory = newCreateFactory
}
export function createFactory<ElementType extends React.ElementType>(
  Component: ElementType
): (props: any) => React.ReactElement {
  return _createFactory(Component)
}