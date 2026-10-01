/**
 * Normalize a phone number for consistent storage and lookup.
 * Handles Excel stripping leading zeros from Nigerian numbers.
 * 
 * Examples:
 *   "08012345678"  → "08012345678"
 *   "8012345678"   → "08012345678"  (Excel stripped the zero)
 *   "+2348012345678" → "08012345678" (international format)
 *   "2348012345678"  → "08012345678" (no plus)
 *   " 080 123 456 78" → "08012345678" (spaces)
 */
export function normalizePhone(raw) {
  if (!raw && raw !== 0) return ''
  let p = String(raw).trim().replace(/[\s\-\(\)\.]/g, '')

  // Remove leading +
  if (p.startsWith('+')) p = p.slice(1)

  // International format: 2348012345678 → 08012345678
  if (p.startsWith('234') && p.length === 13) {
    p = '0' + p.slice(3)
  }

  // Excel dropped leading zero: 8012345678 (10 digits starting with 7,8,9)
  if (p.length === 10 && /^[789]/.test(p)) {
    p = '0' + p
  }

  return p
}
