import Foundation
import NitroModules

final class HybridDatabasePaths: HybridDatabasePathsSpec {
  // Matches upstream WatermelonDB's iOS location: Documents/<name>.db
  var databaseDirectory: String {
    return FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].path
  }
}
