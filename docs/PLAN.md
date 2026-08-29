# Codex Usage Plugin Update Plan

## Goal

Bring this package in line with the installed implementation in:

- `C:\Users\ahmad\.config\opencode-v1\tui\codex-usage-tui.ts`
- `C:\Users\ahmad\.config\opencode-v1\tui\codex-usage-core.ts`

The update will make network and authentication handling testable, avoid requests while the sidebar section is collapsed, throttle failed requests, and restrict credential loading to a trusted Codex CLI auth file.

## Scope

### 1. Extract the core usage client

Add `src/core.ts` using the installed core module as the baseline.

- Move auth loading, request construction, timeout handling, response validation, and payload normalization from `tui.ts` into `src/core.ts`.
- Export the data types consumed by the UI: `Credits`, `NormalizedWindow`, `UsagePayload`, `UsageFailure`, and the request-result union.
- Keep the endpoint and a 15-second request timeout as named constants.
- Make `fetchUsage` accept injected configuration, fetch, timeout, and disabled-state dependencies so it can be unit-tested without real credentials or network calls.
- Classify request failures as disabled, no configuration, unauthorized, rate-limited, HTTP error, unexpected response, timeout, or generic request failure.
- Use `AbortController` for timeout cancellation, reject redirects, require a JSON content type, and safely handle invalid JSON.

### 2. Restrict and validate Codex authentication

Replace the package's environment, custom config, and `CODEX_HOME` credential fallbacks with the trusted default Codex CLI auth file policy from `src/core.ts`.

- Read only `~/.codex/auth.json`.
- Reject symbolic links, non-regular files, files with multiple hard links, and paths whose canonical location differs from the expected location.
- On non-Windows platforms, reject auth files that grant group or other permissions.
- Read only `tokens.access_token` or `tokens.accessToken`, with the optional account ID from the matching token fields.
- Add `OPENCODE_CODEX_USAGE_DISABLED=true` as an explicit opt-out before any credential or network access.
- Remove debug payload file creation so an unexpected response cannot be persisted to disk and no false "saved" status is shown.

### 3. Update the TUI module

Refactor `tui.ts` to import the core module and retain only presentation, state management, and interaction behavior.

- Change the initial state to `idle` and default the sidebar section to collapsed.
- Do not read credentials or call the usage endpoint until the user expands the section.
- Persist the collapsed state in the existing `codex-usage.collapsed` key; expanding sets a one-way fetch-requested flag for the current session.
- Record `lastFetch` for every completed result, including disabled, missing-auth, parse, and request-error states, so all retries respect `REFRESH_MS`.
- Add clear UI messages for disabled usage, unavailable or invalid auth, timeout, rate limiting, and other classified failures.
- Retain the existing plan, usage-window, credits, reset-credit, and collapsed-summary displays.
- Use the TUI lifecycle disposal hook to clear the update timer.

### 4. Harden payload normalization

Apply the installed normalizer behavior in the core module.

- Accept finite numeric strings as well as numeric JSON values.
- Reject negative limit-window durations.
- Clamp usage percentages to the `0` through `100` range before the UI calculates remaining capacity.
- Return a diagnostic error when `rate_limit` is absent or has no usable windows rather than writing the raw payload.
- Preserve current window labels, additional-rate-limit handling, sorting, credit parsing, and reset-credit parsing.

### 5. Update packaging and installation

Ensure a package installation has every module the TUI entry point imports.

- Include `src/core.ts` through the `src` directory in the `files` allowlist in `package.json`.
- Update `install.mjs` and `install.ps1` to copy `src/tui.ts` and `src/core.ts` into the configured OpenCode TUI directory.
- Keep `tui.json` registration pointed only at `./plugins/codex-usage-tui.ts`; the relative `./core.js` import resolves beside that installed TUI module.
- Bump the package version according to the repository's release policy after the behavior change is complete.

### 6. Revise documentation

Update `README.md` to describe the new security and interaction model.

- State that the plugin reads only the trusted default Codex CLI auth file created by `codex login`.
- Remove instructions for `OPENCODE_CODEX_ACCESS_TOKEN`, `OPENCODE_CODEX_ACCOUNT_ID`, `codex-usage.json`, and `CODEX_HOME` because they are no longer supported.
- Document `OPENCODE_CODEX_USAGE_DISABLED=true` and that expanding the collapsed section triggers the first request.
- Explain that the section refreshes once per minute after it has been expanded and link to the official usage dashboard for errors.

### 7. Add verification coverage

Introduce focused automated tests for the extracted core module and extend installation smoke coverage.

- Test trusted-auth validation through injected file-trust and file-read functions, including malformed input and missing tokens.
- Test disabled mode, HTTP status classification, non-JSON responses, malformed JSON, timeout, and request failures with injected fetch implementations.
- Test payload normalization for numeric strings, percentage clamping, negative windows, empty windows, and additional-rate-limit sorting.
- Verify both installers copy `core.ts` beside `codex-usage-tui.ts` and keep `tui.json` idempotently registered.
- Run the type/syntax checks, test suite, `npm pack --dry-run`, and isolated Node and PowerShell installer smoke tests before release.

## Implementation Order

1. Add the core module and its tests.
2. Refactor the TUI to consume the core API and implement lazy, throttled fetching.
3. Update package contents and both installers.
4. Update documentation and version metadata.
5. Run the complete verification set and review the package tarball contents.
