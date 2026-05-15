/**
 * Produção (`ng build`). Client ID do Google: use GOOGLE_OAUTH_CLIENT_ID no CI/deploy — não deixe fallback aqui.
 */
export const environment = {
  production: true,
  googleOAuthClientId:
    typeof process !== 'undefined' && process.env['GOOGLE_OAUTH_CLIENT_ID']
      ? String(process.env['GOOGLE_OAUTH_CLIENT_ID']).trim()
      : '',
  /** Produção: nunca incluir conector Sandbox no widget. */
  pluggyIncludeSandbox: false,
};
