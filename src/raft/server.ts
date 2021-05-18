import debug from 'debug';
import { EventEmitter } from 'events';
import * as opentelemetry from '@opentelemetry/api';
import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from '@opentelemetry/tracing';
import { CollectorTraceExporter } from '@opentelemetry/exporter-collector';
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

// Setup tracing
const provider = new BasicTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
// const exporter = new CollectorTraceExporter({
//   // serviceName: 'basic-service', // TODO
//   // url: '<opentelemetry-collector-url>', // url is optional and can be omitted - default is http://localhost:55681/v1/trace
//   headers: {}, // an optional object containing custom headers to be sent with each request
//   concurrencyLimit: 10, // an optional limit on pending requests
// });
// provider.addSpanProcessor(new BatchSpanProcessor(exporter, {
//   // The maximum queue size. After the size is reached spans are dropped.
//   maxQueueSize: 100,
//   // The maximum batch size of every export. It must be smaller or equal to maxQueueSize.
//   maxExportBatchSize: 10,
//   // The interval between two consecutive exports
//   scheduledDelayMillis: 500,
//   // How long the export can run before it is cancelled
//   exportTimeoutMillis: 30000,
// }));
provider.register();

interface ServerPeer {
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
  private commitIndex = 0;
  peers = new Map<string, ServerPeer>();

  private rpcTimeoutIds: { [key: string]: number } = {};
  private rpcSpans: { [key: string]: opentelemetry.Span } = {};
  private electionTimeoutId: number;
  private tracer: opentelemetry.Tracer;

  /**
   * If you want to see debug messages:
   *
   * ```js
   * localStorage.debug = 'raft:*'
   * ```
   */
  private debug: debug.Debugger;

