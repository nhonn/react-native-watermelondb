#pragma once

// App builds link the vendored, symbol-prefixed SQLite (cpp/vendor/sqlite3/wmdb_sqlite3.c); host tests link the system one.
#ifdef WMDB_VENDORED_SQLITE
#include "wmdb_sqlite3_prefix.h"
#endif
#include <sqlite3.h>
