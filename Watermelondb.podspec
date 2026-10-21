require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "Watermelondb"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/noahnguyen/react-native-watermelondb.git", :tag => "#{s.version}" }

  s.source_files = [
    # Implementation (Swift)
    "ios/**/*.{swift}",
    # Implementation (C++ objects)
    "cpp/**/*.{hpp,cpp}",
    # Vendored SQLite (symbol-prefixed amalgamation, same build as Android)
    "cpp/vendor/sqlite3/wmdb_sqlite3.c",
  ]
  s.preserve_paths = "cpp/vendor/sqlite3/*.{c,h}" # sqlite3.c/.h are #included, not compiled on their own

  # Keep in sync with android/CMakeLists.txt. iOS-only: HAVE_GETHOSTUUID=0 (not in the iOS SDK); Android-only: HAVE_FDATASYNC.
  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => "\"$(PODS_TARGET_SRCROOT)/cpp/vendor/sqlite3\"",
    "GCC_PREPROCESSOR_DEFINITIONS" => "$(inherited) WMDB_VENDORED_SQLITE=1 SQLITE_THREADSAFE=2 SQLITE_DEFAULT_MEMSTATUS=0 " \
      "SQLITE_DEFAULT_WAL_SYNCHRONOUS=1 SQLITE_LIKE_DOESNT_MATCH_BLOBS=1 SQLITE_OMIT_DEPRECATED=1 " \
      "SQLITE_OMIT_PROGRESS_CALLBACK=1 SQLITE_USE_ALLOCA=1 HAVE_GETHOSTUUID=0",
  }

  load 'nitrogen/generated/ios/Watermelondb+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)
end
