#include "HybridNativeDatabase.hpp"
#include <stdexcept>

namespace margelo::nitro::watermelondb {

using ::watermelondb::DatabaseCore;

HybridNativeDatabase::HybridNativeDatabase(const std::string& path, bool usesExclusiveLocking)
    : HybridObject(TAG), _core(std::make_shared<DatabaseCore>(path, usesExclusiveLocking)),
      _queue(std::make_unique<ThreadPool>("WatermelonDB", 1, 1)) {}

template <typename T, typename F> std::shared_ptr<Promise<T>> HybridNativeDatabase::enqueue(F&& work) {
  auto promise = Promise<T>::create();
  _queue->run([core = _core, promise, work = std::forward<F>(work)]() mutable {
    try {
      if constexpr (std::is_void_v<T>) {
        work(*core);
        promise->resolve();
      } else {
        promise->resolve(work(*core));
      }
    } catch (...) {
      promise->reject(std::current_exception());
    }
  });
  return promise;
}

std::shared_ptr<Promise<InitializeResult>> HybridNativeDatabase::initialize(double expectedVersion) {
  return enqueue<InitializeResult>([expectedVersion](DatabaseCore& core) {
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
  });
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

std::shared_ptr<Promise<std::vector<std::variant<std::string, std::unordered_map<std::string, std::variant<NullType, bool, std::string, double>>>>>>
HybridNativeDatabase::query(const std::string& table, const std::string& sql, const std::vector<std::variant<NullType, bool, std::string, double>>& args) {
  return enqueue<std::vector<std::variant<std::string, std::unordered_map<std::string, std::variant<NullType, bool, std::string, double>>>>>(
      [=](DatabaseCore& core) { return core.query(table, sql, args); });
}

std::shared_ptr<Promise<std::vector<std::string>>>
HybridNativeDatabase::queryIds(const std::string& sql, const std::vector<std::variant<NullType, bool, std::string, double>>& args) {
  return enqueue<std::vector<std::string>>([=](DatabaseCore& core) { return core.queryIds(sql, args); });
}

std::shared_ptr<Promise<std::vector<std::unordered_map<std::string, std::variant<NullType, bool, std::string, double>>>>>
HybridNativeDatabase::unsafeQueryRaw(const std::string& sql, const std::vector<std::variant<NullType, bool, std::string, double>>& args) {
  return enqueue<std::vector<std::unordered_map<std::string, std::variant<NullType, bool, std::string, double>>>>(
      [=](DatabaseCore& core) { return core.unsafeQueryRaw(sql, args); });
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

} // namespace margelo::nitro::watermelondb
