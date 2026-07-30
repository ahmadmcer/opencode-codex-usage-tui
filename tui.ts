import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createElement, insert, setProp } from "@opentui/solid"
import { onCleanup } from "solid-js"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const CONFIG_FILE = join(homedir(), ".config", "opencode", "codex-usage.json")
const DEBUG_FILE = join(homedir(), ".config", "opencode", "codex-usage-debug.json")
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
const DASHBOARD_URL = "https://chatgpt.com/codex/settings/usage"
const REFRESH_MS = 60_000
const COLLAPSED_KV_KEY = "codex-usage.collapsed"

interface Config {
  accessToken: string
  accountId?: string
}

interface UsageWindowPayload {
  used_percent?: unknown
  limit_window_seconds?: unknown
  reset_after_seconds?: unknown
  reset_at?: unknown
}

interface UsagePayload {
  plan_type?: unknown
  rate_limit?: unknown
  additional_rate_limits?: unknown
  credits?: unknown
  rate_limit_reset_credits?: unknown
}

interface NormalizedWindow {
  label: string
  usedPercent: number
  windowSeconds: number
  resetInSec: number
  limitReached: boolean
}

interface Credits {
  hasCredits: boolean
  unlimited: boolean
  balance: string
}

interface FetchState {
  status: "loading" | "ok" | "error" | "no-config"
  plan?: string
  windows: NormalizedWindow[]
  credits?: Credits
  resetCredits?: number
  message?: string
  lastFetch: number
}

let state: FetchState = { status: "loading", windows: [], lastFetch: 0 }
let inflight = false
let collapsed = false
let collapsedInitialized = false

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function loadConfig(): Config | null {
  const envToken = process.env.OPENCODE_CODEX_ACCESS_TOKEN?.trim()
  const envAccountId = process.env.OPENCODE_CODEX_ACCOUNT_ID?.trim()
  if (envToken) return { accessToken: envToken, accountId: envAccountId || undefined }

  try {
    if (!existsSync(CONFIG_FILE)) return null
    const cfg = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"))
    const accessToken = toStringValue(cfg?.accessToken ?? cfg?.access_token)
    if (!accessToken) return null
    return {
      accessToken,
      accountId: toStringValue(cfg?.accountId ?? cfg?.account_id),
    }
  } catch {
    return null
  }
}

function resetInSeconds(window: UsageWindowPayload): number {
  const resetAfter = toNumber(window.reset_after_seconds)
  if (resetAfter !== undefined) return Math.max(0, Math.floor(resetAfter))

  const resetAt = toNumber(window.reset_at)
  if (resetAt === undefined) return 0
  const resetAtMs = resetAt > 1_000_000_000_000 ? resetAt : resetAt * 1000
  return Math.max(0, Math.floor((resetAtMs - Date.now()) / 1000))
}

function labelForWindow(seconds: number, fallback: string): string {
  if (seconds <= 6 * 3600) return "5h"
  if (seconds >= 6 * 86400 && seconds <= 8 * 86400) return "Weekly"
  if (seconds >= 27 * 86400 && seconds <= 32 * 86400) return "Monthly"
  if (seconds >= 86400) return `${Math.round(seconds / 86400)}d`
  return fallback
}

function normalizeWindow(label: string, window: unknown, limitReached: boolean): NormalizedWindow | null {
  if (!isRecord(window)) return null
  const usedPercent = toNumber(window.used_percent)
  const windowSeconds = toNumber(window.limit_window_seconds)
  if (usedPercent === undefined || windowSeconds === undefined) return null
  return {
    label: labelForWindow(windowSeconds, label),
    usedPercent,
    windowSeconds,
    resetInSec: resetInSeconds(window as UsageWindowPayload),
    limitReached,
  }
}

function normalizeRateLimit(label: string, rateLimit: unknown): NormalizedWindow[] {
  if (!isRecord(rateLimit)) return []
  const limitReached = rateLimit.limit_reached === true
  return [
    normalizeWindow(label, rateLimit.primary_window, limitReached),
    normalizeWindow(label, rateLimit.secondary_window, limitReached),
  ].filter((item): item is NormalizedWindow => Boolean(item))
}

