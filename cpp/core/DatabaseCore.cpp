#include "DatabaseCore.hpp"
#include <cstdio>
#include <stdexcept>

namespace watermelondb {

using margelo::nitro::NullType;

DatabaseCore::DatabaseCore(std::string path, bool usesExclusiveLocking) : _path(std::move(path)), _exclusive(usesExclusiveLocking) {}

DatabaseCore::~DatabaseCore() {
  close();
}

sqlite3* DatabaseCore::db() const {
  if (_db == nullptr) {
    throw std::runtime_error("Database is not open (or was closed)");
  }
  return _db->handle();
}

void DatabaseCore::throwDbError(const std::string& message, const std::string& sql) const {
  std::string text = message;
  if (_db != nullptr) {
    text += " - " + std::string(sqlite3_errmsg(_db->handle())) + " (sqlite error " + std::to_string(sqlite3_extended_errcode(_db->handle())) + ")";
  }
  if (!sql.empty()) {
    text += ", sql: " + sql;
  }
  throw std::runtime_error(text);
}

void DatabaseCore::open() {
  if (_db != nullptr) {
    return;
  }
  _db = std::make_unique<SqliteDb>(_path);
#ifdef __ANDROID__
  executeMultiple("pragma temp_store = memory; pragma synchronous = FULL;");
#endif
  executeMultiple("pragma journal_mode = WAL; pragma busy_timeout = 5000;");
  if (_exclusive) {
    executeMultiple("pragma locking_mode = EXCLUSIVE;");
  }
}

sqlite3_stmt* DatabaseCore::prepare(const std::string& sql) {
  auto it = _statements.find(sql);
  if (it != _statements.end()) {
    sqlite3_reset(it->second);
    return it->second;
  }
  sqlite3_stmt* stmt = nullptr;
  if (sqlite3_prepare_v2(db(), sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK) {
    sqlite3_finalize(stmt);
    throwDbError("Failed to prepare query statement", sql);
  }
  _statements.emplace(sql, stmt);
  return stmt;
}

// Strings are bound with SQLITE_STATIC: `args` must outlive the statement's use (SqliteStatement clears bindings).
void DatabaseCore::bindArgs(sqlite3_stmt* stmt, const std::vector<SQLiteValue>& args, const std::string& sql) {
  if (sqlite3_bind_parameter_count(stmt) != static_cast<int>(args.size())) {
    throw std::runtime_error("Number of args passed to query doesn't match number of arg placeholders, sql: " + sql);
  }
  for (size_t i = 0; i < args.size(); i++) {
    const int idx = static_cast<int>(i) + 1;
    const SQLiteValue& v = args[i];
    int result;
    if (std::holds_alternative<NullType>(v)) {
      result = sqlite3_bind_null(stmt, idx);
    } else if (const auto* s = std::get_if<std::string>(&v)) {
      result = sqlite3_bind_text(stmt, idx, s->c_str(), static_cast<int>(s->size()), SQLITE_STATIC);
    } else if (const auto* d = std::get_if<double>(&v)) {
      result = sqlite3_bind_double(stmt, idx, *d);
    } else {
      result = sqlite3_bind_int(stmt, idx, std::get<bool>(v) ? 1 : 0);
    }
    if (result != SQLITE_OK) {
      throwDbError("Failed to bind an argument for query", sql);
    }
  }
}

void DatabaseCore::step(sqlite3_stmt* stmt, const std::string& sql) {
  if (sqlite3_step(stmt) != SQLITE_DONE) {
    throwDbError("Failed to execute statement", sql);
  }
}

void DatabaseCore::finalizeStatements() {
  for (auto& entry : _statements) {
    sqlite3_finalize(entry.second);
  }
  _statements.clear();
}

void DatabaseCore::execSimple(const char* sql) {
  char* err = nullptr;
  if (sqlite3_exec(db(), sql, nullptr, nullptr, &err) != SQLITE_OK) {
    std::string message = err != nullptr ? err : "unknown error";
    sqlite3_free(err);
    throw std::runtime_error("Failed to execute '" + std::string(sql) + "' - " + message);
  }
}

void DatabaseCore::rollbackQuietly() {
  try {
    execSimple("rollback transaction");
  } catch (const std::exception& e) {
    std::fprintf(stderr, "[WatermelonDB] Rollback failed: %s\n", e.what());
  }
}

void DatabaseCore::executeMultiple(const std::string& sql) {
  char* err = nullptr;
  if (sqlite3_exec(db(), sql.c_str(), nullptr, nullptr, &err) != SQLITE_OK) {
    std::string message = err != nullptr ? err : "unknown error";
    sqlite3_free(err);
    throw std::runtime_error("Failed to execute SQL - " + message + ", sql: " + sql);
  }
}

int DatabaseCore::getUserVersion() {
  sqlite3_stmt* stmt = prepare("pragma user_version");
  SqliteStatement guard(stmt);
  if (sqlite3_step(stmt) != SQLITE_ROW) {
    throwDbError("Failed to read user_version");
  }
  return sqlite3_column_int(stmt, 0);
}

void DatabaseCore::setUserVersion(int version) {
  executeMultiple("pragma user_version = " + std::to_string(version));
}

void DatabaseCore::resetWithSchema(const std::string& schemaSql, int version) {
  db();
  finalizeStatements();
  if (sqlite3_db_config(db(), SQLITE_DBCONFIG_RESET_DATABASE, 1, 0) != SQLITE_OK) {
    throwDbError("Failed to enable database reset");
  }
  execSimple("vacuum");
  sqlite3_db_config(db(), SQLITE_DBCONFIG_RESET_DATABASE, 0, 0);

  execSimple("begin exclusive transaction");
  try {
    _cache.clear();
    executeMultiple(schemaSql);
    setUserVersion(version);
    execSimple("commit transaction");
  } catch (...) {
    rollbackQuietly();
    throw;
  }
}

void DatabaseCore::migrate(const std::string& sql, int from, int to) {
  const int current = getUserVersion();
  if (current != from) {
    throw std::runtime_error("Incompatible migration set applied. DB: " + std::to_string(current) + ", migration: " + std::to_string(from));
  }
  execSimple("begin exclusive transaction");
  try {
    executeMultiple(sql);
    setUserVersion(to);
    execSimple("commit transaction");
  } catch (...) {
    rollbackQuietly();
    throw;
  }
}

RawRow DatabaseCore::readRow(sqlite3_stmt* stmt) {
  RawRow row;
  const int columns = sqlite3_column_count(stmt);
  for (int i = 0; i < columns; i++) {
    std::string name = sqlite3_column_name(stmt, i);
    switch (sqlite3_column_type(stmt, i)) {
      case SQLITE_INTEGER:
        row[std::move(name)] = static_cast<double>(sqlite3_column_int64(stmt, i));
        break;
      case SQLITE_FLOAT:
        row[std::move(name)] = sqlite3_column_double(stmt, i);
        break;
      case SQLITE_TEXT:
        row[std::move(name)] = std::string(reinterpret_cast<const char*>(sqlite3_column_text(stmt, i)),
                                           static_cast<size_t>(sqlite3_column_bytes(stmt, i)));
        break;
      case SQLITE_NULL:
        row[std::move(name)] = margelo::nitro::null;
        break;
      default:
        throw std::runtime_error("BLOB columns are not supported");
    }
  }
  return row;
}

FindResult DatabaseCore::find(const std::string& table, const std::string& id) {
  const std::string key = table + "$" + id;
  if (_cache.count(key) != 0) {
    return id;
  }
  const std::string sql = "select * from \"" + table + "\" where id == ? limit 1";
  sqlite3_stmt* stmt = prepare(sql);
  SqliteStatement guard(stmt);
  const std::vector<SQLiteValue> args{SQLiteValue(id)}; // must outlive step (SQLITE_STATIC)
  bindArgs(stmt, args, sql);
  const int result = sqlite3_step(stmt);
  if (result == SQLITE_DONE) {
    return margelo::nitro::null;
  }
  if (result != SQLITE_ROW) {
    throwDbError("Failed to execute find", sql);
  }
  RawRow row = readRow(stmt);
  _cache.insert(key);
  return row;
}

std::vector<CachedRecord> DatabaseCore::query(const std::string& table, const std::string& sql, const std::vector<SQLiteValue>& args) {
  sqlite3_stmt* stmt = prepare(sql);
  SqliteStatement guard(stmt);
  bindArgs(stmt, args, sql);

  int idColumn = -1;
  const int columns = sqlite3_column_count(stmt);
  for (int i = 0; i < columns; i++) {
    if (std::string(sqlite3_column_name(stmt, i)) == "id") {
      idColumn = i;
      break;
    }
  }
  if (idColumn < 0) {
    throw std::runtime_error("Query must return an 'id' column, sql: " + sql);
  }

  std::vector<CachedRecord> records;
  int result;
  while ((result = sqlite3_step(stmt)) == SQLITE_ROW) {
    std::string id(reinterpret_cast<const char*>(sqlite3_column_text(stmt, idColumn)), static_cast<size_t>(sqlite3_column_bytes(stmt, idColumn)));
    const std::string key = table + "$" + id;
    if (_cache.count(key) != 0) {
      records.emplace_back(std::move(id));
    } else {
      records.emplace_back(readRow(stmt));
      _cache.insert(key);
    }
  }
  if (result != SQLITE_DONE) {
    throwDbError("Failed to execute query", sql);
  }
  return records;
}

std::vector<std::string> DatabaseCore::queryIds(const std::string& sql, const std::vector<SQLiteValue>& args) {
  sqlite3_stmt* stmt = prepare(sql);
  SqliteStatement guard(stmt);
  bindArgs(stmt, args, sql);
  std::vector<std::string> ids;
  int result;
  while ((result = sqlite3_step(stmt)) == SQLITE_ROW) {
    ids.emplace_back(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0)), static_cast<size_t>(sqlite3_column_bytes(stmt, 0)));
  }
  if (result != SQLITE_DONE) {
    throwDbError("Failed to execute queryIds", sql);
  }
  return ids;
}

