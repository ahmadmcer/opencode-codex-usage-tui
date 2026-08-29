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
- Supports disabling requests with `OPENCODE_CODEX_USAGE_DISABLED=true`

## Install

Add the published package to OpenCode's TUI configuration:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-codex-usage-tui@1.3.3"]
}
```

OpenCode resolves the npm package and loads its `./tui` entry point directly. No files are copied into the OpenCode configuration directory. Pin the version for reproducible setups, or omit the version when you want OpenCode to resolve the latest release.

For local development, build and pack the project:

```powershell
npm install
npm run check
npm pack
```

Then reference the generated tarball in `tui.json` using the local package spec supported by your OpenCode installation. Restart OpenCode after editing `tui.json`; TUI plugins are loaded at startup.

For example, a local file URL can be used when supported:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["file:///absolute/path/to/opencode-codex-usage-tui-1.3.3.tgz"]
}
```

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
