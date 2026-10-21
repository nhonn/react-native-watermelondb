#pragma once

#include "HybridNativeDatabaseFactorySpec.hpp"

namespace margelo::nitro::watermelondb {

class HybridNativeDatabaseFactory : public HybridNativeDatabaseFactorySpec {
public:
  HybridNativeDatabaseFactory() : HybridObject(TAG) {}

  std::shared_ptr<HybridNativeDatabaseSpec> createDatabase(const std::string& path, bool usesExclusiveLocking) override;
  std::shared_ptr<ArrayBuffer> getRandomBytes(double count) override;
};

} // namespace margelo::nitro::watermelondb
