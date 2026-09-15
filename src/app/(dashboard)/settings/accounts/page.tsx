import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MailAccountForm } from "@/components/settings/mail-account-form";
import { MailAccountRename } from "@/components/settings/mail-account-rename";
import { MailAccountToggle } from "@/components/settings/mail-account-toggle";
import { GmailImportButton } from "@/components/settings/gmail-import-button";
import { ScanAccountButton } from "@/components/settings/scan-account-button";

export const dynamic = "force-dynamic";

const GMAIL_ERROR_MESSAGES: Record<string, string> = {
  sin_code: "Google no devolvió un código de autorización.",
  sin_refresh_token: "Google no entregó un refresh token — vuelve a intentar (a veces requiere revocar el acceso previo en myaccount.google.com/permissions).",
  sin_perfil: "No se pudo leer el perfil de Gmail tras conectar.",
  access_denied: "Cancelaste el consentimiento en Google.",
  state_invalido: "El enlace de conexión expiró o no es válido — vuelve a hacer clic en \"Conectar con Google\".",
  cuenta_ya_conectada: "Esa cuenta de Gmail ya está conectada a otra organización.",
};

export default async function MailAccountsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail_connected?: string; gmail_error?: string }>;
}) {
  const { organizationId } = await requireSession();
  const { gmail_connected, gmail_error } = await searchParams;
  const accounts = await prisma.mailAccount.findMany({
    where: { organizationId },
    orderBy: { label: "asc" },
    include: { _count: { select: { emails: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl text-foreground">Cuentas de correo</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Cada correo pertenece a una cuenta y la bandeja se puede subdividir por cuenta. La priorización
          (urgencia + remitente VIP) y el nivel de servicio siguen siendo globales, combinando todas las
          cuentas activas.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-vip">
          Nota: agregar una cuenta manualmente aquí solo la registra para asociarle correos de prueba, no
          inicia un login OAuth. Para leer correos reales, conecta una cuenta de Gmail abajo.
        </p>
      </div>

      {gmail_connected && (
        <p className="rounded-lg border border-border bg-card p-3 text-sm text-foreground">
          Cuenta de Gmail conectada correctamente (solo lectura).
        </p>
      )}
      {gmail_error && (
        <p className="rounded-lg border border-urgent/30 bg-urgent/5 p-3 text-sm text-urgent">
          {GMAIL_ERROR_MESSAGES[gmail_error] ?? `No se pudo conectar con Google (${gmail_error}).`}
        </p>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">Conectar Gmail (solo lectura)</p>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Acceso de solo lectura (gmail.readonly): lee tus correos y adjuntos reales para clasificarlos.
          Nunca escribe ni envía nada en tu Gmail — los borradores generados solo se guardan aquí.
        </p>
        <Button
          size="sm"
          className="w-fit"
          nativeButton={false}
          render={<a href="/api/auth/google">Conectar con Google</a>}
        />
      </div>

      <MailAccountForm />

      <div className="flex flex-col gap-3">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
          >
            <div>
              <div className="flex items-center gap-2">
                <MailAccountRename accountId={account.id} currentLabel={account.label} />
                {account.provider === "gmail" && <Badge>Gmail</Badge>}
                {!account.isActive && <Badge variant="outline">Inactiva</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {account.emailAddress} · {account._count.emails} correo(s)
              </p>
            </div>
            <div className="flex items-center gap-3">
              {account.provider === "gmail" && (
                <>
                  <GmailImportButton accountId={account.id} />
                  <ScanAccountButton accountId={account.id} />
                </>
              )}
              <MailAccountToggle accountId={account.id} checked={account.isActive} />
            </div>
          </div>
        ))}
        {accounts.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Todavía no hay cuentas configuradas. Agrega la primera arriba.
          </p>
        )}
      </div>
    </div>
  );
}
