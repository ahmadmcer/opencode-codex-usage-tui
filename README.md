# opencode-codex-usage

OpenCode TUI plugin that shows remaining ChatGPT Codex usage limits in the sidebar.

It reads the same internal Codex usage data shown by the ChatGPT Codex usage dashboard and renders remaining limit percentages, reset timers, credits, and banked reset credits.

## Features

- Shows remaining Codex limits, not used percentage
- Displays the shortest window first, typically the shared 5-hour Plus limit
- Displays reset timers below each usage row and aligned to the right
- Shows the ChatGPT plan in uppercase, for example `PLUS`
- Supports collapsed and expanded sidebar display
- Automatically reads Codex CLI auth from `~/.codex/auth.json`
- Supports token override from environment variables or `~/.config/opencode/codex-usage.json`

## Install

Install with `npx` from GitHub:

```powershell
npx github:ahmadmcer/opencode-codex-usage
```

Do not use `npx opencode-codex-usage`; that unscoped npm package name belongs to another project.

If this package is published to npm later, use the scoped package name:

```powershell
npx @ahmadmcer/opencode-codex-usage
```

For local development from this folder:

```powershell
node .\install.mjs
```

PowerShell-only local installer alternative:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

The installer copies `tui.ts` to:

```text
~/.config/opencode/plugins/codex-usage-tui.ts
```

It also adds `./plugins/codex-usage-tui.ts` to `~/.config/opencode/tui.json` if it is not already registered.

Restart OpenCode after installing. TUI plugins are loaded at startup.

## Configure Auth

Default flow:

```powershell
codex login
```

The plugin automatically reads the Codex CLI token from:

```text
~/.codex/auth.json
```

If you use a custom Codex home, set `CODEX_HOME`; the plugin will read:

```text
$env:CODEX_HOME\auth.json
```

Manual override for a temporary shell session:

```powershell
$env:OPENCODE_CODEX_ACCESS_TOKEN = "<access_token>"
$env:OPENCODE_CODEX_ACCOUNT_ID = "<optional_account_id>"
```

Persistent override alternative:

```json
{
  "accessToken": "<access_token>",
  "accountId": "<optional_account_id>"
}
```

Save it as:

```text
~/.config/opencode/codex-usage.json
```

Manual auth values override `~/.codex/auth.json`. `accountId` is optional for many personal ChatGPT accounts. If your ChatGPT login has multiple workspaces/accounts, include it.

## Getting A Codex Token

After logging in with Codex CLI, credentials are normally stored in:

```text
~/.codex/auth.json
```

The plugin reads `tokens.access_token` and a few compatible fallback fields. If the token expires, run `codex login` again and restart OpenCode if needed.

Do not commit or share `auth.json`, `codex-usage.json`, or access tokens.

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
