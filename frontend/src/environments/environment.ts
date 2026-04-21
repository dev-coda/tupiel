/**
 * Default Angular environment file used for **production** builds
 * (`ng build` / `ng build --configuration production`).
 *
 * - `apiUrl: '/api'` — same-origin API (nginx or platform proxy). Docker injects
 *   `window.APP_CONFIG.apiUrl` at container start (see frontend Dockerfile); that
 *   value takes precedence in AuthService / ApiService when present.
 *
 * Local dev uses `environment.development.ts` via `angular.json` **development**
 * fileReplacements only — it is never included in production or Docker images.
 */
export const environment = {
  production: true,
  apiUrl: '/api',
};
