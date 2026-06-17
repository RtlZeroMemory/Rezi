import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const BUILD_RS_PATH = fileURLToPath(new URL("../../packages/native/build.rs", import.meta.url));
const BUILD_NATIVE_SCRIPT_PATH = fileURLToPath(
  new URL("../../packages/native/scripts/build-native.mjs", import.meta.url),
);
const PREBUILD_WORKFLOW_PATH = fileURLToPath(
  new URL("../../.github/workflows/prebuild.yml", import.meta.url),
);
const RELEASE_WORKFLOW_PATH = fileURLToPath(
  new URL("../../.github/workflows/release.yml", import.meta.url),
);

const STATIC_CRT_RUSTFLAGS = "-C target-feature=+crt-static";

function assertWindowsPrebuildUsesStaticCrt(workflow, label) {
  assert.match(
    workflow,
    new RegExp(
      [
        "- name: Build prebuild",
        "[\\s\\S]*?env:",
        `[\\s\\S]*?RUSTFLAGS: \\$\\{\\{ runner\\.os == 'Windows' && '${STATIC_CRT_RUSTFLAGS.replace("+", "\\+")}' \\|\\| '' \\}\\}`,
        '[\\s\\S]*?run: npx napi build --platform --release --target "\\$\\{\\{ matrix\\.rustTarget \\}\\}" --js false',
      ].join("\\n?"),
      "u",
    ),
    `${label} Windows prebuilds must pass Rust +crt-static`,
  );
}

describe("native Windows CRT linking", () => {
  test("local Windows native builds use static MSVC CRT", () => {
    const buildRs = readFileSync(BUILD_RS_PATH, "utf8");
    const buildScript = readFileSync(BUILD_NATIVE_SCRIPT_PATH, "utf8");

    assert.match(buildRs, /CARGO_CFG_TARGET_ENV"\)\.as_deref\(\) == Ok\("msvc"\)/);
    assert.match(
      buildRs,
      /target_features\.split\(','\)\.any\(\|feature\| feature == "crt-static"\)/,
    );
    assert.match(buildRs, /build\.static_crt\(true\)/);
    assert.match(
      buildScript,
      /const WINDOWS_STATIC_CRT_RUSTFLAGS = "-C target-feature=\+crt-static";/,
    );
    assert.match(buildScript, /function isWindowsMsvcTarget\(targetTriple\)/);
    assert.match(buildScript, /function withWindowsStaticCrtEnv\(env, hostTargetTriple\)/);
  });

  test("published Windows native prebuilds use static MSVC CRT", () => {
    assertWindowsPrebuildUsesStaticCrt(
      readFileSync(PREBUILD_WORKFLOW_PATH, "utf8"),
      "manual prebuild workflow",
    );
    assertWindowsPrebuildUsesStaticCrt(
      readFileSync(RELEASE_WORKFLOW_PATH, "utf8"),
      "release workflow",
    );
  });
});
