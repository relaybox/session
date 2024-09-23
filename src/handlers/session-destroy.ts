import { Pool } from 'pg';
import { RedisClient } from '@/lib/redis';
import { getLogger } from '@/util/logger.util';
import {
  broadcastAuthUserDisconnectEvent,
  destoryRoomSubscriptions,
  destoryUserSubscriptions,
  getActiveSession,
  getAuthUser,
  setAuthUserOffline,
  setSessionDisconnected,
  unsetSessionHeartbeat
} from '@/module/service';
import { SessionData, SocketConnectionEvent } from '@/module/types';

const logger = getLogger('session-destroy');

export async function handler(
  pgPool: Pool,
  redisClient: RedisClient,
  data: SessionData & Partial<SocketConnectionEvent>
): Promise<void> {
  const { uid, connectionId, user, appPid } = data;

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

    await destoryRoomSubscriptions(logger, redisClient, connectionId);
    await destoryUserSubscriptions(logger, redisClient, connectionId);
    await setSessionDisconnected(logger, pgClient, connectionId);
    await unsetSessionHeartbeat(logger, redisClient, connectionId);

    if (user) {
      logger.debug(`Auth user attached to session, checking if online`, { uid, connectionId });

      const userIsOnline = await getAuthUser(logger, redisClient, appPid, user);

      if (!userIsOnline) {
        logger.debug(`User is not online, setting offline`, { uid, connectionId });
        await setAuthUserOffline(logger, pgClient, user.id);
        broadcastAuthUserDisconnectEvent(logger, user, data);
      }
    }

    logger.info(`Session destroy complete for ${connectionId}`, { uid, connectionId });
  } catch (err) {
    logger.error(`Session data destroy failed`, { err, uid, connectionId });
    throw err;
  } finally {
    pgClient.release();
  }
}
