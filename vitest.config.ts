import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    // Next resolves `@/` from apps/web/tsconfig.json; Vitest has to be told.
    alias: { "@/": fileURLToPath(new URL("./apps/web/src/", import.meta.url)) },
  },
});
