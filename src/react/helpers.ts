import { createElement } from 'react'
import type React from 'react'
export type HOC<Base, Enhanced> = (
  arg0: React.ComponentType<Base>
) => React.ComponentType<Enhanced>

export function createFactory<ElementType extends React.ElementType>(
  Component: ElementType
): (props: any) => React.ReactElement {
  // eslint-disable-next-line react/function-component-definition, react/display-name
  return (props: any) => createElement(Component, props)
}
