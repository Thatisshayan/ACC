## Analysis

The current `desktop/package.json` has Electron as a dependency but lacks electron-builder configuration. To build a Windows NSIS installer, we need to:

1. Add `electron-builder` as a dev dependency
2. Configure the `build` section with Windows-specific NSIS settings
3. Add build scripts for convenience
4. Ensure proper file inclusion (main process files + UI/dist)

## Recommended Changes

### Complete `desktop/package.json`:


{
  "name": "acc-agent-command-center",
  "version": "2.0.0",
  "description": "ACC v2 — Personal AI Operating System",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder build --win",
    "build:dir": "electron-builder build --win --dir",
    "postinstall": "electron-builder install-app-deps"
  },
  "build": {
    "appId": "com.acc.agentcommandcenter",
    "productName": "ACC v2",
    "directories": {
      "output": "dist"
    },
    "files": [
      "main.js",
      "preload.js",
      "package.json",
      "node_modules/**/*",
      "!node_modules/.cache/**/*",
      "!node_modules/electron/**/*"
    ],
    "extraFiles": [
      {
        "from": "ui/dist",
        "to": "ui/dist",
        "filter": ["**/*"]
      }
    ],
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ],
      "icon": null,
      "signAndEditExecutable": false,
      "sign": false
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "ACC v2",
      "installerIcon": null,
      "uninstallerIcon": null,
      "installerHeaderIcon": null,
      "installerSidebar": null,
      "uninstallDisplayName": "ACC v2",
      "include": null,
      "script": null,
      "license": null,
      "deleteAppDataOnUninstall": false,
      "runAfterFinish": true,
      "warningsAsErrors": false
    },
    "asar": true,
    "asarUnpack": [
      "node_modules/**/*.node"
    ],
    "npmRebuild": true,
    "nodeGypRebuild": false
  },
  "dependencies": {
    "electron": "^28.0.0"
  },
  "devDependencies": {
    "electron-builder": "^24.9.1"
  }
}


### Build Commands:

bash
# Step 1: Install electron-builder
cd C:\Users\Shaya\agent-command-center\desktop
npm install electron-builder --save-dev

# Step 2: Build the installer
npx electron-builder build --win

# Step 3: Output location
# The installer will be at:
# C:\Users\Shaya\agent-command-center\desktop\dist\ACC-Setup-2.0.0.exe


### Key Configuration Details:

- **NSIS Installer**: Non-one-click, allows custom installation directory
- **No Code Signing**: `sign: false` and `signAndEditExecutable: false` for local distribution
- **Auto-Updater**: Disabled (no `publish` configuration)
- **File Inclusion**: Main process files + `ui/dist` as extra files
- **Architecture**: x64 only (can add ia32 if needed)
- **ASAR**: Enabled for performance, with native modules unpacked

### Production Readiness Notes:

1. **Icon**: Set to `null` - replace with actual `.ico` file path when available
2. **Code Signing**: Add certificate configuration when distributing publicly
3. **Auto-Updater**: Add `electron-updater` and `publish` config when ready
4. **Native Modules**: If using native modules, ensure they're in `asarUnpack`

### Risk Mitigation:

- Test build with `--dir` flag first to verify file structure
- Ensure `ui/dist` exists before building (run UI build step first)
- Check that all required files are included in `files` array
- Verify Node.js version compatibility (electron-builder requires Node >= 14)

### Next Steps:

1. Run `npm install` to install electron-builder
2. Build UI first: `cd ui && npm run build`
3. Build installer: `npx electron-builder build --win`
4. Test the installer on a clean Windows machine