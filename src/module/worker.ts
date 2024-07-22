import { Job, Worker } from 'bullmq';
import { getLogger } from '../util/logger.util';
import { JobName, router } from './router';
import { createClient } from '../lib/redis';
import { getPgPool } from '../lib/pg';

const logger = getLogger('session');

const QUEUE_NAME = 'session';
const REDIS_HOST = process.env.REDIS_HOST!;
const REDIS_PORT = Number(process.env.REDIS_PORT!);

const pgPool = getPgPool();

const redisClient = createClient({
  host: REDIS_HOST,
  port: REDIS_PORT
});

const workerConnectionOpts = {
  host: REDIS_HOST,
  port: REDIS_PORT
};

async function handler({ id, name, data }: Job) {
  logger.info(`Processing job ${id} (${name})`, { data });
  await router(pgPool, redisClient, name as JobName, data);
}

export async function startWorker() {
  await redisClient.connect();

  const worker = new Worker(QUEUE_NAME, handler, {
    connection: workerConnectionOpts,
    prefix: 'queue'
  });

  worker.on('failed', (job: Job<any, void, string> | undefined, err: Error, prev: string) => {
    logger.error(`Failed to process job ${job?.id}`, { err });
  });
}
