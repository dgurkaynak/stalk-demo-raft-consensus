import { EventEmitter } from 'events';
import cfg from '../globals/server-config';
import {
  RaftServerState,
  RaftServerEvents,
  RaftLogItem,
  RaftMessage,
  RequestVoteMessage,
  RequestVoteResponseMessage,
  AppendEntriesMessage,
  AppendEntriesResponseMessage,
} from './raft-interfaces';
import {
  RaftServerWorkerMessage,
  RaftServerWorkerMessageType,
} from './worker-messaging-interfaces';

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

  // TODO: You need to sync these variables with worker's state
  state = RaftServerState.STOPPED;
  term = 1;
  votedFor: string;
  log: RaftLogItem[] = [];
  peers = new Map<string, PeerRaftServer>();

  constructor(id: string, peerIds: string[]) {
    this.id = id;

    const peersMap = new Map<string, PeerRaftServer>();
    peerIds.forEach((peerId) => {
      peersMap.set(peerId, {
        id: peerId,
        voteGranted: false,
        matchIndex: 0,
        nextIndex: 1,
        heartbeatTimeoutId: null,
      });
    });
    this.peers = peersMap;

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
        const peerIds: string[] = [];
        this.peers.forEach((p) => peerIds.push(p.id));

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
        console.log('ready bitch');
      }
    });
  }

  private sendMessage(message: RaftServerWorkerMessage) {
    this.worker.postMessage(JSON.stringify(message));
  }

  stop() {
    // TODO: Send stop event
  }

  start() {
    // TODO: Send start event
  }

  request(value: string) {
    // TODO: Send request event
  }

  forceTriggerElection() {
    // TODO: Send force trigger election event
  }
}
