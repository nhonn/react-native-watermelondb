import React from 'react'
import hoistNonReactStatics from 'hoist-non-react-statics'
import type Database from '../Database'
import { DatabaseConsumer } from './DatabaseContext'
type WithDatabaseProps<T extends {}> = T & {
  database: Database
} // HoC to inject the database into the props of consumers

export default function withDatabase<T extends {}>(
  Component: React.ComponentType<WithDatabaseProps<T>>
): React.ComponentType<T> {
  function DatabaseComponent(
    props: any
  ): React.ReactElement<React.ComponentProps<any>, any> {
    return (
      <DatabaseConsumer>
        {(database: Database) => <Component {...props} database={database} />}
      </DatabaseConsumer>
    )
  }

  return hoistNonReactStatics(DatabaseComponent, Component)
}