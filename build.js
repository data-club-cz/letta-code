#!/usr/bin/env bun

/**
 * Build script for Letta Code CLI
 * Bundles TypeScript source into a single JavaScript file
 */

import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));
const version = pkg.version;
const useMagick = Bun.env.USE_MAGICK;
const features = [];

console.log(`📦 Building Letta Code v${version}...`);
if (useMagick) {
  console.log(`🪄 Using magick variant of imageResize...`);
  features.push("USE_MAGICK");
}

await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: ".",
  target: "node",
  format: "esm",
  minify: false, // Keep readable for debugging
  sourcemap: "external",
  naming: {
    entry: "letta.js",
  },
  define: {
    LETTA_VERSION: JSON.stringify(version),
    BUILD_TIME: JSON.stringify(new Date().toISOString()),
    __USE_MAGICK__: useMagick ? "true" : "false",
  },
  // Load text files as strings (for markdown, etc.)
  loader: {
    ".md": "text",
    ".mdx": "text",
    ".txt": "text",
  },
  // Keep most native Node.js modules external to avoid bundling issues.
  // grammY must stay external too: bundling its node-fetch/abort-controller
  // stack into letta.js breaks Telegram startup because node-fetch rejects the
  // bundled AbortSignal class during bot.init().
  // But don't make `sharp` external, causes issues with global Bun-based installs
  // ref: #745, #1200
  external: ["ws", "@vscode/ripgrep", "node-pty", "grammy"],
  features: features,
});

// Add shebang to output file
const outputPath = join(__dirname, "letta.js");
let content = readFileSync(outputPath, "utf-8");

// Remove any existing shebang first
if (content.startsWith("#!")) {
  content = content.slice(content.indexOf("\n") + 1);
}

// Patch secrets requirement back in for node build
content = content.replace(
  `(()=>{throw new Error("Cannot require module "+"bun");})().secrets`,
  `globalThis.Bun.secrets`,
);

const withShebang = `#!/usr/bin/env node
${content}`;
await Bun.write(outputPath, withShebang);

// Make executable
if (process.platform !== "win32") {
  await Bun.$`chmod +x letta.js`;
}

// ── Node-only provider sidecars ──────────────────────────────────────────────
// pi-ai loads the AWS Bedrock provider through an indirect dynamic import
// (`importNodeOnlyProvider("./amazon-bedrock.ts")`) so its Node-only AWS SDK /
// SigV4 stack stays out of the main (edge-safe) bundle. Bun can't statically
// analyse that indirect import, so it leaves a runtime `import("./amazon-bedrock.js")`
// in letta.js that resolves *next to letta.js*. We must therefore emit that
// sidecar here. This is required for the `local` backend's client-side Bedrock
// inference (Pi). The `api` backend never loads it — the Letta server does
// inference there — which is why this gap was invisible until the local-backend
// migration. Without this file, a local-backend Bedrock turn fails at runtime
// with "Cannot find module .../amazon-bedrock.js".
const bedrockProviderEntry = join(
  __dirname,
  "node_modules/@earendil-works/pi-ai/dist/providers/amazon-bedrock.js",
);
if (existsSync(bedrockProviderEntry)) {
  await Bun.build({
    entrypoints: [bedrockProviderEntry],
    outdir: ".",
    target: "node",
    format: "esm",
    minify: false,
    sourcemap: "external",
    naming: { entry: "amazon-bedrock.js" },
    external: ["ws", "@vscode/ripgrep", "node-pty", "grammy"],
  });
  console.log("🪣 Built node-only Bedrock provider sidecar: amazon-bedrock.js");
} else {
  console.warn(
    `⚠️  Bedrock provider not found at ${bedrockProviderEntry} — ` +
      "local-backend Bedrock inference will fail until it is built.",
  );
}

await Bun.build({
  entrypoints: ["./src/app-server-client.ts"],
  outdir: "./dist",
  target: "browser",
  format: "esm",
  minify: false,
  sourcemap: "external",
  naming: {
    entry: "app-server-client.js",
  },
});

// Copy bundled skills to skills/ directory for shipping
const bundledSkillsSrc = join(__dirname, "src/skills/builtin");
const bundledSkillsDst = join(__dirname, "skills");

if (existsSync(bundledSkillsSrc)) {
  // Clean and copy
  if (existsSync(bundledSkillsDst)) {
    rmSync(bundledSkillsDst, { recursive: true });
  }
  cpSync(bundledSkillsSrc, bundledSkillsDst, { recursive: true });
  console.log("📂 Copied bundled skills to skills/");
}

// Generate type declarations for wire types export
console.log("📝 Generating type declarations...");
await Bun.$`bunx tsc -p tsconfig.types.json`;
console.log("   Output: dist/types/protocol.d.ts");

console.log("✅ Build complete!");
console.log(`   Output: letta.js`);
console.log("   Output: dist/app-server-client.js");
console.log(`   Size: ${(Bun.file(outputPath).size / 1024).toFixed(0)}KB`);
