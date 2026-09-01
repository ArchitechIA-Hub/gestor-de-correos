/** Etiquetas visibles de cada acción de auditoría. Usadas por /audit y por el
 * historial por correo en /inbox/[id]. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CLASSIFY: "Clasificación",
  DETECT_COMMITMENT: "Compromiso detectado",
  MARK_URGENT: "Marcado urgente",
  CREATE_CALENDAR_EVENT: "Evento de calendario creado",
  SEND_WHATSAPP_NOTIFICATION: "Notificación WhatsApp",
  GENERATE_DRAFT: "Borrador generado",
  EDIT_DRAFT: "Borrador editado",
  APPROVE_DRAFT: "Borrador aprobado/descartado",
  TOGGLE_EXTRA: "Extra activado/desactivado",
  SEND_DIGEST: "Informe enviado",
  REVERT: "Reversión",
  MARK_MARKETING: "Marcado como marketing",
  CATEGORIZE: "Movido a/desde Finanzas",
  MANAGE_MAIL_ACCOUNT: "Cuenta de correo gestionada",
  UPDATE_COMMITMENT_STATUS: "Estado de compromiso actualizado",
  CREATE_URGENT_ALERT: "Alerta push creada",
  IMPORT_EMAIL: "Correo importado de Gmail",
  SEND_DRAFT: "Respuesta enviada",
};
