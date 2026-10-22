#pragma once

#if __has_include(<NitroModules/Null.hpp>)
#include <NitroModules/Null.hpp>
#else
#include "Null.hpp"
#endif
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <tuple>
#include <variant>
#include <vector>

// Spellings are copied verbatim from nitrogen/generated/shared/c++/HybridNativeDatabaseSpec.hpp
// (nitrogen sorts variant members - do not reorder).
namespace watermelondb {

using SQLiteValue = std::variant<margelo::nitro::NullType, bool, std::string, double>;

// Query result: column names once, then 16-byte cells; text lives in a shared arena. Cells and text grow in fixed
// chunks, never by reallocating and copying, so peak memory is the result itself, not 2-3x it, and tiny results
// (find) stay tiny. A row is either a single Id cell (record already cached in JS) or `columns.size()` value cells.
struct RecordSetData {
  enum class Kind : uint8_t { Null, Number, Text, Id };
  struct Cell {
    Kind kind;
    uint32_t length; // text byte length
    union {
      double number;
      uint64_t offset; // (text chunk << 32) | offset in chunk
    };
  };

  std::vector<std::string> columns;
  size_t rowCount = 0;

  size_t cellCount() const { return _cellCount; }
  const Cell& cell(size_t i) const {
    if (i < kFirstCells) {
      return _cellChunks[0][i];
    }
    return _cellChunks[1 + (i - kFirstCells) / kCellBlock][(i - kFirstCells) % kCellBlock];
  }
  // Drops cells back to `count` (rolls back a partially read row).
  void truncateCells(size_t count) { _cellCount = count; }

  void addNull() { pushCell(Cell{Kind::Null, 0, {0}}); }
  void addNumber(double value) {
    Cell cell{Kind::Number, 0, {0}};
    cell.number = value;
    pushCell(cell);
  }
  void addText(const char* data, size_t size, Kind kind = Kind::Text) {
    Cell cell{kind, static_cast<uint32_t>(size), {0}};
    cell.offset = appendText(data, size);
    pushCell(cell);
  }
  void addIdRow(std::string_view id) {
    addText(id.data(), id.size(), Kind::Id);
    rowCount++;
  }
  void endRow() { rowCount++; }

  std::string_view view(const Cell& cell) const { return {_textChunks[cell.offset >> 32].get() + (cell.offset & 0xFFFFFFFFu), cell.length}; }
  // Index of the first cell of row `row` (O(row): scans past earlier rows; hot paths iterate sequentially instead).
  size_t rowStart(size_t row) const {
    size_t i = 0;
    while (row-- > 0) {
      i += cell(i).kind == Kind::Id ? 1 : columns.size();
    }
    return i;
  }

private:
  static constexpr size_t kFirstCells = 16;
  static constexpr size_t kCellBlock = 4096;
  static constexpr size_t kFirstText = 256;
  static constexpr size_t kTextBlock = 64 * 1024;

  void pushCell(const Cell& value) {
    const size_t capacity = _cellChunks.empty() ? 0 : kFirstCells + (_cellChunks.size() - 1) * kCellBlock;
    if (_cellCount == capacity) {
      _cellChunks.emplace_back(new Cell[_cellChunks.empty() ? kFirstCells : kCellBlock]);
    }
    const size_t i = _cellCount++;
    (i < kFirstCells ? _cellChunks[0][i] : _cellChunks[1 + (i - kFirstCells) / kCellBlock][(i - kFirstCells) % kCellBlock]) = value;
  }
  uint64_t appendText(const char* data, size_t size) {
    if (_textChunks.empty() || size > _textCapacity - _textUsed) {
      _textCapacity = std::max(size, _textChunks.empty() ? kFirstText : kTextBlock);
      _textChunks.emplace_back(new char[_textCapacity]);
      _textUsed = 0;
    }
    std::memcpy(_textChunks.back().get() + _textUsed, data, size);
    const uint64_t offset = (static_cast<uint64_t>(_textChunks.size() - 1) << 32) | _textUsed;
    _textUsed += size;
    return offset;
  }

  std::vector<std::unique_ptr<Cell[]>> _cellChunks;
  std::vector<std::unique_ptr<char[]>> _textChunks;
  size_t _cellCount = 0;
  size_t _textUsed = 0;
  size_t _textCapacity = 0;
};
// Shared + const so Nitro's Promise resolution copies a pointer, not the rows.
struct RecordSet {
  std::shared_ptr<const RecordSetData> data = std::make_shared<const RecordSetData>();
};
// One value row (never an Id row); converted to a JS record object.
struct FoundRecord {
  std::shared_ptr<const RecordSetData> data;
};
// null = not found, string = id already cached in JS, FoundRecord = the record. Spelling matches the nitrogen output.
using FindResult = std::variant<margelo::nitro::NullType, std::string, FoundRecord>;
using LocalValue = std::variant<margelo::nitro::NullType, std::string>;
using BatchTable = std::optional<std::variant<margelo::nitro::NullType, std::string>>;
// [cacheBehavior (-1 remove | 0 ignore | 1 add), table, sql, argBatches]; id is argBatch[0] when cacheBehavior != 0
using NativeBatchOperation = std::tuple<double, BatchTable, std::string, std::vector<std::vector<SQLiteValue>>>;

} // namespace watermelondb
