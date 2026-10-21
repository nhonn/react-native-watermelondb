#include "HybridNativeDatabaseFactory.hpp"
#include "HybridNativeDatabase.hpp"
#include <cmath>
#include <stdexcept>
#include <stdlib.h>

namespace margelo::nitro::watermelondb {

std::shared_ptr<HybridNativeDatabaseSpec> HybridNativeDatabaseFactory::createDatabase(const std::string& path, bool usesExclusiveLocking) {
  return std::make_shared<HybridNativeDatabase>(path, usesExclusiveLocking);
}

std::shared_ptr<ArrayBuffer> HybridNativeDatabaseFactory::getRandomBytes(double count) {
  if (!(count >= 1 && count <= 65536) || std::floor(count) != count) {
    throw std::invalid_argument("getRandomBytes: count must be an integer between 1 and 65536");
  }
  const size_t n = static_cast<size_t>(count);
  auto buffer = ArrayBuffer::allocate(n);
  arc4random_buf(buffer->data(), n);
  return buffer;
}

} // namespace margelo::nitro::watermelondb
