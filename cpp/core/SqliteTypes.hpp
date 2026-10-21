#pragma once

#if __has_include(<NitroModules/Null.hpp>)
#include <NitroModules/Null.hpp>
#else
#include "Null.hpp"
#endif
#include <optional>
#include <string>
#include <tuple>
#include <unordered_map>
#include <variant>
#include <vector>

// Spellings are copied verbatim from nitrogen/generated/shared/c++/HybridNativeDatabaseSpec.hpp
// (nitrogen sorts variant members - do not reorder).
namespace watermelondb {

using SQLiteValue = std::variant<margelo::nitro::NullType, bool, std::string, double>;
using RawRow = std::unordered_map<std::string, SQLiteValue>;
using CachedRecord = std::variant<std::string, RawRow>;
using FindResult = std::variant<margelo::nitro::NullType, std::string, RawRow>;
using LocalValue = std::variant<margelo::nitro::NullType, std::string>;
using BatchTable = std::optional<std::variant<margelo::nitro::NullType, std::string>>;
// [cacheBehavior (-1 remove | 0 ignore | 1 add), table, sql, argBatches]; id is argBatch[0] when cacheBehavior != 0
using NativeBatchOperation = std::tuple<double, BatchTable, std::string, std::vector<std::vector<SQLiteValue>>>;

} // namespace watermelondb
