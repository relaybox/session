import { Pool } from 'pg';

let pgPool: Pool;

export function getPgPool(): Pool {
  if (pgPool) {
    return pgPool;
  }

  pgPool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    max: Number(process.env.DB_MAX_CONNECTIONS),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS),
    connectionTimeoutMillis: 2000
  });

  return pgPool;
}
