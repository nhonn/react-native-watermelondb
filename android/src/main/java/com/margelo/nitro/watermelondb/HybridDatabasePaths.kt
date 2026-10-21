package com.margelo.nitro.watermelondb

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules

@Keep
@DoNotStrip
class HybridDatabasePaths : HybridDatabasePathsSpec() {
  // Same parent as upstream WatermelonDB's `getDatabasePath(name).replace("/databases", "")`
  override val databaseDirectory: String
    get() = (NitroModules.applicationContext
      ?: throw Error("WatermelonDB: React application context is not available")).dataDir.absolutePath
}
