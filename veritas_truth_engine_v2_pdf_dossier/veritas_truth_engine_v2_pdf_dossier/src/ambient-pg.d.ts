declare module "pg" {
  export interface QueryResult<T = any> {
    rows: T[];
  }

  export interface PoolConfig {
    connectionString?: string;
    max?: number;
    ssl?: any;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<T = any>(text: string, values?: any[]): Promise<QueryResult<T>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }

  export interface PoolClient {
    query<T = any>(text: string, values?: any[]): Promise<QueryResult<T>>;
    release(): void;
  }
}
