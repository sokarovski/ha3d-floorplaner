// ESLint flat config. Enforces the dependency direction from
// spec/architecture/frontend-architecture.md and the "no shortcuts" rules from
// spec/design-system/README.md. Inline eslint-disable comments are not allowed.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const sharedForbidden = {
  patterns: [
    {
      group: [
        "react",
        "react-*",
        "react/*",
        "react-dom",
        "react-dom/*",
        "react-router",
        "react-aria-components",
      ],
      message: "shared/ must not depend on React.",
    },
    { group: ["zustand", "zustand/*"], message: "shared/ must not depend on stores." },
    { group: ["three", "three/*"], message: "shared/ geometry must not depend on the browser renderer." },
    {
      group: ["fastify", "@fastify/*", "isomorphic-git", "node:*", "fs", "path", "os"],
      message: "shared/ must not depend on the server or the filesystem.",
    },
    {
      group: ["**/src/**", "**/server/**", "@/*"],
      message: "shared/ must not import application or server code.",
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".homeplan-data/**",
      ".claude/**",
      "spec/**",
      "custom_components/homeplan/frontend/**",
      ".cache/**",
      // Compiled inside the home-assistant/frontend checkout with HA's toolchain and types (scripts/build-ha-cards.mjs).
      "packaging/ha-cards/frontend/**",
    ],
  },
  {
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "error" },
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true },
      ],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-restricted-exports": [
        "error",
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { ...tseslint.configs.disableTypeChecked.languageOptions, globals: globals.node },
  },
  {
    files: [
      "eslint.config.js",
      "vite.config.ts",
      "vite.ha-viewer.config.ts",
      "vite.website.config.ts",
      "vite.live-demo.config.ts",
    ],
    rules: { "no-restricted-exports": "off" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/server/**", "fastify", "@fastify/*", "isomorphic-git", "node:*"],
              message: "Browser code must not import server code.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='className']",
          message: "Style through data attributes in .tw.css, not className.",
        },
        {
          selector: "JSXAttribute[name.name='style']",
          message: "No inline styles; use data attributes and .tw.css.",
        },
      ],
    },
  },
  {
    files: ["src/design-system/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/features/**",
                "**/api/**",
                "**/renderer/**",
                "**/stores/**",
                "zustand",
                "zustand/*",
              ],
              message:
                "Design-system components receive props and must not import feature services or stores.",
            },
            {
              group: ["**/server/**", "fastify", "@fastify/*", "node:*"],
              message: "Browser code must not import server code.",
            },
          ],
        },
      ],
    },
  },
  {
    // The showcase website: a static React page that reuses design-system components and tokens only,
    // never the builder's services, router, stores or renderer.
    files: ["website/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|/)src/(?!design-system/)",
              message:
                "The website reuses src/design-system/ only; it does not start the builder application.",
            },
            {
              group: ["react-router", "react-router/*", "zustand", "zustand/*", "three", "three/*"],
              message: "The website does not use the builder's router, stores or renderer.",
            },
            {
              group: ["**/server/**", "fastify", "@fastify/*", "node:*"],
              message: "Browser code must not import server code.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='className']",
          message: "Style through data attributes in .tw.css, not className.",
        },
        {
          selector: "JSXAttribute[name.name='style']",
          message: "No inline styles; use data attributes and .tw.css.",
        },
      ],
    },
  },
  {
    // The HA viewer (D23): Lit + Three.js, imports only shared/ (spec/home-assistant/viewer-mvp.md#stack).
    files: ["ha-viewer/**/*.ts"],
    languageOptions: { globals: globals.browser },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|/)src/(?!renderer/)",
              message:
                "The HA viewer is a separate Lit front end; it imports shared/ and the framework-free src/renderer/ only.",
            },
            {
              group: ["react", "react-*", "react-dom", "react-dom/*", "zustand", "zustand/*"],
              message:
                "The HA viewer is a separate Lit front end; it imports shared/ and the framework-free src/renderer/ only.",
            },
            {
              group: ["**/server/**", "fastify", "@fastify/*", "node:*"],
              message: "Browser code must not import server code.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["shared/**/*.ts"],
    rules: { "no-restricted-imports": ["error", sharedForbidden] },
  },
  {
    files: ["server/**/*.ts"],
    languageOptions: { globals: globals.node },
    rules: {
      // Fastify plugins and handlers are async by contract even when they do not await.
      "@typescript-eslint/require-await": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/src/**", "react", "react-*", "react-dom", "three", "three/*", "zustand"],
              message: "Server code must not import browser code.",
            },
          ],
        },
      ],
    },
  },
);
