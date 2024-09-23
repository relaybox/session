import { Pool } from 'pg';
import { RedisClient } from '@/lib/redis';
import { SessionData, SocketConnectionEvent } from './types';
import { handler as sessionDestroyHandler } from '@/handlers/session-destroy';
import { handler as sessionActiveHandler } from '@/handlers/session-active';
import { handler as sessionUserInactiveHandler } from '@/handlers/session-user-inactive';
import { handler as sessionSocketConnectionEventHandler } from '@/handlers/session-socket-connection-event';
import { handler as sessionHeartbeathandler } from '@/handlers/session-heartbeat';
import { handler as sessionCronTaskHandler } from '@/handlers/session-cron-task';

export enum JobName {
  SESSION_DESTROY = 'session:destroy',
  SESSION_ACTIVE = 'session:active',
  SESSION_USER_INACTIVE = 'session:user:inactive',
  SESSION_SOCKET_CONNECTION_EVENT = 'session:socket:connection_event',
  SESSION_HEARTBEAT = 'session:heartbeat',
  SESSION_CRON_TASK = 'session:cron:task'
}

const handlerMap = {
  [JobName.SESSION_DESTROY]: sessionDestroyHandler,
  [JobName.SESSION_ACTIVE]: sessionActiveHandler,
  [JobName.SESSION_USER_INACTIVE]: sessionUserInactiveHandler,
  [JobName.SESSION_SOCKET_CONNECTION_EVENT]: sessionSocketConnectionEventHandler,
  [JobName.SESSION_HEARTBEAT]: sessionHeartbeathandler,
  [JobName.SESSION_CRON_TASK]: sessionCronTaskHandler
};

export async function router(
  pgPool: Pool,
  redisClient: RedisClient,
  jobName: JobName,
  data: SessionData & Partial<SocketConnectionEvent>
): Promise<void> {
  return handlerMap[jobName](pgPool, redisClient, data);
}
