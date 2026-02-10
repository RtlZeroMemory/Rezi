import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

function splitPathList(value, delim) {
  return value
    .split(delim)
    .map((p) => p.trim().replace(/^"+|"+$/g, ""))
    .filter(Boolean);
}

function envHasLib(env, libName) {
  if (process.platform !== "win32") return true;
  const libPath = env.LIB;
  if (typeof libPath !== "string" || libPath.length === 0) return false;
  for (const dir of splitPathList(libPath, ";")) {
    if (existsSync(join(dir, libName))) return true;
  }
  return false;
}

function parseCmdSetOutput(output) {
  const next = {};
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.length === 0) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    // cmd.exe prints internal per-drive cwd entries like `=C:=C:\...`.
    if (key.startsWith("=")) continue;
    next[key] = line.slice(idx + 1);
  }
  return next;
}

function runBatchAndGetEnv(batchFile, batchArgs, env) {
  const args = Array.isArray(batchArgs) ? batchArgs : [];

  // Avoid nested quoting issues between Node/Windows argument escaping and cmd.exe parsing
  // by writing a temporary .cmd file. This keeps the `call "C:\\path with spaces\\..."` intact.
  const scriptPath = join(
    tmpdir(),
    `rezi-ui-native-msvc-env-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.cmd`,
  );
  const script = `@echo off\r\ncall "${batchFile}" ${args.join(" ")}\r\nset\r\n`;
  writeFileSync(scriptPath, script, { encoding: "utf8" });

  try {
    const out = execFileSync("cmd.exe", ["/d", "/s", "/c", scriptPath], { encoding: "utf8", env });
    return parseCmdSetOutput(out);
  } finally {
    rmSync(scriptPath, { force: true });
  }
}

