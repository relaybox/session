import { Logger } from 'winston';
import * as repository from './repository';
import * as db from './db';
import {
  AuthUser,
  AuthUserEvent,
  KeyNamespace,
  KeyPrefix,
  KeySuffix,
  SessionData,
  SubscriptionType
} from './types';
import { RedisClient } from '@/lib/redis';
import { dispatch } from '@/lib/publisher';
import { PoolClient } from 'pg';

export const PLATFORM_RESERVED_NAMESPACE = '$';
export const WS_IDLE_TIMEOUT_MS = Number(process.env.WS_IDLE_TIMEOUT_MS) || 0;
export const ACTIVE_SESSION_HEARTBEAT_SCORE_MAX = WS_IDLE_TIMEOUT_MS * 4; // Sorted set score max threshold
export const ACTIVE_SESSION_EXPIRY_SECS = (WS_IDLE_TIMEOUT_MS / 1000) * 3; // Expiry time for active session key
export const CRON_TASK_MAX_INACTIVE_SESSIONS_COUNT = 100; // Limit of number of entires fetched per cron run

export function formatKey(keyParts: string[]): string {
  return keyParts.join(':');
}

export function formatPresenceSubscription(nspRoomId: string, event: string): string {
  return `${nspRoomId}:${PLATFORM_RESERVED_NAMESPACE}:${KeyNamespace.PRESENCE}:${event}`;
}

export function formatUserSubscription(nspClientId: string, event: string): string {
  return `${nspClientId}:${PLATFORM_RESERVED_NAMESPACE}:${event}`;
}

export function formatUserSubscriptionAll(nspClientId: string): string {
  return `${nspClientId}:$:$:subscribe:all`;
}

export async function getCachedRooms(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string
): Promise<string[] | null> {
  logger.debug(`Getting cached rooms`, { connectionId });

  const key = `${KeyPrefix.CONNECTION}:${connectionId}:${KeySuffix.ROOMS}`;
  const cachedRooms = await repository.getCachedRooms(redisClient, key);

  return Object.keys(cachedRooms);
}

export async function getCachedUsers(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string
): Promise<string[] | null> {
  logger.debug(`Getting cached users`, { connectionId });

  const key = `${KeyPrefix.CONNECTION}:${connectionId}:${KeyNamespace.USERS}`;
  const cachedUsers = await repository.getCachedUsers(redisClient, key);

  return Object.keys(cachedUsers);
}

export function purgeCachedRooms(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string
): Promise<number> {
  logger.debug(`Purging cached rooms`, { connectionId });

  const key = `${KeyPrefix.CONNECTION}:${connectionId}:${KeySuffix.ROOMS}`;

  return repository.purgeCachedRooms(redisClient, key);
}

export async function purgeSubscriptions(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string,
  nspRoomId: string,
  keyNamespace: KeyNamespace
): Promise<void> {
  logger.debug(`Deleting all ${keyNamespace} subscriptions`, {
    connectionId,
    nspRoomId,
    keyNamespace
  });

  const key = formatKey([KeyPrefix.CONNECTION, connectionId, keyNamespace, nspRoomId]);

  try {
    const subscriptions = await repository.getAllSubscriptions(redisClient, key);

    await Promise.all(
      Object.keys(subscriptions).map(async (subscription) =>
        repository.deleteSubscription(redisClient, key, subscription)
      )
    );
  } catch (err) {
    logger.error(`Failed to delete subscriptions`, { connectionId, nspRoomId, keyNamespace, err });
    throw err;
  }
}

export async function purgeUserSubscriptions(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string,
  clientId: string
): Promise<void> {
  logger.debug(`Deleting all user subscriptions`, { clientId });

  const key = formatKey([KeyPrefix.CONNECTION, connectionId, KeyNamespace.USERS, clientId]);

  try {
    await repository.deleteHash(redisClient, key);
  } catch (err) {
    logger.error(`Failed to delete user subscriptions`, { clientId, key, err });
    throw err;
  }
}

export async function purgeCachedUsers(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string
): Promise<void> {
  logger.debug(`Purging cached users`, { connectionId });

  const key = formatKey([KeyPrefix.CONNECTION, connectionId, KeyNamespace.USERS]);

  try {
    await repository.deleteHash(redisClient, key);
  } catch (err) {
    logger.error(`Failed to delete users`, { connectionId, key, err });
    throw err;
  }
}

