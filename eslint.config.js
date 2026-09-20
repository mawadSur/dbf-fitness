// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Function entrypoints target Deno (npm: imports, Deno globals); their pure logic.ts is still linted.
    ignores: ["dist/*", "supabase/functions/**/index.ts"],
  }
]);
