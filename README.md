# react-native-watermelondb

[WatermelonDB](https://github.com/Nozbe/WatermelonDB) for React Native, written in TypeScript, with a [Nitro](https://nitro.margelo.com) C++ SQLite engine for iOS and Android.

[![Version](https://img.shields.io/npm/v/react-native-watermelondb.svg)](https://www.npmjs.com/package/react-native-watermelondb)
[![Downloads](https://img.shields.io/npm/dm/react-native-watermelondb.svg)](https://www.npmjs.com/package/react-native-watermelondb)
[![License](https://img.shields.io/npm/l/react-native-watermelondb.svg)](https://github.com/noahnguyen/react-native-watermelondb/blob/main/LICENSE)

## Requirements

- React Native v0.76.0 or higher
- Node 18.0.0 or higher

> [!IMPORTANT]  
> To Support `Nitro Views` you need to install React Native version v0.78.0 or higher.

## Installation

```bash
bun add react-native-watermelondb react-native-nitro-modules
```

```ts
import { Database } from 'react-native-watermelondb'
import SQLiteAdapter from 'react-native-watermelondb/adapters/sqlite'
```

## Usage

```ts
import { Database, appSchema, tableSchema } from 'react-native-watermelondb'
import SQLiteAdapter from 'react-native-watermelondb/adapters/sqlite'

const schema = appSchema({
  version: 1,
  tables: [tableSchema({ name: 'posts', columns: [{ name: 'title', type: 'string' }] })],
})

const adapter = new SQLiteAdapter({ dbName: 'app', schema })
const database = new Database({ adapter, modelClasses: [Post] }) // Post extends Model
```

The rest of the API (models, `Q` queries, relations, observation, sync, React helpers) follows upstream WatermelonDB.

LokiJS, Turbo Login and Windows are not supported.

SQLite calls run synchronously on the JS thread by default, like upstream's JSI mode: no thread hop or Promise per call, but large queries block the JS thread. Pass `synchronous: false` to `SQLiteAdapter` to run calls on a per-database native thread instead. In that mode, reads issued in the same tick are sent as one native call, and `find`/`getLocal` (single-row reads) still run synchronously when no other call is in flight.

iOS and Android both use the bundled SQLite in `cpp/vendor/sqlite3` (same version and compile options on both; symbols are prefixed with `wmdb_`, so it can't clash with another SQLite in the app).

## Credits

Fork of [WatermelonDB](https://github.com/Nozbe/WatermelonDB) (MIT, © Nozbe) at commit `5c463222ecd79928861385bac94b486fcc7623d4`, with the JS ported to TypeScript and the native layer replaced by a Nitro C++ engine (iOS + Android only).

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## Development

```bash
bun check          # typecheck
bun run lint       # oxlint
bun run format     # oxfmt
bun run test       # jest
bun run test:cpp   # C++ core tests
bun run bench:js   # JS benchmarks
bun run bench:cpp  # C++ core benchmarks
bun run codegen    # nitrogen + build
```
