import { Job, Worker } from 'bullmq';
import { getLogger } from '../util/logger.util';
import { JobName, router } from './router';
import { cleanupRedisClient, connectionOptionsIo, getRedisClient } from '../lib/redis';
import { cleanupPgPool, getPgPool } from '../lib/pg';

const QUEUE_NAME = 'session';

const logger = getLogger(QUEUE_NAME);
const pgPool = getPgPool();
const redisClient = getRedisClient();

let worker: Worker | null;

async function initializeConnections(): Promise<void> {
  if (!pgPool) {
    throw new Error('Failed to initialize PG pool');
  }

  if (!redisClient) {
    throw new Error('Failed to initialize Redis client');
  }

  try {
    await redisClient.connect();
  } catch (err) {
    logger.error('Failed to connect to Redis', { err });
    throw err;
  }
}

async function handler({ id, name, data }: Job) {
  if (!pgPool || !redisClient) {
    throw new Error('Database connections not initialized');
  }

  logger.info(`Processing job ${id} (${name})`, { data });

  await router(pgPool, redisClient, name as JobName, data);
}

export async function startWorker() {
  await initializeConnections();

  worker = new Worker(QUEUE_NAME, handler, {
    connection: connectionOptionsIo,
    prefix: 'queue'
  });

  worker.on('failed', (job: Job<any, void, string> | undefined, err: Error, prev: string) => {
    logger.error(`Failed to process job ${job?.id}`, { err });
  });

  worker.on('ready', () => {
    logger.info(`Session worker ready`);
  });

  worker.on('active', () => {
    logger.info(`Session worker active`);
  });
}

async function stopWorker(): Promise<void> {
  if (!worker) {
    throw new Error('Worker not initialized');
  }

  try {
    await worker.close();
  } catch (err) {
    logger.error('Failed to close worker', { err });
  } finally {
    worker = null;
  }
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down session worker`);

  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);

  try {
    await Promise.all([stopWorker(), cleanupRedisClient(), cleanupPgPool()]);

    clearTimeout(shutdownTimeout);

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (err) {
    logger.error('Error during graceful shutdown', { err });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
