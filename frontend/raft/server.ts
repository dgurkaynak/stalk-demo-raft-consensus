import { SESSION_ID } from '../session-id';
import debug from 'debug';
import { EventEmitter } from 'events';
import * as opentracing from 'opentracing';
import { Tracer } from '../tracing/tracer';
import { Span } from '../tracing/span';

// Extremely slow-downed for visulatization
// export const MIN_MESSAGE_DELAY = 1000;
// export const MAX_MESSAGE_DELAY = 1500;
// export const RPC_TIMEOUT = 5000;
// export const MIN_ELECTION_TIMEOUT = 10000;
// export const MAX_ELECTION_TIMEOUT = 20000;
// export const HEARTBEAT_INTERVAL = 3000;
// export const BATCH_SIZE = 1;

// More realistic scenario
export const MIN_MESSAGE_DELAY = 30;
export const MAX_MESSAGE_DELAY = 50;
export const RPC_TIMEOUT = 150;
export const MIN_ELECTION_TIMEOUT = 500;
export const MAX_ELECTION_TIMEOUT = 600;
export const HEARTBEAT_INTERVAL = 100;
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
  LOG_REQUESTED = 'log requested',
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
  private rpcSpans: { [key: string]: Span } = {};
  private electionTimeoutId: number;
  private tracer: Tracer;

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
    this.tracer = new Tracer({
      process: {
        serviceName: 'raft-server',
        tags: {
          name: this.id,
          sessionId: SESSION_ID,
        },
      },
    });
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

  // child of
  private reloadElectionTimeout(parentSpan: Span) {
    clearTimeout(this.electionTimeoutId);
    const delay =
      MIN_ELECTION_TIMEOUT +
      Math.random() * (MAX_ELECTION_TIMEOUT - MIN_ELECTION_TIMEOUT);
    this.electionTimeoutId = setTimeout(
      () => this.handleElectionTimeout(parentSpan, true),
      delay
    ) as any;

    parentSpan.log({ message: `Election timeout reset`, timeout: delay });
    this.ee.emit(RaftServerEvents.SET_ELECTION_TIMEOUT, { delay });
  }

  // Can be in 4 states
  private handleElectionTimeout(parentSpan: Span, doesFollowFrom = false) {
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
      const span = doesFollowFrom
        ? this.tracer.startSpan('startNewElection', {
            references: [opentracing.followsFrom(parentSpan.context())],
          })
        : this.tracer.startSpan('startNewElection', {
            childOf: parentSpan,
          });
      span.addTags({ ...this.dumpState() });
      this.debug(`Election timeout, starting a new one...`);

      // Starting new election
      this.reloadElectionTimeout(span);
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
        this.sendRequestVoteMessage(span, peerId);
      });

      span.finish();

      return;
    }
  }

  private stepDown(parentSpan: Span, term: number) {
    this.state = RaftServerState.FOLLOWER;
    this.term = term;
    this.votedFor = null;
    this.reloadElectionTimeout(parentSpan);

    this.ee.emit(RaftServerEvents.STEPPED_DOWN);

    // We're updating `term`
    // we're sure that we're not leader, but just in case
    // this.advanceCommitIndex();
  }

  private sendRequestVoteMessage(parentSpan: Span, peerId: string) {
    const span = this.tracer.startSpan('requestVote', {
      references: [opentracing.followsFrom(parentSpan.context())],
    });

    const message: RequestVoteMessage = {
      id: generateMessageId(),
      from: this.id,
      to: peerId,
      term: this.term,
      type: 'RequestVote',
      lastLogTerm: logTerm(this.log, this.log.length),
      lastLogIndex: this.log.length,
    };

    span.addTags({
      to: peerId,
      term: this.term,
      lastLogTerm: message.lastLogTerm,
      lastLogIndex: message.lastLogIndex,
    });
    this.tracer.inject(span, opentracing.FORMAT_TEXT_MAP, message);
    this.rpcSpans[message.id] = span;

    this.sendMessage(message, RPC_TIMEOUT);
  }

  // Can be in 3 states
  private handleRequestVoteMessage(message: RequestVoteMessage) {
    const parentSpanContext = this.tracer.extract(
      opentracing.FORMAT_TEXT_MAP,
      message
    );
    const span = this.tracer.startSpan('handleRequestVote', {
      childOf: parentSpanContext,
    });
    span.addTags({
      ...this.dumpState(),
      'request.term': message.term,
      'request.lastLogTerm': message.lastLogTerm,
      'request.lastLogIndex': message.lastLogIndex,
    });

    this.debug(
      `Recieved ${message.type} message from ${message.from}`,
      message
    );

    if (this.term < message.term) {
      const logMessage = `Incoming term (${message.term}) is higher than my term (${this.term}), stepping down`;
      this.debug(logMessage);
      span.log({ message: logMessage });
      this.stepDown(span, message.term);
    }

    let granted = false;

    if (
      this.term == message.term &&
      (!this.votedFor || this.votedFor == message.from) &&
      (message.lastLogTerm > logTerm(this.log) ||
        (message.lastLogTerm == logTerm(this.log) &&
          message.lastLogIndex >= this.log.length))
    ) {
      const logMessage = `Voted for ${message.from}`;
      this.debug(logMessage);
      span.log({ message: logMessage });

      granted = true;
      this.votedFor = message.from;
      this.reloadElectionTimeout(span);

      this.ee.emit(RaftServerEvents.VOTED);
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

    span.addTags({ granted });
    setTimeout(() => span.finish(), 25);
  }

  // Can be in 3 states
  private handleRequestVoteResponse(message: RequestVoteResponseMessage) {
    const span = this.rpcSpans[message.id];
    delete this.rpcSpans[message.id];
    span?.log({
      message: 'Response recieved',
      // ...this.dumpState(),
      'response.term': message.term,
      'response.granted': message.granted,
    });
    if (!message.granted) {
      span?.addTags({ error: 'not granted' });
    }

    this.debug(
      `Recieved ${message.type} message from ${message.from}`,
      message
    );

    if (this.term < message.term) {
      const logMessage = `Incoming term (${message.term}) is higher than my term (${this.term}), stepping down`;
      this.debug(logMessage);
      span?.log({ message: logMessage });
      this.stepDown(span, message.term);
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
        span?.log({ message: 'Became leader', grantedVotes, quorum });
        this.debug('Became LEADER');
        this.state = RaftServerState.LEADER;
        this.peers.forEach((peer, peerId) => {
          peer.nextIndex = this.log.length + 1;
          this.sendAppendEntriesMessage(span, peerId);
        });

        this.clearElectionTimeout();

        this.ee.emit(RaftServerEvents.BECAME_LEADER);
      }
    }

    span?.finish();
  }

  private sendAppendEntriesMessage(parentSpan: Span, peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    const span = this.tracer.startSpan('appendEntries', {
      references: [opentracing.followsFrom(parentSpan.context())],
    });

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

    span.addTags({
      to: peerId,
      term: this.term,
      prevIndex: message.prevIndex,
      prevTerm: message.prevTerm,
      entries: message.entries.map((e) => e.value).join(','),
      commitIndex: message.commitIndex,
    });
    this.tracer.inject(span, opentracing.FORMAT_TEXT_MAP, message);
    this.rpcSpans[message.id] = span;

    this.sendMessage(message, RPC_TIMEOUT);
  }

  // Can be in 3 states
  private handleAppendEntriesMessage(message: AppendEntriesMessage) {
    let success = false;
    let matchIndex = 0;

    const parentSpanContext = this.tracer.extract(
      opentracing.FORMAT_TEXT_MAP,
      message
    );
    const span = this.tracer.startSpan('handleAppendEntries', {
      childOf: parentSpanContext,
    });
    span.addTags({
      ...this.dumpState(),
      'request.term': message.term,
      'request.prevIndex': message.prevIndex,
      'request.entries': message.entries,
      'request.commitIndex': message.commitIndex,
    });

    this.debug(
      `Recieved ${message.type} message from ${message.from}`,
      message
    );

    if (this.term < message.term) {
      const logMessage = `Incoming term (${message.term}) is higher than my term (${this.term}), stepping down`;
      this.debug(logMessage);
      span.log({ message: logMessage });
      this.stepDown(span, message.term);
    }

    if (this.term == message.term) {
      this.state = RaftServerState.FOLLOWER;
      this.reloadElectionTimeout(span);

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

    span.addTags({ success, matchIndex });
    setTimeout(() => span.finish(), 50);
  }

  // Can be in 3 states
  private handleAppendEntriesResponse(message: AppendEntriesResponseMessage) {
    const span = this.rpcSpans[message.id];
    delete this.rpcSpans[message.id];
    span?.log({
      message: 'Response recieved',
      // ...this.dumpState(),
      'response.term': message.term,
      'response.success': message.success,
      'response.matchIndex': message.matchIndex,
    });
    if (!message.success) {
      span?.addTags({ error: 'not success' });
    }

    this.debug(
      `Recieved ${message.type} message from ${message.from}`,
      message
    );

    if (this.term < message.term) {
      const logMessage = `Incoming term (${message.term}) is higher than my term (${this.term}), stepping down`;
      this.debug(logMessage);
      span?.log({ message: logMessage });
      this.stepDown(span, message.term);
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
        span?.log({
          message: `Peer has still missing logs, re-sending append entries`,
        });
        this.sendAppendEntriesMessage(span, peerId);
      } else {
        span?.log({
          message: `Peer's log is up to date, setting a heartbeat timeout`,
        });
        clearTimeout(peer.heartbeatTimeoutId);
        peer.heartbeatTimeoutId = setTimeout(() => {
          if (this.state == RaftServerState.STOPPED) return;
          if (this.state == RaftServerState.LEADER) {
            this.sendAppendEntriesMessage(span, peerId);
          }
        }, HEARTBEAT_INTERVAL) as any;
      }
    }

    span?.finish();
  }

  // Can be in 4 states
  private handleMessageTimeout(message: RaftMessage) {
    const span = this.rpcSpans[message.id];
    delete this.rpcSpans[message.id];
    span?.addTags({ error: 'timeout' });

    this.debug(`Message timeout`, message);

    if (this.state == RaftServerState.STOPPED) {
      span?.finish();
      return;
    }

    // If we couldn't successfully reply a message, noop.
    // The requesters will request again.
    if (
      message.type == 'AppendEntriesResponse' ||
      message.type == 'RequestVoteResponse'
    ) {
      span?.log({
        message: `Timeout, but message type is "${message.type}", noop`,
      });
      span?.finish();
      return;
    }

    // Maybe new term has began (election timeout). If so, we don't want to retry again
    if (message.term != this.term) {
      span?.log({ message: `Timeout, but term is changed, noop` });
      span?.finish();
      return;
    }

    // If we couldn't send RequestVote message, and we're
    // still candidate, try again
    if (
      message.type == 'RequestVote' &&
      this.state == RaftServerState.CANDIDATE
    ) {
      span?.log({ message: `Timeout, resending` });
      span?.finish();
      // this.debug(`Timeout for sending ${message.type} message to ${message.to}, retrying...`, message);
      this.sendRequestVoteMessage(span, message.to);
      return;
    }

    // If we couldn't send AppendEntries message, and we're
    // still leader, try again
    if (
      message.type == 'AppendEntries' &&
      this.state == RaftServerState.LEADER
    ) {
      span?.log({ message: `Timeout, resending` });
      span?.finish();
      // this.debug(`Timeout for sending ${message.type} message to ${message.to}, retrying...`, message);
      this.sendAppendEntriesMessage(span, message.to);
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

  private dumpState() {
    return {
      'self.state': this.state,
      'self.term': this.term,
      'self.votedFor': this.votedFor,
      'self.logs': this.log.map((l, i) => l.value).join(','),
      'self.logsLength': this.log.length,
      'self.commitIndex': this.commitIndex,
    };
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

    const span = this.tracer.startSpan('stop', {});

    this.state = RaftServerState.STOPPED;
    clearTimeout(this.electionTimeoutId);
    this.peers.forEach((peer) => {
      clearTimeout(peer.heartbeatTimeoutId);
    });

    span.finish();
    this.ee.emit(RaftServerEvents.STOPPED);
  }

  start() {
    if (this.state != RaftServerState.STOPPED) {
      return;
    }

    const span = this.tracer.startSpan('start', {});

    this.state = RaftServerState.FOLLOWER;
    this.reloadElectionTimeout(span);

    span.finish();
    this.ee.emit(RaftServerEvents.STARTED);
  }

  request(value: string) {
    const span = this.tracer.startSpan('request', {});
    span.addTags({
      ...this.dumpState(),
      value,
    });

    this.log.push({
      term: this.term,
      value,
    });

    span.finish();
    this.ee.emit(RaftServerEvents.LOG_REQUESTED);
  }

  forceTriggerElection() {
    const span = this.tracer.startSpan('forceTriggerElection', {});
    span.addTags({ ...this.dumpState() });

    this.handleElectionTimeout(span);
    span.finish();
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
