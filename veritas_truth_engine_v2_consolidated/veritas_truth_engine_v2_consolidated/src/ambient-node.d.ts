declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
  cwd(): string;
  exit(code?: number): never;
};

declare module "node:http" {
  const http: {
    createServer(handler: (req: any, res: any) => void | Promise<void>): {
      listen(port: number, cb?: () => void): void;
    };
  };
  export default http;
}
