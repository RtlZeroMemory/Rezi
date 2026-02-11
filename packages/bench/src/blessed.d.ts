declare module "blessed" {
  const blessed: {
    screen: (opts: Record<string, unknown>) => {
      render: () => void;
      destroy: () => void;
      append: (el: unknown) => void;
      remove: (el: unknown) => void;
      children: unknown[];
      program: { flush: () => void };
    };
    box: (opts: Record<string, unknown>) => unknown;
    text: (opts: Record<string, unknown>) => unknown;
    line: (opts: Record<string, unknown>) => unknown;
  };
  export = blessed;
}
