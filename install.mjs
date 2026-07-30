#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { homedir } from "node:os"

const __dirname = dirname(fileURLToPath(import.meta.url))
const pluginEntry = "./plugins/codex-usage-tui.ts"

function parseArgs(argv) {
  const args = { configDir: join(homedir(), ".config", "opencode") }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--config-dir") {
      const value = argv[++i]
      if (!value) throw new Error("--config-dir requires a value")
      args.configDir = resolve(value)
    } else if (arg.startsWith("--config-dir=")) {
      args.configDir = resolve(arg.slice("--config-dir=".length))
    } else if (arg === "--help" || arg === "-h") {
      args.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

function printHelp() {
  console.log(`Install @ahmadmcer/opencode-codex-usage TUI plugin\n\nUsage:\n  npx github:ahmadmcer/opencode-codex-usage\n  npx github:ahmadmcer/opencode-codex-usage --config-dir <path>\n`)
}

function readJson(path) {
  if (!existsSync(path)) return { $schema: "https://opencode.ai/tui.json", plugin: [] }
  return JSON.parse(readFileSync(path, "utf8"))
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function install(configDir) {
  const source = join(__dirname, "tui.ts")
  const pluginDir = join(configDir, "plugins")
  const target = join(pluginDir, "codex-usage-tui.ts")
  const tuiJson = join(configDir, "tui.json")

  if (!existsSync(source)) throw new Error(`Missing source file: ${source}`)
  mkdirSync(pluginDir, { recursive: true })
  copyFileSync(source, target)

  const config = readJson(tuiJson)
  const plugins = Array.isArray(config.plugin) ? config.plugin : config.plugin ? [config.plugin] : []
  if (!plugins.includes(pluginEntry)) config.plugin = [...plugins, pluginEntry]
  else config.plugin = plugins
  writeJson(tuiJson, config)

  console.log(`Installed Codex Usage TUI plugin: ${target}`)
  console.log(`Registered in: ${tuiJson}`)
  console.log("Restart OpenCode for the change to take effect.")
}

try {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) printHelp()
  else install(args.configDir)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