std::vector<RawRow> DatabaseCore::unsafeQueryRaw(const std::string& sql, const std::vector<SQLiteValue>& args) {
  sqlite3_stmt* stmt = prepare(sql);
  SqliteStatement guard(stmt);
  bindArgs(stmt, args, sql);
  std::vector<RawRow> rows;
  int result;
  while ((result = sqlite3_step(stmt)) == SQLITE_ROW) {
    rows.push_back(readRow(stmt));
  }
  if (result != SQLITE_DONE) {
    throwDbError("Failed to execute unsafeQueryRaw", sql);
  }
  return rows;
}

double DatabaseCore::count(const std::string& sql, const std::vector<SQLiteValue>& args) {
  sqlite3_stmt* stmt = prepare(sql);
  SqliteStatement guard(stmt);
  bindArgs(stmt, args, sql);
  if (sqlite3_step(stmt) != SQLITE_ROW) {
    throwDbError("Failed to execute count", sql);
  }
  return static_cast<double>(sqlite3_column_int64(stmt, 0));
}

LocalValue DatabaseCore::getLocal(const std::string& key) {
  const std::string sql = "select value from local_storage where key = ?";
  sqlite3_stmt* stmt = prepare(sql);
  SqliteStatement guard(stmt);
  const std::vector<SQLiteValue> args{SQLiteValue(key)}; // must outlive step (SQLITE_STATIC)
  bindArgs(stmt, args, sql);
  const int result = sqlite3_step(stmt);
  if (result == SQLITE_DONE) {
    return margelo::nitro::null;
  }
  if (result != SQLITE_ROW) {
    throwDbError("Failed to execute getLocal", sql);
  }
  return std::string(reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0)), static_cast<size_t>(sqlite3_column_bytes(stmt, 0)));
}

