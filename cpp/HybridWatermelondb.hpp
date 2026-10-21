#pragma once
#include <vector>
#include "HybridWatermelondbSpec.hpp"

namespace margelo::nitro::watermelondb {
class HybridWatermelondb : public HybridWatermelondbSpec {
    public:
        HybridWatermelondb() : HybridObject(TAG), HybridWatermelondbSpec() {}
       
        double sum(double a, double b) override;
    };
} // namespace margelo::nitro::watermelondb
