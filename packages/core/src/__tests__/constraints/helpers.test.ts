if (typeof require === "function") {
  require("tsx/cjs");
  require("./helpers.test.impl.ts");
} else {
  const dynamicImport = new Function("specifier", "return import(specifier);");
  dynamicImport("tsx")
    .then(() => dynamicImport("./helpers.test.impl.js"))
    .catch(() => {
      process.nextTick(() => {
        throw new Error("Failed to load helpers constraint test bootstrap.");
      });
    });
}
