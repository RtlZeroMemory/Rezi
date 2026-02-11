declare module "terminal-kit" {
  const termkit: {
    createTerminal: (opts: Record<string, unknown>) => unknown;
    ScreenBuffer: new (
      opts: Record<string, unknown>,
    ) => {
      put: (opts: Record<string, unknown>, str: string) => void;
      fill: (opts?: Record<string, unknown>) => void;
      draw: (opts: { delta: boolean }) => void;
      width: number;
      height: number;
    };
  };
  export = termkit;
}
