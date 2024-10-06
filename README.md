# Session - RelayBox Session Service

The session service is one of four core services that keep the core database up to date with the latest data broadcast by the [Core](https://github.com/relaybox/core) Realtime Service.

## Getting Started

### Prerequisites

- Node.js 20.x
- Docker (optional)

### Configuration

Create a copy of `.env.template` in the root of the project and rename it to `.env`. Adjust the configuration settings to match your local environment. Further information about each environment variable can be found in `.env.template`.

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

The service unit tests can be found in the `./test` directory. Tests are run using the `vitest` runner.

```
npm run test
```

## About "Sessions"

Sessions are a critical part of the RelayBox ecosystem. They are directly tied to the WebSocket connection lifecycle and the unique ID assigned to each connection.

A session begins when a socket connection is established and is marked for deletion when the connection is closed. To account for network blips, minor outages, and other disruptions, a session can be re-established by the client using the same connection ID. This allows a reconnected session to restore subscriptions that would otherwise be lost.

If the client attempts to reconnect using an existing connection ID, and upon successful validation, the session will be restored, allowing the user to continue interacting with the service as if the connection was never closed.

This mechanism enables the service to maintain a persistent session "state" across the network, regardless of the task or process that initiated the connection.

## About this service

The "Session" service initiates worker processes that handle FIFO jobs added to BullMQ by the [Core](https://github.com/relaybox/core) service. It is responsible for managing the session lifecycle, including persisting data and broadcasting events to relevant subscribers.

![RelayBox system diagram, highlight Session](/assets/system/relaybox-system-session.png)

The following jobs are handled by the service:

- `session:destroy`

A delayed job is added when a WebSocket connection is closed by a client, whether through a clean disconnect or otherwise. The job is scheduled with a delay of `Number(process.env.WS_IDLE_TIMEOUT_MS) * 4`.

If no active session related to the job's connection ID is found when the job is processed, the session will be considered inactive and destroyed. Destroying a session involves the following steps:

- Purging cached room subscriptions
- Purging cached user subscriptions
- Unsetting the session heartbeat value
- Persisting the session disconnection event in the database
- Persisting user online visibility in the database
- Removing the session id from the sorted set of heartbeat values (used by the cron task)

We'll cover the cron task and active session heartbeat logic shortly, so bear with me! :)

- `session:active`

Sessions are considered active when a socket connection is established. Session data is stored in Redis, with the connection ID attached to the session as the key.

Sessions maintain their active state by emitting a heartbeat every `WS_IDLE_TIMEOUT_MS` milliseconds.

A session key is initialized with a `ttl` of `(WS_IDLE_TIMEOUT_MS / 1000) * 3` seconds. Each time a session heartbeat is received, the `ttl` is reset. When the cron task runs, it iterates over a sorted set of connection IDs. Any connection ID with a value of `WS_IDLE_TIMEOUT_MS * 4` is considered inactive and purged, indicating that a heartbeat was not registered and the session key has expired.

This job is responsible for processing heartbeat jobs and resetting the session's ttl upon receiving a heartbeat, ensuring the session is not purged when a session destroy job is processed or the cron task runs.

- `session:user:inactive`

Inactive sessions are slightly different from destroyed sessions. Inactive session jobs are processed similarly to destroyed sessions, but with some important differences.

When a session is disconnected, it is marked as inactive, and a job is added to the session queue with a 5-second delay. Instead of being associated with the connection ID, the UID (which is either the client ID or connection ID, depending on whether the client is authenticated) is used to identify the job.

Think of this job as a "soft destroy" event. After a brief delay, the user attached to the session is removed from any presence sets they are part of, and the session disconnection event is broadcast to relevant subscribers.

However, session subscriptions are not purged, allowing a new connection with the same connection ID to restore subscriptions in the event of a network disruption recovery.

For example, if a user is disconnected due to entering a tunnel while driving, the tunnel might last for 30 seconds. When the user re-emerges, they can continue interacting with the service as if they were never disconnected. This mechanism allows other users to notice the disconnection briefly, while still enabling the reconnected user to resume their previous session state.

Essentially, this logic allows a user to miss two session heartbeats before the session data related to their connection is purged.

- `session:socket:connection_event`

Unlike session destroy, inactive, and active states, which provide session feedback and persistence based on varying time delays, this job provides immediate feedback on connection and disconnection events. It plays a pivotal role in aggregating and calculating peak connection statistics for an application.

This job is processed when a connection is either established or disconnected. Its responsibility is to persist the timestamp associated with the job and the action (either connect or disconnect). It also broadcasts immediate feedback about the user’s status (if they are authenticated). This data can be handled via the [@relaybox/client](https://relaybox.net/docs/api-reference/relaybox-client/users#user-on-connection-event) client SDK library.

In the event of a connection, the job saves the initial session data matched to the connection ID, persists the connection status in the database, and broadcasts the event to relevant subscribers.

In the event of a disconnection, the job persists the user's offline status and broadcasts the disconnection event to relevant subscribers.

- `session:cron:task`

Ensuring session data is accurate is a critical part of the RelayBox ecosystem. The cron task acts as a fallback to clean up hanging session data in case the regular session management system fails.

A sorted set of connection IDs is maintained, with each value representing the last heartbeat received for the session. When the cron task runs, it fetches a list of all sessions with a value greater than `(WS_IDLE_TIMEOUT_MS / 1000) * 4`, which ideally should be none.

If any are found, it first checks if there is an active session related to the ID. If none are found, it runs the session destroy logic against the session associated with the ID, ensuring that statistics are valid and always accurate. However, due to this being a disaster recovery mechanism, no events are broadcast to subscribers.

## TLDR

First of all, fair enough!! It's kinda long winded. In short...

The session management system in RelayBox ensures that active sessions are accurately tracked and maintained, using heartbeats to confirm their status. Each session is identified by a unique connection ID and is stored in Redis with a time-to-live (TTL) value, which is reset every time a heartbeat is received. If a session misses too many heartbeats, it is marked as inactive and eventually destroyed if not restored. Additionally, a cron task acts as a safety net, regularly checking for any sessions that may have been missed by normal processes and cleaning up any stale or inactive session data, ensuring system integrity and accurate connection statistics.
