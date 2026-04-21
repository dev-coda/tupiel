/**
 * Resolves the API base URL for HttpClient and window.open links.
 *
 * - `window.APP_CONFIG.apiUrl` when set (Docker / deployed): may be `/api` or an absolute URL.
 * - Otherwise `/api` (same origin). With `ng serve`, `proxy.conf.json` forwards `/api` to the
 *   Express backend — use that instead of hard-coding a port so traffic does not hit another
 *   process bound to :3000 (e.g. Next.js). `proxy.conf.json` targets port 3000 by default.
 * - Optional dev override: `localStorage.setItem('tupiel_api_base_url', 'http://127.0.0.1:3000/api')`
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '/api';
  }

  const raw = (window as unknown as { APP_CONFIG?: { apiUrl?: string } }).APP_CONFIG
    ?.apiUrl;
  if (raw != null && String(raw).trim() !== '') {
    return String(raw).replace(/\/+$/, '');
  }

  try {
    const dev = localStorage.getItem('tupiel_api_base_url');
    if (dev != null && dev.trim() !== '') {
      return dev.replace(/\/+$/, '');
    }
  } catch {
    /* ignore */
  }

  return '/api';
}