function normalizePayload(payload: UsagePayload): Omit<FetchState, "status" | "lastFetch"> {
  const windows = normalizeRateLimit("Usage", payload.rate_limit)

  if (Array.isArray(payload.additional_rate_limits)) {
    for (const item of payload.additional_rate_limits) {
      if (!isRecord(item)) continue
      const name = toStringValue(item.limit_name) ?? toStringValue(item.metered_feature) ?? "Extra"
      for (const window of normalizeRateLimit(name, item.rate_limit)) {
        windows.push({ ...window, label: window.label === "5h" || window.label === "Weekly" ? name : window.label })
      }
    }
  }

  windows.sort((a, b) => a.windowSeconds - b.windowSeconds)

  const creditsPayload = isRecord(payload.credits) ? payload.credits : undefined
  const credits = creditsPayload
    ? {
        hasCredits: creditsPayload.has_credits === true,
        unlimited: creditsPayload.unlimited === true,
        balance: toStringValue(creditsPayload.balance) ?? "0",
      }
    : undefined

  const resetCreditsPayload = isRecord(payload.rate_limit_reset_credits) ? payload.rate_limit_reset_credits : undefined
  const resetCredits = toNumber(resetCreditsPayload?.available_count)

  return {
    plan: toStringValue(payload.plan_type) ?? "Unknown",
    windows,
    credits,
    resetCredits,
  }
}

