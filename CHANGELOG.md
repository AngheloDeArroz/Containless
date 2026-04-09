# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-09

### Added

- Initial release
- `containless run` — read config, install runtimes, run start command
- `containless install <runtime@version>` — download and install a runtime
- `containless clean` — delete installed runtimes
- `containless info` — display installed runtimes in a table
- Support for Node.js, Python, Java, and Go runtimes
- Download caching in `.containless/cache/`
- Progress bar for downloads
- Platform detection (linux, darwin, win32) and architecture (x64, arm64)
- `containless.json` configuration file support
- Colored terminal output with chalk
- `.gitignore` warning for `.containless/` directory
