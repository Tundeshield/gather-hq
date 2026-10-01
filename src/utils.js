/**
 * Normalize a phone number for consistent storage and lookup.
 * Handles Excel/Sheets stripping leading zeros from Nigerian numbers.
 */
export function normalizePhone(raw) {
  if (!raw && raw !== 0) return ''
  let p = String(raw).trim().replace(/[\s\-\(\)\.]/g, '')
  if (p.startsWith('+')) p = p.slice(1)
  // International format: 2348012345678 → 08012345678
  if (p.startsWith('234') && p.length === 13) p = '0' + p.slice(3)
  // Google Sheets / Excel dropped leading zero: 8012345678 (10 digits starting with 7,8,9)
  if (p.length === 10 && /^[789]/.test(p)) p = '0' + p
  return p
}

/**
 * Clean a value that might be "Nil", "N/A", "-", "none" etc.
 * Returns empty string for those, otherwise returns trimmed value.
 */
export function cleanOptional(val) {
  if (!val) return ''
  const s = String(val).trim()
  if (/^(nil|n\/a|none|na|-|null)$/i.test(s)) return ''
  return s
}

/**
 * Combine two name columns (e.g. Surname + First Name) into one full name.
 * Handles cases where one might be empty.
 */
export function combineName(first, second) {
  const a = String(first || '').trim()
  const b = String(second || '').trim()
  if (a && b) return a + ' ' + b
  return a || b
}
