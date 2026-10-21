#pragma once

#include "HybridNativeDatabaseSpec.hpp"
#include "core/DatabaseCore.hpp"
#include <NitroModules/ThreadPool.hpp>
#include <memory>

namespace margelo::nitro::watermelondb {

class HybridNativeDatabase : public HybridNativeDatabaseSpec {
public:
  HybridNativeDatabase(const std::string& path, bool usesExclusiveLocking);

  std::shared_ptr<Promise<InitializeResult>> initialize(double expectedVersion) override;
  std::shared_ptr<Promise<void>> setUpWithSchema(const std::string& schemaSql, double schemaVersion) override;
  std::shared_ptr<Promise<void>> setUpWithMigrations(const std::string& migrationSql, double fromVersion, double toVersion) override;
  std::shared_ptr<Promise<std::variant<NullType, std::string, std::unordered_map<std::string, std::variant<NullType, bool, std::string, double>>>>>
  find(const std::string& table, const std::string& id) override;
  std::shared_ptr<Promise<std::vector<std::variant<std::string, std::unordered_map<std::string, std::variant<NullType, bool, std::string, double>>>>>>
  query(const std::string& table, const std::string& sql, const std::vector<std::variant<NullType, bool, std::string, double>>& args) override;
  std::shared_ptr<Promise<std::vector<std::string>>> queryIds(const std::string& sql,
                                                              const std::vector<std::variant<NullType, bool, std::string, double>>& args) override;
  std::shared_ptr<Promise<std::vector<std::unordered_map<std::string, std::variant<NullType, bool, std::string, double>>>>>
  unsafeQueryRaw(const std::string& sql, const std::vector<std::variant<NullType, bool, std::string, double>>& args) override;
  std::shared_ptr<Promise<double>> count(const std::string& sql, const std::vector<std::variant<NullType, bool, std::string, double>>& args) override;
  std::shared_ptr<Promise<void>> batch(
      const std::vector<std::tuple<double, std::optional<std::variant<NullType, std::string>>, std::string,
                                   std::vector<std::vector<std::variant<NullType, bool, std::string, double>>>>>& operations) override;
  std::shared_ptr<Promise<std::variant<NullType, std::string>>> getLocal(const std::string& key) override;
  std::shared_ptr<Promise<void>> unsafeExecuteMultiple(const std::string& sql) override;
  std::shared_ptr<Promise<void>> unsafeResetDatabase(const std::string& schemaSql, double schemaVersion) override;
  std::shared_ptr<Promise<void>> unsafeClose() override;

private:
  // Runs `work` on the serial queue. The task captures the core (not `this`), so the last HybridObject
  // reference can never be dropped on the queue thread (which would make ~ThreadPool join itself).
  template <typename T, typename F> std::shared_ptr<Promise<T>> enqueue(F&& work);

  std::shared_ptr<::watermelondb::DatabaseCore> _core;
  std::unique_ptr<ThreadPool> _queue;
};

} // namespace margelo::nitro::watermelondb
