import { Pool } from 'pg';
import { RedisClient } from '@/lib/redis';
import { getLogger } from '@/util/logger.util';
import {
  broadcastSessionDestroy,
  getClientPresenceActiveRooms,
  removeActiveMember,
  unsetClientPresenceActive
} from '@/module/service';
import { SessionData, SocketConnectionEvent } from '@/module/types';

const logger = getLogger('session-user-inactive');

/**
 * Soft delete a user session. Inactivity timeout is 5000ms.
 *
 * This will trigger...
 * - Removal of member from active presence sets
 * - Broadcast session destroy message to clients subscibed to presence.leave for rooms associated with user
 *
 * This will not...
 * - Destroy all subscriptions (see session-destroy)
 */
export async function handler(
  pgPool: Pool,
  redisClient: RedisClient,
  data: SessionData & Partial<SocketConnectionEvent>
): Promise<void> {
  const { uid, connectionId, appPid } = data;

  logger.info(`Processing user inactive event for ${uid}`, { connectionId });

  try {
    const rooms = await getClientPresenceActiveRooms(logger, redisClient, appPid, uid);

    if (rooms && rooms.length > 0) {
      await Promise.all(
        rooms.map(async (nspRoomId) =>
          Promise.all([
            removeActiveMember(logger, redisClient, uid, nspRoomId),
            unsetClientPresenceActive(logger, redisClient, appPid, uid, nspRoomId),
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
