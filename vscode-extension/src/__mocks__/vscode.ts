// Mock for the vscode module

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file', path })
};

// Mock configurations store
const mockConfigStore: Record<string, any> = {};

export const workspace = {
  getConfiguration: (section?: string, resource?: any) => {
    return {
      get: (key: string) => {
        const fullKey = section ? `${section}.${key}` : key;
        return mockConfigStore[fullKey];
      },
      update: async (key: string, value: any, target: number) => {
        const fullKey = section ? `${section}.${key}` : key;
        if (value === undefined) {
          delete mockConfigStore[fullKey];
        } else {
          mockConfigStore[fullKey] = value;
        }
      }
    };
  }
};

// Mock extensions store
const installedExtensions = new Set<string>();

export const extensions = {
  getExtension: (extensionId: string) => {
    return installedExtensions.has(extensionId) ? { id: extensionId } : undefined;
  }
};

export const window = {
  showInformationMessage: async () => {},
  showErrorMessage: async () => {},
  showWarningMessage: async () => {},
  createOutputChannel: () => ({
    appendLine: () => {},
    show: () => {},
    clear: () => {}
  }),
  createStatusBarItem: () => ({
    text: '',
    tooltip: '',
    command: '',
    show: () => {},
    hide: () => {}
  })
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: async () => {}
};

// Helper methods to control the mock state in tests
export const _testMocks = {
  reset: () => {
    Object.keys(mockConfigStore).forEach(key => delete mockConfigStore[key]);
    installedExtensions.clear();
  },
  getConfig: (key: string) => mockConfigStore[key],
  setConfig: (key: string, value: any) => { mockConfigStore[key] = value; },
  installExtension: (id: string) => installedExtensions.add(id),
  uninstallExtension: (id: string) => installedExtensions.delete(id)
};
