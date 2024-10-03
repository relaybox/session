# Session - Session Management Service by RelayBox

The session service is one of 4 core services that manage keeping the core database up to date with that latest data from broadcast from the uws realtime service.

## Getting Started

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

## Installation

To install the necessary packages, simply run...

```
npm install
```

Once complete, the dev environment is ready to go. To start the service, run the following command...

```
npm run dev
```

## Testing

Unit tests are built using `vitest`.

```
npm run test
```

## About this Service

The service is responsisble for starting a worker that processes FIFO jobs added to BullMQ from [uws](https://github.com/relaybox/uws) service.

The following jobs are handled by the service:

## session:destroy

A delayed job added when a websocket connection is closed by a client, either a clean disconnect or otherwise. The job is added with a delay of `Number(process.env.WS_IDLE_TIMEOUT_MS) * 4`.

If no active session is found when the job is processed, the session will be considered inactive and be destroyed. Destorying a session involves:

- Purging room subscriptions
- Purging user subscriptions
- Removing active members from presence sets previously joined
- Unsetting the session heartbeat value
- Persisting the session disconnection event in the database
- Persisting user online visibility in the database
- Broadcasting session disconnection event relevant subscribers

## session:active

Sessions ar considered active whien a socket connection is established. Session data is stored in Redis along with the connection id attached to the session.

A key will always have a `ttl` of `(WS_IDLE_TIMEOUT_MS / 1000) * 3` seconds. Each time a session heartbeat is received the `ttl` is reset. When teh cron task runs, it iterates a sorted set of connection IDs. Any connection IDs found that have a value of `WS_IDLE_TIMEOUT_MS * 4` will be considered inactive and purged.

This job is responsible for setting resetting the `ttl` of the session to ensure it isn't puged when the cron task runs.

## SESSION_USER_INACTIVE = 'session:user:inactive'

## SESSION_SOCKET_CONNECTION_EVENT = 'session:socket:connection_event'

## SESSION_HEARTBEAT = 'session:heartbeat'

## SESSION_CRON_TASK = 'session:cron:task'
