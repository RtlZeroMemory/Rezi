if (typeof require === "function") {
  require("tsx/cjs");
  require("./parser.test.impl.ts");
} else {
  const dynamicImport = new Function("specifier", "return import(specifier);");
  dynamicImport("tsx")
    .then(() => dynamicImport("./parser.test.impl.js"))
    .catch(() => {
      process.nextTick(() => {
        throw new Error("Failed to load parser constraint test bootstrap.");
      });
    });
}
