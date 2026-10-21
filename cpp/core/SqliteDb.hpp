#pragma once

#include "StatementCache.hpp"
#include <sqlite3.h>
#include <string>

namespace watermelondb {

// RAII sqlite3* connection
class SqliteDb final {
public:
  explicit SqliteDb(const std::string& path);
  ~SqliteDb();
  SqliteDb(const SqliteDb&) = delete;
  SqliteDb& operator=(const SqliteDb&) = delete;

  sqlite3* handle() const { return _db; }

private:
  sqlite3* _db = nullptr;
};

// Borrows a statement from the cache; resets, clears bindings and returns it on scope exit.
class SqliteStatement final {
public:
  SqliteStatement(sqlite3_stmt* stmt, StatementCache& cache, const std::string& sql) : _stmt(stmt), _cache(cache), _sql(sql) {}
  ~SqliteStatement();
  SqliteStatement(const SqliteStatement&) = delete;
  SqliteStatement& operator=(const SqliteStatement&) = delete;

  sqlite3_stmt* get() const { return _stmt; }

private:
  sqlite3_stmt* _stmt;
  StatementCache& _cache;
  const std::string& _sql;
};

} // namespace watermelondb
