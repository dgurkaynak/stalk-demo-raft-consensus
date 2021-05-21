import { EventEmitter } from 'events';
import { RaftServerState, RaftLogItem } from './raft-interfaces';
import {
  RaftServerWorkerMessage,
  RaftServerWorkerMessageType,
} from './worker-messaging-interfaces';
import { CLUSTER } from '../globals/cluster';
import * as TraceCollector from '../globals/trace-collector';

interface PeerRaftServer {
  id: string;
  voteGranted: boolean;
  matchIndex: number;
  nextIndex: number;
  heartbeatTimeoutId: number;
}

export class RaftServer {
  readonly id: string;
  readonly ee = new EventEmitter();
  readonly ready: Promise<never>;

  private readyHandlers: { resolve: Function; reject: Function };
  private worker: Worker;

  state = RaftServerState.STOPPED;
  term = 1;
  votedFor: string;
  log: RaftLogItem[] = [];
  peers: { [key: string]: PeerRaftServer } = {};

  constructor(id: string, peerIds: string[]) {
    this.id = id;

    peerIds.forEach((peerId) => {
      this.peers[peerId] = {
        id: peerId,
        voteGranted: false,
        matchIndex: 0,
        nextIndex: 1,
        heartbeatTimeoutId: null,
      };
    });

    this.ready = new Promise((resolve, reject) => {
      this.readyHandlers = { resolve, reject };
    });

    this.worker = new Worker(new URL('./server-worker.ts', import.meta.url));
    this.bindEvents();
  }

  private bindEvents() {
    this.worker.addEventListener('message', (event) => {
      const message = JSON.parse(event.data) as RaftServerWorkerMessage;

      if (message.type == RaftServerWorkerMessageType.LOADED) {
        const peerIds = Object.keys(this.peers);

        this.sendMessage({
          type: RaftServerWorkerMessageType.INIT,
          payload: {
            id: this.id,
            peerIds: peerIds,
          },
        });
      }

      if (message.type == RaftServerWorkerMessageType.READY) {
        this.readyHandlers.resolve();
        console.log(`[${this.id}] Ready`);
      }

      if (message.type == RaftServerWorkerMessageType.PROXY_EVENT) {
        this.ee.emit(message.payload.type, message.payload);
      }

      if (message.type == RaftServerWorkerMessageType.MESSAGE_TO_PEER) {
        const targetId = message.payload.to;
        const target = CLUSTER.servers.find((s) => s.id == targetId);
        target?.sendMessage({
          type: RaftServerWorkerMessageType.MESSAGE_FROM_PEER,
          payload: message.payload,
        });
      }

      if (message.type == RaftServerWorkerMessageType.STATE_UPDATE) {
        this.state = message.payload.state;
        this.term = message.payload.term;
        this.votedFor = message.payload.votedFor;
        this.log = message.payload.log;
        this.peers = message.payload.peers;
      }

      if (message.type == RaftServerWorkerMessageType.EXPORT_SPAN) {
        const span = message.payload;
        TraceCollector.addSpan(span);
      }
    });
  }

  sendMessage(message: RaftServerWorkerMessage) {
    this.worker.postMessage(JSON.stringify(message));
  }

  stop() {
    this.sendMessage({
      type: RaftServerWorkerMessageType.STOP,
    });
  }

  start() {
    this.sendMessage({
      type: RaftServerWorkerMessageType.START,
    });
  }

  request(value: string) {
    this.sendMessage({
      type: RaftServerWorkerMessageType.REQUEST,
      payload: {
        value,
      },
    });
  }

  forceTriggerElection() {
    this.sendMessage({
      type: RaftServerWorkerMessageType.FORCE_TRIGGER_ELECTION,
    });
  }
}
