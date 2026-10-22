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

using Kind = RecordSetData::Kind;

static const RecordSetData::Cell& col(const RecordSetData& data, size_t row, const char* name) {
  const auto& columns = data.columns;
  const size_t i = static_cast<size_t>(std::find(columns.begin(), columns.end(), name) - columns.begin());
  assert(i < columns.size());
  const size_t start = data.rowStart(row);
  assert(data.cell(start).kind != Kind::Id);
  return data.cell(start + i);
}

static std::string str(const RecordSetData& data, size_t row, const char* name) {
  const auto& cell = col(data, row, name);
  assert(cell.kind == Kind::Text);
  return std::string(data.view(cell));
}

static std::string idRow(const RecordSetData& data, size_t row) {
  const auto& cell = data.cell(data.rowStart(row));
  assert(cell.kind == Kind::Id);
  return std::string(data.view(cell));
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
  const auto& record = *std::get<FoundRecord>(found).data;
  assert(record.rowCount == 1 && str(record, 0, "name") == "C");
  assert(std::get<std::string>(core.find("tasks", "c")) == "c");
  assert(std::holds_alternative<margelo::nitro::NullType>(core.find("tasks", "zzz")));

  auto records = core.query("tasks", "select * from tasks order by id", {});
  assert(records.data->rowCount == 3);
  assert(idRow(*records.data, 0) == "a"); // cached by the batch -> bare id
  assert(idRow(*records.data, 1) == "b");
  assert(idRow(*records.data, 2) == "c"); // cached by the find above

  // forget: id leaves the cached set, so the next find sends the full row again
  core.forget("tasks", {"a"});
  assert(std::holds_alternative<FoundRecord>(core.find("tasks", "a")));
  core.forget("nope", {"x"}); // unknown table: no-op

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
  assert(raw.data->rowCount == 1);
  assert(str(*raw.data, 0, "name") == "B");
  assert(col(*raw.data, 0, "extra").kind == Kind::Null);

  // re-prepare: the query cached before the migrate must report the new column
  core.batch({insertOp(0, "e", "E")});
  auto reprepared = core.query("tasks", "select * from tasks order by id", {});
  const auto& cols = reprepared.data->columns;
  assert(std::find(cols.begin(), cols.end(), "extra") != cols.end());
  const size_t last = reprepared.data->rowCount - 1;
  assert(col(*reprepared.data, last, "extra").kind == Kind::Null);
  assert(str(*reprepared.data, last, "name") == "E");
  assert(idRow(*reprepared.data, 0) == "b");

  // text is stored in a shared arena: long and non-ASCII values must round-trip intact next to other rows
  const char* longName = "h\xc3\xa9llo w\xc3\xb6rld - a name far longer than any small-string buffer";
  core.batch({insertOp(0, "g", longName), insertOp(0, "h", "H")});
  auto mixed = core.query("tasks", "select * from tasks where id in ('g', 'h') order by id", {});
  assert(mixed.data->rowCount == 2);
  assert(str(*mixed.data, 0, "name") == longName);
  assert(str(*mixed.data, 1, "name") == "H");

  // many rows span several cell/text chunks; mass cache removal (set shrink) must leave the survivors cached
  std::vector<NativeBatchOperation> adds, removes;
  for (int i = 0; i < 3000; i++) {
    adds.push_back(insertOp(1, ("m" + std::to_string(i)).c_str(), ("name " + std::to_string(i)).c_str()));
  }
  core.batch(adds);
  for (int i = 0; i < 2990; i++) {
    removes.push_back(NativeBatchOperation{-1, BatchTable(std::string("tasks")), "delete from tasks where id = ?", {{S(("m" + std::to_string(i)).c_str())}}});
  }
  core.batch(removes);
  assert(std::holds_alternative<margelo::nitro::NullType>(core.find("tasks", "m0")));
  assert(std::get<std::string>(core.find("tasks", "m2995")) == "m2995");
  // 5000 rows x 2 cells cross the 4096-cell chunk boundary
  auto big = core.unsafeQueryRaw("with recursive c(i) as (select 1 union all select i + 1 from c where i < 5000) select i, 'row number ' || i as s from c", {});
  assert(big.data->rowCount == 5000 && big.data->cellCount() == 10000);
  assert(big.data->cell(9998).kind == Kind::Number && big.data->cell(9998).number == 5000);
  assert(str(*big.data, 4999, "s") == "row number 5000");
  assert(str(*big.data, 0, "s") == "row number 1");

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
