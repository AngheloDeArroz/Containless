# Containless

Run projects instantly without the hassle of installing system dependencies, managing language versions, or learning Docker. Containless automatically provisions fully isolated, project-local runtimes for Node.js, Python, Java, and Go.

## Features

- **Auto-detection** — Detects installed Containless runtimes the moment you open a workspace
- **Full sandbox** — Terminal PATH is overridden so every command uses the local runtime
- **CLI integration** — Run all Containless CLI commands directly from VS Code
- **Status bar** — See active runtimes at a glance with a persistent status bar indicator
- **Output channel** — All CLI output and extension activity is logged to a dedicated panel
- **Python** — Configures the interpreter path and virtual environment
- **Node.js** — Configures Node.js for ESLint, npm, and the terminal
- **Java** — Sets `JAVA_HOME` for the Java extension pack
- **Go** — Sets `GOROOT` and alternate tools for the Go extension
- **Live reload** — Watches `containless.json` and reconfigures automatically on changes

## How It Works

1. Open a workspace that contains a `containless.json`
2. The extension activates automatically
3. It scans `.containless/runtimes/` for installed runtimes
4. Workspace settings are updated to point all tools to local runtimes
5. Terminal PATH is prepended with local binary directories

**Result:** Every tool in VS Code — IntelliSense, linting, debugging, and the terminal — uses the project-local runtime instead of whatever is installed globally.

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

| Command | Description |
|---------|-------------|
| `Containless: Run Project` | Install runtimes and execute the start command in the terminal |
| `Containless: Install Runtime` | Select a runtime and version to download and install |
| `Containless: Initialize Project` | Scan the project and generate `containless.json` |
| `Containless: Detect and Configure Runtimes` | Re-scan installed runtimes and update VS Code settings |
| `Containless: Show Runtime Info` | Display installed runtimes and their status |
| `Containless: Clean Runtimes` | Delete all locally installed runtimes |
| `Containless: Reset to Global Runtimes` | Remove sandbox settings and restore global defaults |
| `Containless: Show Commands` | Open the Containless command menu |

## Status Bar

When a `containless.json` is present, a status bar item appears at the bottom of VS Code showing the active runtimes (e.g. `Containless: node@18.17.0 | python@3.11.0`). Click it to open the command menu for quick access to all Containless actions.

## What Gets Configured

### Python
- `python.defaultInterpreterPath` → local Python or venv executable

### Node.js
- `eslint.runtime` → local Node.js executable
- `npm.binPath` → local Node.js bin directory

### Java
- `java.jdt.ls.java.home` → local Java home

### Go
- `go.goroot` → local Go SDK root
- `go.alternateTools` → local Go binary

### Terminal
- `terminal.integrated.env.{platform}.PATH` → prepended with all local runtime bin directories

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `containless.cliPath` | `string` | `""` | Override the path to the containless CLI binary. Leave empty to auto-detect. |

## Requirements

- **VS Code** 1.85 or later
- A project with a `containless.json` file
- The [Containless CLI](https://www.npmjs.com/package/containless) installed globally or in the project

## Getting Started

1. Install the [Containless CLI](https://www.npmjs.com/package/containless):
   ```bash
   npm install -g containless
   ```
2. Initialize your project:
   ```bash
   containless init
   ```
3. Install runtimes:
   ```bash
   containless run
   ```
4. Open the project in VS Code — the extension takes care of the rest!

Alternatively, after installing the extension, use the Command Palette to run `Containless: Initialize Project` and `Containless: Run Project` without leaving VS Code.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| CLI not found | Install with `npm install -g containless` or set `containless.cliPath` |
| No runtimes detected | Run `Containless: Run Project` from the Command Palette |
| Terminal still uses global runtime | Close the terminal and open a new one (`Ctrl+\``) |
| Settings not applied | Check `.vscode/settings.json` in your workspace |
| IDE still using global runtimes | Restart VS Code or reload the window (`Ctrl+Shift+P` → *Reload Window*) |

## License

[MIT](https://github.com/AngheloDeArroz/Containless/blob/main/LICENSE)
