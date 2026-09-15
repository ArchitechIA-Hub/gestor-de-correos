import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { requireSession } from "@/lib/auth/session";
import { changePassword } from "./change-password";

const mockedRequireSession = vi.mocked(requireSession);

let userId: string;

async function resetDb() {
  // Orden FK-safe completo (no solo lo que este archivo siembra): test.db se
  // comparte entre archivos de test dentro de la misma corrida sin limpiarse
  // entre ellos.
  await prisma.whatsAppNotification.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.urgentAlert.deleteMany();
  await prisma.auditLogEntry.deleteMany();
  await prisma.draft.deleteMany();
  await prisma.commitment.deleteMany();
  await prisma.emailAttachment.deleteMany();
  await prisma.email.deleteMany();
  await prisma.sender.deleteMany();
  await prisma.mailAccount.deleteMany();
  await prisma.scanCycleLog.deleteMany();
  await prisma.appSettings.deleteMany();
  await prisma.extraConfig.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

beforeEach(async () => {
  await resetDb();
  const organization = await prisma.organization.create({ data: { name: "Org de prueba" } });
  const passwordHash = await bcrypt.hash("contraseñaVieja123", 12);
  const user = await prisma.user.create({
    data: { organizationId: organization.id, email: "persona@test.local", name: "Persona", passwordHash },
  });
  userId = user.id;
  mockedRequireSession.mockResolvedValue({ userId, organizationId: organization.id });
});

describe("changePassword", () => {
  it("cambia la contraseña cuando la actual es correcta", async () => {
    await changePassword({ currentPassword: "contraseñaVieja123", newPassword: "contraseñaNueva456" });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await bcrypt.compare("contraseñaNueva456", user.passwordHash)).toBe(true);
    expect(await bcrypt.compare("contraseñaVieja123", user.passwordHash)).toBe(false);
  });

  it("rechaza el cambio si la contraseña actual no coincide", async () => {
    await expect(
      changePassword({ currentPassword: "incorrecta", newPassword: "contraseñaNueva456" })
    ).rejects.toThrow("La contraseña actual no es correcta.");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await bcrypt.compare("contraseñaVieja123", user.passwordHash)).toBe(true);
  });

  it("rechaza una nueva contraseña demasiado corta", async () => {
    await expect(changePassword({ currentPassword: "contraseñaVieja123", newPassword: "corta" })).rejects.toThrow(
      /al menos 8 caracteres/
    );
  });
});
