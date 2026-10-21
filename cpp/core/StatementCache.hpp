#pragma once

#include <sqlite3.h>
#include <list>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>

namespace watermelondb {

// Bounded LRU cache of prepared statements. Owns the cached statements (finalizes on eviction/clear).
// take() removes the entry, so a borrowed statement can never be evicted while in use; put() returns it.
class StatementCache final {
public:
  // Batch uses insert/update/delete per table + find per table; a small bound would thrash apps with many tables.
  static constexpr size_t kCapacity = 128;

  StatementCache() = default;
  ~StatementCache() { clear(); }
  StatementCache(const StatementCache&) = delete;
  StatementCache& operator=(const StatementCache&) = delete;

  sqlite3_stmt* take(const std::string& sql) {
    auto it = _index.find(sql);
    if (it == _index.end()) {
      return nullptr;
    }
    auto entry = it->second;
    sqlite3_stmt* stmt = entry->second;
    _index.erase(it);
    _entries.erase(entry);
    return stmt;
  }

  void put(const std::string& sql, sqlite3_stmt* stmt) {
    if (_index.find(sql) != _index.end()) {
      sqlite3_finalize(stmt);
      return;
    }
    if (_entries.size() == kCapacity) {
      _index.erase(_entries.back().first);
      sqlite3_finalize(_entries.back().second);
      _entries.pop_back();
    }
    _entries.emplace_front(sql, stmt);
    _index.emplace(std::string_view(_entries.front().first), _entries.begin());
  }

  void clear() noexcept {
    for (auto& entry : _entries) {
      sqlite3_finalize(entry.second);
    }
    _index.clear();
    _entries.clear();
  }

  size_t size() const { return _entries.size(); }

private:
  using Entries = std::list<std::pair<std::string, sqlite3_stmt*>>;
  Entries _entries; // front = most recent
  std::unordered_map<std::string_view, Entries::iterator> _index; // views point into list-owned strings
};

} // namespace watermelondb
