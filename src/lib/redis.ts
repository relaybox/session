import {
  createClient,
  RedisClientType,
  RedisModules,
  RedisFunctions,
  RedisScripts,
  RedisClientOptions
} from 'redis';
import { getLogger } from '../util/logger.util';
import fs from 'fs';
import path from 'path';

const logger = getLogger('redis-client');

const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = process.env.REDIS_PORT;
const REDIS_AUTH = process.env.REDIS_AUTH;
const REDIS_TLS_DISABLED = process.env.REDIS_TLS_DISABLED === 'true';

export type RedisClient = RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

// Node redis client options
export const tlsConnectionOptions = {
  tls: true,
  rejectUnauthorized: true,
  cert: fs.readFileSync(path.join(__dirname, '../certs/AmazonRootCA1.pem'))
};

export const socketOptions = {
  host: REDIS_HOST!,
  port: Number(REDIS_PORT)!,
  ...(!REDIS_TLS_DISABLED && tlsConnectionOptions)
};

export const connectionOptions: RedisClientOptions = {
  ...(!REDIS_TLS_DISABLED && { password: getRedisAuthToken() }),
  socket: {
    ...socketOptions,
    reconnectStrategy
  }
};

// IO redis client options (BullMQ)
const tlsConnectionOptionsIo = {
  password: getRedisAuthToken(),
  tls: tlsConnectionOptions
};

export const connectionOptionsIo = {
  host: REDIS_HOST!,
  port: Number(REDIS_PORT)!,
  ...(!REDIS_TLS_DISABLED && tlsConnectionOptionsIo)
};

console.log(connectionOptionsIo);
console.log(connectionOptions);

let redisClient: RedisClient;

function getRedisAuthToken(): string {
  if (!REDIS_AUTH) {
    logger.warn('Redis auth token not found');
    return '';
  }

  return JSON.parse(REDIS_AUTH).authToken;
}

function reconnectStrategy(retries: number) {
  return Math.min(retries * 50, 1000);
}

export function getRedisClient(): RedisClient {
  if (redisClient) {
    return redisClient;
  }

  redisClient = createClient(connectionOptions);

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
