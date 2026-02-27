#!/usr/bin/env node
/**
 * check-native-vendor-integrity.mjs
 *
 * Guardrails for the dual Zireael vendor layout used by @rezi-ui/native.
 *
 * Invariants:
 * - build.rs compiles from packages/native/vendor/zireael
 * - packages/native/vendor/VENDOR_COMMIT.txt is exactly one 40-hex commit
 * - the commit pin matches the repo gitlink pointer at vendor/zireael
 * - if vendor/zireael is checked out locally, its HEAD matches that pointer
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function isHex40(value) {
  return /^[0-9a-fA-F]{40}$/.test(value);
}

function runGit(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const stderr = String(err?.stderr ?? "").trim();
    const detail = stderr.length > 0 ? `: ${stderr}` : "";
    throw new Error(`git ${args.join(" ")} failed${detail}`);
  }
}

function normalizeCommitPin(rawPin) {
  const lines = rawPin
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1 || !isHex40(lines[0])) {
    throw new Error(
      "packages/native/vendor/VENDOR_COMMIT.txt must contain exactly one 40-hex commit hash",
    );
  }
  return lines[0].toLowerCase();
}

function readGitlinkCommit(rootDir) {
  const commit = runGit(rootDir, ["rev-parse", "HEAD:vendor/zireael"]).toLowerCase();
  if (!isHex40(commit)) {
    throw new Error(
      `gitlink pointer for vendor/zireael is not a 40-hex commit (got: ${JSON.stringify(commit)})`,
    );
  }
  return commit;
}

function readSubmoduleHead(rootDir) {
  const submoduleDir = join(rootDir, "vendor/zireael");
  if (!existsSync(submoduleDir)) return null;

  try {
    if (!statSync(submoduleDir).isDirectory()) return null;
  } catch {
    return null;
  }

  // A gitlink path may exist as an ordinary directory when submodules are not
  // initialized. In that case `git -C <path>` resolves to the parent repo and
  // returns the superproject HEAD, which is not a submodule HEAD.
  // Only treat vendor/zireael as checked out when it has its own git metadata.
  const submoduleGitMeta = join(submoduleDir, ".git");
  if (!existsSync(submoduleGitMeta)) return null;

  try {
    const head = runGit(submoduleDir, ["rev-parse", "HEAD"]).toLowerCase();
    return isHex40(head) ? head : null;
  } catch {
    return null;
  }
}

function assertDir(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} is missing: ${path}`);
  }
  if (!statSync(path).isDirectory()) {
    throw new Error(`${label} must be a directory: ${path}`);
  }
}

function validateBuildRs(buildRsText) {
  const compilePathNeedle = 'manifest_dir.join("vendor").join("zireael")';
  if (!buildRsText.includes(compilePathNeedle)) {
    throw new Error(
      "packages/native/build.rs must compile Zireael from packages/native/vendor/zireael",
    );
  }

  const rerunCommitNeedle = 'println!("cargo:rerun-if-changed=vendor/VENDOR_COMMIT.txt");';
  if (!buildRsText.includes(rerunCommitNeedle)) {
    throw new Error(
      "packages/native/build.rs must include rerun-if-changed for vendor/VENDOR_COMMIT.txt",
    );
  }
}

export function checkNativeVendorIntegrity(rootDir, options = {}) {
  const root = rootDir ?? join(dirname(fileURLToPath(import.meta.url)), "..");

  const buildRsPath = join(root, "packages/native/build.rs");
  const nativeVendorRoot = join(root, "packages/native/vendor/zireael");
  const vendorCommitPath = join(root, "packages/native/vendor/VENDOR_COMMIT.txt");

  if (!existsSync(buildRsPath)) {
    throw new Error(`missing build script: ${buildRsPath}`);
  }
  if (!existsSync(vendorCommitPath)) {
    throw new Error(`missing vendor commit pin file: ${vendorCommitPath}`);
  }

  validateBuildRs(readFileSync(buildRsPath, "utf8"));

  assertDir(nativeVendorRoot, "native vendor root");
  assertDir(join(nativeVendorRoot, "include"), "native vendor include directory");
  assertDir(join(nativeVendorRoot, "src"), "native vendor source directory");

  const pinnedCommit = normalizeCommitPin(readFileSync(vendorCommitPath, "utf8"));

  const resolveGitlinkCommit = options.resolveGitlinkCommit ?? readGitlinkCommit;
  const resolveSubmoduleHead = options.resolveSubmoduleHead ?? readSubmoduleHead;

  const gitlinkCommitRaw = resolveGitlinkCommit(root);
  const gitlinkCommit = String(gitlinkCommitRaw).toLowerCase();
  if (!isHex40(gitlinkCommit)) {
    throw new Error(`resolved gitlink commit is invalid: ${JSON.stringify(gitlinkCommitRaw)}`);
  }

  if (pinnedCommit !== gitlinkCommit) {
    throw new Error(
      [
        "native vendor commit pin mismatch:",
        `- packages/native/vendor/VENDOR_COMMIT.txt: ${pinnedCommit}`,
        `- gitlink HEAD:vendor/zireael: ${gitlinkCommit}`,
        "Update the pin file (or submodule pointer) so both commits match.",
      ].join("\n"),
    );
  }

  const submoduleHeadRaw = resolveSubmoduleHead(root);
  if (submoduleHeadRaw !== null && submoduleHeadRaw !== undefined) {
    const submoduleHead = String(submoduleHeadRaw).toLowerCase();
    if (!isHex40(submoduleHead)) {
      throw new Error(
        `resolved checked-out vendor/zireael HEAD is invalid: ${JSON.stringify(submoduleHeadRaw)}`,
      );
    }
    if (submoduleHead !== gitlinkCommit) {
      throw new Error(
        [
          "checked-out vendor/zireael is out of sync with repo gitlink pointer:",
          `- vendor/zireael HEAD: ${submoduleHead}`,
          `- repo gitlink HEAD:vendor/zireael: ${gitlinkCommit}`,
          "Run: git submodule update --init --recursive vendor/zireael",
        ].join("\n"),
      );
    }
  }

  return {
    success: true,
    pinnedCommit,
    gitlinkCommit,
  };
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : null;
const selfPath = realpathSync(fileURLToPath(import.meta.url));
if (invokedPath && invokedPath === selfPath) {
  try {
    const result = checkNativeVendorIntegrity();
    process.stdout.write(
      `check-native-vendor-integrity: OK (pin=${result.pinnedCommit.slice(0, 12)})\n`,
    );
    process.exit(0);
  } catch (err) {
    process.stderr.write(`check-native-vendor-integrity: FAIL\n${String(err?.stack ?? err)}\n`);
    process.exit(1);
  }
}
