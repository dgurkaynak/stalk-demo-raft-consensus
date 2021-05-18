import {
  RaftServerWorkerMessage,
  RaftServerWorkerMessageType,
} from './worker-messaging-interfaces';

self.addEventListener('message', (event) => {
  const message = JSON.parse(event.data) as RaftServerWorkerMessage;

  if (message.type == RaftServerWorkerMessageType.INIT) {
    const { id, peerIds } = message.payload;
    sendMessage({ type: RaftServerWorkerMessageType.READY });
  }
});

function sendMessage(message: RaftServerWorkerMessage) {
  (self.postMessage as any)(JSON.stringify(message));
}

sendMessage({ type: RaftServerWorkerMessageType.LOADED });
