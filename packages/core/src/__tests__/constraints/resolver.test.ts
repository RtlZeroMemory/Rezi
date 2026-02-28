if (typeof require === "function") {
  require("tsx/cjs");
  require("./resolver.test.impl.ts");
} else {
  const dynamicImport = new Function("specifier", "return import(specifier);");
  dynamicImport("tsx")
    .then(() => dynamicImport("./resolver.test.impl.js"))
    .catch(() => {
      process.nextTick(() => {
        throw new Error("Failed to load resolver constraint test bootstrap.");
      });
    });
}
