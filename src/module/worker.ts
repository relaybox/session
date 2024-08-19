import { Job, Worker } from 'bullmq';
import { getLogger } from '../util/logger.util';
import { JobName, router } from './router';
import { connectionOptionsIo, getRedisClient } from '../lib/redis';
import { getPgPool } from '../lib/pg';

const logger = getLogger('session');

const QUEUE_NAME = 'session';

const pgPool = getPgPool();
const redisClient = getRedisClient();

async function handler({ id, name, data }: Job) {
  logger.info(`Processing job ${id} (${name})`, { data });
  await router(pgPool, redisClient, name as JobName, data);
}

export async function startWorker() {
  await redisClient.connect();

  const worker = new Worker(QUEUE_NAME, handler, {
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
