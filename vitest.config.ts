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
    env: {
      // Aísla los tests de integración (scan.test.ts) de la base de datos de
      // desarrollo — nunca deben tocar dev.db.
      DATABASE_URL: "file:./prisma/test.db",
    },
  },
});
