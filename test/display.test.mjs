import assert from "node:assert/strict"
import test from "node:test"
import { normalizePayload } from "../dist/core.js"
import { parseDisplayOptions, selectDisplayWindows } from "../dist/display.js"

const windowPayload = seconds => ({ used_percent: 20, limit_window_seconds: seconds })
const allSections = ["plan", "windows", "credits", "resets"]

test("defaults and explicit all retain the first four sorted windows; primary searches beyond the cap", () => {
  const { windows } = normalizePayload({
    rate_limit: { primary_window: windowPayload(604800), secondary_window: windowPayload(18000) },
    additional_rate_limits: [
      { rate_limit: { primary_window: windowPayload(100), secondary_window: windowPayload(200) } },
      { rate_limit: { primary_window: windowPayload(300), secondary_window: windowPayload(400) } },
    ],
  })
  const before = structuredClone(windows)
  windows.forEach(Object.freeze)
  Object.freeze(windows)
  for (const input of [undefined, {}, { windows: "all" }]) {
    const parsed = parseDisplayOptions(input)
    assert.deepEqual(parsed, { options: { windows: "all", show: allSections }, diagnostics: [] })
    const selected = selectDisplayWindows(windows, parsed.options.windows)
    assert.deepEqual(selected, windows.slice(0, 4))
    assert.notEqual(selected, windows)
  }
  const parsed = parseDisplayOptions({ windows: "primary" })
  assert.deepEqual(parsed, { options: { windows: "primary", show: allSections }, diagnostics: [] })
  assert.deepEqual(selectDisplayWindows(windows, parsed.options.windows), [windows[5]])
  assert.deepEqual(windows, before)
})

test("identical labels and durations do not define primary identity", () => {
  const { windows } = normalizePayload({
    rate_limit: { primary_window: windowPayload(18000), secondary_window: windowPayload(18000) },
    additional_rate_limits: [{ limit_name: "5h", rate_limit: { primary_window: windowPayload(18000), secondary_window: windowPayload(18000) } }],
  })
  const reordered = [windows[2], windows[1], windows[3], windows[0]]
  assert.deepEqual(selectDisplayWindows(reordered, "primary"), [windows[0]])
})

test("missing or invalid main primary never substitutes another window", () => {
  for (const primary_window of [undefined, null, {}, { used_percent: "invalid", limit_window_seconds: 18000 }, { used_percent: 20, limit_window_seconds: -1 }]) {
    const result = normalizePayload({
      rate_limit: { primary_window, secondary_window: windowPayload(18000) },
      additional_rate_limits: [{ rate_limit: { primary_window: windowPayload(100) } }],
    })
    assert.equal(result.error, undefined)
    assert.equal(result.windows.length, 2)
    assert.deepEqual(selectDisplayWindows(result.windows, "primary"), [])
  }
  assert.deepEqual(selectDisplayWindows([], "primary"), [])
  assert.deepEqual(selectDisplayWindows([], "all"), [])
})

test("invalid option values fall back with safe actionable diagnostics", () => {
  for (const windows of ["secret-invalid-value", "PRIMARY", " all ", 1, true, false, null, undefined, [], {}]) {
    const result = parseDisplayOptions({ windows })
    assert.deepEqual(result.options, { windows: "all", show: allSections })
    assert.equal(result.diagnostics.length, 1)
    assert.match(result.diagnostics[0], /Set windows to "all" or "primary"/)
    assert.ok(!result.diagnostics.join(" ").includes("secret-invalid-value"))
  }
})

test("unknown keys are ignored without overriding valid options; diagnostics aggregate safely", () => {
  const input = Object.freeze({ windows: "primary", "secret-key": "secret-value", typo: true })
  const result = parseDisplayOptions(input)
  assert.deepEqual(result.options, { windows: "primary", show: allSections })
  assert.equal(result.diagnostics.length, 1)
  assert.match(result.diagnostics[0], /Remove unknown options/)
  assert.match(result.diagnostics[0], /only "windows" and "show"/)
  assert.ok(!result.diagnostics.join(" ").includes("secret"))
  const invalid = parseDisplayOptions({ windows: null, typo: true })
  assert.deepEqual(invalid.options, { windows: "all", show: allSections })
  assert.equal(invalid.diagnostics.length, 2)
  assert.deepEqual(parseDisplayOptions({ typo: true }).options, { windows: "all", show: allSections })
})

test("show is an independent allowlist with empty, subsets, deduplication and fixed order", () => {
  for (const [show, expected] of [
    [[], []],
    [["windows"], ["windows"]],
    [["resets", "credits", "plan", "credits"], ["plan", "credits", "resets"]],
    [[...allSections].reverse(), allSections],
  ]) {
    const input = Object.freeze({ windows: "primary", show: Object.freeze(show) })
    assert.deepEqual(parseDisplayOptions(input), { options: { windows: "primary", show: expected }, diagnostics: [] })
  }
  assert.deepEqual(parseDisplayOptions({ show: ["credits"] }), { options: { windows: "all", show: ["credits"] }, diagnostics: [] })
  assert.deepEqual(parseDisplayOptions({ windows: false, show: [] }).options, { windows: "all", show: [] })
})

test("invalid show types default all; mixed arrays retain only valid entries without leaking values", () => {
  for (const show of [undefined, null, false, 1, {}, "secret-value"]) {
    const result = parseDisplayOptions({ windows: "primary", show })
    assert.deepEqual(result.options, { windows: "primary", show: allSections })
    assert.equal(result.diagnostics.length, 1)
    assert.match(result.diagnostics[0], /Set show to an array/)
    assert.ok(!result.diagnostics.join(" ").includes("secret"))
  }
  for (const [show, expected] of [
    [["resets", "secret-value", null, 2, {}, ["windows"], "plan", "plan"], ["plan", "resets"]],
    [["secret-value", false], []],
  ]) {
    const result = parseDisplayOptions({ show })
    assert.deepEqual(result.options, { windows: "all", show: expected })
    assert.equal(result.diagnostics.length, 1)
    assert.match(result.diagnostics[0], /invalid entries ignored/)
    assert.ok(!result.diagnostics.join(" ").includes("secret"))
  }
  const invalid = parseDisplayOptions({ windows: null, show: null, "secret-key": true })
  assert.deepEqual(invalid.options, { windows: "all", show: allSections })
  assert.equal(invalid.diagnostics.length, 3)
  assert.ok(!invalid.diagnostics.join(" ").includes("secret"))
})

test("invalid options objects use full defaults and parsing does not share mutable allowlists", () => {
  for (const input of [null, false, 1, "secret-value", []]) {
    const result = parseDisplayOptions(input)
    assert.deepEqual(result.options, { windows: "all", show: allSections })
    assert.equal(result.diagnostics.length, 1)
    assert.match(result.diagnostics[0], /options object.*windows.*show/)
    assert.ok(!result.diagnostics.join(" ").includes("secret"))
  }
  const show = ["plan"]
  const parsed = parseDisplayOptions({ show })
  show.push("credits")
  assert.deepEqual(parsed.options.show, ["plan"])
  parseDisplayOptions().options.show.pop()
  assert.deepEqual(parseDisplayOptions().options.show, allSections)
})
