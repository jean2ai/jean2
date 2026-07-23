---
name: package-release-procedure
description: How to trigger releases in the jean2 monorepo. Covers the 5 workflow files (release.yml for server+tools, release-electron.yml for client, publish-client.yml reusable-only, publish-sdk.yml for SDK, release-browser.yml for browser), trigger order, and the VERSION/package.json contract. Load when releasing server, client, SDK, tools, or browser extension.
---

# Package Release Procedure (jean2 monorepo)

How to trigger releases and how the version contract works. Verified against `.github/workflows/` as of 2026-07-20.

## The VERSION / package.json contract (all packages)

- `package.json` is the ONLY build, tag, and package version source. Always.
- `VERSION` files (`packages/{client,server,sdk}/VERSION`, `tools/*/VERSION`) record the latest **published** version only. They are NEVER updated manually.
- After a release publishes successfully, a bot opens an **announcement PR** that bumps the VERSION file. Merge that PR so VERSION reflects the published version.
- Manually editing VERSION early causes the announcement step to skip ("VERSION already $V; nothing to announce").

Manual version bumps touch ONLY `package.json` files. See skill `client-version-bump` for the client-specific bump procedure.

## The 5 release workflows

| Workflow file | What it releases | Trigger |
|---|---|---|
| `release.yml` (Release) | Server binary + all tools | `workflow_dispatch`: toggle `release_server` and/or `release_all_tools` |
| `release-electron.yml` (Release Electron) | Client desktop (macOS + Windows) + NPM + VERSION PR | `workflow_dispatch`: toggle `release_client` |
| `publish-client.yml` (Publish Client to NPM) | `@jean2/client` to NPM | **Reusable only** (`workflow_call`). Called automatically by release-electron.yml. Never triggered directly. |
| `publish-sdk.yml` (Publish SDK to NPM) | `@jean2/sdk` to NPM + VERSION PR | `release: published` on `sdk/v*` tag, OR `workflow_dispatch` |
| `release-browser.yml` (Release Browser Extension) | Browser extension + VERSION PR | `workflow_dispatch`: toggle `release_browser` |

## Release triggers and order

### Client (desktop + NPM)
1. Trigger **Release Electron** only (branch: `main`, `release_client: true`, `force: false`).
2. Do NOT trigger **Publish Client to NPM** separately. It is reusable-only and is called automatically by the Electron workflow after both desktop builds succeed.
3. The workflow: creates a draft `client/v$V` release, builds macOS, builds Windows, calls publish-client (NPM), makes the release public, opens a VERSION announcement PR.

### Server
1. Bump `packages/server/package.json` version.
2. Trigger **Release** with `release_server: true`, `release_all_tools: false`.
3. Builds cross-platform binaries, creates `server/v$V` release, opens a VERSION announcement PR.

### Tools
1. Bump each changed tool's `package.json` version (and changelog if applicable).
2. Trigger **Release** with `release_server: false`, `release_all_tools: true`.
3. The workflow iterates ALL tools in `tools/manifest.json`. Existing releases are skipped (idempotent). Newly bumped tools are packaged and released. One announcement PR updates all tool VERSION files.
4. Pitfall: the workflow checks every tool in the matrix, not a selected subset. Unchanged tools are skipped but still processed.

### SDK
1. Bump `packages/sdk/package.json` version.
2. Tag and push `sdk/v$V`, OR trigger **Publish SDK to NPM** via `workflow_dispatch`.
3. Publishes `@jean2/sdk@$V` to NPM, syncs `src/version.ts` from package.json during build, opens a VERSION announcement PR.

### Browser extension
1. Bump browser extension version (check `packages/browser/manifest.json` and any package.json).
2. Trigger **Release Browser Extension** with `release_browser: true`.
3. Creates `browser/v$V` release, opens a VERSION announcement PR.

## Pitfalls

- Never trigger `publish-client.yml` directly. It has no `workflow_dispatch` trigger on purpose.
- Never manually edit any VERSION file.
- `release_client` and `release_all_tools` default to `false` in their respective workflows. Server release defaults to `false` too. You must explicitly enable what you want.
- Use `force: true` only to intentionally delete and recreate an existing release (e.g., a botched draft). It force-moves the tag.
- For client releases, `packages/client/package.json` and `packages/client-electron/package.json` must carry the **same** version. The workflow validates this and fails on mismatch.
- The SDK `src/version.ts` is synced from `package.json` at build time inside the publish workflow, so do not hand-edit it before a release.

## Verification

After triggering, monitor the Actions tab:
- Server/Tools: watch the **Release** workflow run. Confirm the announcement PR opens.
- Client: watch **Release Electron**. Confirm macos, windows, publish-npm, publish-release, and announce-version jobs all succeed.
- SDK: watch **Publish SDK to NPM**. Confirm publish + announce jobs succeed.
- Browser: watch **Release Browser Extension**. Confirm prepare, build, and announce jobs succeed.

Merge each announcement PR after the release completes so VERSION files stay in sync with published versions.

