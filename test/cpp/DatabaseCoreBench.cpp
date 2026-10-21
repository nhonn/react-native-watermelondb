// Host benchmark: DatabaseCore vs a raw-sqlite3 floor. Build via `bun run bench:cpp` (-O2).
#include "DatabaseCore.hpp"
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <functional>
#include <sqlite3.h>
#include <stdexcept>

using namespace watermelondb;
using margelo::nitro::null;
using Rows = std::vector<std::vector<SQLiteValue>>;

static SQLiteValue S(const std::string& s) { return SQLiteValue(s); }

static constexpr int N = 10000;
static constexpr int RUNS = 5;
static const char* DB = ".cache/bench-core.db";
static const char* SCHEMA =
    "create table \"tasks\" (\"id\" primary key, \"_changed\", \"_status\", \"name\", \"position\", \"is_done\", \"project_id\", \"notes\");"
    "create index \"tasks_project_id\" on \"tasks\" (\"project_id\"); create index \"tasks__status\" on \"tasks\" (\"_status\");";
static const char* INSERT =
    "insert into \"tasks\" (\"id\",\"_changed\",\"_status\",\"name\",\"position\",\"is_done\",\"project_id\",\"notes\") values (?,?,?,?,?,?,?,?)";

#define CHECK(c)                                                                                                                           \
  do {                                                                                                                                     \
    if (!(c)) throw std::runtime_error(std::string("check failed: ") + #c);                                                                \
  } while (0)

static void removeDb() {
  for (const char* suffix : {"", "-wal", "-shm"}) std::remove((std::string(DB) + suffix).c_str());
}

static std::string idOf(int i) {
  char b[16];
  std::snprintf(b, sizeof b, "t%06d", i);
  return b;
}

static Rows buildRows() {
  Rows rows;
  rows.reserve(N);
  for (int i = 0; i < N; i++) {
    rows.push_back({S(idOf(i)), S(""), S("created"), S("Task " + std::to_string(i)), double(i), double(i % 2 == 0), S("p" + std::to_string(i % 100)),
                    i % 3 ? SQLiteValue(null) : S("lorem ipsum dolor sit amet")});
  }
  return rows;
}

static double ms(const std::function<void()>& fn) {
  auto s = std::chrono::steady_clock::now();
  fn();
  return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - s).count();
}

static double median(std::vector<double> v) {
  std::sort(v.begin(), v.end());
  return v[v.size() / 2];
}

// ---- raw helpers
static sqlite3* rawOpen() {
  sqlite3* db = nullptr;
  CHECK(sqlite3_open(DB, &db) == SQLITE_OK);
  CHECK(sqlite3_exec(db, "pragma journal_mode = WAL; pragma busy_timeout = 5000; pragma mmap_size = 268435456;", nullptr, nullptr, nullptr) ==
        SQLITE_OK);
  return db;
}
static sqlite3_stmt* rawPrepare(sqlite3* db, const char* sql) {
  sqlite3_stmt* st = nullptr;
  CHECK(sqlite3_prepare_v2(db, sql, -1, &st, nullptr) == SQLITE_OK);
  return st;
}
static void rawExec(sqlite3* db, const char* sql) { CHECK(sqlite3_exec(db, sql, nullptr, nullptr, nullptr) == SQLITE_OK); }
static void bindValue(sqlite3_stmt* st, int idx, const SQLiteValue& v) {
  if (auto s = std::get_if<std::string>(&v)) sqlite3_bind_text(st, idx, s->data(), int(s->size()), SQLITE_STATIC);
  else if (auto d = std::get_if<double>(&v)) sqlite3_bind_double(st, idx, *d);
  else sqlite3_bind_null(st, idx);
}
static SQLiteValue readValue(sqlite3_stmt* stmt, int c) { // mirrors DatabaseCore.cpp readValue
  switch (sqlite3_column_type(stmt, c)) {
    case SQLITE_INTEGER: return static_cast<double>(sqlite3_column_int64(stmt, c));
    case SQLITE_FLOAT: return sqlite3_column_double(stmt, c);
    case SQLITE_TEXT:
      return std::string(reinterpret_cast<const char*>(sqlite3_column_text(stmt, c)), static_cast<size_t>(sqlite3_column_bytes(stmt, c)));
    case SQLITE_NULL: return null;
    default: throw std::runtime_error("blob");
  }
}

static void seedCore(const Rows& rows) {
  removeDb();
  DatabaseCore core(DB, false);
  core.open();
  core.resetWithSchema(SCHEMA, 1);
  core.batch({NativeBatchOperation{1, BatchTable(std::string("tasks")), INSERT, rows}});
}

