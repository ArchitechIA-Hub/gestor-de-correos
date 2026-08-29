import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globalSetup: "./vitest.global-setup.ts",
    // Varios archivos de test (scan.test.ts, approve-draft.test.ts, ...) son
    // tests de integración que comparten la misma test.db real vía Prisma —
    // correrlos en paralelo dispara condiciones de carrera entre sus
    // resetDb() (violaciones de foreign key). Se corren en serie.
    fileParallelism: false,
    env: {
      // Aísla los tests de integración de la base de datos de desarrollo —
      // nunca deben tocar dev.db.
      DATABASE_URL: "file:./prisma/test.db",
    },
  },
});
