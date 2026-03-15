declare module 'node:process' {
  const process: any;
  export default process;
}

declare module 'node:path' {
  const path: any;
  export default path;
}

declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: string): Promise<string>;
  export function writeFile(path: string, data: string, encoding: string): Promise<void>;
}

declare module 'node:readline' {
  export interface Interface {
    question(prompt: string, cb: (answer: string) => void): void;
    on(event: string, listener: (...args: any[]) => void): this;
    close(): void;
  }

  const readline: {
    createInterface(options: {
      input: any;
      output: any;
      terminal?: boolean;
    }): Interface;
  };

  export default readline;
}
