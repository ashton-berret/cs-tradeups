declare module 'bun:test' {
  export const beforeEach: (
    fn: () => void | Promise<void>,
  ) => void;
  export const describe: (name: string, fn: () => void) => void;
  export const it: (name: string, fn: () => void | Promise<void>) => void;
  export const mock: {
    module: (specifier: string, factory: () => unknown) => void;
  };
  export const expect: any;
}
