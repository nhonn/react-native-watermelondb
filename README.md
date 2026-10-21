# react-native-watermelondb

react-native-watermelondb is a react native package built with Nitro

[![Version](https://img.shields.io/npm/v/react-native-watermelondb.svg)](https://www.npmjs.com/package/react-native-watermelondb)
[![Downloads](https://img.shields.io/npm/dm/react-native-watermelondb.svg)](https://www.npmjs.com/package/react-native-watermelondb)
[![License](https://img.shields.io/npm/l/react-native-watermelondb.svg)](https://github.com/patrickkabwe/react-native-watermelondb/LICENSE)

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

LokiJS, Turbo Login, JSI/sync dispatcher modes and Windows are not supported.

## Credits

Fork of [WatermelonDB](https://github.com/Nozbe/WatermelonDB) (MIT, © Nozbe) at commit `5c463222ecd79928861385bac94b486fcc7623d4`, with the JS ported to TypeScript and the native layer replaced by a Nitro C++ engine (iOS + Android only; all SQLite calls run asynchronously on a per-database native thread).

Bootstrapped with [create-nitro-module](https://github.com/patrickkabwe/create-nitro-module).

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
