import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

function findPackageJson(startPath) {
  let dir = path.dirname(startPath);
  for (let i = 0; i < 25; i += 1) {
    const candidate = path.join(dir, "package.json");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function patchRealInkLayoutTiming() {
  const repoRoot = process.cwd();
  const benchAppEntry = path.join(repoRoot, "packages/bench-app/dist/entry.js");
  const req = createRequire(existsSync(benchAppEntry) ? benchAppEntry : import.meta.url);
  let inkEntryPath;
  try {
    inkEntryPath = req.resolve("ink");
  } catch {
    return;
  }

  const pkgPath = findPackageJson(inkEntryPath);
  if (!pkgPath) return;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    return;
  }
  if (pkg?.name !== "@jrichman/ink") return;

  const pkgRoot = path.dirname(pkgPath);
  const instancesPath = path.join(pkgRoot, "build", "instances.js");
  if (!existsSync(instancesPath)) return;

  const instancesModule = await import(pathToFileURL(instancesPath).href);
  const instances = instancesModule?.default;
  if (!instances || typeof instances !== "object") return;

  if (instances.__reziInkBenchPatched) return;
  instances.__reziInkBenchPatched = true;

  const originalSet = instances.set?.bind(instances);
  if (typeof originalSet !== "function") return;

  instances.set = (key, instance) => {
    try {
      if (instance && typeof instance === "object" && !instance.__reziInkBenchPatched) {
        instance.__reziInkBenchPatched = true;
        instance.__reziInkBenchLayoutAccumMs = 0;

        const rootNode = instance.rootNode;
        if (rootNode && typeof rootNode.onComputeLayout === "function") {
          const originalComputeLayout = rootNode.onComputeLayout.bind(rootNode);
          rootNode.onComputeLayout = () => {
            const start = performance.now();
            const ret = originalComputeLayout();
            const dt = performance.now() - start;
            instance.__reziInkBenchLayoutAccumMs = (instance.__reziInkBenchLayoutAccumMs ?? 0) + dt;
            return ret;
          };
        }

        const options = instance.options;
        const originalOnRender = options?.onRender;
        if (options && typeof originalOnRender === "function") {
          options.onRender = (metrics) => {
            const layoutTimeMs =
              typeof instance.__reziInkBenchLayoutAccumMs === "number"
                ? instance.__reziInkBenchLayoutAccumMs
                : 0;
            instance.__reziInkBenchLayoutAccumMs = 0;

            if (metrics && typeof metrics === "object") {
              return originalOnRender({ ...metrics, layoutTimeMs });
            }
            return originalOnRender({ renderTime: 0, output: "", staticOutput: "", layoutTimeMs });
          };
        }
      }
    } catch {
      // ignore
    }
    return originalSet(key, instance);
  };
}

await patchRealInkLayoutTiming();
