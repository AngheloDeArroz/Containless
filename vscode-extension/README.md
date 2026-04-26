# Containless VS Code Extension

Automatically detect and configure Containless project runtimes in VS Code.

## Features

- 🔍 **Auto-detection**: Detects installed Containless runtimes on workspace load
- ⚙️ **Auto-configuration**: Updates VS Code settings to use local runtimes
- 🐍 **Python**: Configures Python interpreter path
- 🟢 **Node.js**: Configures Node.js path
- ☕ **Java**: Configures Java home
- 🔵 **Go**: Configures Go root
- 📝 **PATH Integration**: Updates terminal PATH to prioritize local runtimes

## How It Works

When you open a workspace with a `containless.json` file:

1. Extension auto-activates
2. Scans `.containless/runtimes/` for installed runtimes
3. Updates workspace settings to point to local runtimes
4. Configures terminal PATH to use local binaries first
5. IDEs and tools now use project-local runtimes instead of global ones

## Commands

- **Containless: Detect and Configure Runtimes** - Manually trigger runtime detection
- **Containless: Reset to Global Runtimes** - Clear all workspace runtime settings

## Settings

All configuration is automatic and stored in `.vscode/settings.json`. You can manually edit or reset as needed.

### Configured Settings (Python)
- `python.defaultInterpreterPath` - Points to local Python executable

### Configured Settings (Node.js)
- `npm.binPath` - Points to local Node.js bin directory

### Configured Settings (Java)
- `java.home` - Points to local Java home
- `java.jdt.ls.java.home` - Points to local Java home

### Configured Settings (Go)
- `go.goroot` - Points to local Go root
- `go.gopath` - Points to local Go bin directory

### Terminal Settings
- `terminal.integrated.env.{platform}.PATH` - Updated to include local runtime bins

## Requirements

- VS Code 1.85+
- A Containless project with `containless.json`
- Runtimes installed via Containless

## Installation

1. Place this extension in `.vscode-ext/` or publish to VS Code Marketplace
2. Install extension in VS Code
3. Open a Containless project workspace
4. Extension auto-configures on activation

## Troubleshooting

- **No runtimes detected**: Run `containless run` first to install runtimes
- **Settings not applied**: Check `.vscode/settings.json` in your workspace
- **IDE still using global runtimes**: Try restarting VS Code or the specific language server
