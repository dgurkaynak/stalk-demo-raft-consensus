
import debug from 'debug';
import { EventEmitter } from 'events';

export const MIN_MESSAGE_DELAY = 1000;
export const MAX_MESSAGE_DELAY = 1500;
export const RPC_TIMEOUT = 5000;
export const MIN_ELECTION_TIMEOUT = 10000;
export const MAX_ELECTION_TIMEOUT = 20000;
export const HEARTBEAT_INTERVAL = 3000;
export const BATCH_SIZE = 1;


export enum RaftServerState {
  FOLLOWER = 'follower',
  CANDIDATE = 'candidate',
  LEADER = 'leader',
  STOPPED = 'stopped',
}

export enum RaftServerEvents {
  SENT_MESSAGE = 'sent message',
  CLEARED_ELECTION_TIMEOUT = 'cleared election timeout',
  SET_ELECTION_TIMEOUT = 'set election timeout',
  STARTED_NEW_ELECTION = 'started new election',
  STEPPED_DOWN = 'stepped down',
  VOTED = 'voted',
  RECIEVED_VOTE = 'recieved vote',
  BECAME_LEADER = 'became leader',
  RECIEVED_APPEND_ENTRIES = 'recieved append entries',
  STARTED = 'started',
  STOPPED = 'stopped',
  LOG_REQUESTED = 'log requested'
}

export interface RaftLogItem {
  term: number;
  value: string;
}

export type RaftMessage =
  | RequestVoteMessage
  | RequestVoteResponseMessage
  | AppendEntriesMessage
  | AppendEntriesResponseMessage;

export interface RequestVoteMessage {
  id: string;
  from: string;
  to: string;
  term: number;
  type: 'RequestVote';
  lastLogTerm: number;
  lastLogIndex: number;
}

export interface RequestVoteResponseMessage {
  id: string;
  from: string;
  to: string;
  term: number;
  type: 'RequestVoteResponse';
  granted: boolean;
}

export interface AppendEntriesMessage {
  id: string;
  from: string;
  to: string;
  term: number;
  type: 'AppendEntries';
  prevIndex: number;
  prevTerm: number;
  entries: RaftLogItem[];
  commitIndex: number;
}

export interface AppendEntriesResponseMessage {
  id: string;
  from: string;
  to: string;
  term: number;
  type: 'AppendEntriesResponse';
  success: boolean;
  matchIndex: number;
}

export interface ServerPeer {
  server: RaftServer;
  voteGranted: boolean;
  matchIndex: number;
  nextIndex: number;
  heartbeatTimeoutId: number;
}

export class RaftServer {
  readonly id: string;
  readonly ee = new EventEmitter();

  state = RaftServerState.STOPPED;
  term = 1;
  votedFor: string;
  log: RaftLogItem[] = [];
  commitIndex = 0;
  peers = new Map<string, ServerPeer>();

  private rpcTimeoutIds: { [key: string]: number } = {};
  private electionTimeoutId: number;

  /**
   * If you want to see debug messages:
   *
   * ```js
   * localStorage.debug = 'raft:*'
   * ```
   */
  private debug = debug(`raft:server:${this.id}`);

  constructor(id: string) {
    this.id = id;
  }

  init(options: { peerServers: RaftServer[] }) {
    const peersMap = new Map<string, ServerPeer>();
    options.peerServers.forEach((server) => {
      peersMap.set(server.id, {
        server,
        voteGranted: false,
        matchIndex: 0,
        nextIndex: 1,
        heartbeatTimeoutId: null,
      });
    });
    this.peers = peersMap;
  }

  sendMessage(message: RaftMessage, timeout = 0) {
    const peer = this.peers.get(message.to);
    if (!peer) return;

    const delay =
      MIN_MESSAGE_DELAY +
      Math.random() * (MAX_MESSAGE_DELAY - MIN_MESSAGE_DELAY);
    setTimeout(() => peer.server.handleMessage(message), delay);

    this.debug(`Sending ${message.type} message to ${message.to}`, message);
    this.ee.emit(RaftServerEvents.SENT_MESSAGE, { message, delay });

    if (timeout > 0) {
      this.rpcTimeoutIds[message.id] = setTimeout(() => {
        delete this.rpcTimeoutIds[message.id];
        this.handleMessageTimeout(message);
      }, timeout) as any;
    }
  }

