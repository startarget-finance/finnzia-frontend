/**
 * Produção (`ng build`). Client ID do Google: use GOOGLE_OAUTH_CLIENT_ID no CI/deploy — não deixe fallback aqui.
 */
export const environment = {
  production: true,
  googleOAuthClientId:
    typeof process !== 'undefined' && process.env['GOOGLE_OAUTH_CLIENT_ID']
      ? String(process.env['GOOGLE_OAUTH_CLIENT_ID']).trim()
      : '',
  /** Pluggy Connect: exibir conectores Sandbox no widget (desligue em produção se quiser só contas reais). */
  pluggyIncludeSandbox:
    typeof process !== 'undefined' && process.env['PLUGGY_INCLUDE_SANDBOX'] === 'true',
};
