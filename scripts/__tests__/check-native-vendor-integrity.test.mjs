/**
 * Tests for check-native-vendor-integrity.mjs
 */

import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { checkNativeVendorIntegrity } from "../check-native-vendor-integrity.mjs";

const COMMIT_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const COMMIT_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function writeUtf8(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
}

function makeFixtureRoot() {
  return mkdtempSync(join(tmpdir(), "rezi-native-vendor-"));
}

function writeBaseFixture(root, commit = COMMIT_A) {
  writeUtf8(
    join(root, "packages/native/build.rs"),
    [
      "fn main() {",
      '  let manifest_dir = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));',
      '  let _vendor = manifest_dir.join("vendor").join("zireael");',
      '  println!("cargo:rerun-if-changed=vendor/VENDOR_COMMIT.txt");',
      "}",
      "",
    ].join("\n"),
  );
  writeUtf8(join(root, "packages/native/vendor/VENDOR_COMMIT.txt"), `${commit}\n`);
  mkdirSync(join(root, "packages/native/vendor/zireael/include"), { recursive: true });
  mkdirSync(join(root, "packages/native/vendor/zireael/src"), { recursive: true });
}

describe("check-native-vendor-integrity", () => {
  test("passes when pin matches gitlink and build.rs uses native vendor path", () => {
    const root = makeFixtureRoot();
    try {
      writeBaseFixture(root, COMMIT_A);
      assert.equal(
        checkNativeVendorIntegrity(root, {
          resolveGitlinkCommit: () => COMMIT_A,
          resolveSubmoduleHead: () => null,
        }).success,
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails when commit pin format is invalid", () => {
    const root = makeFixtureRoot();
    try {
      writeBaseFixture(root, "not-a-commit");
      assert.throws(
        () =>
          checkNativeVendorIntegrity(root, {
            resolveGitlinkCommit: () => COMMIT_A,
            resolveSubmoduleHead: () => null,
          }),
        /VENDOR_COMMIT\.txt must contain exactly one 40-hex commit hash/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails when build.rs does not use packages/native/vendor/zireael", () => {
    const root = makeFixtureRoot();
    try {
      writeBaseFixture(root, COMMIT_A);
      writeUtf8(
        join(root, "packages/native/build.rs"),
        [
          "fn main() {",
          '  let manifest_dir = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));',
          '  let _vendor = manifest_dir.join("..").join("vendor").join("zireael");',
          '  println!("cargo:rerun-if-changed=vendor/VENDOR_COMMIT.txt");',
          "}",
          "",
        ].join("\n"),
      );
      assert.throws(
        () =>
          checkNativeVendorIntegrity(root, {
            resolveGitlinkCommit: () => COMMIT_A,
            resolveSubmoduleHead: () => null,
          }),
        /build\.rs must compile Zireael from packages\/native\/vendor\/zireael/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails when pinned commit and gitlink commit differ", () => {
    const root = makeFixtureRoot();
    try {
      writeBaseFixture(root, COMMIT_A);
      assert.throws(
        () =>
          checkNativeVendorIntegrity(root, {
            resolveGitlinkCommit: () => COMMIT_B,
            resolveSubmoduleHead: () => null,
          }),
        /native vendor commit pin mismatch/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails when checked-out submodule HEAD differs from gitlink pointer", () => {
    const root = makeFixtureRoot();
    try {
      writeBaseFixture(root, COMMIT_A);
      assert.throws(
        () =>
          checkNativeVendorIntegrity(root, {
            resolveGitlinkCommit: () => COMMIT_A,
            resolveSubmoduleHead: () => COMMIT_B,
          }),
        /checked-out vendor\/zireael is out of sync with repo gitlink pointer/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
