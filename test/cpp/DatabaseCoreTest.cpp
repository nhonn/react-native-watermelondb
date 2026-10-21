#include "DatabaseCore.hpp"
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
  assert(records.size() == 3);
  assert(std::get<std::string>(records[0]) == "a");
  assert(std::get<std::string>(records[2]) == "c");

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

  core.migrate("alter table tasks add column extra;", 1, 2);
  assert(core.getUserVersion() == 2);
  assert(throws([&] { core.migrate("alter table tasks add column extra2;", 1, 3); }));

  auto raw = core.unsafeQueryRaw("select * from tasks where id = ?", {S("b")});
  assert(raw.size() == 1);
  assert(std::get<std::string>(raw[0].at("name")) == "B");
  assert(std::holds_alternative<margelo::nitro::NullType>(raw[0].at("extra")));

  core.close();
  std::puts("DatabaseCore tests passed");
  return 0;
}
