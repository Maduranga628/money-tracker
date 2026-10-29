import { supabase } from '../supabaseClient.js'

// ---------------------------------------------------------------------------
// "Month starts on day N" — the day your salary arrives. The Dashboard counts
// income and spending from that day to the day before it next month.
// The value lives in Supabase (app_settings) so it is the same on every device.
// ---------------------------------------------------------------------------

const SETTING_KEY = 'month_start_day'

const clampDay = (n) => {
  const day = Math.floor(Number(n))
  return Number.isFinite(day) ? Math.min(31, Math.max(1, day)) : 1
}

/** Reads the setting. Falls back to 1 (calendar months) if it isn't set up yet. */
export async function getMonthStartDay() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle()

  if (error || !data) return 1
  return clampDay(data.value)
}

/** Saves the setting. Returns the Supabase error (or null). */
export async function setMonthStartDay(day) {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: SETTING_KEY, value: String(clampDay(day)) }, { onConflict: 'key' })
  return error
}

// ---------------------------------------------------------------------------
// Period maths
// ---------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// The start day in a given month, shortened when the month is short
// (a start day of 31 becomes 28/29/30 in shorter months).
function startInMonth(year, month0, day) {
  const first = new Date(year, month0, 1)
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, lastDay))
}

/**
 * The period that contains `today`.
 * Returns { start, end, label } where start is inclusive, end is exclusive
 * (both 'YYYY-MM-DD'), and label is for display.
 */
export function currentPeriod(startDay, today = new Date()) {
  const day = clampDay(startDay)
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  let start = startInMonth(t.getFullYear(), t.getMonth(), day)
  if (t < start) start = startInMonth(t.getFullYear(), t.getMonth() - 1, day)
  const end = startInMonth(start.getFullYear(), start.getMonth() + 1, day)

  let label
  if (day === 1) {
    label = start.toLocaleString('default', { month: 'long', year: 'numeric' })
  } else {
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1)
    const withYear = start.getFullYear() !== last.getFullYear()
    const short = (d) => d.toLocaleDateString('default', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    })
    label = `${short(start)} – ${short(last)}`
  }

  return { start: iso(start), end: iso(end), label }
}
