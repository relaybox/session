import { Pool } from 'pg';
import { RedisClient } from '@/lib/redis';
import { getLogger } from '@/util/logger.util';
import {
  broadcastSessionDestroy,
  deletePresenceSets,
  getConnectionPresenceSets,
  removeActiveMember
} from '@/module/service';
import { SessionData, SocketConnectionEvent } from '@/module/types';

const logger = getLogger('session-user-inactive');

/**
 * Soft delete a user session.
 * Inactivity timeout is 5000ms (Job added from core).
 * Removes member from active presence sets and
 * broadcasts session destroy message to clients subscibed to `presence.leave` for rooms associated with user.
 * This will not destroy room, presence or user action subscriptions (see session-destroy)
 */
export async function handler(
  pgPool: Pool,
  redisClient: RedisClient,
  data: SessionData & Partial<SocketConnectionEvent>
): Promise<void> {
  const { uid, connectionId } = data;

  logger.info(`Processing user inactive event for ${uid}`, { connectionId });

  try {
    const presenceSets = await getConnectionPresenceSets(logger, redisClient, connectionId);

    if (presenceSets.length > 0) {
      await Promise.all(
        presenceSets.map(
          async (nspRoomId) =>
            await Promise.all([
              removeActiveMember(logger, redisClient, connectionId, nspRoomId),
              broadcastSessionDestroy(logger, uid, nspRoomId, data)
            ])
        )
      );
    }

    await deletePresenceSets(logger, redisClient, connectionId);
  } catch (err) {
    logger.error(`Session user destroy failed`, err);
    throw err;
  }
}
