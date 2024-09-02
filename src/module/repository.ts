import { RedisClient } from '../lib/redis';
import { AuthUser } from './types';

export async function getCachedRooms(
  redisClient: RedisClient,
  key: string
): Promise<string[] | null> {
  const rooms = await redisClient.hGetAll(key);
  return Object.keys(rooms);
}

export async function deleteCachedRooms(redisClient: RedisClient, key: string): Promise<number> {
  return redisClient.del(key);
}

export async function getAllSubscriptions(
  redisClient: RedisClient,
  key: string
): Promise<string[]> {
  const subscriptions = await redisClient.hGetAll(key);

  return Object.keys(subscriptions);
}

export function deleteSubscription(
  redisClient: RedisClient,
  key: string,
  subscription: string
): Promise<number> {
  return redisClient.hDel(key, subscription);
}

export function removeActiveMember(
  redisClient: RedisClient,
  key: string,
  clientId: string
): Promise<number> {
  return redisClient.hDel(key, clientId);
}

export async function shiftActiveMember(
  redisClient: RedisClient,
  key: string,
  clientId: string
): Promise<number> {
  return redisClient.lRem(key, 0, clientId);
}

export async function purgeSessionState(
  redisClient: RedisClient,
  keys: string[]
): Promise<number[]> {
  return Promise.all(keys.map((key) => redisClient.del(key)));
}

export function setSessionActive(
  redisClient: RedisClient,
  key: string,
  data: string,
  ttl: number
): Promise<string | null> {
  return redisClient.set(key, data, { EX: ttl });
}

export function getActiveSession(redisClient: RedisClient, key: string): Promise<string | null> {
  return redisClient.get(key);
}

export function purgeCachedRooms(redisClient: RedisClient, key: string): Promise<number> {
  return redisClient.del(key);
}

export function setSessionHeartbeat(
  redisClient: RedisClient,
  key: string,
  connectionId: string,
  unixTime: number
): Promise<number> {
  return redisClient.zAdd(key, { score: unixTime, value: connectionId });
}

export function unsetSessionHeartbeat(
  redisClient: RedisClient,
  key: string,
  connectionId: string
): Promise<number> {
  return redisClient.zRem(key, connectionId);
}

export function getInactiveConnectionIds(
  redisClient: RedisClient,
  key: string,
  max: number,
  offset: number = 0,
  count: number
): Promise<string[]> {
  return redisClient.zRangeByScore(key, 0, max, {
    LIMIT: {
      offset,
      count
    }
  });
}

export async function addAuthUser(
  redisClient: RedisClient,
  key: string,
  user: AuthUser
): Promise<number> {
  return redisClient.hSet(key, user.clientId, JSON.stringify(user));
}