  constructor(id: string) {
    this.id = id;
    this.debug = debug(`raft:server:${this.id}`);
    this.tracer = opentelemetry.trace.getTracer(`raft-server-${this.id}`);
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

  private sendMessage(message: RaftMessage, timeout = 0) {
    const peer = this.peers.get(message.to);
    if (!peer) return;

    const delay =
      cfg.MIN_MESSAGE_DELAY +
      Math.random() * (cfg.MAX_MESSAGE_DELAY - cfg.MIN_MESSAGE_DELAY);
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
  private handleMessage(message: RaftMessage) {
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
  private reloadElectionTimeout(parentSpan: opentelemetry.Span) {
    clearTimeout(this.electionTimeoutId);
    const delay =
      cfg.MIN_ELECTION_TIMEOUT +
      Math.random() * (cfg.MAX_ELECTION_TIMEOUT - cfg.MIN_ELECTION_TIMEOUT);
    this.electionTimeoutId = setTimeout(
      () => this.handleElectionTimeout(parentSpan, true),
      delay
    ) as any;

    parentSpan.addEvent('election-timeout-reset', { timeout: delay });
    this.ee.emit(RaftServerEvents.SET_ELECTION_TIMEOUT, { delay });
  }

  // Can be in 4 states
  private handleElectionTimeout(
    parentSpan: opentelemetry.Span,
    doesFollowFrom = false
  ) {
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
      const ctx = opentelemetry.setSpan(
        opentelemetry.context.active(),
        parentSpan
      );
      const span = this.tracer.startSpan('startNewElection', {}, ctx); // TODO: Handle doesFollowFrom == true
      span.setAttributes({ ...this.dumpState() });
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

      span.end();

      return;
    }
  }

  // TODO: parentSpan can be null
  private stepDown(parentSpan: opentelemetry.Span, term: number) {
    this.state = RaftServerState.FOLLOWER;
    this.term = term;
    this.votedFor = null;
    this.reloadElectionTimeout(parentSpan);

    this.ee.emit(RaftServerEvents.STEPPED_DOWN);

    // We're updating `term`
    // we're sure that we're not leader, but just in case
    // this.advanceCommitIndex();
  }

  // TODO: parentSpan can be null
  private sendRequestVoteMessage(
    parentSpan: opentelemetry.Span,
    peerId: string
  ) {
    const span = this.tracer.startSpan('requestVote', {
      links: [{ context: parentSpan.context() }],
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

    span.setAttributes({
      to: peerId,
      term: this.term,
      lastLogTerm: message.lastLogTerm,
      lastLogIndex: message.lastLogIndex,
    });
    const ctx = opentelemetry.setSpan(opentelemetry.context.active(), span);
    opentelemetry.propagation.inject(ctx, message);
    this.rpcSpans[message.id] = span;

    this.sendMessage(message, cfg.RPC_TIMEOUT);
  }

  // Can be in 3 states
  private handleRequestVoteMessage(message: RequestVoteMessage) {
    const ctx = opentelemetry.propagation.extract(
      opentelemetry.context.active(),
      message
    );
    const span = this.tracer.startSpan('handleRequestVote', {}, ctx);
    span.setAttributes({
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
      span.addEvent('stepping-down', {
        incomingTerm: message.term,
        myTerm: this.term,
      });
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
      span.addEvent('voted', { for: message.from });

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

    span.setAttributes({ granted });
    setTimeout(() => span.end(), 25);
  }

  // Can be in 3 states
  private handleRequestVoteResponse(message: RequestVoteResponseMessage) {
    const span = this.rpcSpans[message.id];
    delete this.rpcSpans[message.id];
    span?.addEvent('response-recieved', {
      // ...this.dumpState(),
      'response.term': message.term,
      'response.granted': message.granted,
    });
    if (!message.granted) {
      span?.setAttributes({ error: 'not granted' });
    }

    this.debug(
      `Recieved ${message.type} message from ${message.from}`,
      message
    );

    if (this.term < message.term) {
      const logMessage = `Incoming term (${message.term}) is higher than my term (${this.term}), stepping down`;
      this.debug(logMessage);
      span.addEvent('stepping-down', {
        incomingTerm: message.term,
        myTerm: this.term,
      });
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
        span?.addEvent('become-leader', { grantedVotes, quorum });
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

    span?.end();
  }

  // TODO: parentSpan can be null
  private sendAppendEntriesMessage(
    parentSpan: opentelemetry.Span,
    peerId: string
  ) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    const span = this.tracer.startSpan('appendEntries', {
      links: [{ context: parentSpan.context() }],
    });

    const prevIndex = peer.nextIndex - 1;
    let lastIndex = Math.min(prevIndex + cfg.BATCH_SIZE, this.log.length);
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

    span.setAttributes({
      to: peerId,
      term: this.term,
      prevIndex: message.prevIndex,
      prevTerm: message.prevTerm,
      entries: message.entries.map((e) => e.value).join(','),
      commitIndex: message.commitIndex,
    });
    const ctx = opentelemetry.setSpan(opentelemetry.context.active(), span);
    opentelemetry.propagation.inject(ctx, message);
    this.rpcSpans[message.id] = span;

    this.sendMessage(message, cfg.RPC_TIMEOUT);
  }

  // Can be in 3 states
  private handleAppendEntriesMessage(message: AppendEntriesMessage) {
    let success = false;
    let matchIndex = 0;

    const ctx = opentelemetry.propagation.extract(
      opentelemetry.context.active(),
      message
    );
    const span = this.tracer.startSpan('handleAppendEntries', {}, ctx);
    span.setAttributes({
      ...this.dumpState(),
      'request.term': message.term,
      'request.prevIndex': message.prevIndex,
      'request.entries': message.entries,
      'request.commitIndex': message.commitIndex,
    } as any);

    this.debug(
      `Recieved ${message.type} message from ${message.from}`,
      message
    );

    if (this.term < message.term) {
      const logMessage = `Incoming term (${message.term}) is higher than my term (${this.term}), stepping down`;
      this.debug(logMessage);
      span.addEvent('stepping-down', {
        incomingTerm: message.term,
        myTerm: this.term,
      });
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

    span.setAttributes({ success, matchIndex });
    setTimeout(() => span.end(), 50);
  }

  // Can be in 3 states
  private handleAppendEntriesResponse(message: AppendEntriesResponseMessage) {
    const span = this.rpcSpans[message.id];
    delete this.rpcSpans[message.id];
    span?.addEvent('response-recieved', {
      // ...this.dumpState(),
      'response.term': message.term,
      'response.success': message.success,
      'response.matchIndex': message.matchIndex,
    });
    if (!message.success) {
      span?.setAttributes({ error: 'not success' });
    }

    this.debug(
      `Recieved ${message.type} message from ${message.from}`,
      message
    );

    if (this.term < message.term) {
      const logMessage = `Incoming term (${message.term}) is higher than my term (${this.term}), stepping down`;
      this.debug(logMessage);
      span.addEvent('stepping-down', {
        incomingTerm: message.term,
        myTerm: this.term,
      });
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
        span?.addEvent('logs-missing-resending');
        this.sendAppendEntriesMessage(span, peerId);
      } else {
        span?.addEvent('logs-up-to-date');
        clearTimeout(peer.heartbeatTimeoutId);
        peer.heartbeatTimeoutId = setTimeout(() => {
          if (this.state == RaftServerState.STOPPED) return;
          if (this.state == RaftServerState.LEADER) {
            this.sendAppendEntriesMessage(span, peerId);
          }
        }, cfg.HEARTBEAT_INTERVAL) as any;
      }
    }

    span?.end();
  }

  // Can be in 4 states
  private handleMessageTimeout(message: RaftMessage) {
    const span = this.rpcSpans[message.id];
    delete this.rpcSpans[message.id];
    span?.setAttributes({ error: 'timeout' });

    this.debug(`Message timeout`, message);

    if (this.state == RaftServerState.STOPPED) {
      span?.end();
      return;
    }

    // If we couldn't successfully reply a message, noop.
    // The requesters will request again.
    if (
      message.type == 'AppendEntriesResponse' ||
      message.type == 'RequestVoteResponse'
    ) {
      span?.addEvent('timeout', { messageType: message.type });
      span?.end();
      return;
    }

    // Maybe new term has began (election timeout). If so, we don't want to retry again
    if (message.term != this.term) {
      span?.addEvent('timeout', { termChanged: true, noop: true });
      span?.end();
      return;
    }

    // If we couldn't send RequestVote message, and we're
    // still candidate, try again
    if (
      message.type == 'RequestVote' &&
      this.state == RaftServerState.CANDIDATE
    ) {
      span?.addEvent('timeout', { resending: true });
      span?.end();
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
      span?.addEvent('timeout', { resending: true });
      span?.end();
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

    span.end();
    this.ee.emit(RaftServerEvents.STOPPED);
  }

  start() {
    if (this.state != RaftServerState.STOPPED) {
      return;
    }

    const span = this.tracer.startSpan('start', {});

    this.state = RaftServerState.FOLLOWER;
    this.reloadElectionTimeout(span);

    span.end();
    this.ee.emit(RaftServerEvents.STARTED);
  }

  request(value: string) {
    const span = this.tracer.startSpan('request', {});
    span.setAttributes({
      ...this.dumpState(),
      value,
    });

    this.log.push({
      term: this.term,
      value,
    });

    span.end();
    this.ee.emit(RaftServerEvents.LOG_REQUESTED);
  }

  forceTriggerElection() {
    const span = this.tracer.startSpan('forceTriggerElection', {});
    span.setAttributes({ ...this.dumpState() });

    this.handleElectionTimeout(span);
    span.end();
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
