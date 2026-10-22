#pragma once

#include "HybridNativeDatabaseSpec.hpp"
#include "core/DatabaseCore.hpp"
#include <NitroModules/ThreadPool.hpp>
#include <memory>
#include <mutex>

namespace margelo::nitro::watermelondb {

class HybridNativeDatabase : public HybridNativeDatabaseSpec {
public:
  HybridNativeDatabase(const std::string& path, bool usesExclusiveLocking);

  std::shared_ptr<Promise<InitializeResult>> initialize(double expectedVersion) override;
  std::shared_ptr<Promise<void>> setUpWithSchema(const std::string& schemaSql, double schemaVersion) override;
  std::shared_ptr<Promise<void>> setUpWithMigrations(const std::string& migrationSql, double fromVersion, double toVersion) override;
  std::shared_ptr<Promise<::watermelondb::FindResult>>
  find(const std::string& table, const std::string& id) override;
  std::shared_ptr<Promise<::watermelondb::RecordSet>> query(const std::string& table, const std::string& sql,
                                                            const std::vector<std::variant<NullType, bool, std::string, double>>& args) override;
  std::shared_ptr<Promise<std::vector<std::string>>> queryIds(const std::string& sql,
                                                              const std::vector<std::variant<NullType, bool, std::string, double>>& args) override;
  std::shared_ptr<Promise<::watermelondb::RecordSet>> unsafeQueryRaw(
      const std::string& sql, const std::vector<std::variant<NullType, bool, std::string, double>>& args) override;
  std::shared_ptr<Promise<double>> count(const std::string& sql, const std::vector<std::variant<NullType, bool, std::string, double>>& args) override;
  std::shared_ptr<Promise<void>> batch(
      const std::vector<std::tuple<double, std::optional<std::variant<NullType, std::string>>, std::string,
                                   std::vector<std::vector<std::variant<NullType, bool, std::string, double>>>>>& operations) override;
  std::shared_ptr<Promise<std::variant<NullType, std::string>>> getLocal(const std::string& key) override;
  std::shared_ptr<Promise<void>> unsafeExecuteMultiple(const std::string& sql) override;
  std::shared_ptr<Promise<void>> unsafeResetDatabase(const std::string& schemaSql, double schemaVersion) override;
  std::shared_ptr<Promise<std::vector<NativeReadResult>>> readMany(const std::vector<NativeReadCall>& calls) override;

  InitializeResult initializeSync(double expectedVersion) override;
  void setUpWithSchemaSync(const std::string& schemaSql, double schemaVersion) override;
  void setUpWithMigrationsSync(const std::string& migrationSql, double fromVersion, double toVersion) override;
  ::watermelondb::FindResult
  findSync(const std::string& table, const std::string& id) override;
  ::watermelondb::RecordSet querySync(const std::string& table, const std::string& sql,
                                      const std::vector<std::variant<NullType, bool, std::string, double>>& args) override;
  std::vector<std::string> queryIdsSync(const std::string& sql, const std::vector<std::variant<NullType, bool, std::string, double>>& args) override;
  ::watermelondb::RecordSet unsafeQueryRawSync(const std::string& sql,
                                               const std::vector<std::variant<NullType, bool, std::string, double>>& args) override;
  double countSync(const std::string& sql, const std::vector<std::variant<NullType, bool, std::string, double>>& args) override;
  void batchSync(
      const std::vector<std::tuple<double, std::optional<std::variant<NullType, std::string>>, std::string,
                                   std::vector<std::vector<std::variant<NullType, bool, std::string, double>>>>>& operations) override;
  std::variant<NullType, std::string> getLocalSync(const std::string& key) override;
  void unsafeExecuteMultipleSync(const std::string& sql) override;
  void forgetSync(const std::string& table, const std::vector<std::string>& ids) override;
  void unsafeResetDatabaseSync(const std::string& schemaSql, double schemaVersion) override;

private:
  // Runs `work` on the serial queue. The task captures the core (not `this`), so the last HybridObject
  // reference can never be dropped on the queue thread (which would make ~ThreadPool join itself).
  template <typename T, typename F> std::shared_ptr<Promise<T>> enqueue(F&& work);
  template <typename F> decltype(auto) runSync(F&& work);

  std::shared_ptr<::watermelondb::DatabaseCore> _core;
  std::shared_ptr<std::mutex> _lock; // serializes queue work with synchronous calls
  std::unique_ptr<ThreadPool> _queue;
};

} // namespace margelo::nitro::watermelondb
