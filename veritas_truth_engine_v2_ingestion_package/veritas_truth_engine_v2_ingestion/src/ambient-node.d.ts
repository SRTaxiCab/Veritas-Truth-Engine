declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

declare module "node:http" {
  const http: {
    createServer(handler: (req: any, res: any) => void | Promise<void>): {
      listen(port: number, cb?: () => void): void;
    };
  };
  export default http;
}


declare module "node:fs" {
  const fs: {
    readFileSync(path: string, encoding?: string): any;
  };
  export default fs;
}

declare module "node:path" {
  const path: {
    extname(p: string): string;
    basename(p: string): string;
  };
  export default path;
}

declare module "node:crypto" {
  const crypto: {
    createHash(algo: string): {
      update(input: string): any;
      digest(encoding: string): string;
    };
  };
  export default crypto;
}

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
  exit(code?: number): never;
};