function findVswhere() {
  const pf86 = process.env["ProgramFiles(x86)"];
  const pf = process.env.ProgramFiles;
  const candidates = [
    pf86 ? join(pf86, "Microsoft Visual Studio", "Installer", "vswhere.exe") : null,
    pf ? join(pf, "Microsoft Visual Studio", "Installer", "vswhere.exe") : null,
  ].filter(Boolean);
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

function tryGetVisualStudioInstallPath(env) {
  const vswhere = findVswhere();
  if (!vswhere) return null;
  try {
    const out = execFileSync(
      vswhere,
      [
        "-latest",
        "-products",
        "*",
        "-requires",
        "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
        "-property",
        "installationPath",
      ],
      { encoding: "utf8", env },
    );
    const installPath = out.trim();
    return installPath.length > 0 ? installPath : null;
  } catch {
    return null;
  }
}

function getMsvcArchFromRustTarget(hostTargetTriple) {
  if (typeof hostTargetTriple !== "string") return "x64";
  if (hostTargetTriple.startsWith("x86_64-")) return "x64";
  if (hostTargetTriple.startsWith("i686-")) return "x86";
  if (hostTargetTriple.startsWith("aarch64-")) return "arm64";
  return "x64";
}

function getMsvcHostArch() {
  if (process.arch === "x64") return "x64";
  if (process.arch === "arm64") return "arm64";
  if (process.arch === "ia32") return "x86";
  return "x64";
}

function compareSemverDirs(a, b) {
  // Windows SDK folders look like `10.0.22621.0`. Compare numerically.
  const pa = a.split(".").map((n) => Number(n));
  const pb = b.split(".").map((n) => Number(n));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

function tryGetLatestWindowsSdkVersion(sdkRoot) {
  const libRoot = join(sdkRoot, "Lib");
  if (!existsSync(libRoot)) return null;

  try {
    const dirs = readdirSync(libRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(d.name))
      .map((d) => d.name)
      .sort(compareSemverDirs);
    return dirs.length > 0 ? dirs[dirs.length - 1] : null;
  } catch {
    return null;
  }
}

function withWindowsSdkEnv(env, hostTargetTriple) {
  if (process.platform !== "win32") return env;

  const arch = getMsvcArchFromRustTarget(hostTargetTriple);
  const pf86 = env["ProgramFiles(x86)"] ?? process.env["ProgramFiles(x86)"];
  const sdkRoot =
    typeof pf86 === "string" && pf86.length > 0
      ? join(pf86, "Windows Kits", "10")
      : join("C:\\", "Program Files (x86)", "Windows Kits", "10");

  const sdkVersion = tryGetLatestWindowsSdkVersion(sdkRoot);
  if (!sdkVersion) return env;

  const libUcrt = join(sdkRoot, "Lib", sdkVersion, "ucrt", arch);
  const libUm = join(sdkRoot, "Lib", sdkVersion, "um", arch);
  const incRoot = join(sdkRoot, "Include", sdkVersion);
  const incUcrt = join(incRoot, "ucrt");
  const incShared = join(incRoot, "shared");
  const incUm = join(incRoot, "um");
  const incWinrt = join(incRoot, "winrt");
  const incCppWinrt = join(incRoot, "cppwinrt");
  const binVersioned = join(sdkRoot, "Bin", sdkVersion, arch);
  const binFallback = join(sdkRoot, "Bin", arch);

  const next = { ...env };

  // SDK variables are not strictly required for linking, but setting them helps
  // downstream tools (rc.exe, mt.exe, and various build scripts) behave.
  if (typeof next.WindowsSdkDir !== "string" || next.WindowsSdkDir.length === 0) {
    next.WindowsSdkDir = `${sdkRoot}\\`;
  }
  if (typeof next.WindowsSDKVersion !== "string" || next.WindowsSDKVersion.length === 0) {
    next.WindowsSDKVersion = `${sdkVersion}\\`;
  }

  const addTo = (key, paths) => {
    const current = typeof next[key] === "string" ? next[key] : "";
    const parts = current.length > 0 ? splitPathList(current, ";") : [];
    const seen = new Set(parts.map((p) => p.toLowerCase()));
    for (const p of paths) {
      if (!p || !existsSync(p)) continue;
      const lower = p.toLowerCase();
      if (seen.has(lower)) continue;
      parts.push(p);
      seen.add(lower);
    }
    next[key] = parts.join(";");
  };

  addTo("LIB", [libUcrt, libUm]);
  addTo("INCLUDE", [incUcrt, incShared, incUm, incWinrt, incCppWinrt]);
  addTo("PATH", [binVersioned, binFallback]);

  return next;
}

function withMsvcDevEnv(env, hostTargetTriple) {
  if (process.platform !== "win32") return env;

  // If the environment already has the MSVC/SDK lib paths, don't mutate it.
  if (envHasLib(env, "msvcrt.lib") && envHasLib(env, "kernel32.lib")) return env;

  const vsInstallPath = tryGetVisualStudioInstallPath(env);
  if (!vsInstallPath) return env;

  const vsDevCmd = join(vsInstallPath, "Common7", "Tools", "VsDevCmd.bat");
  const vcvars64 = join(vsInstallPath, "VC", "Auxiliary", "Build", "vcvars64.bat");
  const batchFile = existsSync(vsDevCmd) ? vsDevCmd : existsSync(vcvars64) ? vcvars64 : null;
  if (!batchFile) return env;

  const targetArch = getMsvcArchFromRustTarget(hostTargetTriple);
  const hostArch = getMsvcHostArch();

  try {
    const batchArgs = batchFile.toLowerCase().endsWith("vsdevcmd.bat")
      ? ["-no_logo", `-arch=${targetArch}`, `-host_arch=${hostArch}`]
      : [];
    const next = runBatchAndGetEnv(batchFile, batchArgs, env);
    return envHasLib(next, "msvcrt.lib") ? next : env;
  } catch {
    return env;
  }
}

function spawnNpm(args, options) {
  // Prefer the npm CLI path provided by npm itself when running under `npm run`.
  // This avoids shell differences on Windows (cmd.exe vs bash) and PATH issues.
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && existsSync(npmExecPath)) {
    return spawnSync(process.execPath, [npmExecPath, ...args], options);
  }

  const candidates = process.platform === "win32" ? ["npm", "npm.cmd"] : ["npm"];
  let last = null;
  for (const cmd of candidates) {
    const res = spawnSync(cmd, args, options);
    last = res;
    if (!res.error) return res;
  }
  return last;
}

function canRunCargo(env) {
  try {
    execFileSync("cargo", ["--version"], { stdio: "ignore", env });
    return true;
  } catch {
    return false;
  }
}

function getCargoExePath(env) {
  const cargoHome =
    typeof env.CARGO_HOME === "string" && env.CARGO_HOME.length > 0
      ? env.CARGO_HOME
      : typeof env.USERPROFILE === "string" && env.USERPROFILE.length > 0
        ? join(env.USERPROFILE, ".cargo")
        : null;
  if (!cargoHome) return null;
  const cargoBin = join(cargoHome, "bin");
  const cargoExe =
    process.platform === "win32" ? join(cargoBin, "cargo.exe") : join(cargoBin, "cargo");
  return existsSync(cargoExe) ? cargoExe : null;
}

function ensureCargoOnPath(env) {
  if (canRunCargo(env)) return env;

  const cargoExe = getCargoExePath(env);
  if (!cargoExe) {
    const hint =
      process.platform === "win32"
        ? [
            "@rezi-ui/native: cargo not found (Rust toolchain missing).",
            "",
            "Install Rust (includes cargo) via rustup: https://rustup.rs/",
            "Then reopen your terminal and verify:",
            "  cargo --version",
            "  rustc --version",
          ].join("\n")
        : [
            "@rezi-ui/native: cargo not found (Rust toolchain missing).",
            "",
            "Install Rust via rustup: https://rustup.rs/",
            "Then verify: cargo --version",
          ].join("\n");
    process.stderr.write(`${hint}\n`);
    process.exit(1);
  }

  const next = { ...env };
  const cargoBin = join(cargoExe, "..");
  const currentPath = typeof next.PATH === "string" ? next.PATH : "";
  next.PATH = `${cargoBin}${delimiter}${currentPath}`;
  if (canRunCargo(next)) return next;

  process.stderr.write(
    `${[
      "@rezi-ui/native: cargo exists on disk but still isn't runnable from this npm script environment.",
      "",
      `Found cargo at: ${cargoExe}`,
      "",
      "Try running the build from a fresh terminal, or set PATH so it includes your Rust bin directory.",
      "On Windows with rustup, that's usually:",
      `  ${join(String(env.USERPROFILE ?? "C:\\Users\\<you>"), ".cargo", "bin")}`,
    ].join("\n")}\n`,
  );
  process.exit(1);
}

function withRustToolchainOnPath(env) {
  const next = { ...env };
  const currentPath = typeof next.PATH === "string" ? next.PATH : "";

  // When npm is configured to run scripts via Git Bash on Windows, PATH may not
  // include the Rust toolchain even if it exists on disk. The napi CLI shells
  // out to `cargo`, so ensure it's discoverable.
  const cargoHome =
    typeof next.CARGO_HOME === "string" && next.CARGO_HOME.length > 0
      ? next.CARGO_HOME
      : typeof next.USERPROFILE === "string" && next.USERPROFILE.length > 0
        ? join(next.USERPROFILE, ".cargo")
        : null;

  if (cargoHome) {
    const cargoBin = join(cargoHome, "bin");
    const cargoExe =
      process.platform === "win32" ? join(cargoBin, "cargo.exe") : join(cargoBin, "cargo");
    if (existsSync(cargoExe) && !currentPath.toLowerCase().includes(cargoBin.toLowerCase())) {
      next.PATH = `${cargoBin}${delimiter}${currentPath}`;
    }
  }

  // Ensure `napi` can find cargo even if it shells out through cmd.exe with a
  // different PATH resolution behavior.
  if (typeof next.CARGO !== "string" || next.CARGO.length === 0) {
    const cargoExe = getCargoExePath(next);
    if (cargoExe) next.CARGO = cargoExe;
  }

  return next;
}

function buildWithCargoDirectly(env, host) {
  const cargoExe = getCargoExePath(env) ?? "cargo";
  try {
    execFileSync(cargoExe, ["build", "--release", "--target", host], { stdio: "inherit", env });
  } catch (err) {
    if (process.platform === "win32") {
      process.stderr.write(
        `${[
          "",
          "@rezi-ui/native: cargo build failed on Windows.",
          "If you see linker errors like `LNK1104: cannot open file 'msvcrt.lib'` or missing headers like `stdint.h`,",
          "install Visual Studio Build Tools (MSVC v143 + Windows 10/11 SDK) and run the build from a VS Developer shell.",
          "",
        ].join("\n")}\n`,
      );
    }
    throw err;
  }

  const crateName = "rezi_ui_native";
  const targetDir = join(process.cwd(), "target", host, "release");
  const built =
    process.platform === "win32"
      ? join(targetDir, `${crateName}.dll`)
      : process.platform === "darwin"
        ? join(targetDir, `lib${crateName}.dylib`)
        : join(targetDir, `lib${crateName}.so`);

  if (!existsSync(built)) {
    throw new Error(`@rezi-ui/native: cargo build succeeded but output was not found: ${built}`);
  }

  // Node loads addons as .node (they are native shared libraries under the hood).
  // Keep both filenames as candidates for the JS loader.
  copyFileSync(built, join(process.cwd(), "rezi_ui_native.node"));
  copyFileSync(built, join(process.cwd(), "index.node"));
}

function getHostTargetTriple() {
  let out;
  try {
    out = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  } catch (err) {
    const hint =
      process.platform === "win32"
        ? "Install Rust from https://rustup.rs/ (or ensure `rustc.exe` is on PATH)."
        : "Install Rust via rustup (https://rustup.rs/) and ensure `rustc` is on PATH.";
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`@rezi-ui/native: rustc not found or not runnable.\n${hint}\n\n${detail}`);
  }
  const line = out
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("host: "));
  if (!line) throw new Error("Failed to determine Rust host triple from `rustc -vV`");
  return line.slice("host: ".length).trim();
}

