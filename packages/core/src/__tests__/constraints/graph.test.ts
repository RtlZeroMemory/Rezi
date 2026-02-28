if (typeof require === "function") {
  require("tsx/cjs");
  require("./graph.test.impl.ts");
} else {
  const dynamicImport = new Function("specifier", "return import(specifier);");
  dynamicImport("tsx")
    .then(() => dynamicImport("./graph.test.impl.js"))
    .catch(() => {
      process.nextTick(() => {
        throw new Error("Failed to load graph constraint test bootstrap.");
      });
    });
}