  // Can be in 4 states
  handleMessage(message: RaftMessage) {
    clearTimeout(this.rpcTimeoutIds[message.id]);
    delete this.rpcTimeoutIds[message.id];

    if (this.state == RaftServerState.STOPPED) {
      return;
    }

    // Can be in 4 states
    switch (message.type) {
      case 'AppendEntries':
        return this.handleAppendEntriesMessage(message);
      case 'AppendEntriesResponse':
        return this.handleAppendEntriesResponse(message);
      case 'RequestVote':
        return this.handleRequestVoteMessage(message);
      case 'RequestVoteResponse':
        return this.handleRequestVoteResponse(message);
    }
  }

  ////////////////////////////////////////
  ////////////////////////////////////////
  ////////// RAFT IMPLEMENTATION /////////
  ////////////////////////////////////////
  ////////////////////////////////////////

  private clearElectionTimeout() {
    clearTimeout(this.electionTimeoutId);
    this.electionTimeoutId = null;

    this.ee.emit(RaftServerEvents.CLEARED_ELECTION_TIMEOUT);
  }

  private reloadElectionTimeout() {
    clearTimeout(this.electionTimeoutId);
    const delay =
      MIN_ELECTION_TIMEOUT +
      Math.random() * (MAX_ELECTION_TIMEOUT - MIN_ELECTION_TIMEOUT);
    this.electionTimeoutId = setTimeout(
      () => this.handleElectionTimeout(),
      delay
    ) as any;

    this.ee.emit(RaftServerEvents.SET_ELECTION_TIMEOUT, { delay });
  }

  // Can be in 4 states
  private handleElectionTimeout() {
    if (this.state == RaftServerState.STOPPED) {
      return;
    }

    if (this.state == RaftServerState.LEADER) {
      return;
    }

    if (
      this.state == RaftServerState.CANDIDATE ||
      this.state == RaftServerState.FOLLOWER
    ) {
      this.debug(`Election timeout, starting a new one...`);

      // Starting new election
      this.reloadElectionTimeout();
      this.term += 1;
      this.votedFor = this.id;
      this.state = RaftServerState.CANDIDATE;

      this.peers.forEach((peer) => {
        peer.voteGranted = false;
        peer.matchIndex = 0;
        peer.nextIndex = 1;
      });

      this.ee.emit(RaftServerEvents.STARTED_NEW_ELECTION);

      // We're updating `term` and `peers.matchIndex`
      // we're sure that we're not leader, but just in case
      // this.advanceCommitIndex();

      // Send request messages
      this.peers.forEach((peer, peerId) => {
        this.sendRequestVoteMessage(peerId);
      });

      return;
    }
  }

  private stepDown(term: number) {
    this.state = RaftServerState.FOLLOWER;
    this.term = term;
    this.votedFor = null;
    this.reloadElectionTimeout();

    this.ee.emit(RaftServerEvents.STEPPED_DOWN);

    // We're updating `term`
    // we're sure that we're not leader, but just in case
    // this.advanceCommitIndex();
  }

  private sendRequestVoteMessage(peerId: string) {
    const message: RequestVoteMessage = {
      id: generateMessageId(),
      from: this.id,
      to: peerId,
      term: this.term,
      type: 'RequestVote',
      lastLogTerm: logTerm(this.log, this.log.length),
      lastLogIndex: this.log.length,
    };
    this.sendMessage(message, RPC_TIMEOUT);
  }

  // Can be in 3 states
  private handleRequestVoteMessage(message: RequestVoteMessage) {
    this.debug(
      `Recieved ${message.type} message from ${message.from}`,
      message
    );

    if (this.term < message.term) {
      this.debug(
        `Incoming term (${message.term}) is higher than my term (${this.term}), stepping down`
      );
      this.stepDown(message.term);
    }

    let granted = false;

    if (
      this.term == message.term &&
      (!this.votedFor || this.votedFor == message.from) &&
      (message.lastLogTerm > logTerm(this.log) ||
        (message.lastLogTerm == logTerm(this.log) &&
          message.lastLogIndex >= this.log.length))
    ) {
      granted = true;
      this.votedFor = message.from;
      this.reloadElectionTimeout();

      this.ee.emit(RaftServerEvents.VOTED);

      this.debug(`Voted for ${message.from}`);
    }

    const response: RequestVoteResponseMessage = {
      ...message,
      from: this.id,
      to: message.from,
      term: this.term,
      type: 'RequestVoteResponse',
      granted,
    };
    this.sendMessage(response);
  }

