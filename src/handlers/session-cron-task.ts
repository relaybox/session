import { Pool } from 'pg';
import { RedisClient } from '@/lib/redis';
import { getLogger } from '@/util/logger.util';
import {
  deletePresenceSets,
  destroyRoomSubscriptions,
  destroyUserSubscriptions,
  getActiveSession,
  getInactiveConnectionIds,
  setSessionDisconnected,
  unsetSessionHeartbeat
} from '@/module/service';

const logger = getLogger('session-cron');

export async function handler(pgPool: Pool, redisClient: RedisClient): Promise<void> {
  logger.info(`Processing session cron task to clean up hanging session data`);

  const pgClient = await pgPool.connect();

  try {
    const inactivConnectionIds = await getInactiveConnectionIds(logger, redisClient);

    if (!inactivConnectionIds?.length) {
      logger.debug(`No inactive connections to process, exiting...`);
      return;
    }

    logger.debug(`${inactivConnectionIds.length} inactive connections found`, {
      inactivConnectionIds
    });

    for (const connectionId of inactivConnectionIds) {
      const activeSession = await getActiveSession(logger, redisClient, connectionId);

      if (!activeSession) {
        await Promise.all([
          destroyRoomSubscriptions(logger, redisClient, connectionId),
          destroyUserSubscriptions(logger, redisClient, connectionId),
          setSessionDisconnected(logger, pgClient, connectionId),
          unsetSessionHeartbeat(logger, redisClient, connectionId),
          deletePresenceSets(logger, redisClient, connectionId)
        ]);

        logger.debug(`Connection clean up complete`, { connectionId });
      }
    }
  } catch (err) {
    logger.error(`Failed to run session cron task`, { err });
    throw err;
  } finally {
    pgClient.release();
  }
}
