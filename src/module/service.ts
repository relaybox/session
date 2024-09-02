import { Logger } from 'winston';
import * as sessionRepository from './repository';
import {
  AuthUser,
  KeyNamespace,
  KeyPrefix,
  KeySuffix,
  SessionData,
  SubscriptionType
} from './types';
import { RedisClient } from '../lib/redis';
import { dispatch } from '../lib/publisher';
import { PoolClient } from 'pg';
import * as sessionDb from './db';

const PLATFORM_RESERVED_NAMESPACE = '$';
const WS_IDLE_TIMEOUT_MS = Number(process.env.WS_IDLE_TIMEOUT_MS) || 0;
const ACTIVE_SESSION_HEARTBEAT_SCORE_MAX = WS_IDLE_TIMEOUT_MS * 4; // Sorted set score max threshold
const ACTIVE_SESSION_EXPIRY_SECS = (WS_IDLE_TIMEOUT_MS / 1000) * 3; // Expiry time for active session key
const CRON_TASK_MAX_INACTIVE_SESSIONS_COUNT = 100; // Limit of number of entires fetched per cron run

function formatKey(keyParts: string[]): string {
  return keyParts.join(':');
}

export function formatPresenceSubscription(nspRoomId: string, event: string): string {
  return `${nspRoomId}:${PLATFORM_RESERVED_NAMESPACE}:presence:${event}`;
}

export function getCachedRooms(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string
): Promise<string[] | null> {
  logger.debug(`Getting cached rooms`, { connectionId });

  const key = `${KeyPrefix.CONNECTION}:${connectionId}:${KeySuffix.ROOMS}`;

  return sessionRepository.getCachedRooms(redisClient, key);
}

export function purgeCachedRooms(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string
): Promise<number> {
  logger.debug(`Purging cached rooms`, { connectionId });

  const key = `${KeyPrefix.CONNECTION}:${connectionId}:${KeySuffix.ROOMS}`;

  return sessionRepository.purgeCachedRooms(redisClient, key);
}

export async function purgeSubscriptions(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string,
  nspRoomId: string,
  keyNamespace: KeyNamespace
) {
  logger.debug(`Deleting all ${keyNamespace} subscriptions`, {
    connectionId,
    nspRoomId,
    keyNamespace
  });

  const key = formatKey([KeyPrefix.CONNECTION, connectionId, keyNamespace, nspRoomId]);

  try {
    const subscriptions = await sessionRepository.getAllSubscriptions(redisClient, key);

    await Promise.all(
      subscriptions.map(async (subscription) =>
        sessionRepository.deleteSubscription(redisClient, key, subscription)
      )
    );
  } catch (err) {
    logger.error(`Failed to delete subscriptions`, { connectionId, nspRoomId, keyNamespace, err });
    throw err;
  }
}

export async function removeActiveMember(
  logger: Logger,
  redisClient: RedisClient,
  uid: string,
  nspRoomId: string
): Promise<void> {
  logger.debug(`Removing active member`, { uid, nspRoomId });

  const keyPrefix = formatKey([KeyPrefix.PRESENCE, nspRoomId]);

  try {
    await Promise.all([
      sessionRepository.removeActiveMember(redisClient, `${keyPrefix}:${KeySuffix.MEMBERS}`, uid),
      sessionRepository.shiftActiveMember(redisClient, `${keyPrefix}:${KeySuffix.INDEX}`, uid)
    ]);
  } catch (err) {
    logger.error(`Failed to remove active member`, { uid, nspRoomId, err });
    throw err;
  }
}

export function broadcastSessionDestroy(
  logger: Logger,
  uid: string,
  nspRoomId: string,
  sessionData: SessionData
): void {
  logger.debug(`Broadcasting session destroy`, { uid, nspRoomId });

  const subscription = formatPresenceSubscription(nspRoomId, SubscriptionType.LEAVE);
  const data = { uid, message: 'Session disconnect' };

  try {
    dispatch(nspRoomId, subscription, data, sessionData);
  } catch (err) {
    logger.error(`Failed to broadcast disconnect`, { uid, nspRoomId, err });
    throw err;
  }
}

export async function setSessionActive(
  logger: Logger,
  redisClient: RedisClient,
  data: SessionData
): Promise<void> {
  logger.debug(`Processing set session active`, { data });

  const { connectionId } = data;
  const sessionActiveKey = formatKey([KeyPrefix.SESSION, connectionId, KeySuffix.ACTIVE]);
  const sessionData = JSON.stringify(data);

  try {
    await sessionRepository.setSessionActive(
      redisClient,
      sessionActiveKey,
      sessionData,
      ACTIVE_SESSION_EXPIRY_SECS
    );
  } catch (err) {
    logger.error(`Failed to set session active`, { err });
    throw err;
  }
}

