/**
 * Builds the publishable package into `dist/`: one bundled `cortex.js` (the CLI plus every @cortex/*
 * workspace package, which are source-only and private), a generated package.json, and the README/LICENSE.
 * Only `ink` and `react` stay external; users get them from npm when they install.
 *
 *   npm run build -w @cortex/cli
 *   npm pack ./apps/cli/dist          # a tarball exactly as it would be published
 *
 * The published name, license and other metadata come from `publish.json` next to this file.
 */
import { build } from "esbuild";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const dist = path.join(here, "dist");

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const exists = (file) => readFile(file).then(() => true, () => false);

const workspace = await readJson(path.join(here, "package.json"));
const publish = await readJson(path.join(here, "publish.json"));

// Runtime dependencies are the only things the published package installs; they must be external to the bundle.
const runtimeDependencies = Object.fromEntries(["ink", "react"].map((name) => [name, workspace.dependencies[name]]));

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: [path.join(here, "src/index.ts")],
  outfile: path.join(dist, "cortex.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: [...Object.keys(runtimeDependencies), "react/jsx-runtime", "react-devtools-core"],
  legalComments: "none",
  logLevel: "warning",
});

// The source's shebang is for running through tsx during development; the published file runs on plain node.
const bundlePath = path.join(dist, "cortex.js");
const bundled = (await readFile(bundlePath, "utf8")).replace(/^#!.*\r?\n/, "");
await writeFile(bundlePath, `#!/usr/bin/env node\n${bundled}`);

const files = ["cortex.js", "README.md"];
await copyFile(path.join(root, "README.md"), path.join(dist, "README.md"));
if (await exists(path.join(root, "LICENSE"))) {
  await copyFile(path.join(root, "LICENSE"), path.join(dist, "LICENSE"));
  files.push("LICENSE");
}

await writeFile(
  path.join(dist, "package.json"),
  `${JSON.stringify(
    {
      name: publish.name,
      version: workspace.version,
      description: publish.description,
      keywords: publish.keywords,
      license: publish.license,
      repository: publish.repository,
      homepage: publish.homepage,
      bugs: publish.bugs,
      type: "module",
      bin: { cortex: "cortex.js" },
      files,
      engines: { node: publish.node },
      dependencies: runtimeDependencies,
      publishConfig: { access: "public" },
    },
    null,
    2,
  )}\n`,
);

console.log(`Built ${publish.name}@${workspace.version} -> ${path.relative(root, dist)}`);
