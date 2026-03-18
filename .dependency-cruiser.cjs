/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "Keep the runtime-relevant workspace source graph acyclic.",
      severity: "error",
      from: {
        path: "^(packages|examples)/",
      },
      to: {
        circular: true,
        dependencyTypesNot: ["type-only", "pre-compilation-only"],
      },
    },
    {
      name: "core-no-runtime-packages",
      comment: "@rezi-ui/core must not depend on node/jsx/native packages.",
      severity: "error",
      from: {
        path: "^packages/core/src/",
      },
      to: {
        path: "^(packages/(node|jsx|native)/|node_modules/@rezi-ui/(node|jsx|native)/)",
      },
    },
    {
      name: "jsx-only-depends-on-core",
      comment: "@rezi-ui/jsx must stay independent from node/native runtime packages.",
      severity: "error",
      from: {
        path: "^packages/jsx/src/",
      },
      to: {
        path: "^(packages/(node|native)/|node_modules/@rezi-ui/(node|native)/)",
      },
    },
    {
      name: "node-does-not-depend-on-jsx",
      comment: "@rezi-ui/node should not depend on the JSX package.",
      severity: "error",
      from: {
        path: "^packages/node/src/",
      },
      to: {
        path: "^(packages/jsx/|node_modules/@rezi-ui/jsx/)",
      },
    },
    {
      name: "no-orphans",
      comment: "Publishable source should hang off a package entrypoint or an approved test root.",
      severity: "warn",
      from: {
        orphan: true,
        path: "^packages/(core|node|jsx|testkit)/src/",
        pathNot: [
          "(^|/)(__tests__|__e2e__)/", // Approved test roots.
          "|\\.d\\.ts$", // Declaration files.
          "|writers\\.gen\\.ts$", // Generated drawlist writers.
          "|(^|/)(index|all|abi|backend|composition|drawApi|events|pipeline|terminalCaps|terminalProfile|ui)\\.ts$", // Known entry/barrel filenames.
          "|^packages/core/src/(cursor|debug|drawlist|forms|keybindings|layout|protocol|router|testing|theme|widgets)/index\\.ts$", // Core package submodule barrels.
          "|^packages/jsx/src/jsx-(dev-)?runtime\\.ts$", // JSX runtime entry points.
        ].join(""),
      },
      to: {},
    },
  ],
  options: {
    includeOnly: "^(packages|examples)/",
    exclude: {
      path: "(^|/)(dist|node_modules|vendor|out|results|snapshots|target)/",
    },
    doNotFollow: {
      path: "(^|/)(node_modules|dist|vendor|out|results|snapshots|target)/",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "default", "node"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".d.ts", ".json"],
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.ci.json",
    },
  },
};
