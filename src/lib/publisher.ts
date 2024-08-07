import { Connection, Envelope, PublisherProps } from 'rabbitmq-client';
import { SessionData } from '../module/types';

const AMQP_CONNECTION_STRING = process.env.RABBIT_MQ_CONNECTION_STRING;
const AMQP_QUEUE_COUNT = Number(process.env.RABBIT_MQ_QUEUE_COUNT!);
const AMQP_EXCHANGE_NAME = 'ds.rooms';
const AMQP_QUEUE_TYPE = 'topic';
const AMQP_MAX_RETRY_ATTEMPTS = 2;
const AMQP_ROUTING_KEY_PREFIX = '$$';

const connection = new Connection(AMQP_CONNECTION_STRING);

const publisherOptions: PublisherProps = {
  confirm: true,
  maxAttempts: AMQP_MAX_RETRY_ATTEMPTS,
  exchanges: [
    {
      exchange: AMQP_EXCHANGE_NAME,
      type: AMQP_QUEUE_TYPE
    }
  ]
};

const publisher = connection.createPublisher(publisherOptions);

export function dispatch(
  nspRoomId: string,
  subscription: string,
  data: any,
  sessionData: SessionData
): void {
  const envelope: Envelope = {
    exchange: AMQP_EXCHANGE_NAME,
    routingKey: getRoutingKey(nspRoomId)
  };

  const message = {
    nspRoomId,
    event: subscription,
    data,
    session: sessionData
  };

  publisher.send(envelope, message);
}

export function getRoutingKey(nspRoomId: string): string {
  const [appPid, roomId] = nspRoomId.split(/:(.+)/);
  const hashedNamespace = gethashedNamespace(roomId);

  return `${AMQP_ROUTING_KEY_PREFIX}:${appPid}:${hashedNamespace}`;
}

export function gethashedNamespace(namespace: string): number {
  let hash = 0;
  let chr: number;

  for (let i = 0; i < namespace.length; i++) {
    chr = namespace.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }

  return ((hash % AMQP_QUEUE_COUNT) + AMQP_QUEUE_COUNT) % AMQP_QUEUE_COUNT;
}
