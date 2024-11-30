import { getMockSession } from '../__mocks__/internal/session.mock';
import { describe, expect, vi, it, beforeEach, afterEach } from 'vitest';
import {
  addAuthUser,
  broadcastAuthUserConnectEvent,
  broadcastAuthUserDisconnectEvent,
  broadcastSessionDestroy,
  broadcastUserEvent,
  deleteAuthUser,
  deleteAuthUserConnection,
  deletePresenceSets,
  destroyRoomSubscriptions,
  formatKey,
  formatPresenceSubscription,
  formatUserSubscription,
  formatUserSubscriptionAll,
  getActiveSession,
  getAppId,
  getAuthUser,
  getCachedRooms,
  getCachedUsers,
  getConnectionEventId,
  getInactiveConnectionIds,
  purgeCachedRooms,
  purgeCachedUsers,
  purgeSubscriptions,
  purgeUserSubscriptions,
  removeActiveMember,
  saveSessionData,
  saveSocketConnectionEvent,
  setAuthUserOffline,
  setAuthUserOnline,
  setSessionActive,
  setSessionDisconnected,
  setSessionHeartbeat,
  unsetSessionHeartbeat
} from '@/module/service';
import { getLogger } from '@/util/logger.util';
import { RedisClient, RedisClientMultiReturnType } from '@/lib/redis';
import {
  AuthUser,
  AuthUserEvent,
  KeyNamespace,
  KeyPrefix,
  KeySuffix,
  SubscriptionType
} from '@/module/types';
import { PoolClient } from 'pg';
import { RedisClientType } from 'redis';

const logger = getLogger('session-service');

const mockRepository = vi.hoisted(() => ({
  getCachedRooms: vi.fn(),
  getCachedUsers: vi.fn(),
  deleteCachedRooms: vi.fn(),
  getAllSubscriptions: vi.fn(),
  deleteHash: vi.fn(),
  deleteSubscription: vi.fn(),
  removeActiveMember: vi.fn(),
  shiftActiveMember: vi.fn(),
  purgeSessionState: vi.fn(),
  setSessionActive: vi.fn(),
  getActiveSession: vi.fn(),
  purgeCachedRooms: vi.fn(),
  setSessionHeartbeat: vi.fn(),
  unsetSessionHeartbeat: vi.fn(),
  getInactiveConnectionIds: vi.fn(),
  addAuthUser: vi.fn(),
  getAuthUser: vi.fn(),
  deleteAuthUser: vi.fn(),
  deletePresenceSets: vi.fn(),
  deleteAuthUserConnection: vi.fn(),
  getAuthUserConnectionCount: vi.fn()
}));

vi.mock('@/module/repository', () => mockRepository);

const mockDb = vi.hoisted(() => ({
  getApplicationIdByAppPid: vi.fn(),
  saveSessionData: vi.fn(),
  setSessionDisconnected: vi.fn(),
  saveConnectionEvent: vi.fn(),
  getConnectionEventId: vi.fn(),
  setAuthUserOffline: vi.fn(),
  setAuthUserOnline: vi.fn()
}));

vi.mock('@/module/db', () => mockDb);

const mockPublisher = vi.hoisted(() => ({
  dispatch: vi.fn()
}));

vi.mock('@/lib/publisher', () => mockPublisher);

