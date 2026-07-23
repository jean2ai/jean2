---
name: client-version-bump
description: How to bump the client version in the jean2 monorepo. Load when releasing or versioning client changes (client, client-electron, changelogs).
---

# Client Version Bump (jean2 monorepo)

Procedural guide for bumping the client version. The client spans two package.json files that must stay in sync. Server and SDK are versioned separately and must NOT be touched.

## Files to update (exactly these two)

| File | Format |
|------|--------|
| `packages/client/package.json` | `"version": "X.Y.Z"` |
| `packages/client-electron/package.json` | `"version": "X.Y.Z"` |

## Do NOT touch these during a manual bump

- `packages/client/VERSION` — NEVER update manually. The GitHub release workflow (`release-electron.yml`) updates it automatically via an announcement PR AFTER the release succeeds. `package.json` is the only build/tag/package version source. VERSION only records the latest *published* version. Manually setting it early causes the announcement step to skip ("VERSION already $V; nothing to announce") and breaks the contract that VERSION reflects a published version.
- `packages/sdk/package.json` — versioned independently
- `packages/server/package.json` — versioned independently
- `packages/sdk/src/version.ts`, `packages/server/src/version.ts` — separate

## Procedure

1. Determine the new version number (e.g. `1.1.0` -> `1.1.1` for a patch).
2. Update both files listed above to the same version string.
3. Create changelog: `changelogs/client/vX.Y.Z.md`
4. Run `bun run typecheck` to verify nothing broke.

## Changelog format

Follow the style of existing entries in `changelogs/client/`. Sections:

- `### Added` for new features
- `### Changed` for modifications to existing behavior
- `### Fixed` for bug fixes
- `### Removed` for deleted features

Each entry is a bullet starting with **bold summary** followed by a colon and description. Only include sections that have entries. Do NOT use em-dashes anywhere (user preference).

Example:

```markdown
### Changed

- **Structured output visual overhaul**: structured responses now render array items as bordered cards with numbered index badges, use a compact definition-list layout for nested objects, and render markdown syntax in string values.
```

## Verification

After updating, confirm both package.json files match:

```sh
grep '"version"' packages/client/package.json packages/client-electron/package.json
```

Both must show the same version. Confirm SDK and server are unchanged:

```sh
grep '"version"' packages/sdk/package.json packages/server/package.json
```

Do NOT check or modify `packages/client/VERSION`. It is updated automatically by the release workflow after publishing succeeds.

