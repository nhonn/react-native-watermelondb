#pragma once

// JSI conversion for ::watermelondb::RecordSet and ::watermelondb::FindResult (kept out of cpp/core so the core stays JSI-free).
#include "core/SqliteTypes.hpp"
#include <NitroModules/JSIConverter.hpp>
#include <jsi/jsi.h>
#include <stdexcept>
#include <vector>

namespace margelo::nitro {

using namespace facebook;

namespace recordset_detail {

using ::watermelondb::RecordSetData;

inline jsi::String stringOf(jsi::Runtime& runtime, const RecordSetData& data, const RecordSetData::Cell& cell) {
  const std::string_view text = data.view(cell);
  return jsi::String::createFromUtf8(runtime, reinterpret_cast<const uint8_t*>(text.data()), text.size());
}

inline jsi::Value valueOf(jsi::Runtime& runtime, const RecordSetData& data, const RecordSetData::Cell& cell) {
  switch (cell.kind) {
    case RecordSetData::Kind::Number:
      return jsi::Value(cell.number);
    case RecordSetData::Kind::Null:
      return jsi::Value::null();
    default:
      return stringOf(runtime, data, cell);
  }
}

// Property names are interned once per result, not once per row/column.
inline std::vector<jsi::PropNameID> propNames(jsi::Runtime& runtime, const RecordSetData& data) {
  std::vector<jsi::PropNameID> names;
  names.reserve(data.columns.size());
  for (const auto& name : data.columns) {
    names.push_back(jsi::PropNameID::forUtf8(runtime, name));
  }
  return names;
}

inline jsi::Object objectOf(jsi::Runtime& runtime, const RecordSetData& data, size_t start, const std::vector<jsi::PropNameID>& names) {
  jsi::Object object(runtime);
  for (size_t c = 0; c < names.size(); c++) {
    object.setProperty(runtime, names[c], valueOf(runtime, data, data.cell(start + c)));
  }
  return object;
}

} // namespace recordset_detail

template <> struct JSIConverter<::watermelondb::RecordSet> final {
  static ::watermelondb::RecordSet fromJSI(jsi::Runtime&, const jsi::Value&) {
    throw std::logic_error("RecordSet cannot be passed from JavaScript");
  }

  static jsi::Value toJSI(jsi::Runtime& runtime, const ::watermelondb::RecordSet& set) {
    using namespace recordset_detail;
    const auto& data = *set.data;
    const auto names = propNames(runtime, data);
    jsi::Array array(runtime, data.rowCount);
    size_t cell = 0;
    for (size_t r = 0; r < data.rowCount; r++) {
      if (data.cell(cell).kind == ::watermelondb::RecordSetData::Kind::Id) {
        array.setValueAtIndex(runtime, r, stringOf(runtime, data, data.cell(cell)));
        cell += 1;
      } else {
        array.setValueAtIndex(runtime, r, objectOf(runtime, data, cell, names));
        cell += names.size();
      }
    }
    return array;
  }

  static bool canConvert(jsi::Runtime&, const jsi::Value&) { return false; }
};

template <> struct JSIConverter<::watermelondb::FoundRecord> final {
  static ::watermelondb::FoundRecord fromJSI(jsi::Runtime&, const jsi::Value&) {
    throw std::logic_error("FoundRecord cannot be passed from JavaScript");
  }

  static jsi::Value toJSI(jsi::Runtime& runtime, const ::watermelondb::FoundRecord& record) {
    using namespace recordset_detail;
    const auto& data = *record.data;
    return objectOf(runtime, data, 0, propNames(runtime, data));
  }

  static bool canConvert(jsi::Runtime&, const jsi::Value&) { return false; }
};

} // namespace margelo::nitro
