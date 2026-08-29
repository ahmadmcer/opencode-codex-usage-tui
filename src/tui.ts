import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createElement, insert, setProp } from "@opentui/solid"
import { fetchUsage, normalizePayload, type Credits, type NormalizedWindow, type UsageFailure } from "./core.js"

const DASHBOARD_URL = "https://chatgpt.com/codex/settings/usage"
const REFRESH_MS = 60_000
const RENDER_MS = 1_000
const COLLAPSED_KV_KEY = "codex-usage.collapsed"

interface FetchState {
  status: "loading" | "ok" | "error" | "no-config" | "disabled"
  plan?: string
  windows: NormalizedWindow[]
  credits?: Credits
  resetCredits?: number
  message?: string
  lastFetch: number
}

let state: FetchState = { status: "loading", windows: [], lastFetch: 0 }
let inflight = false
let fetchRequested = true
let collapsed = true
let collapsedInitialized = false

async function fetchOnce() {
  if (!fetchRequested || inflight) return
  inflight = true
  state = { ...state, status: "loading", message: undefined }
  try {
    const result = await fetchUsage()
    if (!result.ok) {
      const status = result.reason === "disabled" ? "disabled" : result.reason === "no-config" ? "no-config" : "error"
      state = { ...state, status, message: failureMessage(result.reason, result.status), lastFetch: Date.now() }
      return
    }
    const normalized = normalizePayload(result.payload)
    if (normalized.windows.length === 0) {
      state = { ...state, status: "error", message: normalized.error ?? "usage windows missing", lastFetch: Date.now() }
      return
    }
    state = { status: "ok", lastFetch: Date.now(), ...normalized }
  } catch {
    state = { ...state, status: "error", message: "request failed", lastFetch: Date.now() }
  } finally {
    inflight = false
  }
}

function failureMessage(reason: UsageFailure, status?: number): string {
  switch (reason) {
    case "disabled": return "disabled by OPENCODE_CODEX_USAGE_DISABLED"
    case "no-config": return "auth file unavailable or invalid"
    case "unauthorized": return "token expired or unauthorized"
    case "rate-limited": return "rate limited"
    case "http-error": return `HTTP ${status ?? "error"}`
    case "unexpected-response": return "unexpected response"
    case "timeout": return "request timed out"
    case "request-failed": return "request failed"
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

function liveResetSeconds(usage: NormalizedWindow): number {
  if (!state.lastFetch) return usage.resetInSec
  return Math.max(0, usage.resetInSec - Math.floor((Date.now() - state.lastFetch) / 1000))
}

function remainingPercent(usedPercent: number): number {
  return Math.max(0, Math.min(100, 100 - usedPercent))
}

function summaryText(): string {
  const first = state.windows[0]
  if (state.status === "ok" && first) return `(${first.label} ${remainingPercent(first.usedPercent).toFixed(1)}% left)`
  if (state.status === "no-config") return "(no config)"
  if (state.status === "disabled") return "(disabled)"
  if (state.status === "error") return `(${state.message ?? "error"})`
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
    collapsed = Boolean(api.kv.get(COLLAPSED_KV_KEY, true))
    fetchRequested = true
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
          const reset = fmtReset(liveResetSeconds(usage))
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
          if (fetchRequested && (state.lastFetch === 0 || now - state.lastFetch > REFRESH_MS)) fetchOnce()

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
            setNodeText(statusVal, "run codex login to create ~/.codex/auth.json, then restart OpenCode")
          } else if (state.status === "disabled") {
            setNodeText(planVal, "")
            clearWindows()
            setNodeText(creditsVal, "")
            setNodeText(resetsVal, "")
            setNodeText(statusVal, state.message ?? "disabled")
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
          if (!collapsed) fetchRequested = true
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
        const timer = setInterval(update, RENDER_MS)
        api.lifecycle.onDispose(() => clearInterval(timer))

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
