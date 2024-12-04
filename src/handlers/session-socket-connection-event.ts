import { Pool } from 'pg';
import { RedisClient } from '@/lib/redis';
import { getLogger } from '@/util/logger.util';
import {
  addAuthUser,
  addAuthUserConnection,
  broadcastAuthUserConnectEvent,
  broadcastAuthUserDisconnectEvent,
  deleteAuthUser,
  deleteAuthUserConnection,
  getAppId,
  getConnectionEventId,
  saveSessionData,
  saveSocketConnectionEvent,
  setAuthUserOnline
} from '@/module/service';
import { SessionData, SocketConnectionEvent, SocketConnectionEventType } from '@/module/types';

const logger = getLogger('session-socket-connection-event');

export async function handler(
  pgPool: Pool,
  redisClient: RedisClient,
  data: SessionData & Partial<SocketConnectionEvent>
): Promise<void> {
  const pgClient = await pgPool.connect();

  const { appPid, connectionId, socketId, connectionEventType, user } = data;

  logger.info(`Processing connection event of type "${connectionEventType}" for ${connectionId}`, {
    connectionEventType,
    connectionId
  });

  try {
    const appId = await getAppId(logger, pgClient, appPid);

    await saveSessionData(logger, pgClient, appId, data);

    if (connectionEventType === SocketConnectionEventType.DISCONNECT) {
      const socketConnectionEventId = await getConnectionEventId(
        logger,
        pgClient,
        connectionId,
        socketId
      );

      if (!socketConnectionEventId) {
        logger.debug(`Socket connection event not found, exiting.`);
        return;
      }

      if (user) {
        /**
         * Delete current connection and return any remaining connections for the user (by clientId).
         * If no remaining active connections, continue with deleting the user.
         * If active connections are found it means that the user is still active
         * following multiple sessions being opened
         */
        const remainingAuthUserConnectionsCount = await deleteAuthUserConnection(
          logger,
          redisClient,
          appPid,
          user.clientId,
          connectionId
        );

        if (remainingAuthUserConnectionsCount === 0) {
          await deleteAuthUser(logger, redisClient, appPid, user);
          broadcastAuthUserDisconnectEvent(logger, user, data);
        }
      }
    }

    if (connectionEventType === SocketConnectionEventType.CONNECT && user) {
      await setAuthUserOnline(logger, pgClient, user.id);
      await addAuthUser(logger, redisClient, appPid, user);
      await addAuthUserConnection(logger, redisClient, appPid, connectionId, user.clientId);
      broadcastAuthUserConnectEvent(logger, user, data);
    }

    await saveSocketConnectionEvent(logger, pgClient, appId, data);
  } catch (err: any) {
    logger.error(`Failed to process socket connection event`, { err });
    throw err;
  } finally {
    pgClient.release();
  }
}
