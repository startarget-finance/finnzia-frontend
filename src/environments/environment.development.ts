/**
 * Somente `ng serve` / build `development` (substitui environment.ts via angular.json).
 * Variável GOOGLE_OAUTH_CLIENT_ID no ambiente sempre tem prioridade (não precisa editar este arquivo).
 */
const LOCAL_GOOGLE_OAUTH_CLIENT_ID_FALLBACK =
  '850747572789-v5k9366ujt94ln0m5jgg4vc59j4s1sc1.apps.googleusercontent.com';

export const environment = {
  production: false,
  googleOAuthClientId:
    typeof process !== 'undefined' && process.env['GOOGLE_OAUTH_CLIENT_ID']
      ? String(process.env['GOOGLE_OAUTH_CLIENT_ID']).trim()
      : LOCAL_GOOGLE_OAUTH_CLIENT_ID_FALLBACK,
};
