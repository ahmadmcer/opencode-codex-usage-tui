import type { NormalizedWindow } from "./core.js"

const DISPLAY_SECTIONS = ["plan", "windows", "credits", "resets"] as const
type DisplaySection = typeof DISPLAY_SECTIONS[number]
export interface DisplayOptions { windows: "all" | "primary"; show: DisplaySection[] }

// The host validates tuple structure; this boundary owns option semantics.
export function parseDisplayOptions(input: unknown): { options: DisplayOptions; diagnostics: string[] } {
  const options: DisplayOptions = { windows: "all", show: [...DISPLAY_SECTIONS] }
  const diagnostics: string[] = []
  if (input === undefined) return { options, diagnostics }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    diagnostics.push('Use an options object with "windows" ("all" or "primary") and/or "show" (an array of "plan", "windows", "credits", "resets"); using defaults.')
    return { options, diagnostics }
  }
  const raw = input as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(raw, "windows")) {
    if (raw.windows === "all" || raw.windows === "primary") options.windows = raw.windows
    else diagnostics.push('Set windows to "all" or "primary"; using "all".')
  }
  if (Object.prototype.hasOwnProperty.call(raw, "show")) {
    const show = raw.show
    if (!Array.isArray(show)) diagnostics.push('Set show to an array of "plan", "windows", "credits", "resets"; showing all sections.')
    else {
      // Canonical order and deduplication: this is an allowlist, not a layout.
      options.show = DISPLAY_SECTIONS.filter(section => show.includes(section))
      if (show.some(section => !DISPLAY_SECTIONS.includes(section))) diagnostics.push('Use only "plan", "windows", "credits", "resets" in show; invalid entries ignored.')
    }
  }
  if (Object.keys(raw).some(key => key !== "windows" && key !== "show")) diagnostics.push('Remove unknown options; only "windows" and "show" are supported.')
  return { options, diagnostics }
}

export function selectDisplayWindows(windows: readonly NormalizedWindow[], mode: DisplayOptions["windows"]): NormalizedWindow[] {
  if (mode === "all") return windows.slice(0, 4)
  const primary = windows.find(window => window.source === "main" && window.role === "primary")
  return primary ? [primary] : []
}
