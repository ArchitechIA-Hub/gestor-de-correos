import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { MailAccountForm } from "@/components/settings/mail-account-form";
import { MailAccountToggle } from "@/components/settings/mail-account-toggle";

export const dynamic = "force-dynamic";

export default async function MailAccountsSettingsPage() {
  const accounts = await prisma.mailAccount.findMany({
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
          Nota: prototipo sin conexión real a un proveedor de correo — agregar una cuenta aquí solo la
          registra para asociarle correos (reales o de prueba), no inicia un login OAuth.
        </p>
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
                <span className="text-sm font-medium text-foreground">{account.label}</span>
                {!account.isActive && <Badge variant="outline">Inactiva</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {account.emailAddress} · {account._count.emails} correo(s)
              </p>
            </div>
            <MailAccountToggle accountId={account.id} checked={account.isActive} />
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
