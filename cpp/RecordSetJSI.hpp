#pragma once

// JSI conversion for ::watermelondb::RecordSet (kept out of cpp/core so the core stays JSI-free).
#include "core/SqliteTypes.hpp"
#include <NitroModules/JSIConverter.hpp>
#include <jsi/jsi.h>
#include <stdexcept>
#include <vector>

namespace margelo::nitro {

using namespace facebook;

template <> struct JSIConverter<::watermelondb::RecordSet> final {
  static ::watermelondb::RecordSet fromJSI(jsi::Runtime&, const jsi::Value&) {
    throw std::logic_error("RecordSet cannot be passed from JavaScript");
  }

  static jsi::Value toJSI(jsi::Runtime& runtime, const ::watermelondb::RecordSet& set) {
    const auto& data = *set.data;
    // Property names are interned once per result, not once per row/column.
    std::vector<jsi::PropNameID> names;
    names.reserve(data.columns.size());
    for (const auto& name : data.columns) {
      names.push_back(jsi::PropNameID::forUtf8(runtime, name));
    }
    jsi::Array array(runtime, data.rows.size());
    for (size_t r = 0; r < data.rows.size(); r++) {
      const auto& row = data.rows[r];
      if (const auto* id = std::get_if<std::string>(&row)) {
        array.setValueAtIndex(runtime, r, jsi::String::createFromUtf8(runtime, *id));
        continue;
      }
      const auto& values = std::get<std::vector<::watermelondb::SQLiteValue>>(row);
      jsi::Object object(runtime);
      for (size_t c = 0; c < values.size(); c++) {
        object.setProperty(runtime, names[c], JSIConverter<::watermelondb::SQLiteValue>::toJSI(runtime, values[c]));
      }
      array.setValueAtIndex(runtime, r, std::move(object));
    }
    return array;
  }

  static bool canConvert(jsi::Runtime&, const jsi::Value&) { return false; }
};

} // namespace margelo::nitro
