# iOS Build & Deployment

## 1. Prerequisites

- macOS with Xcode installed
- Apple Developer account (free or paid)
- iPhone connected via USB
- Device trusted on computer

## 2. First-Time Setup

Before building, you need to configure your Apple Developer Team ID:

**Step 1: Find your Team ID**

```bash
# Option A: From Xcode
# Open Xcode → Settings → Accounts → Select your Apple ID → Copy Team ID

# Option B: From command line (if you've signed apps before)
security find-identity -v -p codesigning
```

**Step 2: Set the environment variable**

Add to your shell config (`~/.zshrc` or `~/.bashrc`):

```bash
export DEVELOPMENT_TEAM="YOUR_TEAM_ID_HERE"
```

Then reload:

```bash
source ~/.zshrc  # or source ~/.bashrc
```

**Step 3: Regenerate the Xcode project**

```bash
cd packages/client
bun run tauri ios init --ci
```

This only needs to be done once per machine.

## 3. Building the iOS App

```bash
# Navigate to client package
cd packages/client

# Build the iOS app (creates IPA)
bun run tauri:build:ios
```

The IPA will be output to:

```
src-tauri/gen/apple/build/arm64/jean2.ipa
```

## 3. Deploying to iPhone

### Option A: Apple Configurator 2 (Recommended)

1. Download Apple Configurator 2 from App Store (free)
2. Connect iPhone via USB
3. Drag the IPA file onto your device in the app

IPA location: `src-tauri/gen/apple/build/arm64/jean2.ipa`

### Option B: Command Line (macOS 14+)

```bash
# Step 1: Get your device UDID
xcrun xctrace list devices

# Step 2: Install the IPA
xcrun devicectl device install app --device <DEVICE-UDID> src-tauri/gen/apple/build/arm64/jean2.ipa
```

### Option C: ios-deploy

```bash
# Install ios-deploy
brew install ios-deploy

# Install the IPA
ios-deploy --bundle src-tauri/gen/apple/build/arm64/jean2.ipa
```

## 4. Development Mode (Live Reload)

```bash
cd packages/client
bun run tauri:ios:dev
```

## 5. Troubleshooting

### "Connection refused" or "failed to build WebSocket client"

- This happens when opening Xcode directly without the Tauri server
- For Xcode builds, use: `bun run tauri ios dev --open`
- For simple deployment, use the IPA installation methods above

### Linker Error (exit code 65)

- Regenerate the Xcode project:

```bash
bun run tauri ios init --ci
bun run tauri:build:ios
```

### "App connects to dev server instead of bundled assets"

- Ensure `tauri.conf.json` has `"url": "index.html"` in the windows config

### Code Signing Issues

- Ensure you've completed the [First-Time Setup](#2-first-time-setup) to set your Team ID
- Regenerate the Xcode project: `bun run tauri ios init --ci`
- Then rebuild: `bun run tauri:build:ios`

## 6. Project Structure Notes

- `tauri.conf.json` - Main Tauri configuration
- `src-tauri/gen/apple/project.yml` - Xcode project configuration source
- `src-tauri/gen/apple/build/arm64/` - Build output directory