let host;
try {
  host = getHostTargetTriple();
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

const scriptEnv = ensureCargoOnPath(
  withWindowsSdkEnv(withMsvcDevEnv(withRustToolchainOnPath(process.env), host), host),
);

// @napi-rs/cli parses Cargo.toml by running `cargo metadata` through cmd.exe on Windows.
// Some environments can run `cargo` fine from PowerShell, but cmd.exe fails to resolve it.
// Use a direct cargo build path on Windows to avoid that failure mode.
if (process.platform === "win32") {
  try {
    buildWithCargoDirectly(scriptEnv, host);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
} else {
  const res = spawnNpm(
    ["exec", "--", "napi", "build", "--platform", "--release", "--target", host, "--js", "false"],
    {
      stdio: "inherit",
      env: scriptEnv,
    },
  );

  if (res?.error) {
    const detail = res.error instanceof Error ? res.error.message : String(res.error);
    process.stderr.write(`@rezi-ui/native: failed to invoke npm.\n\n${detail}\n`);
    process.exit(1);
  }

  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

if (existsSync("./index.d.ts")) {
  const biomeArgs = ["format", "index.d.ts", "--write"];

  // On Windows, npm may be configured to run scripts via Git Bash, which can end up
  // selecting the POSIX `.bin/biome` shim that relies on `node` being resolvable via
  // a POSIX-style PATH. Run the Biome entrypoint with Node directly to avoid that.
  const fmt =
    process.platform === "win32"
      ? (() => {
          const initCwd = process.env.INIT_CWD;
          const roots = [
            typeof initCwd === "string" && initCwd.length > 0 ? initCwd : null,
            join(process.cwd(), "..", ".."),
          ].filter(Boolean);

          for (const root of roots) {
            const biomeEntrypoint = join(root, "node_modules", "@biomejs", "biome", "bin", "biome");
            if (existsSync(biomeEntrypoint)) {
              return spawnSync(process.execPath, [biomeEntrypoint, ...biomeArgs], {
                stdio: "inherit",
                env: scriptEnv,
              });
            }
          }

          // Fall back to `npm exec` if the entrypoint isn't where we expect.
          return spawnNpm(["exec", "--", "biome", ...biomeArgs], {
            stdio: "inherit",
            env: scriptEnv,
          });
        })()
      : spawnNpm(["exec", "--", "biome", ...biomeArgs], {
          stdio: "inherit",
          env: scriptEnv,
        });
  if (fmt?.error) {
    const detail = fmt.error instanceof Error ? fmt.error.message : String(fmt.error);
    process.stderr.write(
      `@rezi-ui/native: warning: failed to invoke npm for formatting index.d.ts (continuing).\n\n${detail}\n`,
    );
  }
  if (fmt.status !== 0) {
    process.stderr.write(
      `@rezi-ui/native: warning: biome format returned non-zero status (${fmt.status ?? "unknown"}); continuing.\n`,
    );
  }
}
