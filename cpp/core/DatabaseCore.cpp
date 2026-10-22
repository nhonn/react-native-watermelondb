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
  // NORMAL is corruption-safe in WAL mode and fsyncs only at checkpoints; the last commits may roll back on power loss.
  executeMultiple("pragma synchronous = NORMAL;");
  // Spilled sorts/indexes need a writable temp dir, and none of SQLite's defaults (/var/tmp, /tmp, ...) exist on Android.
  // Use the database directory so big ORDER BY/GROUP BY spill to disk; temp_store=memory kept them all in RAM.
  // Process-wide and set by the first database opened; it must outlive SQLite, hence the static.
  static const std::string tempDir = [this] {
    const size_t slash = _path.rfind('/');
    return (slash == std::string::npos || slash == 0) ? std::string() : _path.substr(0, slash);
  }();
  if (tempDir.empty()) {
    executeMultiple("pragma temp_store = memory;");
  } else if (sqlite3_temp_directory == nullptr) {
    sqlite3_temp_directory = const_cast<char*>(tempDir.c_str());
  }
#endif
  // mmap: reads skip the read() syscall + page copy (~2x faster point lookups on a 200k-row DB). An I/O error on a
  // mapped page raises SIGBUS instead of SQLITE_IOERR. No-op where SQLite is built with SQLITE_MAX_MMAP_SIZE=0.
  // cache_size 1 MiB (default 2 MiB): measured no read-speed change on a 500k-row DB, ~1.8 MB less RSS per connection.
  executeMultiple("pragma journal_mode = WAL; pragma busy_timeout = 5000; pragma mmap_size = 268435456; pragma cache_size = -1000;");
  if (_exclusive) {
    executeMultiple("pragma locking_mode = EXCLUSIVE;");
  }
}