void DatabaseCore::batch(const std::vector<NativeBatchOperation>& operations) {
  db();
  std::vector<std::pair<bool, std::string>> cacheChanges; // (add?, key)

  execSimple("begin exclusive transaction");
  try {
    for (const auto& op : operations) {
      const double cacheBehavior = std::get<0>(op);
      const BatchTable& table = std::get<1>(op);
      const std::string& sql = std::get<2>(op);
      const auto& argBatches = std::get<3>(op);

      std::string tableName;
      if (cacheBehavior != 0) {
        const std::string* t = table.has_value() ? std::get_if<std::string>(&*table) : nullptr;
        if (t == nullptr) {
          throw std::runtime_error("Batch operation with cache behavior requires a table");
        }
        tableName = *t;
      }

      sqlite3_stmt* stmt = prepare(sql);
      for (const auto& args : argBatches) {
        SqliteStatement guard(stmt);
        bindArgs(stmt, args, sql);
        step(stmt, sql);
        if (cacheBehavior != 0) {
          const std::string* id = args.empty() ? nullptr : std::get_if<std::string>(&args[0]);
          if (id == nullptr) {
            throw std::runtime_error("Batch operation with cache behavior requires a string id as first argument");
          }
          cacheChanges.emplace_back(cacheBehavior == 1, tableName + "$" + *id);
        }
      }
    }
    execSimple("commit transaction");
  } catch (...) {
    rollbackQuietly();
    throw;
  }

  for (auto& change : cacheChanges) {
    if (change.first) {
      _cache.insert(std::move(change.second));
    } else {
      _cache.erase(change.second);
    }
  }
}

void DatabaseCore::close() {
  finalizeStatements();
  _cache.clear();
  _db.reset();
}

} // namespace watermelondb