export async function getActiveMember(
  logger: Logger,
  redisClient: RedisClient,
  uid: string,
  nspRoomId: string
): Promise<string | undefined> {
  logger.debug(`Getting active member`, { uid, nspRoomId });

  const keyPrefix = formatKey([KeyPrefix.PRESENCE, nspRoomId, KeySuffix.MEMBERS]);

  try {
    return await repository.getActiveMember(redisClient, keyPrefix, uid);
  } catch (err) {
    logger.error(`Failed to get active member`, { uid, nspRoomId, err });
    throw err;
  }
}

export async function removeActiveMember(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string,
  nspRoomId: string
): Promise<void> {
  logger.debug(`Removing active member`, { connectionId, nspRoomId });

  const keyPrefix = formatKey([KeyPrefix.PRESENCE, nspRoomId]);

  try {
    await Promise.all([
      repository.removeActiveMember(redisClient, `${keyPrefix}:${KeySuffix.MEMBERS}`, connectionId),
      repository.shiftActiveMember(redisClient, `${keyPrefix}:${KeySuffix.INDEX}`, connectionId)
    ]);
  } catch (err) {
    logger.error(`Failed to remove active member`, { connectionId, nspRoomId, err });
    throw err;
  }
}

export async function deletePresenceSets(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string
): Promise<void> {
  logger.debug(`Deleting presence sets for connection`, { connectionId });

  const key = formatKey([KeyPrefix.CONNECTION, connectionId, KeySuffix.PRESENCE_SETS]);

  try {
    await repository.deletePresenceSets(redisClient, key);
  } catch (err) {
    logger.error(`Failed to delete presence sets for connection`, { err });
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
  const timestamp = new Date().toISOString();
  const { connectionId, clientId, user } = sessionData;

  const data = {
    connectionId,
    clientId,
    event: SubscriptionType.LEAVE,
    timestamp,
    user
  };

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
    await repository.setSessionActive(
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

  return repository.getActiveSession(redisClient, key);
}

export async function getInactiveConnectionIds(
  logger: Logger,
  redisClient: RedisClient
): Promise<string[] | undefined> {
  logger.debug(`Getting inactive sessions by connection id`);

  try {
    const max = new Date().getTime() - ACTIVE_SESSION_HEARTBEAT_SCORE_MAX;
    const key = formatKey([KeyPrefix.HEARTBEAT, KeySuffix.KEEP_ALIVE]);

    const inactivConnectionIds = await repository.getInactiveConnectionIds(
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
    await repository.setSessionHeartbeat(redisClient, key, connectionId, unixTime);
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
    await repository.unsetSessionHeartbeat(redisClient, key, connectionId);
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
    await db.setSessionDisconnected(pgClient, connectionId);
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
    await db.saveSessionData(pgClient, appId, sessionData);
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
    const { rows: applications } = await db.getApplicationIdByAppPid(pgClient, appPid);
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
    const { rows } = await db.getConnectionEventId(pgClient, connectionId, socketId);
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
  logger.debug(`Saving socket connection event`, { appId, data });

  try {
    await db.saveConnectionEvent(pgClient, appId, data);
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
    await db.setAuthUserOffline(pgClient, uid);
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
    await db.setAuthUserOnline(pgClient, uid);
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
    const key = formatKey([KeyPrefix.AUTH, appPid, KeySuffix.ONLINE]);

    await repository.addAuthUser(redisClient, key, user);
  } catch (err: any) {
    logger.error(`Failed to add auth user`, { err });
    throw err;
  }
}

export async function addAuthUserConnection(
  logger: Logger,
  redisClient: RedisClient,
  appPid: string,
  connectionId: string,
  clientId: string
): Promise<void> {
  logger.debug(`Adding auth user connection`, { clientId, connectionId });

  try {
    const key = formatKey([KeyPrefix.CLIENT, appPid, clientId, KeySuffix.CONNECTIONS]);

    await repository.addAuthUserConnection(redisClient, key, connectionId);
  } catch (err: any) {
    logger.error(`Failed to add auth user connection`, { err });
    throw err;
  }
}

export async function getAuthUser(
  logger: Logger,
  redisClient: RedisClient,
  appPid: string,
  user: AuthUser
): Promise<AuthUser | null> {
  logger.debug(`Getting auth user`, { user });

  try {
    const key = formatKey([KeyPrefix.AUTH, appPid, 'online']);
    const { clientId } = user;

    const authUser = await repository.getAuthUser(redisClient, key, clientId);

    return authUser ? JSON.parse(authUser) : null;
  } catch (err: any) {
    logger.error(`Failed to add auth user`, { err });
    throw err;
  }
}

export async function deleteAuthUser(
  logger: Logger,
  redisClient: RedisClient,
  appPid: string,
  user: AuthUser
): Promise<void> {
  logger.debug(`Deleting auth user`, { user });

  try {
    const key = formatKey([KeyPrefix.AUTH, appPid, 'online']);
    const { clientId } = user;

    await repository.deleteAuthUser(redisClient, key, clientId);
  } catch (err: any) {
    logger.error(`Failed to add auth user`, { err });
    throw err;
  }
}

export async function deleteAuthUserConnection(
  logger: Logger,
  redisClient: RedisClient,
  appPid: string,
  clientId: string,
  connectionId: string
): Promise<number> {
  logger.debug(`Deleting auth user connection`, { appPid, clientId });

  try {
    const key = formatKey([KeyPrefix.CLIENT, appPid, clientId, KeySuffix.CONNECTIONS]);

    const multi = redisClient.multi();

    await repository.deleteAuthUserConnection(multi, key, connectionId);
    await repository.getAuthUserConnectionCount(multi, key);

    const [_, remainingAuthUserConnections] = await multi.exec();

    return remainingAuthUserConnections as number;
  } catch (err: any) {
    logger.error(`Failed to delete auth user connection`, { err });
    throw err;
  }
}

export async function deleteAuthUserConnections(
  logger: Logger,
  redisClient: RedisClient,
  appPid: string,
  clientId?: string
): Promise<void> {
  logger.debug(`Deleting auth user connections`, { appPid, clientId });

  if (!clientId) {
    return;
  }

  try {
    const key = formatKey([KeyPrefix.CLIENT, appPid, clientId, KeySuffix.CONNECTIONS]);

    await repository.deleteAuthUserConnections(redisClient, key);
  } catch (err: any) {
    logger.error(`Failed to delete auth user connections`, { err });
    throw err;
  }
}

export function broadcastUserEvent(
  logger: Logger,
  event: AuthUserEvent,
  user: AuthUser,
  sessionData: SessionData,
  message: any
): void {
  logger.debug(`Broadcasting user event`, { event });

  const nspClientId = `${KeyNamespace.USERS}:${user.clientId}`;
  const subscription = formatUserSubscription(nspClientId, event);

  try {
    dispatch(nspClientId, subscription, message, sessionData);
  } catch (err) {
    logger.error(`Failed to broadcast disconnect`, { nspClientId, err });
    throw err;
  }
}

export function broadcastAuthUserConnectEvent(
  logger: Logger,
  user: AuthUser,
  sessionData: SessionData
): void {
  const userData = {
    ...user,
    isOnline: true,
    lastOnline: new Date().toISOString()
  };

  broadcastUserEvent(logger, AuthUserEvent.CONNECTION_STATUS, user, sessionData, userData);
  broadcastUserEvent(logger, AuthUserEvent.CONNECT, user, sessionData, userData);
}

export function broadcastAuthUserDisconnectEvent(
  logger: Logger,
  user: AuthUser,
  sessionData: SessionData
): void {
  const userData = {
    ...user,
    isOnline: false,
    lastOnline: new Date().toISOString()
  };

  broadcastUserEvent(logger, AuthUserEvent.CONNECTION_STATUS, user, sessionData, userData);
  broadcastUserEvent(logger, AuthUserEvent.DISCONNECT, user, sessionData, userData);
}

export async function destroyRoomSubscriptions(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string
): Promise<any> {
  const rooms = await getCachedRooms(logger, redisClient, connectionId);

  if (rooms && rooms.length > 0) {
    return Promise.all(
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
}

export async function destroyUserSubscriptions(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string
): Promise<any> {
  const users = await getCachedUsers(logger, redisClient, connectionId);

  if (users && users.length > 0) {
    return Promise.all(
      users.map(async (clientId) =>
        Promise.all([
          purgeCachedUsers(logger, redisClient, connectionId),
          purgeUserSubscriptions(logger, redisClient, connectionId, clientId)
        ])
      )
    );
  }
}

export async function getConnectionPresenceSets(
  logger: Logger,
  redisClient: RedisClient,
  connectionId: string
): Promise<string[]> {
  logger.debug(`Getting cached presence sets for connection`);

  const key = formatKey([KeyPrefix.CONNECTION, connectionId, KeySuffix.PRESENCE_SETS]);

  try {
    const connectionPresence = await repository.getConnectionPresenceSets(redisClient, key);

    return Object.keys(connectionPresence);
  } catch (err) {
    logger.error(`Failed to get connection presence`, { connectionId, err });
    throw err;
  }
}
