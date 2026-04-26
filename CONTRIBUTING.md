# Contributing to Containless

Thanks for your interest in contributing to Containless! Here's how to get started.

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Clone and Install

```bash
git clone https://github.com/user/containless.git
cd containless
npm install
```

### Build

```bash
npm run build
```

This compiles TypeScript from `src/` to `dist/`.

### Run Locally (development)

```bash
# Using ts-node
npm run dev -- install node@18.17.0

# Or build and run
npm run build
node dist/cli.js install node@18.17.0
```

### Link for Global Testing

```bash
npm link
containless --help
```

## Project Structure

```
src/
├── cli.ts              ← Commander setup, entry point
├── config.ts           ← Read/write containless.json
├── runtimes/
│   ├── index.ts        ← Runtime resolver
│   ├── node.ts         ← Node.js download logic
│   ├── python.ts       ← Python download logic
│   ├── java.ts         ← Java download logic
│   └── go.ts           ← Go download logic
├── installer.ts        ← Download + extract + cache logic
├── runner.ts           ← Spawn child process with injected PATH
└── utils.ts            ← Platform detection, version parsing, helpers

vscode-extension/
├── src/
│   ├── extension.ts         ← Extension entry point
│   ├── runtimeDetector.ts   ← Scan .containless/runtimes/
│   └── settingsManager.ts   ← Update VS Code settings
├── package.json
├── tsconfig.json
├── README.md
└── .vscodeignore
```

## VS Code Extension Development

The extension auto-configures VS Code to use locally installed Containless runtimes.

### Building the Extension

```bash
cd vscode-extension
npm install
npm run build

# Watch mode for development
npm run watch
```

### Testing the Extension

1. Open `vscode-extension/` as a separate VS Code window
2. Press `F5` to launch the Extension Development Host
3. Open a Containless project in the new window
4. Extension should auto-activate and configure runtimes

### Extension Architecture

- **extension.ts**: Entry point, command registration, activation trigger
- **runtimeDetector.ts**: Scans `.containless/runtimes/` and detects installed runtimes
- **settingsManager.ts**: Updates VS Code workspace settings and terminal PATH

### Key APIs Used

- `vscode.workspace.getConfiguration()` — Read/update settings
- `vscode.workspace.createFileSystemWatcher()` — Watch containless.json
- `vscode.window.showInformationMessage()` — Show notifications

### Adding Support for New Runtimes

1. Update `RuntimeDetector.getRuntimeBinPath()` with the new runtime's bin path logic
2. Update `SettingsManager.configureRuntimes()` to set the appropriate VS Code settings
3. Test by running `containless install <runtime>` then opening in VS Code

## Code Style

- TypeScript strict mode
- Use `async/await` over raw promises
- Use chalk for all console output
- Meaningful error messages — never swallow errors silently

## Adding a New Runtime

1. Create `src/runtimes/<name>.ts` with:
   - `get<Name>DownloadUrl(version)` — returns the download URL
   - `get<Name>ArchiveName(version)` — returns the cache key filename
   - `get<Name>BinaryName()` — returns the binary name
   - `<NAME>_STRIP_LEVEL` — number of directories to strip during extraction
2. Register it in `src/runtimes/index.ts`
3. Add it to `SUPPORTED_RUNTIMES` in `src/utils.ts`
4. Update the README

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Ensure the project builds: `npm run build`
5. Commit with a descriptive message
6. Push to your fork and open a Pull Request

## Reporting Issues

Use the [issue templates](https://github.com/user/containless/issues/new/choose) to report bugs or request features.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
