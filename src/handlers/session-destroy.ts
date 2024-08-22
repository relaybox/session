import { Pool } from 'pg';
import { RedisClient } from '../lib/redis';
import { getLogger } from '../util/logger.util';
import {
  getActiveSession,
  getCachedRooms,
  purgeCachedRooms,
  purgeSubscriptions,
  setSessionDisconnected,
  unsetSessionHeartbeat
} from '../module/service';
import { KeyNamespace, SessionData, SocketConnectionEvent } from '../module/types';

const logger = getLogger('session-destroy');

export async function handler(
  pgPool: Pool,
  redisClient: RedisClient,
  data: SessionData & Partial<SocketConnectionEvent>
): Promise<void> {
  const { uid, connectionId } = data;

  logger.info(`Preparing to destroy session data for (${connectionId})`, { uid, connectionId });

  const pgClient = await pgPool.connect();

  try {
    const activeSession = await getActiveSession(logger, redisClient, connectionId);

    if (activeSession) {
      logger.debug(`Active session found, maintain session`, { connectionId });
      return;
    }

    logger.debug(`No active session found for ${connectionId}, executing destroy`, {
      uid,
      connectionId
    });

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
            purgeSubscriptions(logger, redisClient, connectionId, nspRoomId, KeyNamespace.PRESENCE),
            purgeSubscriptions(logger, redisClient, connectionId, nspRoomId, KeyNamespace.METRICS)
          ])
        )
      );
    }

    await setSessionDisconnected(logger, pgClient, connectionId);
    await unsetSessionHeartbeat(logger, redisClient, connectionId);

    logger.debug(`Session destroy complete for ${connectionId}`);
  } catch (err) {
    logger.error(`Session data destroy failed`, err);
    throw err;
  } finally {
    pgClient.release();
  }
}
