if (typeof require === "function") {
  require("tsx/cjs");
  require("./integration.test.impl.ts");
} else {
  const dynamicImport = new Function("specifier", "return import(specifier);");
  dynamicImport("tsx")
    .then(() => dynamicImport("./integration.test.impl.js"))
    .catch(() => {
      process.nextTick(() => {
        throw new Error("Failed to load integration constraint test bootstrap.");
      });
    });
}
