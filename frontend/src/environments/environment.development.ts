/**
 * **Only** used when `ng serve` or `ng build --configuration development` runs
 * (see `angular.json` fileReplacements). Never part of Docker / production builds.
 *
 * Calls the API directly so login works even if the dev-server proxy does not
 * forward `/api` (which can surface as HTTP 404).
 */
export const environment = {
  production: false,
  apiUrl: 'http://127.0.0.1:3000/api',
};
