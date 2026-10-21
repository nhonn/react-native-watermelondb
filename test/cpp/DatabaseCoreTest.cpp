#include "DatabaseCore.hpp"
#include <algorithm>
#include <cassert>
#include <cstdio>

using namespace watermelondb;
using margelo::nitro::null;

static SQLiteValue S(const char* s) { return SQLiteValue(std::string(s)); }

static NativeBatchOperation insertOp(double cache, const char* id, const char* name) {
  return NativeBatchOperation{cache,
                              BatchTable(std::string("tasks")),
                              "insert into tasks (id, _status, _changed, name) values (?, '', '', ?)",
                              {{S(id), S(name)}}};
}

static const SQLiteValue& col(const RecordSet& set, size_t row, const char* name) {
  const auto& columns = set.data->columns;
  const size_t i = static_cast<size_t>(std::find(columns.begin(), columns.end(), name) - columns.begin());
  return std::get<std::vector<SQLiteValue>>(set.data->rows[row])[i];
}

template <typename F> static bool throws(F f) {
  try {
    f();
  } catch (const std::exception&) {
    return true;
  }
  return false;
}

int main() {
  DatabaseCore core(":memory:", false);
  core.open();
  core.open();
  assert(core.getUserVersion() == 0);

  core.resetWithSchema("create table tasks (id primary key, _status, _changed, name); "
                       "create table local_storage (key varchar(16) primary key not null, value text not null);",
                       1);
  assert(core.getUserVersion() == 1);

  core.batch({insertOp(1, "a", "A"), insertOp(1, "b", "B")});
  assert(std::get<std::string>(core.find("tasks", "a")) == "a");

  core.batch({insertOp(0, "c", "C")});
  auto found = core.find("tasks", "c");
  auto& row = std::get<RawRow>(found);
  assert(std::get<std::string>(row.at("name")) == "C");
  assert(std::get<std::string>(core.find("tasks", "c")) == "c");
  assert(std::holds_alternative<margelo::nitro::NullType>(core.find("tasks", "zzz")));

  auto records = core.query("tasks", "select * from tasks order by id", {});
  assert(records.data->rows.size() == 3);
  assert(std::get<std::string>(records.data->rows[0]) == "a");
  assert(std::get<std::string>(records.data->rows[2]) == "c");

  assert(core.queryIds("select id from tasks where name = ?", {S("B")}) == std::vector<std::string>{"b"});
  assert(core.count("select count(*) as count from tasks", {}) == 3);

  assert(std::holds_alternative<margelo::nitro::NullType>(core.getLocal("x")));
  core.batch({NativeBatchOperation{0, BatchTable(std::nullopt), "insert or replace into local_storage (key, value) values (?, ?)", {{S("x"), S("v")}}}});
  assert(std::get<std::string>(core.getLocal("x")) == "v");

  // rollback: 2nd op invalid
  assert(throws([&] { core.batch({insertOp(1, "d", "D"), NativeBatchOperation{0, BatchTable(std::nullopt), "not valid sql", {{}}}}); }));
  assert(core.count("select count(*) as count from tasks", {}) == 3);
  // "d" must not be cached after rollback
  assert(std::holds_alternative<margelo::nitro::NullType>(core.find("tasks", "d")));

  // cache remove
  core.batch({NativeBatchOperation{-1, BatchTable(std::string("tasks")), "delete from tasks where id = ?", {{S("a")}}}});
  assert(std::holds_alternative<margelo::nitro::NullType>(core.find("tasks", "a")));
  // cache changes apply in operation order: remove, then re-add in the same batch leaves the id cached
  core.batch({NativeBatchOperation{-1, BatchTable(std::string("tasks")), "delete from tasks where id = ?", {{S("b")}}}, insertOp(1, "b", "B")});
  assert(std::get<std::string>(core.find("tasks", "b")) == "b");

  core.migrate("alter table tasks add column extra;", 1, 2);
  assert(core.getUserVersion() == 2);
  assert(throws([&] { core.migrate("alter table tasks add column extra2;", 1, 3); }));

  auto raw = core.unsafeQueryRaw("select * from tasks where id = ?", {S("b")});
  assert(raw.data->rows.size() == 1);
  assert(std::get<std::string>(col(raw, 0, "name")) == "B");
  assert(std::holds_alternative<margelo::nitro::NullType>(col(raw, 0, "extra")));

  // re-prepare: the query cached before the migrate must report the new column
  core.batch({insertOp(0, "e", "E")});
  auto reprepared = core.query("tasks", "select * from tasks order by id", {});
  const auto& cols = reprepared.data->columns;
  assert(std::find(cols.begin(), cols.end(), "extra") != cols.end());
  const size_t last = reprepared.data->rows.size() - 1;
  assert(std::get<std::vector<SQLiteValue>>(reprepared.data->rows[last]).size() == cols.size());
  assert(std::holds_alternative<margelo::nitro::NullType>(col(reprepared, last, "extra")));
  assert(std::get<std::string>(reprepared.data->rows[0]) == "b");

  assert(throws([&] { core.query("tasks", "select name from tasks where 0", {}); }));

  // LRU bound: more distinct statements than capacity, then reuse
  for (int i = 0; i < 300; i++) {
    core.queryIds("select id from tasks where name = 'n" + std::to_string(i) + "'", {});
  }
  assert(core.queryIds("select id from tasks where name = 'n0'", {}).empty());
  assert(std::get<std::string>(core.find("tasks", "b")) == "b");

  sqlite3* mem = nullptr;
  assert(sqlite3_open(":memory:", &mem) == SQLITE_OK);
  {
    StatementCache cache;
    for (int i = 0; i <= 128; i++) {
      sqlite3_stmt* stmt = nullptr;
      assert(sqlite3_prepare_v2(mem, ("select " + std::to_string(i)).c_str(), -1, &stmt, nullptr) == SQLITE_OK);
      cache.put("select " + std::to_string(i), stmt);
    }
    assert(cache.size() == StatementCache::kCapacity);
    assert(cache.take("select 0") == nullptr);
    sqlite3_stmt* taken = cache.take("select 128");
    assert(taken != nullptr);
    assert(cache.take("select 128") == nullptr); // a borrowed statement is never handed out twice
    cache.put("select 128", taken);
    assert(cache.take("select 128") == taken);
    cache.put("select 128", taken);
  }
  sqlite3_close(mem);

  core.close();
  std::puts("DatabaseCore tests passed");
  return 0;
}
