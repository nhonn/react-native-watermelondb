#include "SqliteDb.hpp"
#include <stdexcept>

namespace watermelondb {

SqliteDb::SqliteDb(const std::string& path) {
  int result = sqlite3_open_v2(path.c_str(), &_db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_URI, nullptr);
  if (result != SQLITE_OK) {
    std::string message = _db != nullptr ? sqlite3_errmsg(_db) : "out of memory";
    sqlite3_close_v2(_db);
    _db = nullptr;
    throw std::runtime_error("Error while trying to open database - " + message + " (code " + std::to_string(result) + ")");
  }
}

SqliteDb::~SqliteDb() {
  sqlite3_close_v2(_db);
}

SqliteStatement::~SqliteStatement() {
  sqlite3_reset(_stmt);
  sqlite3_clear_bindings(_stmt);
}

} // namespace watermelondb
