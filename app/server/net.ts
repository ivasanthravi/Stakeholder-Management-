// Client IP for rate limiting and audit. X-Forwarded-For is client-controlled except for the entries appended by our
// own proxies, so the left-most value can't be trusted. Configuration decides which entry is real:
//   CLIENT_IP_HEADER  a header set by the platform's edge that clients can't forge (e.g. x-real-ip, fly-client-ip)
//   TRUSTED_PROXY_HOPS how many proxies append to X-Forwarded-For (default 1: take the right-most entry)
// Without a proxy (local development) there is no header and the address is reported as "local".
export interface IpConfig { header?: string; hops?: number }

export function ipConfig(env: Record<string, unknown>): IpConfig {
  return { header: (env.CLIENT_IP_HEADER as string | undefined)?.toLowerCase() || undefined, hops: Math.max(1, Number(env.TRUSTED_PROXY_HOPS) || 1) }
}

export function clientIp(headers: Headers, cfg: IpConfig): string {
  if (cfg.header) {
    const v = headers.get(cfg.header)?.split(',')[0]?.trim()
    if (v) return v
  }
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const chain = xff.split(',').map(s => s.trim()).filter(Boolean)
    // Each trusted proxy appends the address it received from; the client is `hops` entries from the right.
    return chain[Math.max(0, chain.length - (cfg.hops ?? 1))] ?? 'local'
  }
  return 'local'
}