export function getActiveSession(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string
): Promise<any> {
  logger.debug(`Getting active session for connection id`, { connectionId });

  const key = formatKey([KeyPrefix.SESSION, connectionId, KeySuffix.ACTIVE]);

  return sessionRepository.getActiveSession(redisClient, key);
}
export async function getInactiveConnectionIds(
  logger: Logger,
  redisClient: RedisClient
): Promise<string[] | undefined> {
  logger.debug(`Getting inactive sessions by connection id`);

  try {
    const max = new Date().getTime() - ACTIVE_SESSION_HEARTBEAT_SCORE_MAX;
    const key = formatKey([KeyPrefix.HEARTBEAT, KeySuffix.KEEP_ALIVE]);

    const inactivConnectionIds = await sessionRepository.getInactiveConnectionIds(
      redisClient,
      key,
      max,
      0,
      CRON_TASK_MAX_INACTIVE_SESSIONS_COUNT
    );

    return inactivConnectionIds;
  } catch (err) {
    logger.error(`Failed to get inactive sessions by connection id`, { err });
    throw err;
  }
}

export async function setSessionHeartbeat(
  logger: Logger,
  redisClient: RedisClient,
  data: SessionData
): Promise<void> {
  logger.debug(`Processing set session heartbeat`, { data });

  const { connectionId, timestamp } = data;

  const key = formatKey([KeyPrefix.HEARTBEAT, KeySuffix.KEEP_ALIVE]);
  const unixTime = new Date(timestamp).getTime();

  try {
    await sessionRepository.setSessionHeartbeat(redisClient, key, connectionId, unixTime);
  } catch (err) {
    logger.error(`Failed to set session active`, { err });
    throw err;
  }
}

export async function unsetSessionHeartbeat(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string
): Promise<void> {
  logger.debug(`Processing unset session heartbeat`, { connectionId });

  const key = formatKey([KeyPrefix.HEARTBEAT, KeySuffix.KEEP_ALIVE]);

  try {
    await sessionRepository.unsetSessionHeartbeat(redisClient, key, connectionId);
  } catch (err) {
    logger.error(`Failed to set session active`, { err });
    throw err;
  }
}

export async function setSessionDisconnected(
  logger: Logger,
  pgClient: PoolClient,
  connectionId: string
): Promise<void> {
  logger.debug(`Setting session as disconnected ${connectionId}`, { connectionId });

  try {
    await sessionDb.setSessionDisconnected(pgClient, connectionId);
  } catch (err) {
    logger.error(`Session disconnection failed`, err);
    throw err;
  }
}

export async function saveSessionData(
  logger: Logger,
  pgClient: PoolClient,
  appId: string,
  sessionData: SessionData
): Promise<void> {
  logger.debug(`Saving session data`, { appId, sessionData });

  try {
    await sessionDb.saveSessionData(pgClient, appId, sessionData);
  } catch (err: any) {
    logger.error(`Failed to save session data`, { err });
    throw err;
  }
}

export async function getAppId(
  logger: Logger,
  pgClient: PoolClient,
  appPid: string
): Promise<string> {
  logger.debug(`Getting app id for ${appPid}`);

  try {
    const { rows: applications } = await sessionDb.getApplicationIdByAppPid(pgClient, appPid);
    return applications[0].id;
  } catch (err: any) {
    logger.error(`Failed to get appId`, { err });
    throw err;
  }
}

export async function getConnectionEventId(
  logger: Logger,
  pgClient: PoolClient,
  connectionId: string,
  socketId: string
): Promise<string | null> {
  logger.debug(`Getting connection event id for ${connectionId}`, { connectionId, socketId });

  try {
    const { rows } = await sessionDb.getConnectionEventId(pgClient, connectionId, socketId);
    return rows[0]?.id;
  } catch (err: any) {
    logger.error(`Failed to get connection id`, { connectionId, socketId, err });
    throw err;
  }
}

export async function saveSocketConnectionEvent(
  logger: Logger,
  pgClient: PoolClient,
  appId: string,
  data: any
): Promise<void> {
  logger.debug(`Saving scket connection event`, { appId, data });

  try {
    await sessionDb.saveConnectionEvent(pgClient, appId, data);
  } catch (err: any) {
    logger.error(`Failed to process connect event`, { err });
    throw err;
  }
}

export async function setAuthUserOffline(
  logger: Logger,
  pgClient: PoolClient,
  uid: string
): Promise<void> {
  logger.debug(`Setting auth user offline`, { uid });

  try {
    await sessionDb.setAuthUserOffline(pgClient, uid);
  } catch (err: any) {
    logger.error(`Failed to set auth user offline`, { err });
    throw err;
  }
}

export async function setAuthUserOnline(
  logger: Logger,
  pgClient: PoolClient,
  uid: string
): Promise<void> {
  logger.debug(`Setting auth user online`, { uid });

  try {
    await sessionDb.setAuthUserOnline(pgClient, uid);
  } catch (err: any) {
    logger.error(`Failed to set auth user online`, { err });
    throw err;
  }
}

export async function addAuthUser(
  logger: Logger,
  redisClient: RedisClient,
  appPid: string,
  user: AuthUser
): Promise<void> {
  logger.debug(`Adding auth user`, { user });

  try {
    const key = formatKey([KeyPrefix.AUTH, appPid, 'online']);

    await sessionRepository.addAuthUser(redisClient, key, user);
  } catch (err: any) {
    logger.error(`Failed to add auth user`, { err });
    throw err;
  }
}
