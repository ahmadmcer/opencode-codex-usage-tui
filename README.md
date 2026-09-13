# opencode-codex-usage-tui

OpenCode TUI plugin that shows remaining ChatGPT Codex usage limits in the sidebar.

It reads the same internal Codex usage data shown by the ChatGPT Codex usage dashboard and renders remaining limit percentages, reset timers, credits, and banked reset credits.

## Features

- Shows remaining Codex limits, not used percentage
- Displays the shortest window first, typically the shared 5-hour Plus limit
- Displays reset timers below each usage row and aligned to the right
- Shows the ChatGPT plan in uppercase, for example `PLUS`
- Supports collapsed and expanded sidebar display
- Automatically reads trusted Codex CLI auth from `~/.codex/auth.json`
- Continuously refreshes usage in the background
- Updates reset countdowns in realtime between API refreshes
- Supports configuring displayed sections and usage windows
- Supports disabling requests with `OPENCODE_CODEX_USAGE_DISABLED=true`

## Install

Add the package to OpenCode's TUI configuration:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-codex-usage-tui"]
}
```

OpenCode resolves the npm package and loads its `./tui` entry point directly. No files are copied into the OpenCode configuration directory. Pin the version for reproducible setups, or omit the version when you want OpenCode to resolve the latest release.

## Configuration

These display options require a build or supporting release that includes them; the older published `1.3.3` package does not include them. Add them as the second item in the plugin tuple:

| Option | Values | Default |
| --- | --- | --- |
| `windows` | `"all"` or `"primary"` | `"all"`: show up to the first four sorted windows |
| `show` | Array of `"plan"`, `"windows"`, `"credits"`, and/or `"resets"` | All four sections |

`windows: "primary"` is strict: it shows only the main API `rate_limit.primary_window`. The shortest, secondary, or additional window is not a substitute. Other quotas remain enforced but hidden. If the main primary window is missing, no fallback window is shown; plan and credit information remain available when their sections are enabled. `windows: "all"` shows up to the first four sorted windows.

`show` is an allowlist, not a layout setting. Listed sections render in the fixed order `plan`, `windows`, `credits`, `resets`; duplicates are harmless. `[]` hides all optional sections, while the header and operational statuses remain available. `resets` is the separate credit-reset row, not a countdown for each usage window. When `windows` is hidden, usage summaries and the primary-unavailable status are not exposed. Operational errors remain available.

Primary-only display example:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["opencode-codex-usage-tui", { "show": ["plan", "windows"], "windows": "primary" }]]
}
```

Replace the existing plugin entry rather than adding another one. Keep any package version pin in the first tuple element, but use a local build or supporting release that includes these options. Bare registration, empty options, and omitted `show` or `windows` retain their defaults. Invalid values and unknown option keys are reported together in one aggregated startup warning; recognized valid fields are retained. Invalid `windows` values use `"all"`; a non-array `show` uses all sections; invalid entries in a `show` array are ignored while valid entries are retained. Changes take effect after rebuilding when needed, then restarting OpenCode.

To restore the defaults, remove the whole options object (bare registration), or set `show` to all four sections and `windows` to `"all"`. Setting `windows` to `"all"` alone does not restore sections hidden by `show`.

## Development

For local development, build, test, check, and pack the project:

```powershell
npm install
npm run build
npm test
npm run check
npm pack
```

For the same local `show` workflow, reference the built module directly in `tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["file:///absolute/path/to/opencode-codex-usage-tui/dist/tui.js", { "show": ["plan", "windows"], "windows": "primary" }]]
}
```

This direct `file://` entry loads the module at `dist/tui.js`; it does not install or extract a `.tgz` tarball. Rebuilding the repository updates this direct-file installation. If you test the exact `npm pack` artifact, extract the generated tarball and target the extracted package's `dist/tui.js` instead, keeping the package's other `dist` files together:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["file:///absolute/path/to/extracted/package/dist/tui.js", { "show": ["plan", "windows"], "windows": "primary" }]]
}
```

An already extracted copy or tarball does not change when the repository is rebuilt; rebuild and replace that copy when testing it. Quit and restart OpenCode after changing `tui.json` or the loaded build so the plugin is reloaded.

### Release verification

Automated unit, build, syntax, and package checks do not verify OpenCode UI rendering or compatibility with the minimum supported host version. Before publishing, perform an isolated runtime smoke check in the target host covering tuple options, collapsed and expanded primary-window display, missing-primary and error states, and once-only warnings.

## Configure Auth

Default flow:

```powershell
codex login
```

The plugin reads the Codex CLI token from:

```text
~/.codex/auth.json
```

The file must be the regular, non-linked file created by the Codex CLI. The plugin does not support environment-token overrides, custom Codex homes, or a separate OpenCode credential file.

To disable the usage request entirely for a shell session:

```powershell
$env:OPENCODE_CODEX_USAGE_DISABLED = "true"
```

The section starts collapsed but begins fetching immediately. Reset countdowns render live, while usage data refreshes at most once per minute to avoid rate limits.

## Getting A Codex Token

After logging in with Codex CLI, credentials are normally stored in:

```text
~/.codex/auth.json
```

The plugin reads `tokens.access_token` (or `tokens.accessToken`) and an optional account ID from the token object. If the token expires, run `codex login` again and restart OpenCode if needed.

Do not commit or share `auth.json` or access tokens.

## Endpoint

This plugin calls an internal ChatGPT endpoint:

```text
https://chatgpt.com/backend-api/wham/usage
```

Because this endpoint is not a public stable API, the plugin is defensive and falls back to a short error plus the official dashboard URL if the payload changes:

```text
https://chatgpt.com/codex/settings/usage
```

## License

MIT
