param(
  [string]$ConfigDir = "$HOME\.config\opencode"
)

$ErrorActionPreference = "Stop"

$source = Join-Path $PSScriptRoot "tui.ts"
$pluginDir = Join-Path $ConfigDir "plugins"
$target = Join-Path $pluginDir "codex-usage-tui.ts"
$tuiJson = Join-Path $ConfigDir "tui.json"
$pluginEntry = "./plugins/codex-usage-tui.ts"

if (!(Test-Path -LiteralPath $source)) {
  throw "Missing source file: $source"
}

if (!(Test-Path -LiteralPath $ConfigDir)) {
  New-Item -ItemType Directory -Path $ConfigDir | Out-Null
}

if (!(Test-Path -LiteralPath $pluginDir)) {
  New-Item -ItemType Directory -Path $pluginDir | Out-Null
}

Copy-Item -LiteralPath $source -Destination $target -Force

if (Test-Path -LiteralPath $tuiJson) {
  $raw = Get-Content -LiteralPath $tuiJson -Raw
  $config = $raw | ConvertFrom-Json
} else {
  $config = [pscustomobject]@{
    '$schema' = "https://opencode.ai/tui.json"
  }
}

if ($null -eq $config.plugin) {
  $config | Add-Member -NotePropertyName plugin -NotePropertyValue @()
}

$plugins = @($config.plugin)
if ($plugins -notcontains $pluginEntry) {
  $config.plugin = @($plugins + $pluginEntry)
}

$json = $config | ConvertTo-Json -Depth 20
Set-Content -LiteralPath $tuiJson -Value $json -Encoding UTF8

Write-Host "Installed Codex Usage TUI plugin: $target"
Write-Host "Registered in: $tuiJson"
Write-Host "Restart OpenCode for the change to take effect."
