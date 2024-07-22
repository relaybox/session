import { Pool } from 'pg';
import { RedisClient } from '../lib/redis';
import { getLogger } from '../util/logger.util';
import { broadcastSessionDestroy, getCachedRooms, removeActiveMember } from '../module/service';
import { SessionData, SocketConnectionEvent } from '../module/types';

const logger = getLogger('session-user-inactive');

export async function handler(
  pgPool: Pool,
  redisClient: RedisClient,
  data: SessionData & Partial<SocketConnectionEvent>
): Promise<void> {
  const { uid, connectionId } = data;

  try {
    const rooms = await getCachedRooms(logger, redisClient, connectionId);

    if (rooms && rooms.length > 0) {
      await Promise.all(
        rooms.map(async (nspRoomId) =>
          Promise.all([
            removeActiveMember(logger, redisClient, uid, nspRoomId),
            broadcastSessionDestroy(logger, uid, nspRoomId, data)
          ])
        )
      );
    }
  } catch (err) {
    logger.error(`Session user destroy failed`, err);
    throw err;
  }
}
