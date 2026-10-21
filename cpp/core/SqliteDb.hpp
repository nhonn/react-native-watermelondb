#pragma once

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

// Resets (and clears bindings of) a cached statement when it goes out of scope. Does not own the statement.
class SqliteStatement final {
public:
  explicit SqliteStatement(sqlite3_stmt* stmt) : _stmt(stmt) {}
  ~SqliteStatement();
  SqliteStatement(const SqliteStatement&) = delete;
  SqliteStatement& operator=(const SqliteStatement&) = delete;

  sqlite3_stmt* get() const { return _stmt; }

private:
  sqlite3_stmt* _stmt;
};

} // namespace watermelondb
