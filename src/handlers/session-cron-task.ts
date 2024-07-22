import { Pool } from 'pg';
import { RedisClient } from '../lib/redis';
import { getLogger } from '../util/logger.util';
import {
  getActiveSession,
  getCachedRooms,
  getInactiveConnectionIds,
  purgeCachedRooms,
  purgeSubscriptions,
  setSessionDisconnected,
  unsetSessionHeartbeat
} from '../module/service';
import { KeyNamespace } from '../module/types';

const logger = getLogger('session-cron');

export async function handler(pgPool: Pool, redisClient: RedisClient): Promise<void> {
  logger.info(`Processing session cron task to clean up hanging session data`);

  const pgClient = await pgPool.connect();

  try {
    const inactivConnectionIds = await getInactiveConnectionIds(logger, redisClient);

    if (!inactivConnectionIds?.length) {
      logger.info(`No inactive connections to process, exiting...`);
      return;
    }

    logger.info(`${inactivConnectionIds.length} inactive connections found`, {
      inactivConnectionIds
    });

    for (const connectionId of inactivConnectionIds) {
      const activeSession = await getActiveSession(logger, redisClient, connectionId);

      if (!activeSession) {
        const rooms = await getCachedRooms(logger, redisClient, connectionId);

        if (rooms && rooms.length > 0) {
          await Promise.all(
            rooms.map(async (nspRoomId) =>
              Promise.all([
                purgeCachedRooms(logger, redisClient, connectionId),
                purgeSubscriptions(
                  logger,
                  redisClient,
                  connectionId,
                  nspRoomId,
                  KeyNamespace.SUBSCRIPTIONS
                ),
                purgeSubscriptions(
                  logger,
                  redisClient,
                  connectionId,
                  nspRoomId,
                  KeyNamespace.PRESENCE
                ),
                purgeSubscriptions(
                  logger,
                  redisClient,
                  connectionId,
                  nspRoomId,
                  KeyNamespace.METRICS
                )
              ])
            )
          );
        }

        await setSessionDisconnected(logger, pgClient, connectionId);
        await unsetSessionHeartbeat(logger, redisClient, connectionId);

        logger.info(`Connection clean up complete`, { connectionId });
      }
    }
  } catch (err) {
    logger.error(`Failed to run session cron task`, { err });
    throw err;
  } finally {
    pgClient.release();
  }
}
