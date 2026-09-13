import assert from "node:assert/strict"
import test from "node:test"
import { normalizePayload } from "../dist/core.js"

test("normalization preserves provenance, sorting, relabeling and existing values", () => {
  const result = normalizePayload({
    plan_type: " plus ",
    rate_limit: {
      limit_reached: true,
      primary_window: { used_percent: "125", limit_window_seconds: 604800, reset_after_seconds: 90.9 },
      secondary_window: { used_percent: -5, limit_window_seconds: 18000, reset_after_seconds: -1 },
    },
    additional_rate_limits: [{
      limit_name: " Extra quota ",
      rate_limit: {
        primary_window: { used_percent: 25.5, limit_window_seconds: 3600 },
        secondary_window: { used_percent: 40, limit_window_seconds: 604800 },
      },
    }],
    credits: { has_credits: true, unlimited: false, balance: " 12 " },
    rate_limit_reset_credits: { available_count: "2" },
  })
  assert.deepEqual(result, {
    plan: "plus",
    windows: [
      { source: "additional", role: "primary", label: "Extra quota", usedPercent: 25.5, windowSeconds: 3600, resetInSec: 0, limitReached: false },
      { source: "main", role: "secondary", label: "5h", usedPercent: 0, windowSeconds: 18000, resetInSec: 0, limitReached: true },
      { source: "main", role: "primary", label: "Weekly", usedPercent: 100, windowSeconds: 604800, resetInSec: 90, limitReached: true },
      { source: "additional", role: "secondary", label: "Extra quota", usedPercent: 40, windowSeconds: 604800, resetInSec: 0, limitReached: false },
    ],
    credits: { hasCredits: true, unlimited: false, balance: "12" },
    resetCredits: 2,
  })
})

test("absolute reset seconds and milliseconds retain the existing countdown", t => {
  t.mock.method(Date, "now", () => 1_800_000_000_000)
  const { windows } = normalizePayload({ rate_limit: {
    primary_window: { used_percent: 1, limit_window_seconds: 2592000, reset_at: 1_800_000_120 },
    secondary_window: { used_percent: 2, limit_window_seconds: 172800, reset_at: 1_800_000_120_000 },
  } })
  assert.deepEqual(windows.map(window => [window.label, window.resetInSec]), [["2d", 120], ["Monthly", 120]])
})

test("empty or invalid windows retain normalization errors", () => {
  assert.deepEqual(normalizePayload({}), { windows: [], error: "rate_limit missing" })
  assert.deepEqual(normalizePayload({ rate_limit: {} }), { windows: [], error: "usage windows missing" })
  for (const primary_window of [null, {}, { used_percent: "bad", limit_window_seconds: 1 }, { used_percent: 5, limit_window_seconds: -1 }]) {
    assert.deepEqual(normalizePayload({ rate_limit: { primary_window } }), { windows: [], error: "usage windows missing" })
  }
})
