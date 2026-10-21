project(Watermelondb)
cmake_minimum_required(VERSION 3.9.0)

set (PACKAGE_NAME Watermelondb)
set (CMAKE_VERBOSE_MAKEFILE ON)
set (CMAKE_CXX_STANDARD 20)

# Enable Raw Props parsing in react-native (for Nitro Views)
add_compile_options(-DRN_SERIALIZABLE_STATE=1)

# Define C++ library and add all sources
add_library(${PACKAGE_NAME} SHARED 
	src/main/cpp/cpp-adapter.cpp
	../cpp/HybridNativeDatabaseFactory.cpp
	../cpp/HybridNativeDatabase.cpp
	../cpp/core/SqliteDb.cpp
	../cpp/core/DatabaseCore.cpp
	../cpp/vendor/sqlite3/sqlite3.c
)

# SQLite tuning (see sqlite.org/compile.html#recommended_compile_time_options).
# THREADSAFE=2: each connection is used by one thread at a time (guarded by HybridNativeDatabase::_lock); global state stays locked for multiple DBs.
# Not used: DQS=0 / MAX_EXPR_DEPTH=0 (behavior differs from iOS system SQLite), OMIT_SHARED_CACHE (tests use cache=shared).
set_source_files_properties(../cpp/vendor/sqlite3/sqlite3.c PROPERTIES
  COMPILE_DEFINITIONS "SQLITE_THREADSAFE=2;SQLITE_DEFAULT_MEMSTATUS=0;SQLITE_LIKE_DOESNT_MATCH_BLOBS=1;SQLITE_OMIT_DEPRECATED=1;SQLITE_OMIT_PROGRESS_CALLBACK=1;SQLITE_USE_ALLOCA=1;HAVE_FDATASYNC=1"
  COMPILE_OPTIONS "-O2;-fvisibility=hidden")

# Add Nitrogen specs :)
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/Watermelondb+autolinking.cmake)

# Set up local includes
include_directories(
        "src/main/cpp"
        "../cpp"
        "../cpp/core"
        "../cpp/vendor/sqlite3"
)

find_library(LOG_LIB log)

# Link all libraries together
target_link_libraries(
        ${PACKAGE_NAME}
        ${LOG_LIB}
        android                                   # <-- Android core
)
