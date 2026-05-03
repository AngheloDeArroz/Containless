# Containless

Run projects instantly without the hassle of installing system dependencies, managing language versions, or learning Docker. Containless automatically provisions fully isolated, project-local runtimes for Node.js, Python, Java, and Go.

## Features

- **Auto-detection** — Detects installed Containless runtimes the moment you open a workspace
- **Full sandbox** — Terminal PATH is overridden so every command uses the local runtime
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
| `Containless: Detect and Configure Runtimes` | Manually trigger runtime detection and configuration |
| `Containless: Reset to Global Runtimes` | Remove all sandbox settings and restore global defaults |

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

## Requirements

- **VS Code** 1.85 or later
- A project with a `containless.json` file
- Runtimes installed via the [Containless CLI](https://github.com/AngheloDeArroz/Containless)

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

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No runtimes detected | Run `containless run` first to install runtimes |
| Terminal still uses global runtime | Close the terminal and open a new one (`Ctrl+\``) |
| Settings not applied | Check `.vscode/settings.json` in your workspace |
| IDE still using global runtimes | Restart VS Code or reload the window (`Ctrl+Shift+P` → *Reload Window*) |

## License

[MIT](https://github.com/AngheloDeArroz/Containless/blob/main/LICENSE)