  // Can be in 3 states
  private handleRequestVoteResponse(message: RequestVoteResponseMessage) {
    this.debug(
      `Recieved ${message.type} message from ${message.from}`,
      message
    );

    if (this.term < message.term) {
      this.debug(
        `Incoming term (${message.term}) is higher than my term (${this.term}), stepping down`
      );
      this.stepDown(message.term);
    }

    if (this.state == RaftServerState.CANDIDATE && this.term == message.term) {
      const peer = this.peers.get(message.from);
      peer.voteGranted = message.granted;

      this.ee.emit(RaftServerEvents.RECIEVED_VOTE);

      // Check if we're leader now
      const quorum = Math.ceil((this.peers.size + 1) / 2);
      let grantedVotes = 1;
      this.peers.forEach((peer) => {
        if (peer.voteGranted) grantedVotes++;
      });

      if (grantedVotes >= quorum) {
        this.debug('Became LEADER');
        this.state = RaftServerState.LEADER;
        this.peers.forEach((peer, peerId) => {
          peer.nextIndex = this.log.length + 1;
          this.sendAppendEntriesMessage(peerId);
        });

        this.clearElectionTimeout();

        this.ee.emit(RaftServerEvents.BECAME_LEADER);
      }
    }
  }

  private sendAppendEntriesMessage(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    const prevIndex = peer.nextIndex - 1;
    let lastIndex = Math.min(prevIndex + BATCH_SIZE, this.log.length);
    if (peer.matchIndex + 1 < peer.nextIndex) lastIndex = prevIndex;

    const message: AppendEntriesMessage = {
      id: generateMessageId(),
      from: this.id,
      to: peerId,
      term: this.term,
      type: 'AppendEntries',
      prevIndex: prevIndex,
      prevTerm: logTerm(this.log, prevIndex),
      entries: this.log.slice(prevIndex, lastIndex),
      commitIndex: Math.min(this.commitIndex, lastIndex),
    };
    this.sendMessage(message, RPC_TIMEOUT);
  }

  // Can be in 3 states
  private handleAppendEntriesMessage(message: AppendEntriesMessage) {
    let success = false;
    let matchIndex = 0;

    this.debug(
      `Recieved ${message.type} message from ${message.from}`,
      message
    );

    if (this.term < message.term) {
      this.debug(
        `Incoming term (${message.term}) is higher than my term (${this.term}), stepping down`
      );
      this.stepDown(message.term);
    }

    if (this.term == message.term) {
      this.state = RaftServerState.FOLLOWER;
      this.reloadElectionTimeout();

      if (
        message.prevIndex == 0 ||
        (message.prevIndex <= this.log.length &&
          logTerm(this.log, message.prevIndex) == message.prevTerm)
      ) {
        success = true;
        let index = message.prevIndex;

        message.entries.forEach((entry, i) => {
          index++;
          if (logTerm(this.log, index) != entry.term) {
            while (this.log.length > index - 1) {
              this.log.pop();
            }

            this.log.push(entry);
          }
        });

        // this.log is changed, however we're not calling `advanceCommitIndex`,
        // we're updating `this.commitIndex` anyway.

        matchIndex = index;
        this.commitIndex = Math.max(this.commitIndex, message.commitIndex);
      }

      this.ee.emit(RaftServerEvents.RECIEVED_APPEND_ENTRIES);
    }

    const response: AppendEntriesResponseMessage = {
      id: message.id,
      from: this.id,
      to: message.from,
      term: this.term,
      type: 'AppendEntriesResponse',
      success,
      matchIndex,
    };
    this.sendMessage(response);
  }