SqliteStatement DatabaseCore::prepare(const std::string& sql) {
  sqlite3_stmt* stmt = _statements.take(sql); // cached statements are always reset
  if (stmt == nullptr) {
    if (sqlite3_prepare_v2(db(), sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK) {
      sqlite3_finalize(stmt);
      throwDbError("Failed to prepare query statement", sql);
    }
  }
  return SqliteStatement(stmt, _statements, sql);
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
  const std::string sql = "pragma user_version"; // the guard borrows it
  SqliteStatement statement = prepare(sql);
  sqlite3_stmt* stmt = statement.get();
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
  _statements.clear();
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

static void readValue(sqlite3_stmt* stmt, int column, RecordSetData& data) {
  switch (sqlite3_column_type(stmt, column)) {
    case SQLITE_INTEGER:
      data.addNumber(static_cast<double>(sqlite3_column_int64(stmt, column)));
      return;
    case SQLITE_FLOAT:
      data.addNumber(sqlite3_column_double(stmt, column));
      return;
    case SQLITE_TEXT:
      data.addText(reinterpret_cast<const char*>(sqlite3_column_text(stmt, column)), static_cast<size_t>(sqlite3_column_bytes(stmt, column)));
      return;
    case SQLITE_NULL:
      data.addNull();
      return;
    default:
      throw std::runtime_error("BLOB columns are not supported");
  }
}

// Appends one row of values; on a throw the partial row is dropped so the set stays consistent.
static void readValues(sqlite3_stmt* stmt, RecordSetData& data) {
  const size_t start = data.cellCount();
  try {
    for (size_t i = 0; i < data.columns.size(); i++) {
      readValue(stmt, static_cast<int>(i), data);
    }
  } catch (...) {
    data.truncateCells(start);
    throw;
  }
  data.endRow();
}

static std::vector<std::string> columnNames(sqlite3_stmt* stmt) {
  const int count = sqlite3_column_count(stmt);
  std::vector<std::string> names;
  names.reserve(static_cast<size_t>(count));
  for (int i = 0; i < count; i++) {
    names.emplace_back(sqlite3_column_name(stmt, i));
  }
  return names;
}

FindResult DatabaseCore::find(const std::string& table, const std::string& id) {
  IdSet& cached = _cache[table];
  if (cached.count(id) != 0) {
    return id;
  }
  const std::string sql = "select * from \"" + table + "\" where id == ? limit 1";
  SqliteStatement statement = prepare(sql);
  sqlite3_stmt* stmt = statement.get();
  if (sqlite3_bind_text(stmt, 1, id.c_str(), static_cast<int>(id.size()), SQLITE_STATIC) != SQLITE_OK) {
    throwDbError("Failed to bind an argument for query", sql);
  }
  const int result = sqlite3_step(stmt);
  if (result == SQLITE_DONE) {
    return margelo::nitro::null;
  }
  if (result != SQLITE_ROW) {
    throwDbError("Failed to execute find", sql);
  }
  auto data = std::make_shared<RecordSetData>();
  data->columns = columnNames(stmt);
  readValues(stmt, *data);
  cached.insert(id);
  return FoundRecord{std::move(data)};
}

RecordSet DatabaseCore::query(const std::string& table, const std::string& sql, const std::vector<SQLiteValue>& args) {
  SqliteStatement statement = prepare(sql);
  sqlite3_stmt* stmt = statement.get();
  bindArgs(stmt, args, sql);
  IdSet& cached = _cache[table];

  auto data = std::make_shared<RecordSetData>();
  int idColumn = -1;
  bool captured = false;
  // Columns are read after the first step: step can re-prepare the statement after a schema change.
  auto capture = [&] {
    data->columns = columnNames(stmt);
    for (size_t i = 0; i < data->columns.size(); i++) {
      if (data->columns[i] == "id") {
        idColumn = static_cast<int>(i);
        break;
      }
    }
    if (idColumn < 0) {
      throw std::runtime_error("Query must return an 'id' column, sql: " + sql);
    }
    captured = true;
  };

  int result;
  while ((result = sqlite3_step(stmt)) == SQLITE_ROW) {
    if (!captured) {
      capture();
    }
    const std::string_view id(reinterpret_cast<const char*>(sqlite3_column_text(stmt, idColumn)),
                              static_cast<size_t>(sqlite3_column_bytes(stmt, idColumn)));
    if (cached.find(id) != cached.end()) {
      data->addIdRow(id);
    } else {
      readValues(stmt, *data);
      // Read the id back from the arena: re-reading columns may have invalidated sqlite's text pointer.
      const size_t rowStart = data->cellCount() - data->columns.size();
      cached.emplace(data->view(data->cell(rowStart + static_cast<size_t>(idColumn))));
    }
  }
  if (result != SQLITE_DONE) {
    throwDbError("Failed to execute query", sql);
  }
  if (!captured) {
    capture(); // validates the 'id' column for empty results
  }
  return RecordSet{std::move(data)};
}

std::vector<std::string> DatabaseCore::queryIds(const std::string& sql, const std::vector<SQLiteValue>& args) {
  SqliteStatement statement = prepare(sql);
  sqlite3_stmt* stmt = statement.get();
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

RecordSet DatabaseCore::unsafeQueryRaw(const std::string& sql, const std::vector<SQLiteValue>& args) {
  SqliteStatement statement = prepare(sql);
  sqlite3_stmt* stmt = statement.get();
  bindArgs(stmt, args, sql);
  auto data = std::make_shared<RecordSetData>();
  bool captured = false;
  int result;
  while ((result = sqlite3_step(stmt)) == SQLITE_ROW) {
    if (!captured) {
      data->columns = columnNames(stmt);
      captured = true;
    }
    readValues(stmt, *data);
  }
  if (result != SQLITE_DONE) {
    throwDbError("Failed to execute unsafeQueryRaw", sql);
  }
  if (!captured) {
    data->columns = columnNames(stmt);
  }
  return RecordSet{std::move(data)};
}

double DatabaseCore::count(const std::string& sql, const std::vector<SQLiteValue>& args) {
  SqliteStatement statement = prepare(sql);
  sqlite3_stmt* stmt = statement.get();
  bindArgs(stmt, args, sql);
  if (sqlite3_step(stmt) != SQLITE_ROW) {
    throwDbError("Failed to execute count", sql);
  }
  return static_cast<double>(sqlite3_column_int64(stmt, 0));
}

LocalValue DatabaseCore::getLocal(const std::string& key) {
  const std::string sql = "select value from local_storage where key = ?";
  SqliteStatement statement = prepare(sql);
  sqlite3_stmt* stmt = statement.get();
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
  struct CacheChange {
    bool add;
    IdSet* cached;
    const std::string* id; // points into `operations`
  };
  std::vector<CacheChange> cacheChanges;

  execSimple("begin exclusive transaction");
  try {
    for (const auto& op : operations) {
      const double cacheBehavior = std::get<0>(op);
      const BatchTable& table = std::get<1>(op);
      const std::string& sql = std::get<2>(op);
      const auto& argBatches = std::get<3>(op);

      IdSet* cached = nullptr;
      if (cacheBehavior != 0) {
        const std::string* t = table.has_value() ? std::get_if<std::string>(&*table) : nullptr;
        if (t == nullptr) {
          throw std::runtime_error("Batch operation with cache behavior requires a table");
        }
        cached = &_cache[*t]; // node-based map: the pointer stays valid
      }

      SqliteStatement statement = prepare(sql);
      sqlite3_stmt* stmt = statement.get();
      for (const auto& args : argBatches) {
        sqlite3_reset(stmt);
        bindArgs(stmt, args, sql);
        step(stmt, sql);
        if (cacheBehavior != 0) {
          const std::string* id = args.empty() ? nullptr : std::get_if<std::string>(&args[0]);
          if (id == nullptr) {
            throw std::runtime_error("Batch operation with cache behavior requires a string id as first argument");
          }
          cacheChanges.push_back({cacheBehavior == 1, cached, id});
        }
      }
    }
    execSimple("commit transaction");
  } catch (...) {
    rollbackQuietly();
    throw;
  }

  bool removed = false;
  for (const auto& change : cacheChanges) {
    if (change.add) {
      change.cached->insert(*change.id);
    } else {
      change.cached->erase(*change.id);
      removed = true;
    }
  }
  // unordered_set never shrinks on erase: give memory back after mass deletes.
  if (removed) {
    for (const auto& change : cacheChanges) {
      if (change.cached->empty()) {
        IdSet().swap(*change.cached);
      } else if (change.cached->bucket_count() > 64 && change.cached->size() * 8 < change.cached->bucket_count()) {
        change.cached->rehash(0);
      }
    }
  }
}

void DatabaseCore::close() {
  _statements.clear();
  _cache.clear();
  _db.reset();
}

} // namespace watermelondb
