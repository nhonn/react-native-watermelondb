import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  Database,
  Model,
  appSchema,
  tableSchema,
} from 'react-native-watermelondb'
import SQLiteAdapter from 'react-native-watermelondb/adapters/sqlite'

const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({ name: 'notes', columns: [{ name: 'body', type: 'string' }] }),
  ],
})

class Note extends Model {
  static table = 'notes'
}

const database = new Database({
  adapter: new SQLiteAdapter({ schema, dbName: 'example' }),
  modelClasses: [Note],
})

function App(): React.JSX.Element {
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      await database.write(async () => {
        await database
          .get<Note>('notes')
          .create((n) => n._setRaw('body', 'hello'))
      })
      setCount(await database.get('notes').query().fetchCount())
    })().catch((e) => setError(String(e?.message ?? e)))
  }, [])

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Notes: {count ?? '...'}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 40, color: 'green' },
  error: { color: 'red' },
})

export default App
