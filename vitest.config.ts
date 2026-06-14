import { defineConfig } from "vitest/config";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * The source uses NodeNext-style ".js" import specifiers that actually point at
 * ".ts" files (required for tsc + Node ESM). Vite resolves the literal path, so
 * this small pre-resolver maps a relative "*.js" specifier to its "*.ts" sibling
 * when one exists. Keeps one import style across tsc, tsx, and Vitest.
 */
export default defineConfig({
  plugins: [
    {
      name: "resolve-js-to-ts",
      enforce: "pre",
      resolveId(source, importer) {
        if (!importer) return null;
        if ((source.startsWith("./") || source.startsWith("../")) && source.endsWith(".js")) {
          const tsPath = resolve(dirname(importer), source.replace(/\.js$/, ".ts"));
          if (existsSync(tsPath)) return tsPath;
        }
        return null;
      },
    },
  ],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
