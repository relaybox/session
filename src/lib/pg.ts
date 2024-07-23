import { Pool } from 'pg';
import { getLogger } from '../util/logger.util';

const logger = getLogger(`pg-pool`);

const RDS_ROOT_CERTIFICATE = process.env.RDS_ROOT_CERTIFICATE || '';

console.log('CERT', RDS_ROOT_CERTIFICATE.slice(0, 100));

let pgPool: Pool;

export function getPgPool(): Pool {
  if (pgPool) {
    return pgPool;
  }

  logger.info('Creating pg pool', { host: process.env.DB_HOST, name: process.env.DB_NAME });

  pgPool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    max: Number(process.env.DB_MAX_CONNECTIONS),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS),
    connectionTimeoutMillis: 2000,
    ssl: {
      rejectUnauthorized: true,
      ca: RDS_ROOT_CERTIFICATE
    }
  });

  return pgPool;
}

process.on('SIGINT', async () => {
  if (pgPool) {
    await pgPool.end();
    logger.info('PG pool ended through app termination, exiting...');
  }

  process.exit(0);
});
