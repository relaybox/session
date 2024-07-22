import { Pool } from 'pg';
import { RedisClient } from '../lib/redis';
import { getLogger } from '../util/logger.util';
import { setSessionActive, setSessionHeartbeat } from '../module/service';
import { SessionData, SocketConnectionEvent } from '../module/types';

const logger = getLogger('session-heartbeat');

export async function handler(
  pgPool: Pool,
  redisClient: RedisClient,
  data: SessionData & Partial<SocketConnectionEvent>
): Promise<void> {
  try {
    await setSessionHeartbeat(logger, redisClient, data);
  } catch (err: any) {
    logger.error(`Failed to set session active`, { err });
    throw err;
  }
}
