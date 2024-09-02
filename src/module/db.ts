import { PoolClient, QueryResult } from 'pg';
import { SessionData, SocketConnectionEvent, SocketConnectionEventType } from './types';

export function getApplicationIdByAppPid(
  pgClient: PoolClient,
  appPid: string
): Promise<QueryResult> {
  const query = `
    SELECT id FROM applications WHERE pid = $1
  `;

  return pgClient.query(query, [appPid]);
}

export function saveSessionData(
  pgClient: PoolClient,
  appId: string,
  data: any
): Promise<QueryResult> {
  const now = new Date().toISOString();
  const query = `
    INSERT INTO sessions (
      "appId", "appPid", "keyId", uid, "clientId", "connectionId", 
      "socketId", "createdAt", "updatedAt"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9 
    ) ON CONFLICT (uid, "connectionId") 
      DO UPDATE
        SET "updatedAt" = $9;
  `;

  return pgClient.query(query, [
    appId,
    data.appPid,
    data.keyId,
    data.uid,
    data.clientId,
    data.connectionId,
    data.socketId,
    now,
    now
  ]);
}

export function setSessionDisconnected(
  pgClient: PoolClient,
  connectionId: string
): Promise<QueryResult> {
  const now = new Date().toISOString();
  const query = `
    UPDATE sessions SET "disconnectedAt" = $1 WHERE "connectionId" = $2
  `;

  return pgClient.query(query, [now, connectionId]);
}

export function saveConnectionEvent(
  pgClient: PoolClient,
  appId: string,
  data: SessionData & Partial<SocketConnectionEvent>
): Promise<QueryResult> {
  const query = `
    INSERT INTO connections (
      "appId", "appPid", uid, "clientId", "connectionId", "socketId", 
      "connectionEventType", "connectionChange", "createdAt"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9 
    ) ON CONFLICT ("connectionId", "connectionEventType") 
      DO UPDATE 
        SET "socketId" = $10;
  `;

  const connectionChange = data.connectionEventType === SocketConnectionEventType.CONNECT ? 1 : -1;

  return pgClient.query(query, [
    appId,
    data.appPid,
    data.uid,
    data.clientId,
    data.connectionId,
    data.socketId,
    data.connectionEventType,
    connectionChange,
    data.connectionEventTimestamp,
    data.socketId
  ]);
}

export function getConnectionEventId(
  pgClient: PoolClient,
  connectionId: string,
  socketId: string
): Promise<QueryResult> {
  const query = `
    SELECT id FROM connections 
    WHERE "connectionId" = $1 AND "socketId" = $2;
  `;

  return pgClient.query(query, [connectionId, socketId]);
}

export async function setAuthUserOffline(pgClient: PoolClient, uid: string): Promise<QueryResult> {
  const now = new Date().toISOString();

  const query = `
    UPDATE authentication_users 
    SET "isOnline" = false, "lastOnline" = $1 
    WHERE "id" = $2;  
  `;

  return pgClient.query(query, [now, uid]);
}

export function setAuthUserOnline(pgClient: PoolClient, uid: string): Promise<QueryResult> {
  const now = new Date().toISOString();

  const query = `
    UPDATE authentication_users 
    SET "isOnline" = true, "lastOnline" = $1 
    WHERE "id" = $2;  
  `;

  return pgClient.query(query, [now, uid]);
}
