import {
  createClient as createRedisClient,
  RedisClientType,
  RedisModules,
  RedisFunctions,
  RedisScripts
} from 'redis';
import { getLogger } from '../util/logger.util';

const logger = getLogger('redis-client');

interface RedisOptions {
  host: string;
  port: number;
}

export type RedisClient = RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

let redisClient: RedisClient;

function reconnectStrategy(retries: number) {
  return Math.min(retries * 50, 1000);
}

export function createClient({ host, port }: RedisOptions): RedisClient {
  if (redisClient) {
    return redisClient;
  }

  redisClient = createRedisClient({
    socket: {
      host,
      port,
      reconnectStrategy
    }
  });

  redisClient.on('error', (err) => {
    logger.error(`Redis connection error`, { host, port, err });
  });

  return redisClient;
}
