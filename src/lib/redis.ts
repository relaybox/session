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

  redisClient.on('connect', () => {
    logger.info('Redis connected');
  });

  redisClient.on('error', (err) => {
    logger.error(`Redis connection error`, { err });
  });

  redisClient.on('ready', () => {
    logger.info('Redis client is ready');
  });

  redisClient.on('end', () => {
    logger.info('Redis client disconnected');
  });

  return redisClient;
}

process.on('SIGINT', async () => {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis client disconnected through app termination');
  }

  process.exit(0);
});
