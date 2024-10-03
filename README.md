# Session - Session Management Service by RelayBox

The session service is one of 4 core services that manage keeping the core database up to date with that latest data from broadcast from the uws realtime service.

The service is responsisble for starting a worker that processes FIFO jobs added to BullMQ from [uws](https://github.com/relaybox/uws) service.

The followinf messages are handled by the service:

## SESSION_DESTROY = 'session:destroy'

A delayed job added when a websocket connection is closed by a client, either a clean disconnect or otherwise. The job is added with a delay of `Number(process.env.WS_IDLE_TIMEOUT_MS) * 4`.

If no active session is found when the job is processed, the session will be considered inactive and be detroyed. Destorying a session involves purging room and user subscriptions, removing an active member from presence sets previously joined, unsetting the session heartbeat value and persisting the session disconnection event in the database.

## SESSION_ACTIVE = 'session:active'

## SESSION_USER_INACTIVE = 'session:user:inactive'

## SESSION_SOCKET_CONNECTION_EVENT = 'session:socket:connection_event'

## SESSION_HEARTBEAT = 'session:heartbeat'

## SESSION_CRON_TASK = 'session:cron:task'

## Session Management

Session management is a critical part of the relaybox ecosystem.

```
# Local DB host
DB_HOST=

# Local DB name
DB_NAME=

# Local DB port
DB_PORT=

# Local DB proxy enabled - Set to false for local development
DB_PROXY_ENABLED=

# Local DB user
DB_USER=

# Local DB password
DB_PASSWORD=

# Local DB max connections
DB_MAX_CONNECTIONS=

# Local DB idle timeout
DB_IDLE_TIMEOUT_MS=

# Local DB TLS disabled - Set to true for local development unless connecttion over TLS
DB_TLS_DISABLED=

# Local Redis host
REDIS_HOST=

# Local Redis port
REDIS_PORT=

# Local DB TLS disabled - Set to true for local development unless connecttion over TLS
REDIS_TLS_DISABLED=

# Local RabbitMQ connection string
RABBIT_MQ_CONNECTION_STRING=

# Recommended setting 5 - This value needs to be synced across services
RABBIT_MQ_QUEUE_COUNT=

# Recommended setting "30000" - This value needs to be synced across services
WS_IDLE_TIMEOUT_MS=

# Length of time in mins between each session cron run, for more details, see the "Session Management" section
CRON_SCHEDULE_MINS=

# Localhost - Set to true for local development
LOCALHOST=

# Desired log level - recommended setting "debug" for local development
LOG_LEVEL=
```
