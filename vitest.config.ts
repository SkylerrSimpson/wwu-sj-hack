import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    // Next resolves `@/` from apps/web/tsconfig.json; Vitest has to be told.
    // Backslashes in a Windows path stop the alias from resolving.
    alias: {
      "@/": fileURLToPath(new URL("./apps/web/src/", import.meta.url)).replaceAll("\\", "/"),
    },
  },
});
