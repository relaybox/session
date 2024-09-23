export enum KeyPrefix {
  USER = 'user',
  APPLICATION = 'application',
  PRESENCE = 'presence',
  METRICS = 'metrics',
  SESSION = 'session',
  CONNECTION = 'connection',
  HEARTBEAT = 'heartbeat',
  AUTH = 'auth'
}

export enum KeyNamespace {
  SUBSCRIPTIONS = 'subscriptions',
  PRESENCE = 'presence',
  METRICS = 'metrics',
  USERS = 'users'
}

export enum KeySuffix {
  SESSION = 'session',
  ROOMS = 'rooms',
  SECRET = 'secret',
  PENDING = 'pending',
  INDEX = 'index',
  MEMBERS = 'members',
  ACTIVE = 'active',
  DATA = 'data',
  KEEP_ALIVE = 'keepalive'
}

export enum SubscriptionType {
  JOIN = 'join',
  LEAVE = 'leave',
  UPDATE = 'update'
}

export interface AuthUser {
  id: string;
  clientId: string;
  createdAt: string;
  updatedAt: string;
  username: string;
  isOnline: boolean;
  lastOnline: string;
}

export enum AuthUserEvent {
  CONNECTION_STATUS = 'user:connection:status',
  CONNECT = 'user:connect',
  DISCONNECT = 'user:disconnect'
}

export interface SessionData {
  uid: string;
  appPid: string;
  keyId: string;
  clientId: string;
  exp: number;
  timestamp: string;
  permissions: DsPermissions;
  // anonymous: boolean;
  socketId: string;
  connectionId: string;
  user?: AuthUser;
}

export const DS_PERMISSIONS_WILDCARD = '*';

export enum DsPermission {
  SUBSCRIBE = 'subscribe',
  PUBLISH = 'publish',
  PRESENCE = 'presence',
  METRICS = 'metrics'
}

export interface DsPermissions {
  [room: string]: string[];
}

export enum SocketConnectionEventType {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect'
}

export interface SocketConnectionEvent {
  connectionEventType: SocketConnectionEventType;
  connectionEventTimestamp: Date;
}
