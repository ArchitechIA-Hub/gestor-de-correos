"use client";

import { useEffect, useRef } from "react";
import { setEmailReadState } from "@/app/actions/mark-email-read";

/**
 * Marca el correo como leído al abrir su detalle. Es un client component a
 * propósito: hacerlo en el render RSC lo dispararía también durante el
 * prefetch de <Link> (marcaría correos leídos con solo pasar el ratón).
 * El efecto solo corre en una navegación real.
 */
export function AutoMarkRead({ emailId, alreadyRead }: { emailId: string; alreadyRead: boolean }) {
  const done = useRef(false);

  useEffect(() => {
    if (alreadyRead || done.current) return;
    done.current = true;
    void setEmailReadState(emailId, true);
  }, [emailId, alreadyRead]);

  return null;
}