async function fetchOnce() {
  if (inflight) return
  inflight = true
  try {
    const cfg = loadConfig()
    if (!cfg) {
      state = { ...state, status: "no-config" }
      return
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${cfg.accessToken}`,
      Referer: DASHBOARD_URL,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    if (cfg.accountId) headers["ChatGPT-Account-ID"] = cfg.accountId

    const res = await fetch(USAGE_URL, { headers })
    if (res.status === 401 || res.status === 403) {
      state = { ...state, status: "error", message: "token expired or unauthorized" }
      return
    }
    if (res.status === 429) {
      state = { ...state, status: "error", message: "rate limited" }
      return
    }
    if (!res.ok) {
      state = { ...state, status: "error", message: `HTTP ${res.status}` }
      return
    }
    if (!(res.headers.get("content-type") ?? "").includes("application/json")) {
      state = { ...state, status: "error", message: "unexpected non-JSON response" }
      return
    }

    const raw = (await res.json()) as unknown
    if (!isRecord(raw)) {
      state = { ...state, status: "error", message: "unexpected response shape" }
      return
    }

    const normalized = normalizePayload(raw as UsagePayload)
    if (normalized.windows.length === 0) {
      try {
        writeFileSync(DEBUG_FILE, JSON.stringify(raw, null, 2))
      } catch {}
      state = { ...state, status: "error", message: "parse failed, saved codex-usage-debug.json" }
      return
    }

    state = { status: "ok", lastFetch: Date.now(), ...normalized }
  } catch (e) {
    state = { ...state, status: "error", message: String((e as Error).message ?? e) }
  } finally {
    inflight = false
  }
}

function fmtReset(resetSec: number): string {
  if (!resetSec || resetSec < 0) return ""
  const days = Math.floor(resetSec / 86400)
  const hours = Math.floor((resetSec % 86400) / 3600)
  const mins = Math.floor((resetSec % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function fmtPct(pct: number): string {
  return `${pct.toFixed(1).padStart(5)}%`
}

function remainingPercent(usedPercent: number): number {
  return Math.max(0, Math.min(100, 100 - usedPercent))
}

function summaryText(): string {
  const first = state.windows[0]
  if (state.status === "ok" && first) return `(${first.label} ${remainingPercent(first.usedPercent).toFixed(1)}% left)`
  if (state.status === "no-config") return "(no config)"
  if (state.status === "error") return "(error)"
  return "(...)"
}

function setNodeText(node: any, text: string) {
  insert(node, null)
  insert(node, [text])
}

function el(tag: string, props: Record<string, unknown>, children: any[] = []): any {
  const node = createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) setProp(node, key, value)
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) insert(node, child)
  }
  return node
}

function txt(props: Record<string, unknown>, children: any[] = []): any {
  return el("text", props, children)
}

function box(props: Record<string, unknown>, children: any[] = []): any {
  return el("box", props, children)
}

function valNode(style: Record<string, unknown>): any {
  return txt(style, [""])
}

const tui: TuiPlugin = async (api) => {
  if (!collapsedInitialized) {
    collapsed = Boolean(api.kv.get(COLLAPSED_KV_KEY, false))
    collapsedInitialized = true
  }

  api.slots.register({
    order: 160,
    slots: {
      sidebar_content() {
        const theme = api.theme.current as any
        const muted = theme.textMuted
        const normal = theme.text
        const valStyle = { fg: muted }

        const headerTitle = valNode({ bold: true, fg: normal })
        const headerSummary = valNode(valStyle)
        const planVal = valNode(valStyle)
        const creditsVal = valNode(valStyle)
        const resetsVal = valNode(valStyle)
        const statusVal = valNode(valStyle)

        function usageBlock() {
          const label = valNode({ fg: muted })
          const pct = valNode(valStyle)
          const reset = valNode(valStyle)
          const block = box({ flexDirection: "column", width: "100%" }, [
            box({ flexDirection: "row", width: "100%", justifyContent: "space-between" }, [label, pct]),
            box({ flexDirection: "row", width: "100%", justifyContent: "flex-end" }, [reset]),
          ])
          return { block, label, pct, reset }
        }

        const primary = usageBlock()
        const secondary = usageBlock()
        const extraOne = usageBlock()
        const extraTwo = usageBlock()

        function setUsageWindow(view: ReturnType<typeof usageBlock>, usage: NormalizedWindow | undefined) {
          setProp(view.block, "visible", Boolean(usage))
          if (!usage) {
            setNodeText(view.label, "")
            setNodeText(view.pct, "")
            setNodeText(view.reset, "")
            return
          }
          const reset = fmtReset(usage.resetInSec)
          setNodeText(view.label, usage.label)
          setNodeText(view.pct, `${fmtPct(remainingPercent(usage.usedPercent))} left${usage.limitReached ? " exhausted" : ""}`)
          setNodeText(view.reset, reset ? `reset ${reset}` : "")
        }

        function clearWindows() {
          setUsageWindow(primary, undefined)
          setUsageWindow(secondary, undefined)
          setUsageWindow(extraOne, undefined)
          setUsageWindow(extraTwo, undefined)
        }

        function update() {
          const now = Date.now()
          if (state.lastFetch === 0 || now - state.lastFetch > REFRESH_MS) fetchOnce()

          setNodeText(headerTitle, collapsed ? "▶ Codex Usage" : "▼ Codex Usage")
          setNodeText(headerSummary, collapsed ? ` ${summaryText()}` : "")
          setProp(headerSummary, "visible", collapsed)

          if (state.status === "ok") {
            const windows = state.windows
            setNodeText(planVal, (state.plan ?? "Unknown").toUpperCase())
            setUsageWindow(primary, windows[0])
            setUsageWindow(secondary, windows[1])
            setUsageWindow(extraOne, windows[2])
            setUsageWindow(extraTwo, windows[3])
            setNodeText(
              creditsVal,
              state.credits ? (state.credits.hasCredits ? (state.credits.unlimited ? "unlimited" : state.credits.balance) : "none") : "",
            )
            setNodeText(resetsVal, state.resetCredits === undefined ? "" : `${state.resetCredits} available`)
            setNodeText(statusVal, "")
          } else if (state.status === "no-config") {
            setNodeText(planVal, "")
            clearWindows()
            setNodeText(creditsVal, "")
            setNodeText(resetsVal, "")
            setNodeText(statusVal, `set OPENCODE_CODEX_ACCESS_TOKEN\nor ${CONFIG_FILE}\n${DASHBOARD_URL}`)
          } else if (state.status === "error") {
            setNodeText(planVal, "")
            clearWindows()
            setNodeText(creditsVal, "")
            setNodeText(resetsVal, "")
            setNodeText(statusVal, `${state.message ?? "error"}\n${DASHBOARD_URL}`)
          } else {
            setNodeText(planVal, "")
            clearWindows()
            setNodeText(creditsVal, "")
            setNodeText(resetsVal, "")
            setNodeText(statusVal, "loading")
          }
        }

        function toggle() {
          collapsed = !collapsed
          api.kv.set(COLLAPSED_KV_KEY, collapsed)
          setProp(body, "visible", !collapsed)
          update()
        }

        const header = box({ flexDirection: "row", width: "100%", onMouseUp: () => toggle() }, [headerTitle, headerSummary])
        const body = box({ flexDirection: "column", width: "100%", visible: !collapsed }, [
          box({ flexDirection: "row", width: "100%", justifyContent: "space-between" }, [txt({ fg: muted }, ["Plan"]), planVal]),
          primary.block,
          secondary.block,
          extraOne.block,
          extraTwo.block,
          box({ flexDirection: "row", width: "100%", justifyContent: "space-between" }, [txt({ fg: muted }, ["Credits"]), creditsVal]),
          box({ flexDirection: "row", width: "100%", justifyContent: "space-between" }, [txt({ fg: muted }, ["Resets"]), resetsVal]),
          statusVal,
        ])
        const root = box({ flexDirection: "column", width: "100%" }, [header, body])

        update()
        const timer = setInterval(update, 2000)
        onCleanup(() => clearInterval(timer))

        return root
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "codex-usage",
  tui,
}

export default plugin
