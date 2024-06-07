import type { NuxtOptions } from "@nuxt/schema";
import fsExtra from "fs-extra";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join, normalize, posix, relative } from "node:path";
import { stringify as yamlStringify } from "yaml";

import { DEFAULT_COMMAND } from "./constants.js";
import type { OutputBundleOptions } from "./interfaces.js";

let nuxtOptions: NuxtOptions;
export async function getConfig(cwd: string): Promise<NuxtOptions> {
  if (!nuxtOptions) {
    const { loadNuxtConfig } = await import("@nuxt/kit");
    nuxtOptions = await loadNuxtConfig({ cwd });
  }

  return nuxtOptions;
}

async function getWantsBackend(cwd: string): Promise<boolean> {
  const { ssr: wantsBackend } = await getConfig(cwd);

  return wantsBackend;
}

export async function build(cwd: string, cmd = DEFAULT_COMMAND): Promise<void> {
  const command = (await getWantsBackend(cwd)) ? "build" : "generate";

  const build = spawnSync(cmd, ["run", command], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, NITRO_PRESET: "node" },
  });

  if (build.status !== 0) throw Error("Was unable to build your Nuxt application.");
}

/**
 * Moves the server and client code generated by nuxt build into the output directory
 * Also generates the bundle.yaml file.
 * @param cwd The current working directory
 * @param outputBundleOptions The target location of built artifacts in the output bundle.
 * @param outDir The location of the dist directory.
 */
export async function generateOutputDirectory(
  cwd: string,
  outputBundleOptions: OutputBundleOptions,
): Promise<void> {
  const outDir = join(cwd, ".output");

  await fsExtra.copy(outDir, outputBundleOptions.outputDirectory, {
    overwrite: true,
  });
  // TODO: review, is this needed? Currently having errors with this
  // await fsExtra.copy(
  //   join(cwd, "node_modules"),
  //   join(outputBundleOptions.outputDirectory, "node_modules"),
  //   { overwrite: true },
  // );

  await Promise.all([generateBundleYaml(outputBundleOptions, cwd)]);
}

async function generateBundleYaml(
  outputBundleOptions: OutputBundleOptions,
  cwd: string,
): Promise<void> {
  const {
    app: { baseURL },
  } = await getConfig(cwd);

  await writeFile(
    outputBundleOptions.bundleYamlPath,
    yamlStringify({
      staticAssets: [normalize(relative(cwd, outputBundleOptions.clientDirectory))],
      serverDirectory: outputBundleOptions.wantsBackend
        ? normalize(relative(cwd, outputBundleOptions.serverDirectory))
        : null,
      rewrites: outputBundleOptions.wantsBackend
        ? []
        : [
            {
              source: posix.join(baseURL, "**"),
              destination: posix.join(baseURL, "200.html"),
            },
          ],
    }),
  );
}

/**
 * Provides the paths in the output bundle for the built artifacts.
 * @param cwd The root directory of the uploaded source code.
 * @param wantsBackend Whether the app uses SSR.
 * @return The output bundle paths.
 */
export function populateOutputBundleOptions(
  cwd: string,
  wantsBackend: boolean,
): OutputBundleOptions {
  const outputBundleDir = join(cwd, ".apphosting");

  return {
    bundleYamlPath: join(outputBundleDir, "bundle.yaml"),
    outputDirectory: outputBundleDir,
    clientDirectory: join(outputBundleDir, "public"),
    serverDirectory: join(outputBundleDir, "server"),
    wantsBackend,
  };
}

/**
 * Validate output directory includes all necessary parts
 */
export async function validateOutputDirectory(
  outputBundleOptions: OutputBundleOptions,
): Promise<void> {
  if (
    !(await fsExtra.pathExists(outputBundleOptions.outputDirectory)) ||
    !(await fsExtra.pathExists(outputBundleOptions.bundleYamlPath))
  ) {
    throw new Error("Output directory is not of expected structure");
  }
}