int main() {
  const Rows rows = buildRows();
  const char* names[] = {"insert 10k", "query 10k cold", "query 10k warm", "find cold x1000", "count x100"};
  std::vector<double> core[5], raw[5];

  for (int run = 0; run < RUNS + 1; run++) { // run 0 = warm-up, dropped
    double c[5] = {}, r[5] = {};

    { // insert
      removeDb();
      DatabaseCore dc(DB, false);
      dc.open();
      dc.resetWithSchema(SCHEMA, 1);
      std::vector<NativeBatchOperation> ops{NativeBatchOperation{1, BatchTable(std::string("tasks")), INSERT, rows}};
      c[0] = ms([&] { dc.batch(ops); });
      CHECK(dc.count("select count(*) as \"count\" from \"tasks\"", {}) == N);
    }
    {
      removeDb();
      sqlite3* db = rawOpen();
      rawExec(db, SCHEMA);
      r[0] = ms([&] {
        rawExec(db, "begin exclusive transaction");
        sqlite3_stmt* st = rawPrepare(db, INSERT);
        for (const auto& row : rows) {
          for (int i = 0; i < 8; i++) bindValue(st, i + 1, row[size_t(i)]);
          CHECK(sqlite3_step(st) == SQLITE_DONE);
          sqlite3_reset(st);
        }
        sqlite3_finalize(st);
        rawExec(db, "commit transaction");
      });
      sqlite3_close(db);
    }

    seedCore(rows);
    { // query cold + warm
      DatabaseCore dc(DB, false);
      dc.open();
      const std::string q = "select \"tasks\".* from \"tasks\"";
      c[1] = ms([&] { CHECK(dc.query("tasks", q, {}).data->rows.size() == N); });
      c[2] = ms([&] { CHECK(dc.query("tasks", q, {}).data->rows.size() == N); });
    }
    {
      sqlite3* db = rawOpen();
      Rows out;
      r[1] = ms([&] {
        sqlite3_stmt* st = rawPrepare(db, "select \"tasks\".* from \"tasks\"");
        const int cols = sqlite3_column_count(st);
        while (sqlite3_step(st) == SQLITE_ROW) {
          std::vector<SQLiteValue> v;
          v.reserve(size_t(cols));
          for (int i = 0; i < cols; i++) v.push_back(readValue(st, i));
          out.push_back(std::move(v));
        }
        sqlite3_finalize(st);
      });
      CHECK(out.size() == N);
      sqlite3_close(db);
    }
    { // find cold
      DatabaseCore dc(DB, false);
      dc.open();
      c[3] = ms([&] {
        for (int i = 0; i < N; i += 10) CHECK(std::holds_alternative<RawRow>(dc.find("tasks", idOf(i))));
      });
    }
    {
      sqlite3* db = rawOpen();
      r[3] = ms([&] {
        sqlite3_stmt* st = rawPrepare(db, "select * from \"tasks\" where id == ? limit 1");
        for (int i = 0; i < N; i += 10) {
          const std::string id = idOf(i);
          sqlite3_bind_text(st, 1, id.data(), int(id.size()), SQLITE_STATIC);
          CHECK(sqlite3_step(st) == SQLITE_ROW);
          std::unordered_map<std::string, SQLiteValue> row;
          for (int k = 0; k < sqlite3_column_count(st); k++) row[sqlite3_column_name(st, k)] = readValue(st, k);
          CHECK(row.size() == 8);
          sqlite3_reset(st);
        }
        sqlite3_finalize(st);
      });
      sqlite3_close(db);
    }
    { // count
      DatabaseCore dc(DB, false);
      dc.open();
      const std::string q = "select count(*) as \"count\" from \"tasks\" where \"project_id\" == ?";
      c[4] = ms([&] {
        for (int k = 0; k < 100; k++) CHECK(dc.count(q, {S("p" + std::to_string(k))}) == 100);
      });
    }
    {
      sqlite3* db = rawOpen();
      r[4] = ms([&] {
        sqlite3_stmt* st = rawPrepare(db, "select count(*) as \"count\" from \"tasks\" where \"project_id\" == ?");
        for (int k = 0; k < 100; k++) {
          const std::string p = "p" + std::to_string(k);
          sqlite3_bind_text(st, 1, p.data(), int(p.size()), SQLITE_STATIC);
          CHECK(sqlite3_step(st) == SQLITE_ROW && sqlite3_column_int(st, 0) == 100);
          sqlite3_reset(st);
        }
        sqlite3_finalize(st);
      });
      sqlite3_close(db);
    }

    if (run == 0) continue;
    for (int i = 0; i < 5; i++) {
      core[i].push_back(c[i]);
      raw[i].push_back(r[i]);
    }
  }
  removeDb();

  const double limits[5] = {1.3, 2.0, 0, 1.5, 1.3};
  std::printf("\n| workload | core ms | raw ms | core/raw | verdict |\n|---|---|---|---|---|\n");
  for (int i = 0; i < 5; i++) {
    const double c = median(core[i]);
    if (i == 2) {
      std::printf("| %s | %.1f | — | — | n/a |\n", names[i], c);
      continue;
    }
    const double r = median(raw[i]);
    std::printf("| %s | %.1f | %.1f | %.2f | %s |\n", names[i], c, r, c / r, c / r <= limits[i] ? "low overhead" : "investigate");
  }
  return 0;
}
