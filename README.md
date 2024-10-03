# Session - Session Management Service by RelayBox

The session service is one of 4 core services that manage keeping the core database up to date with that latest data from broadcast from the uws realtime service.

## Getting Started

Create a copy of .env.tempate in the root of the project and rename it to .env. Add the following configuration options...

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

## About "Sessions"

Sessions are a critical part of the relaybox ecosystem. Sessions are directly related to the websocket connection lifecycle and the unique ID assigned to each connection.

A session begins when a socket connection is established and is marked for deletion when the connection is closed. To cater for network blips, minor outages and other disruptions a session can be re-established by the client using the same connection ID. This enables a reconnected session to restore subscriptions that would otherwise be lost.

If the client attempts to reconnect using an existing connection ID, following validation, the session will be restored and the user can continue to interact with the service as if the connection was never closed.

This mechanism allows the service to maintain a persistent session "state" across the network and from any process, not nescessarily the one that initiated the connection.

## About this service

The "Session" service starts worker processes that handle FIFO jobs added to BullMQ from [uws](https://github.com/relaybox/uws) service and is responsible for managing the session lifecycle in terms of persisting data and broadcasting events to relevant subscribers.

The following jobs are handled by the service:

## session:destroy

A delayed job added when a websocket connection is closed by a client, either a clean disconnect or otherwise. The job is added with a delay of `Number(process.env.WS_IDLE_TIMEOUT_MS) * 4`.

If an active session related to the connection ID of the job being processed is not found when the job is processed, the session will be considered inactive and destroyed. Destroying a session involves:

- Purging cached room subscriptions
- Purging cached user subscriptions
- Unsetting the session heartbeat value
- Persisting the session disconnection event in the database
- Persisting user online visibility in the database
- Removing the session id from the sorted set of heartbeat values (used by the cron task)

We'll cover the cron task and active session heartbeat logic shortly, bear with me :)

## session:active

Sessions are considered active whien a socket connection is established. Session data is stored in Redis along with the connection id attached to the session as the key.

A key will always start with a `ttl` of `(WS_IDLE_TIMEOUT_MS / 1000) * 3` seconds. Each time a session heartbeat is received the `ttl` is reset. When the cron task runs, it iterates a sorted set of connection IDs. Any connection IDs found that has a value of `WS_IDLE_TIMEOUT_MS * 4` will be considered inactive and purged. This means that a heartbeat has not been registered and the active session key has expired.

This job is responsible for processing heartbeat jobs and resetting the `ttl` of the session in response to a session heartbeat to ensure it isn't puged when the a session destroy job is processed or the cron task runs.

## session:user:inactive

Inactive sessions are slightly different to destoyed sessions. Inactive session jobs are preocessed in a similar way to destroyed sessions with some important diferences.

A disconnected session is marked as inactive and a job is added to the session queue with a 5 seconds delay. Instead of being associated with the connection ID, the uid (which is either the client ID or connection ID based on whether the client is considered authenticated) is used to identtify the job.

Consider this job as a soft destroy event. After a brief delay, The user attached to the session will be removed from any presence sets they are currently a member of and the session disconnection event will be broadcast to relevant subscribers.

However, the session subscriptions will not be purged, allowing a new connection with the same connection ID to restore conections in the event of a network disruption.

Imagine a scenario where a user is disconnected due to entering a tunnel whislt driving. The tunnel may last for 30 seconds but when the user emerges, they will want to continue to interact with the service as if they were never disconnected. This mechanism allows other users to acknowledge the disconnection after a short period of time whilst allowing the reconnected user to pick up their previous session state.

Essentually, this logic allows a user to miss 2 session heartbeats before session data related to thier connection is purged.

## SESSION_SOCKET_CONNECTION_EVENT = 'session:socket:connection_event'

## SESSION_HEARTBEAT = 'session:heartbeat'

## SESSION_CRON_TASK = 'session:cron:task'
