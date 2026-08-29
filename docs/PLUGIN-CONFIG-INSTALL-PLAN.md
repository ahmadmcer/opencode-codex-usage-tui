# OpenCode Plugin Configuration Installation Plan

## Goal

Make `@ahmadmcer/opencode-codex-usage` load directly from OpenCode's `tui.json` `plugin` array rather than copying its source files into `~/.config/opencode/plugins`.

OpenCode supports npm package specs in `tui.json`. A package TUI module must have a default export shaped as `{ id?, tui }`, and its package metadata must expose the TUI entry point.

## Current State

- `src/tui.ts` already has the required default TUI module export with the stable ID `codex-usage`.
- `package.json` exposes `./tui`, but points at TypeScript source.
- `scripts/install.mjs` and `scripts/install.ps1` copy `src/tui.ts` and `src/core.ts` into a local OpenCode plugin directory, then mutate `tui.json` to reference the copied file.
- The current README documents only this copy-based installation flow.

## Target User Configuration

Document this as the supported installation method after publishing the package:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["@ahmadmcer/opencode-codex-usage@<version>"]
}
```

For local development, document a package spec that OpenCode can resolve without copying source files, such as a `file:` package reference or a packed tarball. Confirm the exact local npm-spec syntax in an OpenCode smoke test before publishing the documentation.

## Implementation Steps

### 1. Produce a distributable package

- Add a TypeScript build configuration that emits JavaScript modules into `dist/` while preserving the relative `tui` to `core` import.
- Add package scripts for `build`, `check`, and the test command selected for this repository.
- Add only the build tooling needed for the package; keep OpenCode and OpenTUI packages as peer dependencies.
- Add an `engines.opencode` range compatible with the TUI plugin API used by this package.

### 2. Define package entry points

- Change `package.json` exports so the TUI subpath resolves to `./dist/tui.js` for ESM imports.
- Keep the package target-exclusive: expose the TUI entry point only and do not restore a server plugin export.
- Include `dist/`, `README.md`, and `LICENSE` in the published files list; exclude TypeScript source and copy-install scripts unless they remain explicitly supported developer tooling.
- Verify that `dist/tui.js` default-exports the existing `{ id: "codex-usage", tui }` module and that its import resolves to `dist/core.js`.

### 3. Replace the copy installer

- Remove `scripts/install.mjs`, `scripts/install.ps1`, and the `bin` field because OpenCode itself will resolve and load the configured npm package.
- Do not modify a user's `tui.json` from package code. Configuration ownership stays with the user and OpenCode.
- Remove installer-specific source paths and copy-target assumptions from the repository.

### 4. Update documentation

- Replace the `npx` and source-copy installation sections in `README.md` with the `tui.json` configuration snippet.
- Explain that OpenCode loads TUI plugins at startup, so users must quit and restart OpenCode after editing `tui.json`.
- Document version pinning and upgrade behavior for the package spec.
- Retain the Codex login, security, opt-out, usage-refresh, and internal endpoint documentation.
- Add a local-development section using the verified local package reference or tarball workflow.

### 5. Add automated verification

- Test the compiled `dist/tui.js` import to confirm it returns the expected plugin module ID and `tui` function.
- Test that `dist/tui.js` can resolve its compiled `core.js` dependency without source files present.
- Run the type check, test suite, and build before packaging.
- Run `npm pack --dry-run` and inspect the tarball contents to ensure it contains only the runtime files needed by OpenCode.
- In an isolated OpenCode config directory, add the package spec to `tui.json`, start OpenCode, and confirm the Codex Usage sidebar section loads without copied files.

## Files Expected to Change

- `package.json`
- New TypeScript build configuration and test files
- `src/tui.ts` only if build output or module-resolution adjustments require it
- `README.md`
- Remove `scripts/install.mjs`
- Remove `scripts/install.ps1`

## Completion Criteria

- A published or packed package can be referenced directly in OpenCode's `tui.json` `plugin` array.
- OpenCode loads the `codex-usage` TUI module and resolves its core dependency from the installed package.
- No plugin source files are copied into `~/.config/opencode/plugins`.
- The package tarball contains the compiled runtime, documentation, and license, but not the retired installer path.