describe('service', () => {
  let mockRedisClient = {} as RedisClient;
  let mockPgClient = {} as PoolClient;

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('formatKey', () => {
    it('should return the key parts concatenated to string', () => {
      expect(formatKey(['key1', 'key2'])).toEqual('key1:key2');
    });
  });

  describe('formatPresenceSubscription', () => {
    it('should return a valid presence subscription string', () => {
      const nspRoomId = 'nsp:room1';
      const event = 'event1';

      expect(formatPresenceSubscription(nspRoomId, event)).toEqual(`nsp:room1:$:presence:event1`);
    });
  });

  describe('formatUserSubscription', () => {
    it('should return a valid user subscription string', () => {
      const nspClientId = 'nsp:user1';
      const event = 'event1';

      expect(formatUserSubscription(nspClientId, event)).toEqual(`nsp:user1:$:event1`);
    });
  });

  describe('formatUserSubscriptionAll', () => {
    it('should return a valid user subscription string for all user events', () => {
      const nspClientId = 'nsp:user1';

      expect(formatUserSubscriptionAll(nspClientId)).toEqual(`nsp:user1:$:$:subscribe:all`);
    });
  });

  describe('getCachedRooms', () => {
    it('should return an array of cached rooms by connectionId', async () => {
      mockRepository.getCachedRooms.mockResolvedValueOnce({
        room1: '2024-09-23T09:32:53.553Z',
        room2: '2024-09-23T09:32:53.553Z'
      });

      const connectionId = '12345';

      const result = await getCachedRooms(logger, mockRedisClient, connectionId);

      expect(result).toEqual(['room1', 'room2']);
    });
  });

  describe('getCachedUsers', () => {
    it('should return an array of cached users by connectionId', async () => {
      mockRepository.getCachedUsers.mockResolvedValueOnce({
        user1: '2024-09-23T09:32:53.553Z',
        user2: '2024-09-23T09:32:53.553Z'
      });

      const connectionId = '12345';

      const result = await getCachedUsers(logger, mockRedisClient, connectionId);

      expect(result).toEqual(['user1', 'user2']);
    });
  });

  describe('purgeCachedRooms', () => {
    it('should purge cached rooms by connectionId', async () => {
      const connectionId = '12345';
      const cachedRoomsKey = `${KeyPrefix.CONNECTION}:${connectionId}:${KeySuffix.ROOMS}`;

      await purgeCachedRooms(logger, mockRedisClient, connectionId);

      expect(mockRepository.purgeCachedRooms).toHaveBeenCalledWith(mockRedisClient, cachedRoomsKey);
    });
  });

  describe('purgeSubscriptions', () => {
    it('should purge all subscriptions by keyNamespace, connectionId and nspRoomId', async () => {
      mockRepository.getAllSubscriptions.mockResolvedValueOnce({
        'nsp:room1:event': '2024-09-23T09:32:53.553Z',
        'nsp:room2:event': '2024-09-23T09:32:53.553Z'
      });

      const connectionId = '12345';
      const nspRoomId = 'nsp:room1';
      const keyNamespace = KeyNamespace.USERS;
      const subscriptionsCacheKey = formatKey([
        KeyPrefix.CONNECTION,
        connectionId,
        keyNamespace,
        nspRoomId
      ]);

      await purgeSubscriptions(logger, mockRedisClient, connectionId, nspRoomId, keyNamespace);

      expect(mockRepository.getAllSubscriptions).toHaveBeenCalledWith(
        mockRedisClient,
        subscriptionsCacheKey
      );

      expect(mockRepository.deleteSubscription).toHaveBeenCalledTimes(2);
    });
  });

  describe('purgeUserSubscriptions', () => {
    it('should purge cached users by deleting cache key for connectionId and clientId', async () => {
      const connectionId = '12345';
      const clientId = 'abcde';
      const userSubscriptionsKey = formatKey([
        KeyPrefix.CONNECTION,
        connectionId,
        KeyNamespace.USERS,
        clientId
      ]);

      await purgeUserSubscriptions(logger, mockRedisClient, connectionId, clientId);

      expect(mockRepository.deleteHash).toHaveBeenCalledWith(mockRedisClient, userSubscriptionsKey);
    });
  });

  describe('purgeCachedUsers', () => {
    it('should purge cached users by deleting cache key for connectionId', async () => {
      const connectionId = '12345';
      const userCacheKey = formatKey([KeyPrefix.CONNECTION, connectionId, KeyNamespace.USERS]);

      await purgeCachedUsers(logger, mockRedisClient, connectionId);

      expect(mockRepository.deleteHash).toHaveBeenCalledWith(mockRedisClient, userCacheKey);
    });
  });

  describe('removeActiveMember', () => {
    it('should remove active member from cahced rooms by deleting userdata and shifting active member index', async () => {
      const connectionId = '12345';
      const nspRoomId = 'nsp:room1';
      const keyPrefix = formatKey([KeyPrefix.PRESENCE, nspRoomId]);

      await removeActiveMember(logger, mockRedisClient, connectionId, nspRoomId);

      expect(mockRepository.removeActiveMember).toHaveBeenCalledWith(
        mockRedisClient,
        `${keyPrefix}:${KeySuffix.MEMBERS}`,
        connectionId
      );

      expect(mockRepository.shiftActiveMember).toHaveBeenCalledWith(
        mockRedisClient,
        `${keyPrefix}:${KeySuffix.INDEX}`,
        connectionId
      );
    });
  });

  describe('broadcastSessionDestroy', () => {
    it('should broadcast session destroy event to nspRoomId', () => {
      const uid = '12345';
      const nspRoomId = 'nsp:room1';
      const sessionData = getMockSession({ uid });
      const presenceSubscription = formatPresenceSubscription(nspRoomId, SubscriptionType.LEAVE);

      broadcastSessionDestroy(logger, uid, nspRoomId, sessionData);

      expect(mockPublisher.dispatch).toHaveBeenCalledWith(
        nspRoomId,
        presenceSubscription,
        expect.objectContaining({
          clientId: sessionData.clientId,
          event: SubscriptionType.LEAVE,
          timestamp: expect.any(String),
          user: sessionData.user
        }),
        sessionData
      );
    });
  });

  describe('setSessionActive', () => {
    it('should set session active based on received heartbeat', async () => {
      const connectionId = '12345';
      const sessionData = getMockSession({ connectionId });
      const sessionActiveKey = formatKey([KeyPrefix.SESSION, connectionId, KeySuffix.ACTIVE]);

      await setSessionActive(logger, mockRedisClient, sessionData);

      expect(mockRepository.setSessionActive).toHaveBeenCalledWith(
        mockRedisClient,
        sessionActiveKey,
        JSON.stringify(sessionData),
        expect.any(Number)
      );
    });
  });

  describe('getActiveSession', () => {
    it('should get active session by connectionId', async () => {
      const connectionId = '12345';
      const sessionActiveKey = formatKey([KeyPrefix.SESSION, connectionId, KeySuffix.ACTIVE]);

      await getActiveSession(logger, mockRedisClient, connectionId);

      expect(mockRepository.getActiveSession).toHaveBeenCalledWith(
        mockRedisClient,
        sessionActiveKey
      );
    });
  });

  describe('getInactiveConnectionIds', () => {
    it('should return an array of inactive connectionIds based on zrange score', async () => {
      const connectionIds = ['12345', '67890'];
      mockRepository.getInactiveConnectionIds.mockResolvedValueOnce(connectionIds);

      const keepAliveCacheKey = formatKey([KeyPrefix.HEARTBEAT, KeySuffix.KEEP_ALIVE]);

      const inactiveConnectionIds = await getInactiveConnectionIds(logger, mockRedisClient);

      expect(mockRepository.getInactiveConnectionIds).toHaveBeenCalledWith(
        mockRedisClient,
        keepAliveCacheKey,
        expect.any(Number),
        0,
        expect.any(Number)
      );

      expect(inactiveConnectionIds).toEqual(connectionIds);
    });
  });

  describe('setSessionHeartbeat', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should add session data to keep alive sorted set', async () => {
      const timestamp = new Date().toISOString();

      vi.setSystemTime(new Date(timestamp));

      const connectionId = '12345';
      const sessionData = getMockSession({ connectionId, timestamp });
      const sessionKeepAliveKey = formatKey([KeyPrefix.HEARTBEAT, KeySuffix.KEEP_ALIVE]);
      const unixTime = new Date(timestamp).getTime();

      await setSessionHeartbeat(logger, mockRedisClient, sessionData);

      expect(mockRepository.setSessionHeartbeat).toHaveBeenCalledWith(
        mockRedisClient,
        sessionKeepAliveKey,
        connectionId,
        unixTime
      );
    });
  });

  describe('unsetSessionHeartbeat', () => {
    it('should remove session data from keep alive sorted set', async () => {
      const connectionId = '12345';
      const sessionKeepAliveKey = formatKey([KeyPrefix.HEARTBEAT, KeySuffix.KEEP_ALIVE]);

      await unsetSessionHeartbeat(logger, mockRedisClient, connectionId);

      expect(mockRepository.unsetSessionHeartbeat).toHaveBeenCalledWith(
        mockRedisClient,
        sessionKeepAliveKey,
        connectionId
      );
    });
  });

  describe('setSessionDisconnected', () => {
    it('should set db session as disconnected', async () => {
      const connectionId = '12345';

      await setSessionDisconnected(logger, mockPgClient, connectionId);

      expect(mockDb.setSessionDisconnected).toHaveBeenCalledWith(mockPgClient, connectionId);
    });
  });

  describe('saveSessionData', () => {
    it('should save or update db session by appId', async () => {
      const connectionId = '12345';
      const appId = 'abcde';
      const sessionData = getMockSession({ connectionId });

      await saveSessionData(logger, mockPgClient, appId, sessionData);

      expect(mockDb.saveSessionData).toHaveBeenCalledWith(mockPgClient, appId, sessionData);
    });
  });

  describe('getAppId', () => {
    it('should get corrseponding appId by appPid', async () => {
      mockDb.getApplicationIdByAppPid.mockResolvedValueOnce({
        rows: [
          {
            id: 'app-id'
          }
        ]
      });

      const appPid = 'abcde';
      const appId = await getAppId(logger, mockPgClient, appPid);

      expect(mockDb.getApplicationIdByAppPid).toHaveBeenCalledWith(mockPgClient, appPid);
      expect(appId).toEqual('app-id');
    });
  });

  describe('getConnectionEventId', () => {
    it('should get corrseponding appId by appPid', async () => {
      mockDb.getConnectionEventId.mockResolvedValueOnce({
        rows: [
          {
            id: 'connection-event-id'
          }
        ]
      });

      const connectionId = '12345';
      const socketId = 'abcde';

      const connectionEventId = await getConnectionEventId(
        logger,
        mockPgClient,
        connectionId,
        socketId
      );

      expect(mockDb.getConnectionEventId).toHaveBeenCalledWith(
        mockPgClient,
        connectionId,
        socketId
      );
      expect(connectionEventId).toEqual('connection-event-id');
    });
  });

  describe('saveSocketConnectionEvent', () => {
    it('should save connection event', async () => {
      const appId = 'abcde';
      const data = {
        action: 'connect',
        timestamp: new Date().toISOString()
      };

      await saveSocketConnectionEvent(logger, mockPgClient, appId, data);

      expect(mockDb.saveConnectionEvent).toHaveBeenCalledWith(mockPgClient, appId, data);
    });
  });

  describe('setAuthUserOffline', () => {
    it('should set auth user as offline', async () => {
      const uid = '12345';

      await setAuthUserOffline(logger, mockPgClient, uid);

      expect(mockDb.setAuthUserOffline).toHaveBeenCalledWith(mockPgClient, uid);
    });
  });

  describe('setAuthUserOnline', () => {
    it('should set auth user as online', async () => {
      const uid = '12345';

      await setAuthUserOnline(logger, mockPgClient, uid);

      expect(mockDb.setAuthUserOnline).toHaveBeenCalledWith(mockPgClient, uid);
    });
  });

  describe('addAuthUser', () => {
    it('should add auth user data to cached dataset', async () => {
      const appPid = 'abcde';
      const sessionData = getMockSession({ appPid });
      const authUser = sessionData.user as AuthUser;
      const usersCachedKey = formatKey([KeyPrefix.AUTH, appPid, 'online']);

      await addAuthUser(logger, mockRedisClient, appPid, authUser);

      expect(mockRepository.addAuthUser).toHaveBeenCalledWith(
        mockPgClient,
        usersCachedKey,
        authUser
      );
    });
  });

  describe('getAuthUser', () => {
    it('should get auth user data from cached dataset', async () => {
      const appPid = 'abcde';
      const clientId = '12345';
      const sessionData = getMockSession({ clientId, appPid }, { clientId });
      const authUser = sessionData.user as AuthUser;
      const usersCachedKey = formatKey([KeyPrefix.AUTH, appPid, 'online']);

      mockRepository.getAuthUser.mockResolvedValueOnce(JSON.stringify(authUser));

      const cachedAuthUser = await getAuthUser(logger, mockRedisClient, appPid, authUser);

      expect(mockRepository.getAuthUser).toHaveBeenCalledWith(
        mockPgClient,
        usersCachedKey,
        clientId
      );
      expect(cachedAuthUser).toEqual(authUser);
    });
  });

  describe('deleteAuthUser', () => {
    it('should delete auth user data from cached dataset', async () => {
      const appPid = 'abcde';
      const clientId = '12345';
      const sessionData = getMockSession({ clientId, appPid }, { clientId });
      const authUser = sessionData.user as AuthUser;
      const usersCachedKey = formatKey([KeyPrefix.AUTH, appPid, 'online']);

      mockRepository.getAuthUser.mockResolvedValueOnce(JSON.stringify(authUser));

      await deleteAuthUser(logger, mockRedisClient, appPid, authUser);

      expect(mockRepository.deleteAuthUser).toHaveBeenCalledWith(
        mockPgClient,
        usersCachedKey,
        clientId
      );
    });
  });

  describe('broadcastUserEvent', () => {
    it('should broadcast auth user event to user watching nspClientId', async () => {
      const event = AuthUserEvent.CONNECT;
      const sessionData = getMockSession();
      const authUser = sessionData.user as AuthUser;
      const nspClientId = `${KeyNamespace.USERS}:${authUser.clientId}`;
      const subscription = formatUserSubscription(nspClientId, event);
      const message = { aribitrary: 'data' };

      broadcastUserEvent(logger, event, authUser, sessionData, message);

      expect(mockPublisher.dispatch).toHaveBeenCalledWith(
        nspClientId,
        subscription,
        message,
        sessionData
      );
    });
  });

  describe('broadcastAuthUserConnectEvent', () => {
    it('should broadcast connect event to user watching nspClientId', async () => {
      const sessionData = getMockSession();
      const authUser = sessionData.user as AuthUser;
      const nspClientId = `${KeyNamespace.USERS}:${authUser.clientId}`;
      const connectEventSubscription = formatUserSubscription(nspClientId, AuthUserEvent.CONNECT);
      const connectStatusEventSubscription = formatUserSubscription(
        nspClientId,
        AuthUserEvent.CONNECTION_STATUS
      );

      const userData = {
        ...authUser,
        isOnline: true,
        lastOnline: new Date().toISOString()
      };

      broadcastAuthUserConnectEvent(logger, authUser, sessionData);

      expect(mockPublisher.dispatch).toHaveBeenCalledWith(
        nspClientId,
        connectEventSubscription,
        userData,
        sessionData
      );

      expect(mockPublisher.dispatch).toHaveBeenCalledWith(
        nspClientId,
        connectStatusEventSubscription,
        userData,
        sessionData
      );
    });
  });

  describe('broadcastAuthUserDisconnectEvent', () => {
    it('should broadcast disconnect event to user watching nspClientId', async () => {
      const sessionData = getMockSession();
      const authUser = sessionData.user as AuthUser;
      const nspClientId = `${KeyNamespace.USERS}:${authUser.clientId}`;
      const disconnectEventSubscription = formatUserSubscription(
        nspClientId,
        AuthUserEvent.DISCONNECT
      );
      const connectStatusEventSubscription = formatUserSubscription(
        nspClientId,
        AuthUserEvent.CONNECTION_STATUS
      );

      const userData = {
        ...authUser,
        isOnline: false,
        lastOnline: new Date().toISOString()
      };

      broadcastAuthUserDisconnectEvent(logger, authUser, sessionData);

      expect(mockPublisher.dispatch).toHaveBeenCalledWith(
        nspClientId,
        disconnectEventSubscription,
        userData,
        sessionData
      );

      expect(mockPublisher.dispatch).toHaveBeenCalledWith(
        nspClientId,
        connectStatusEventSubscription,
        userData,
        sessionData
      );
    });
  });

  describe('destroyRoomSubscriptions', () => {
    it('should delete all subscriptions for a given connectionId', async () => {
      const connectionId = '12345';

      mockRepository.getCachedRooms.mockResolvedValue({
        room1: '2024-09-23T09:32:53.553Z',
        room2: '2024-09-23T09:32:53.553Z'
      });

      mockRepository.getAllSubscriptions.mockResolvedValue({
        'room1:event': '2024-09-23T09:32:53.553Z',
        'room2:event': '2024-09-23T09:32:53.553Z'
      });

      const cachedRoomsKey = formatKey([KeyPrefix.CONNECTION, connectionId, KeySuffix.ROOMS]);

      await destroyRoomSubscriptions(logger, mockRedisClient, connectionId);

      expect(mockRepository.getCachedRooms).toHaveBeenCalledWith(mockRedisClient, cachedRoomsKey);
      expect(mockRepository.purgeCachedRooms).toHaveBeenCalledTimes(2);
      expect(mockRepository.deleteSubscription).toHaveBeenCalledTimes(12);
    });
  });

  describe('deletePresenceSets', () => {
    it('should delete all presence sets for a given connectionId', async () => {
      const connectionId = '12345';

      const connectionPresenceSetsKey = formatKey([
        KeyPrefix.CONNECTION,
        connectionId,
        KeySuffix.PRESENCE_SETS
      ]);

      await deletePresenceSets(logger, mockRedisClient, connectionId);

      expect(mockRepository.deletePresenceSets).toHaveBeenCalledWith(
        mockPgClient,
        connectionPresenceSetsKey
      );
    });
  });

  describe('deleteAuthUserConnection', () => {
    it('should delete a connection by id and return the remaining connections count', async () => {
      const appPid = 'test-app-pid';
      const clientId = 'test-client-id';
      const connectionId = '12345';
      const authUserConnectionCount = 1;

      const mockRedisClientMultiReturnType = {
        exec: vi.fn().mockResolvedValue([1, authUserConnectionCount])
      } as unknown as RedisClientMultiReturnType;

      const mockRedisClient = {
        multi: vi.fn().mockReturnValue(mockRedisClientMultiReturnType)
      } as unknown as RedisClient;

      const connectionPresenceSetsKey = formatKey([
        KeyPrefix.CLIENT,
        appPid,
        clientId,
        KeySuffix.CONNECTIONS
      ]);

      const remainingAuthUserConnectionsCount = await deleteAuthUserConnection(
        logger,
        mockRedisClient,
        appPid,
        clientId,
        connectionId
      );

      expect(mockRepository.deleteAuthUserConnection).toHaveBeenCalledWith(
        mockRedisClientMultiReturnType,
        connectionPresenceSetsKey,
        connectionId
      );
      expect(mockRepository.getAuthUserConnectionCount).toHaveBeenCalledWith(
        mockRedisClientMultiReturnType,
        connectionPresenceSetsKey
      );
      expect(remainingAuthUserConnectionsCount).toBe(authUserConnectionCount);
    });
  });
});
