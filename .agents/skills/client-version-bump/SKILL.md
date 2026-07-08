---
name: client-version-bump
description: How to bump the client version in the jean2 monorepo. Load when releasing or versioning client changes (client, client-electron, changelogs).
---

# Client Version Bump (jean2 monorepo)

Procedural guide for bumping the client version. The client spans three files that must stay in sync. Server and SDK are versioned separately and must NOT be touched.

## Files to update (exactly these three)

| File | Format |
|------|--------|
| `packages/client/package.json` | `"version": "X.Y.Z"` |
| `packages/client/VERSION` | `X.Y.Z\n` (plain text, trailing newline) |
| `packages/client-electron/package.json` | `"version": "X.Y.Z"` |

## Files NOT to touch

- `packages/sdk/package.json` — versioned independently
- `packages/server/package.json` — versioned independently
- `packages/sdk/src/version.ts`, `packages/server/src/version.ts` — separate

## Procedure

1. Determine the new version number (e.g. `1.1.0` -> `1.1.1` for a patch).
2. Update all three files listed above to the same version string.
3. Create changelog: `changelogs/client/vX.Y.Z.md`
4. Run `bun run typecheck` to verify nothing broke.

## Changelog format

Follow the style of existing entries in `changelogs/client/`. Sections:

- `### Added` — new features
- `### Changed` — modifications to existing behavior
- `### Fixed` — bug fixes
- `### Removed` — deleted features

Each entry is a bullet starting with **bold summary** followed by an em-dash (use regular dash `-` not em-dash character) and description. Only include sections that have entries.

Example:

```markdown
### Changed

- **Structured output visual overhaul** — structured responses now render array items as bordered cards with numbered index badges, use a compact definition-list layout for nested objects, and render markdown syntax in string values.
```

## Verification

After updating, confirm all three files match:

```sh
grep '"version"' packages/client/package.json packages/client-electron/package.json
cat packages/client/VERSION
```

All three must show the same version. Confirm SDK and server are unchanged:

```sh
grep '"version"' packages/sdk/package.json packages/server/package.json
```

