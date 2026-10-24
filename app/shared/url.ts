/**
 * Post-sign-in redirect targets come from the URL (`?next=`), so they're attacker-controllable. Only same-site
 * relative paths are accepted: "/x" yes; "//evil.com", "/\\evil.com", "https://…", "javascript:…" → fallback.
 */
export function safeNext(next: string | null | undefined, fallback = '/') {
  if (!next || typeof next !== 'string') return fallback
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  if (/[\u0000-\u001f]/.test(next)) return fallback
  try {
    const u = new URL(next, 'https://meridian.invalid')
    if (u.origin !== 'https://meridian.invalid') return fallback
    return u.pathname + u.search + u.hash
  } catch { return fallback }
}
