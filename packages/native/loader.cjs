const { readdirSync } = require("node:fs");

let native = null;
let lastErr = null;
const tried = [];

function tryDynamicRequire(file) {
  tried.push(file);
  try {
    return require(`./${file}`);
  } catch (err) {
    lastErr = err;
    return null;
  }
}

if (process.platform === "linux" && process.arch === "x64") {
  tried.push("rezi_ui_native.linux-x64-gnu.node");
  try {
    native = require("./rezi_ui_native.linux-x64-gnu.node");
  } catch (err) {
    lastErr = err;
  }

  if (!native) {
    tried.push("rezi_ui_native.linux-x64-musl.node");
    try {
      native = require("./rezi_ui_native.linux-x64-musl.node");
    } catch (err) {
      lastErr = err;
    }
  }

  if (!native) {
    tried.push("rezi_ui_native.linux-x64.node");
    try {
      native = require("./rezi_ui_native.linux-x64.node");
    } catch (err) {
      lastErr = err;
    }
  }
} else if (process.platform === "linux" && process.arch === "arm64") {
  tried.push("rezi_ui_native.linux-arm64-gnu.node");
  try {
    native = require("./rezi_ui_native.linux-arm64-gnu.node");
  } catch (err) {
    lastErr = err;
  }

  if (!native) {
    tried.push("rezi_ui_native.linux-arm64-musl.node");
    try {
      native = require("./rezi_ui_native.linux-arm64-musl.node");
    } catch (err) {
      lastErr = err;
    }
  }

  if (!native) {
    tried.push("rezi_ui_native.linux-arm64.node");
    try {
      native = require("./rezi_ui_native.linux-arm64.node");
    } catch (err) {
      lastErr = err;
    }
  }
} else if (process.platform === "darwin" && process.arch === "x64") {
  tried.push("rezi_ui_native.darwin-x64.node");
  try {
    native = require("./rezi_ui_native.darwin-x64.node");
  } catch (err) {
    lastErr = err;
  }
} else if (process.platform === "darwin" && process.arch === "arm64") {
  tried.push("rezi_ui_native.darwin-arm64.node");
  try {
    native = require("./rezi_ui_native.darwin-arm64.node");
  } catch (err) {
    lastErr = err;
  }
} else if (process.platform === "win32" && process.arch === "x64") {
  tried.push("rezi_ui_native.win32-x64-msvc.node");
  try {
    native = require("./rezi_ui_native.win32-x64-msvc.node");
  } catch (err) {
    lastErr = err;
  }
} else if (process.platform === "win32" && process.arch === "arm64") {
  tried.push("rezi_ui_native.win32-arm64-msvc.node");
  try {
    native = require("./rezi_ui_native.win32-arm64-msvc.node");
  } catch (err) {
    lastErr = err;
  }
}

if (!native) {
  const platformCandidates = [
    "rezi_ui_native.linux-x64-gnu.node",
    "rezi_ui_native.linux-x64-musl.node",
    "rezi_ui_native.linux-x64.node",
    "rezi_ui_native.linux-arm64-gnu.node",
    "rezi_ui_native.linux-arm64-musl.node",
    "rezi_ui_native.linux-arm64.node",
    "rezi_ui_native.darwin-x64.node",
    "rezi_ui_native.darwin-arm64.node",
    "rezi_ui_native.win32-x64-msvc.node",
    "rezi_ui_native.win32-arm64-msvc.node",
  ];

  let discovered = [];
  try {
    discovered = readdirSync(__dirname).filter((file) => file.endsWith(".node"));
  } catch {
    discovered = [];
  }

  const candidates = ["index.node", "rezi_ui_native.node", ...platformCandidates, ...discovered];

  for (const file of new Set(candidates)) {
    native = tryDynamicRequire(file);
    if (native) break;
  }
}

if (!native) {
  const extra =
    lastErr instanceof Error ? `\n\nLast error:\n${lastErr.stack ?? lastErr.message}` : "";
  throw new Error(
    `Failed to load @rezi-ui/native binary. Tried: ${[...new Set(tried)].join(", ")}${extra}`,
  );
}

module.exports = native;
