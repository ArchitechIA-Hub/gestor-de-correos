import { getAppSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { TimeZoneForm } from "@/components/settings/timezone-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { ChangePasswordForm } from "@/components/settings/change-password-form";

export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  const user = await getCurrentUser();
  const [settings, organization] = await Promise.all([
    getAppSettings(user.organizationId),
    prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl text-foreground">Preferencias</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajustes generales de la aplicación.
        </p>
      </div>

      <ProfileForm currentUserName={user.name} currentOrganizationName={organization.name} />
      <ChangePasswordForm />
      <TimeZoneForm currentTimeZone={settings.timeZone} />
    </div>
  );
}
