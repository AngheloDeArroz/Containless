# Containless Roadmap

This document outlines what has been accomplished so far and the vision for the future of Containless.

## Accomplished Today (v0.1.0)
- **Core CLI Architecture**: Built the entire CLI structure in Node.js and TypeScript, designed to be completely decoupled from global system runtimes.
- **Commands**: 
  - `run` - Reads `containless.json`, installs runtimes locally, and executes commands within the isolated environment.
  - `install` - Dedicated command to pull specific runtimes.
  - `clean` - Removes local runtimes to free up space.
  - `info` - Status page showing all installed runtimes and their local paths.
- **Runtimes Support**: Fully working isolated environments for:
  - Node.js
  - Python
  - Java
  - Go
- **Caching Mechanism**: Smart caching layer (`.containless/cache/`) to prevent repeated downloads of the same runtime archive.
- **PATH Injection Technique**: Sandboxing process environments by manipulating the executable `PATH` internally without polluting the user shell.
- **Open-source Boilerplate**: Initialized with `CONTRIBUTING.md`, `CHANGELOG.md`, Issue Templates, PR Templates, and a Github Action for npm publication.

## Vision / What Containless Will Become
We want Containless to be the absolute standard for local development, effectively replacing traditional version managers (like nvm, pyenv, SDKMAN) and heavyweight containers for local testing.

- **Broader Runtime Support**: Native support for more languages (Rust, PHP, Ruby, Deno, Bun).
- **Intelligent Lockfile Parsing**: Automatically detect the required runtime version by parsing external files (e.g., `package.json` engines, `pyproject.toml`, `go.mod`, `.nvmrc`). 
- **Shell Hooks & Auto-switching**: Optional shell integration that modifies `PATH` contextually as you navigate into a project directory (similar to `direnv`), skipping the need to prefix commands with `containless run`.
- **Project Bootstrapping / Templates**: Command like `containless init <template>` to scaffold an entire project configured with the correct local runtimes pre-installed.
- **Security & Integrity**: Checksums and cryptographic verification for all runtime binaries downloaded from upstream sources.
- **GUI / System Tray Application**: A lightweight visual interface to manage runtimes across different projects.
