import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "dist/**",
    "node_modules/**",
    // Mirrored Adobe declarations are validated by TypeScript rather than linted as project code.
    "src/shared/types/*/internal/**/*.d.ts",
    "test/uxp-plugin/dist/**",
    "test/uxp-plugin/vendor/**",
    "test/uxp-plugin/webview/generated/**"
  ]),
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
      reportUnusedInlineConfigs: "error"
    }
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [eslint.configs.recommended]
  },
  {
    files: [
      "eslint.config.mjs",
      "scripts/**/*.mjs",
      "test/contract/**/*.mjs",
      "test/runner/**/*.mjs",
      "test/static/**/*.mjs"
    ],
    languageOptions: {
      globals: globals.nodeBuiltin
    }
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
        ...globals.commonjs
      }
    }
  },
  {
    files: ["test/cdp/cases/**/*.mjs", "test/uxp-plugin/webview/**/*.js"],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    files: ["test/uxp-plugin/host.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        require: "readonly"
      }
    }
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.d.ts", "src/**/*.test.ts"],
    extends: [eslint.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends" }]
    }
  },
  {
    // Declaration files and the runtime-injected CDP test DSL do not have a complete
    // executable type graph, but they still receive the recommended TypeScript rules.
    files: ["src/**/*.d.ts", "src/**/*.test.ts", "test/**/*.ts"],
    extends: [eslint.configs.recommended, tseslint.configs.recommended]
  },
  {
    files: ["src/webview/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    rules: {
      "prefer-const": ["error", { ignoreReadBeforeAssign: true }]
    }
  }
);
