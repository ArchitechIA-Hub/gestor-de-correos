/**
 * Un error de gaxios/googleapis (p. ej. al refrescar el access token) trae
 * `config`/`response` con el cuerpo crudo de la request — que para el
 * endpoint de token incluye el `refresh_token` en texto plano. El
 * `errorRedactor` de gaxios tapa `client_secret`/`grant_type` pero NO
 * `refresh_token` (visto en vivo: quedó expuesto en los logs de la demo al
 * fallar con `invalid_grant`). Nunca pasar el error crudo a console.error ni
 * dejarlo propagar sin pasar por esta función — solo estos dos campos del
 * cuerpo de respuesta de Google son seguros de loguear.
 */
export function describeGoogleApiError(error: unknown): string {
  if (error && typeof error === "object") {
    const err = error as {
      message?: string;
      response?: { data?: { error?: string; error_description?: string } };
    };
    const code = err.response?.data?.error;
    const description = err.response?.data?.error_description;
    if (code) return description ? `${code}: ${description}` : code;
    if (typeof err.message === "string") return err.message;
  }
  return "Error desconocido de la API de Google";
}