  // Can be in 3 states
  private handleAppendEntriesResponse(message: AppendEntriesResponseMessage) {
    this.debug(
      `Recieved ${message.type} message from ${message.from}`,
      message
    );

    if (this.term < message.term) {
      this.debug(
        `Incoming term (${message.term}) is higher than my term (${this.term}), stepping down`
      );
      this.stepDown(message.term);
    }

    const peerId = message.from;

    if (this.state == RaftServerState.LEADER && this.term == message.term) {
      const peer = this.peers.get(peerId);

      if (message.success) {
        peer.matchIndex = Math.max(peer.matchIndex, message.matchIndex);
        peer.nextIndex = message.matchIndex + 1;

        // `peers.matchIndex` is probably changed
        this.advanceCommitIndex();
      } else {
        peer.nextIndex = Math.max(1, peer.nextIndex - 1);
      }

      // If peer.nextIndex <= this.log.length, call `sendAppendEntriesMessage` now,
      // If not, we're gonna wait for heartbeat timeout
      if (peer.nextIndex <= this.log.length) {
        this.sendAppendEntriesMessage(peerId);
      } else {
        clearTimeout(peer.heartbeatTimeoutId);
        peer.heartbeatTimeoutId = setTimeout(
          () => this.handleHeartbeatTimeout(peerId),
          HEARTBEAT_INTERVAL
        ) as any;
      }
    }
  }

  // Can be in 4 states
  private handleMessageTimeout(message: RaftMessage) {
    this.debug(`Message timeout`, message);

    if (this.state == RaftServerState.STOPPED) {
      return;
    }

    // If we couldn't successfully reply a message, noop.
    // The requesters will request again.
    if (
      message.type == 'AppendEntriesResponse' ||
      message.type == 'RequestVoteResponse'
    ) {
      return;
    }

    // Maybe new term has began (election timeout). If so, we don't want to retry again
    if (message.term != this.term) return;

    // If we couldn't send RequestVote message, and we're
    // still candidate, try again
    if (
      message.type == 'RequestVote' &&
      this.state == RaftServerState.CANDIDATE
    ) {
      // this.debug(`Timeout for sending ${message.type} message to ${message.to}, retrying...`, message);
      this.sendRequestVoteMessage(message.to);
      return;
    }

    // If we couldn't send AppendEntries message, and we're
    // still leader, try again
    if (
      message.type == 'AppendEntries' &&
      this.state == RaftServerState.LEADER
    ) {
      // this.debug(`Timeout for sending ${message.type} message to ${message.to}, retrying...`, message);
      this.sendAppendEntriesMessage(message.to);
      return;
    }
  }

  // When to call these function? When the following change:
  // - peers.matchIndex
  // - this.log.length
  // - this.term
  //
  // However if we're sure that we're not leader, no need to call
  private advanceCommitIndex() {
    const matchIndexes = [];
    this.peers.forEach((peer) => matchIndexes.push(peer.matchIndex));
    matchIndexes.push(this.log.length);
    matchIndexes.sort((a, b) => a - b);
    const n = matchIndexes[Math.floor((this.peers.size + 1) / 2)];

    if (
      this.state == RaftServerState.LEADER &&
      logTerm(this.log, n) == this.term
    ) {
      this.commitIndex = Math.max(this.commitIndex, n);
    }
  }

  // Can be in 4 states
  private handleHeartbeatTimeout(peerId: string) {
    if (this.state == RaftServerState.STOPPED) {
      return;
    }

    if (this.state == RaftServerState.LEADER) {
      this.sendAppendEntriesMessage(peerId);
    }
  }

  ////////////////////////////////////////////////
  ////////////////////////////////////////////////
  ////////////////////////////////////////////////
  ////////////////////////////////////////////////
  ////////////////////////////////////////////////

  stop() {
    if (this.state == RaftServerState.STOPPED) {
      return;
    }

    this.state = RaftServerState.STOPPED;
    clearTimeout(this.electionTimeoutId);
    this.peers.forEach((peer) => {
      clearTimeout(peer.heartbeatTimeoutId);
    });

    this.ee.emit(RaftServerEvents.STOPPED);
  }

  start() {
    if (this.state != RaftServerState.STOPPED) {
      return;
    }

    this.state = RaftServerState.FOLLOWER;
    this.reloadElectionTimeout();

    this.ee.emit(RaftServerEvents.STARTED);
  }

  request(value: string) {
    this.log.push({
      term: this.term,
      value
    });

    this.ee.emit(RaftServerEvents.LOG_REQUESTED);
  }

  forceTriggerElection() {
    this.handleElectionTimeout();
  }
}

function generateMessageId() {
  return Math.random().toString(36).substring(2, 7);
}

function logTerm(log: RaftLogItem[], index: number = log.length) {
  if (index < 1 || index > log.length) {
    return 0;
  } else {
    return log[index - 1].term;
  }
}
