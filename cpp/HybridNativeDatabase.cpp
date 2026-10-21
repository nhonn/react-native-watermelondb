#include "HybridNativeDatabase.hpp"
#include <mutex>
#include <stdexcept>

namespace margelo::nitro::watermelondb {

using ::watermelondb::DatabaseCore;

HybridNativeDatabase::HybridNativeDatabase(const std::string& path, bool usesExclusiveLocking)
    : HybridObject(TAG), _core(std::make_shared<DatabaseCore>(path, usesExclusiveLocking)), _lock(std::make_shared<std::mutex>()),
      _queue(std::make_unique<ThreadPool>("WatermelonDB", 1, 1)) {}

template <typename T, typename F> std::shared_ptr<Promise<T>> HybridNativeDatabase::enqueue(F&& work) {
  auto promise = Promise<T>::create();
  _queue->run([core = _core, lock = _lock, promise, work = std::forward<F>(work)]() mutable {
    try {
      if constexpr (std::is_void_v<T>) {
        {
          std::lock_guard<std::mutex> guard(*lock);
          work(*core);
        }
        promise->resolve();
      } else {
        auto value = [&] {
          std::lock_guard<std::mutex> guard(*lock);
          return work(*core);
        }();
        promise->resolve(std::move(value));
      }
    } catch (...) {
      promise->reject(std::current_exception());
    }
  });
  return promise;
}

template <typename F> decltype(auto) HybridNativeDatabase::runSync(F&& work) {
  std::lock_guard<std::mutex> guard(*_lock);
  return work(*_core);
}

static InitializeResult initializeCore(DatabaseCore& core, double expectedVersion) {
  core.open();
  const int version = core.getUserVersion();
  if (version == expectedVersion) {
    return InitializeResult(InitializeCode::OK, std::nullopt);
  }
  if (version > 0 && version < expectedVersion) {
    return InitializeResult(InitializeCode::MIGRATIONS_NEEDED, static_cast<double>(version));
  }
  // version == 0 (new DB), or database is newer than the schema
  return InitializeResult(InitializeCode::SCHEMA_NEEDED, std::nullopt);
}

std::shared_ptr<Promise<InitializeResult>> HybridNativeDatabase::initialize(double expectedVersion) {
  return enqueue<InitializeResult>([expectedVersion](DatabaseCore& core) { return initializeCore(core, expectedVersion); });
}

std::shared_ptr<Promise<void>> HybridNativeDatabase::setUpWithSchema(const std::string& schemaSql, double schemaVersion) {
  return enqueue<void>([=](DatabaseCore& core) { core.resetWithSchema(schemaSql, static_cast<int>(schemaVersion)); });
}

std::shared_ptr<Promise<void>> HybridNativeDatabase::setUpWithMigrations(const std::string& migrationSql, double fromVersion,
                                                                         double toVersion) {
  return enqueue<void>([=](DatabaseCore& core) { core.migrate(migrationSql, static_cast<int>(fromVersion), static_cast<int>(toVersion)); });
}

std::shared_ptr<Promise<std::variant<NullType, std::string, std::unordered_map<std::string, std::variant<NullType, bool, std::string, double>>>>>
HybridNativeDatabase::find(const std::string& table, const std::string& id) {
  return enqueue<std::variant<NullType, std::string, std::unordered_map<std::string, std::variant<NullType, bool, std::string, double>>>>(
      [=](DatabaseCore& core) { return core.find(table, id); });
}

std::shared_ptr<Promise<::watermelondb::RecordSet>>
HybridNativeDatabase::query(const std::string& table, const std::string& sql, const std::vector<std::variant<NullType, bool, std::string, double>>& args) {
  return enqueue<::watermelondb::RecordSet>([=](DatabaseCore& core) { return core.query(table, sql, args); });
}

std::shared_ptr<Promise<std::vector<std::string>>>
HybridNativeDatabase::queryIds(const std::string& sql, const std::vector<std::variant<NullType, bool, std::string, double>>& args) {
  return enqueue<std::vector<std::string>>([=](DatabaseCore& core) { return core.queryIds(sql, args); });
}

std::shared_ptr<Promise<::watermelondb::RecordSet>>
HybridNativeDatabase::unsafeQueryRaw(const std::string& sql, const std::vector<std::variant<NullType, bool, std::string, double>>& args) {
  return enqueue<::watermelondb::RecordSet>([=](DatabaseCore& core) { return core.unsafeQueryRaw(sql, args); });
}

std::shared_ptr<Promise<double>> HybridNativeDatabase::count(const std::string& sql,
                                                              const std::vector<std::variant<NullType, bool, std::string, double>>& args) {
  return enqueue<double>([=](DatabaseCore& core) { return core.count(sql, args); });
}

std::shared_ptr<Promise<void>> HybridNativeDatabase::batch(
    const std::vector<std::tuple<double, std::optional<std::variant<NullType, std::string>>, std::string,
                                 std::vector<std::vector<std::variant<NullType, bool, std::string, double>>>>>& operations) {
  return enqueue<void>([=](DatabaseCore& core) { core.batch(operations); });
}

std::shared_ptr<Promise<std::variant<NullType, std::string>>> HybridNativeDatabase::getLocal(const std::string& key) {
  return enqueue<std::variant<NullType, std::string>>([=](DatabaseCore& core) { return core.getLocal(key); });
}

std::shared_ptr<Promise<void>> HybridNativeDatabase::unsafeExecuteMultiple(const std::string& sql) {
  return enqueue<void>([=](DatabaseCore& core) { core.executeMultiple(sql); });
}

std::shared_ptr<Promise<void>> HybridNativeDatabase::unsafeResetDatabase(const std::string& schemaSql, double schemaVersion) {
  return enqueue<void>([=](DatabaseCore& core) { core.resetWithSchema(schemaSql, static_cast<int>(schemaVersion)); });
}

std::shared_ptr<Promise<void>> HybridNativeDatabase::unsafeClose() {
  return enqueue<void>([](DatabaseCore& core) { core.close(); });
}

// Synchronous variants: run on the calling (JS) thread; exceptions propagate to Nitro, which rethrows them in JS.
InitializeResult HybridNativeDatabase::initializeSync(double expectedVersion) {
  return runSync([=](DatabaseCore& core) { return initializeCore(core, expectedVersion); });
}

void HybridNativeDatabase::setUpWithSchemaSync(const std::string& schemaSql, double schemaVersion) {
  runSync([&](DatabaseCore& core) { core.resetWithSchema(schemaSql, static_cast<int>(schemaVersion)); });
}

void HybridNativeDatabase::setUpWithMigrationsSync(const std::string& migrationSql, double fromVersion, double toVersion) {
  runSync([&](DatabaseCore& core) { core.migrate(migrationSql, static_cast<int>(fromVersion), static_cast<int>(toVersion)); });
}

std::variant<NullType, std::string, std::unordered_map<std::string, std::variant<NullType, bool, std::string, double>>>
HybridNativeDatabase::findSync(const std::string& table, const std::string& id) {
  return runSync([&](DatabaseCore& core) { return core.find(table, id); });
}

::watermelondb::RecordSet HybridNativeDatabase::querySync(const std::string& table, const std::string& sql,
                                                          const std::vector<std::variant<NullType, bool, std::string, double>>& args) {
  return runSync([&](DatabaseCore& core) { return core.query(table, sql, args); });
}

std::vector<std::string> HybridNativeDatabase::queryIdsSync(const std::string& sql,
                                                            const std::vector<std::variant<NullType, bool, std::string, double>>& args) {
  return runSync([&](DatabaseCore& core) { return core.queryIds(sql, args); });
}

::watermelondb::RecordSet HybridNativeDatabase::unsafeQueryRawSync(const std::string& sql,
                                                                   const std::vector<std::variant<NullType, bool, std::string, double>>& args) {
  return runSync([&](DatabaseCore& core) { return core.unsafeQueryRaw(sql, args); });
}

double HybridNativeDatabase::countSync(const std::string& sql, const std::vector<std::variant<NullType, bool, std::string, double>>& args) {
  return runSync([&](DatabaseCore& core) { return core.count(sql, args); });
}

void HybridNativeDatabase::batchSync(
    const std::vector<std::tuple<double, std::optional<std::variant<NullType, std::string>>, std::string,
                                 std::vector<std::vector<std::variant<NullType, bool, std::string, double>>>>>& operations) {
  runSync([&](DatabaseCore& core) { core.batch(operations); });
}

std::variant<NullType, std::string> HybridNativeDatabase::getLocalSync(const std::string& key) {
  return runSync([&](DatabaseCore& core) { return core.getLocal(key); });
}

void HybridNativeDatabase::unsafeExecuteMultipleSync(const std::string& sql) {
  runSync([&](DatabaseCore& core) { core.executeMultiple(sql); });
}

void HybridNativeDatabase::unsafeResetDatabaseSync(const std::string& schemaSql, double schemaVersion) {
  runSync([&](DatabaseCore& core) { core.resetWithSchema(schemaSql, static_cast<int>(schemaVersion)); });
}

} // namespace margelo::nitro::watermelondb
