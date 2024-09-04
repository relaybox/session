import { Pool } from 'pg';
import { RedisClient } from '../lib/redis';
import { getLogger } from '../util/logger.util';
import {
  addAuthUser,
  broadcastUserEvent,
  deleteAuthUser,
  getAppId,
  getConnectionEventId,
  saveSessionData,
  saveSocketConnectionEvent,
  setAuthUserOnline
} from '../module/service';
import {
  AuthUserEvent,
  SessionData,
  SocketConnectionEvent,
  SocketConnectionEventType
} from '../module/types';

const logger = getLogger('session-socket-connection-event');

export async function handler(
  pgPool: Pool,
  redisClient: RedisClient,
  data: SessionData & Partial<SocketConnectionEvent>
): Promise<void> {
  const pgClient = await pgPool.connect();

  const { appPid, connectionId, socketId, connectionEventType, user } = data;

  logger.info(`Processing connection event of type ${connectionEventType} for ${connectionId}`, {
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
        return;
      }

      if (user) {
        await deleteAuthUser(logger, redisClient, appPid, user);
      }
    }

    if (connectionEventType === SocketConnectionEventType.CONNECT && user) {
      await setAuthUserOnline(logger, pgClient, user.id);
      await addAuthUser(logger, redisClient, appPid, user);
      broadcastUserEvent(logger, appPid, user, AuthUserEvent.ONLINE, data);
    }

    await saveSocketConnectionEvent(logger, pgClient, appId, data);
  } catch (err: any) {
    logger.error(`Failed to process socket connection event`, { err });
    throw err;
  } finally {
    pgClient.release();
  }
}
