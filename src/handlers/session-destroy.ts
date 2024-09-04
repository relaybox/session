import { Pool } from 'pg';
import { RedisClient } from '../lib/redis';
import { getLogger } from '../util/logger.util';
import {
  broadcastDisconnectEvent,
  getActiveSession,
  getAuthUser,
  getCachedRooms,
  getCachedUsers,
  purgeCachedRooms,
  purgeCachedUsers,
  purgeSubscriptions,
  purgeUserSubscriptions,
  setAuthUserOffline,
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

    const users = await getCachedUsers(logger, redisClient, connectionId);

    if (users && users.length > 0) {
      await Promise.all(
        users.map(async (clientId) =>
          Promise.all([
            purgeCachedUsers(logger, redisClient, connectionId),
            purgeUserSubscriptions(logger, redisClient, connectionId, clientId)
          ])
        )
      );
    }

    await setSessionDisconnected(logger, pgClient, connectionId);
    await unsetSessionHeartbeat(logger, redisClient, connectionId);

    if (user) {
      logger.debug(`Auth user attached to session, checking if online`, { uid, connectionId });

      const userIsOnline = await getAuthUser(logger, redisClient, appPid, user);

      if (!userIsOnline) {
        logger.debug(`User is not online, setting offline`, { uid, connectionId });
        await setAuthUserOffline(logger, pgClient, user.id);
        broadcastDisconnectEvent(logger, user, data);
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
