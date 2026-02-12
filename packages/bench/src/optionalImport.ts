// Bench-only helper to keep optional framework imports from becoming hard deps.
// Using a non-literal specifier avoids TypeScript module resolution errors when
// the optional package isn't installed in this workspace.

// biome-ignore lint/suspicious/noExplicitAny: bench harness intentionally treats optional deps as `any`.
export async function optionalImport(specifier: string): Promise<any> {
  return import(specifier);
}

