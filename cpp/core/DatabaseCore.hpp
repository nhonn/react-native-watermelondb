#pragma once

#include "SqliteDb.hpp"
#include "SqliteTypes.hpp"
#include <functional>
#include <memory>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace watermelondb {

/**
 * SQLite engine with WatermelonDB's record cache. Not thread-safe: all calls must happen on one serial thread.
 */
class DatabaseCore final {
public:
  DatabaseCore(std::string path, bool usesExclusiveLocking);
  ~DatabaseCore();
  DatabaseCore(const DatabaseCore&) = delete;
  DatabaseCore& operator=(const DatabaseCore&) = delete;

  void open(); // idempotent
  int getUserVersion();
  void setUserVersion(int version);
  void resetWithSchema(const std::string& schemaSql, int version);
  void migrate(const std::string& sql, int from, int to);

  FindResult find(const std::string& table, const std::string& id);
  RecordSet query(const std::string& table, const std::string& sql, const std::vector<SQLiteValue>& args);
  std::vector<std::string> queryIds(const std::string& sql, const std::vector<SQLiteValue>& args);
  RecordSet unsafeQueryRaw(const std::string& sql, const std::vector<SQLiteValue>& args);
  double count(const std::string& sql, const std::vector<SQLiteValue>& args);
  LocalValue getLocal(const std::string& key);
  void executeMultiple(const std::string& sql);
  void batch(const std::vector<NativeBatchOperation>& operations);
  void close();

private:
  sqlite3* db() const;
  [[noreturn]] void throwDbError(const std::string& message, const std::string& sql = "") const;
  SqliteStatement prepare(const std::string& sql);
  void bindArgs(sqlite3_stmt* stmt, const std::vector<SQLiteValue>& args, const std::string& sql);
  void step(sqlite3_stmt* stmt, const std::string& sql); // expects SQLITE_DONE
  void execSimple(const char* sql);
  void rollbackQuietly();

  std::string _path;
  bool _exclusive;
  std::unique_ptr<SqliteDb> _db;
  StatementCache _statements;
  // Ids of records the JS side has cached, per table. Transparent hash: lookups by string_view don't allocate.
  struct IdHash {
    using is_transparent = void;
    size_t operator()(std::string_view s) const noexcept { return std::hash<std::string_view>{}(s); }
  };
  using IdSet = std::unordered_set<std::string, IdHash, std::equal_to<>>;
  std::unordered_map<std::string, IdSet> _cache;
};

} // namespace watermelondb
