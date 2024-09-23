import { Queue } from 'bullmq';
import { getLogger } from '@/util/logger.util';
import { JobName } from './router';

const logger = getLogger('session-cron-init');

const SESSION_QUEUE_NAME = 'session';
const SESSION_CRON_JOB_ID = 'session:cron';
const CRON_SCHEDULE_MINS = process.env.CRON_SCHEDULE_MINS;

const connectionOpts = {
  host: process.env.REDIS_HOST!,
  port: Number(process.env.REDIS_PORT!)
};

export const jobConfig = {
  jobId: SESSION_CRON_JOB_ID,
  repeat: {
    pattern: `0 */${CRON_SCHEDULE_MINS} * * * *`
  },
  removeOnComplete: true,
  removeOnFail: { count: 5 }
};

export const sessionQueue = new Queue(SESSION_QUEUE_NAME, {
  connection: connectionOpts,
  prefix: 'queue'
});

export async function startSessionCron() {
  logger.info(`Starting session cron`);

  try {
    await sessionQueue.add(JobName.SESSION_CRON_TASK, 1, jobConfig);
  } catch (err) {
    logger.error(`Failed to start session cron`, { err });
  }
}
