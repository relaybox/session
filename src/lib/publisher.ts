import { Connection, Envelope, PublisherProps } from 'rabbitmq-client';
import { SessionData } from '../module/types';

const AMQP_CONNECTION_STRING = process.env.RABBIT_MQ_CONNECTION_STRING;
const AMQP_EXCHANGE_NAME = 'ds.rooms';
const AMQP_QUEUE_TYPE = 'topic';
const AMQP_MAX_RETRY_ATTEMPTS = 2;

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
    routingKey: getBindingKey(subscription)
  };

  const message = {
    nspRoomId,
    event: subscription,
    data,
    session: sessionData
  };

  publisher.send(envelope, message);
}

function getBindingKey(subscription: string): string {
  return subscription.replace(/:/g, '.');
}
