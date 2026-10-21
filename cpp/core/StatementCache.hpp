#pragma once

#include "Sqlite3.hpp"
#include <list>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>

namespace watermelondb {

// Bounded LRU cache of prepared statements. Owns every statement it was given (finalizes on eviction/clear).
// take() marks an entry borrowed (never handed out twice, never evicted) without reallocating; put() returns it.
// clear() finalizes borrowed statements too: call it only while nothing is borrowed.
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
    if (it == _index.end() || it->second->borrowed) {
      return nullptr;
    }
    const auto entry = it->second;
    entry->borrowed = true;
    _entries.splice(_entries.begin(), _entries, entry); // LRU touch, no allocation
    return entry->stmt;
  }

  void put(const std::string& sql, sqlite3_stmt* stmt) {
    auto it = _index.find(sql);
    if (it != _index.end()) {
      if (it->second->stmt == stmt) {
        it->second->borrowed = false;
      } else {
        sqlite3_finalize(stmt); // prepared while the cached one was borrowed
      }
      return;
    }
    if (_entries.size() >= kCapacity) {
      evictOne();
    }
    _entries.push_front(Entry{sql, stmt, false});
    _index.emplace(std::string_view(_entries.front().sql), _entries.begin());
  }

  void clear() noexcept {
    for (auto& entry : _entries) {
      sqlite3_finalize(entry.stmt);
    }
    _index.clear();
    _entries.clear();
  }

  size_t size() const { return _entries.size(); }

private:
  struct Entry {
    std::string sql;
    sqlite3_stmt* stmt;
    bool borrowed;
  };
  using Entries = std::list<Entry>;

  void evictOne() {
    for (auto it = _entries.end(); it != _entries.begin();) {
      if (!(--it)->borrowed) {
        _index.erase(it->sql);
        sqlite3_finalize(it->stmt);
        _entries.erase(it);
        return;
      }
    }
  }

  Entries _entries; // front = most recent
  std::unordered_map<std::string_view, Entries::iterator> _index; // views point into list-owned strings
};

} // namespace watermelondb
