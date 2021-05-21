import './opentelemetry-webworker-fix';
import * as opentelemetry from '@opentelemetry/api';
import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from '@opentelemetry/tracing';
import { CollectorTraceExporter } from '@opentelemetry/exporter-collector';
import {
  RaftServerWorkerMessage,
  RaftServerWorkerMessageType,
} from './worker-messaging-interfaces';
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
import { WorkerStalkSpanExporter } from './worker-stalk-span-exporter';

interface PeerRaftServer {
  id: string;
  voteGranted: boolean;
  matchIndex: number;
  nextIndex: number;
  heartbeatTimeoutId: number;
}

// General variables
let tracer: opentelemetry.Tracer;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const minSpanDuration = cfg.MIN_MESSAGE_DELAY;

// Public state (exposed to UI)
let state = RaftServerState.STOPPED;
let term = 1;
let votedFor: string;
let log: RaftLogItem[] = [];
let peers: { [key: string]: PeerRaftServer } = {};

// Internal state
let id: string;
let commitIndex = 0;
let rpcTimeoutIds: { [key: string]: number } = {};
let rpcSpans: { [key: string]: opentelemetry.Span } = {};
let electionTimeoutId: number;

function sendMessageToPeer(message: RaftMessage, timeout = 0) {
  const peer = peers[message.to];
  if (!peer) return;

  const delay =
    cfg.MIN_MESSAGE_DELAY +
    Math.random() * (cfg.MAX_MESSAGE_DELAY - cfg.MIN_MESSAGE_DELAY);

  setTimeout(() => {
    sendMessage({
      type: RaftServerWorkerMessageType.MESSAGE_TO_PEER,
      payload: message,
    });
  }, delay);

  debug(`Sending ${message.type} message to ${message.to}`, message);
  sendMessage({
    type: RaftServerWorkerMessageType.PROXY_EVENT,
    payload: {
      type: RaftServerEvents.SENT_MESSAGE,
      message,
      delay,
    },
  });

  if (timeout > 0) {
    rpcTimeoutIds[message.id] = setTimeout(() => {
      delete rpcTimeoutIds[message.id];
      handleMessageTimeout(message);
    }, timeout) as any;
  }
}

function clearElectionTimeout() {
  clearTimeout(electionTimeoutId);
  electionTimeoutId = null;

  sendMessage({
    type: RaftServerWorkerMessageType.PROXY_EVENT,
    payload: {
      type: RaftServerEvents.CLEARED_ELECTION_TIMEOUT,
    },
  });
}

function reloadElectionTimeout(parentSpan: opentelemetry.Span) {
  clearTimeout(electionTimeoutId);
  const delay =
    cfg.MIN_ELECTION_TIMEOUT +
    Math.random() * (cfg.MAX_ELECTION_TIMEOUT - cfg.MIN_ELECTION_TIMEOUT);

  electionTimeoutId = setTimeout(
    () => handleElectionTimeout(parentSpan),
    delay
  ) as any;

  parentSpan?.addEvent('election-timeout-reset', { timeout: delay });
  sendMessage({
    type: RaftServerWorkerMessageType.PROXY_EVENT,
    payload: {
      type: RaftServerEvents.SET_ELECTION_TIMEOUT,
      delay,
    },
  });
}

// Can be in 4 states
async function handleElectionTimeout(parentSpan: opentelemetry.Span) {
  if (state == RaftServerState.STOPPED) {
    return;
  }

  if (state == RaftServerState.LEADER) {
    return;
  }

  if (state == RaftServerState.CANDIDATE || state == RaftServerState.FOLLOWER) {
    const ctx = opentelemetry.setSpan(
      opentelemetry.context.active(),
      parentSpan
    );
    const span = tracer.startSpan('startNewElection', {}, ctx);
    span.setAttributes({ ...dumpStateAsSpanAttributes() });
    debug(`Election timeout, starting a new one...`);

    // Starting new election
    reloadElectionTimeout(span);
    term += 1;
    votedFor = id;
    state = RaftServerState.CANDIDATE;

    Object.values(peers).forEach((peer) => {
      peer.voteGranted = false;
      peer.matchIndex = 0;
      peer.nextIndex = 1;
    });

    sendStateUpdate();
    sendMessage({
      type: RaftServerWorkerMessageType.PROXY_EVENT,
      payload: {
        type: RaftServerEvents.STARTED_NEW_ELECTION,
      },
    });

    // We're updating `term` and `peers.matchIndex`
    // we're sure that we're not leader, but just in case
    // advanceCommitIndex();

    // Send request messages
    Object.values(peers).forEach((peer) => {
      sendRequestVoteMessage(span, peer.id);
    });

    await sleep(minSpanDuration); // make the span visually pleasing
    span.end();

    return;
  }
}

function stepDown(parentSpan: opentelemetry.Span, term_: number) {
  state = RaftServerState.FOLLOWER;
  term = term_;
  votedFor = null;
  reloadElectionTimeout(parentSpan);

  sendStateUpdate();
  sendMessage({
    type: RaftServerWorkerMessageType.PROXY_EVENT,
    payload: {
      type: RaftServerEvents.STEPPED_DOWN,
    },
  });

  // We're updating `term`
  // we're sure that we're not leader, but just in case
  // advanceCommitIndex();
}

function sendRequestVoteMessage(
  parentSpan: opentelemetry.Span,
  peerId: string
) {
  const span = tracer.startSpan('requestVote', {
    links: [{ context: parentSpan?.context() }],
  });

  const message: RequestVoteMessage = {
    id: generateMessageId(),
    from: id,
    to: peerId,
    term: term,
    type: 'RequestVote',
    lastLogTerm: logTerm(log, log.length),
    lastLogIndex: log.length,
  };

  span.setAttributes({
    to: peerId,
    term: term,
    lastLogTerm: message.lastLogTerm,
    lastLogIndex: message.lastLogIndex,
  });
  const ctx = opentelemetry.setSpan(opentelemetry.context.active(), span);
  opentelemetry.propagation.inject(ctx, message);
  rpcSpans[message.id] = span;

  sendMessageToPeer(message, cfg.RPC_TIMEOUT);
}

// Can be in 3 states
async function handleRequestVoteMessage(message: RequestVoteMessage) {
  const ctx = opentelemetry.propagation.extract(
    opentelemetry.context.active(),
    message
  );
  const span = tracer.startSpan('handleRequestVote', {}, ctx);
  span.setAttributes({
    ...dumpStateAsSpanAttributes(),
    'request.term': message.term,
    'request.lastLogTerm': message.lastLogTerm,
    'request.lastLogIndex': message.lastLogIndex,
  });

  debug(`Recieved ${message.type} message from ${message.from}`, message);

  if (term < message.term) {
    const logMessage = `Incoming term (${message.term}) is higher than my term (${term}), stepping down`;
    debug(logMessage);
    span.addEvent('stepping-down', {
      incomingTerm: message.term,
      myTerm: term,
    });
    stepDown(span, message.term);
  }

  let granted = false;

  if (
    term == message.term &&
    (!votedFor || votedFor == message.from) &&
    (message.lastLogTerm > logTerm(log) ||
      (message.lastLogTerm == logTerm(log) &&
        message.lastLogIndex >= log.length))
  ) {
    const logMessage = `Voted for ${message.from}`;
    debug(logMessage);
    span.addEvent('voted', { for: message.from });

    granted = true;
    votedFor = message.from;
    reloadElectionTimeout(span);

    sendStateUpdate();
    sendMessage({
      type: RaftServerWorkerMessageType.PROXY_EVENT,
      payload: {
        type: RaftServerEvents.VOTED,
      },
    });
  }

  const response: RequestVoteResponseMessage = {
    ...message,
    from: id,
    to: message.from,
    term: term,
    type: 'RequestVoteResponse',
    granted,
  };
  sendMessageToPeer(response);

  span.setAttributes({ granted });

  await sleep(minSpanDuration); // make the span visually pleasing
  span.end();
}

// Can be in 3 states
function handleRequestVoteResponse(message: RequestVoteResponseMessage) {
  const span = rpcSpans[message.id];
  delete rpcSpans[message.id];
  span?.addEvent('response-recieved', {
    // ...dumpState(),
    'response.term': message.term,
    'response.granted': message.granted,
  });
  if (!message.granted) {
    span?.setAttributes({ error: 'not granted' });
  }

  debug(`Recieved ${message.type} message from ${message.from}`, message);

  if (term < message.term) {
    const logMessage = `Incoming term (${message.term}) is higher than my term (${term}), stepping down`;
    debug(logMessage);
    span.addEvent('stepping-down', {
      incomingTerm: message.term,
      myTerm: term,
    });
    stepDown(span, message.term);
  }

  if (state == RaftServerState.CANDIDATE && term == message.term) {
    const peer = peers[message.from];
    peer.voteGranted = message.granted;

    sendStateUpdate();
    sendMessage({
      type: RaftServerWorkerMessageType.PROXY_EVENT,
      payload: {
        type: RaftServerEvents.RECIEVED_VOTE,
      },
    });

    // Check if we're leader now
    const quorum = Math.ceil((Object.keys(peers).length + 1) / 2);
    let grantedVotes = 1;
    Object.values(peers).forEach((peer) => {
      if (peer.voteGranted) grantedVotes++;
    });

    if (grantedVotes >= quorum) {
      span?.addEvent('become-leader', { grantedVotes, quorum });
      debug('Became LEADER');
      state = RaftServerState.LEADER;
      Object.values(peers).forEach((peer) => {
        peer.nextIndex = log.length + 1;
        sendAppendEntriesMessage(span, peer.id);
      });

      clearElectionTimeout();

      sendStateUpdate();
      sendMessage({
        type: RaftServerWorkerMessageType.PROXY_EVENT,
        payload: {
          type: RaftServerEvents.BECAME_LEADER,
        },
      });
    }
  }

  span?.end();
}

function sendAppendEntriesMessage(
  parentSpan: opentelemetry.Span,
  peerId: string
) {
  const peer = peers[peerId];
  if (!peer) return;

  const span = tracer.startSpan('appendEntries', {
    links: [{ context: parentSpan?.context() }],
  });

  const prevIndex = peer.nextIndex - 1;
  let lastIndex = Math.min(prevIndex + cfg.BATCH_SIZE, log.length);
  if (peer.matchIndex + 1 < peer.nextIndex) lastIndex = prevIndex;

  const message: AppendEntriesMessage = {
    id: generateMessageId(),
    from: id,
    to: peerId,
    term: term,
    type: 'AppendEntries',
    prevIndex: prevIndex,
    prevTerm: logTerm(log, prevIndex),
    entries: log.slice(prevIndex, lastIndex),
    commitIndex: Math.min(commitIndex, lastIndex),
  };

  span.setAttributes({
    to: peerId,
    term: term,
    prevIndex: message.prevIndex,
    prevTerm: message.prevTerm,
    entries: message.entries.map((e) => e.value).join(','),
    commitIndex: message.commitIndex,
  });
  const ctx = opentelemetry.setSpan(opentelemetry.context.active(), span);
  opentelemetry.propagation.inject(ctx, message);
  rpcSpans[message.id] = span;

  sendMessageToPeer(message, cfg.RPC_TIMEOUT);
}

// Can be in 3 states
async function handleAppendEntriesMessage(message: AppendEntriesMessage) {
  let success = false;
  let matchIndex = 0;

  const ctx = opentelemetry.propagation.extract(
    opentelemetry.context.active(),
    message
  );
  const span = tracer.startSpan('handleAppendEntries', {}, ctx);
  span.setAttributes({
    ...dumpStateAsSpanAttributes(),
    'request.term': message.term,
    'request.prevIndex': message.prevIndex,
    'request.entries': message.entries,
    'request.commitIndex': message.commitIndex,
  } as any);

  debug(`Recieved ${message.type} message from ${message.from}`, message);

  if (term < message.term) {
    const logMessage = `Incoming term (${message.term}) is higher than my term (${term}), stepping down`;
    debug(logMessage);
    span.addEvent('stepping-down', {
      incomingTerm: message.term,
      myTerm: term,
    });
    stepDown(span, message.term);
  }

  if (term == message.term) {
    state = RaftServerState.FOLLOWER;
    reloadElectionTimeout(span);

    if (
      message.prevIndex == 0 ||
      (message.prevIndex <= log.length &&
        logTerm(log, message.prevIndex) == message.prevTerm)
    ) {
      success = true;
      let index = message.prevIndex;

      message.entries.forEach((entry, i) => {
        index++;
        if (logTerm(log, index) != entry.term) {
          while (log.length > index - 1) {
            log.pop();
          }

          log.push(entry);
        }
      });

      // this.log is changed, however we're not calling `advanceCommitIndex`,
      // we're updating `this.commitIndex` anyway.

      matchIndex = index;
      commitIndex = Math.max(commitIndex, message.commitIndex);
    }

    sendStateUpdate();
    sendMessage({
      type: RaftServerWorkerMessageType.PROXY_EVENT,
      payload: {
        type: RaftServerEvents.RECIEVED_APPEND_ENTRIES,
      },
    });
  }

  const response: AppendEntriesResponseMessage = {
    id: message.id,
    from: id,
    to: message.from,
    term: term,
    type: 'AppendEntriesResponse',
    success,
    matchIndex,
  };
  sendMessageToPeer(response);

  span.setAttributes({ success, matchIndex });

  await sleep(minSpanDuration); // make the span visually pleasing
  span.end();
}

// Can be in 3 states
function handleAppendEntriesResponse(message: AppendEntriesResponseMessage) {
  const span = rpcSpans[message.id];
  delete rpcSpans[message.id];
  span?.addEvent('response-recieved', {
    // ...dumpState(),
    'response.term': message.term,
    'response.success': message.success,
    'response.matchIndex': message.matchIndex,
  });
  if (!message.success) {
    span?.setAttributes({ error: 'not success' });
  }

  debug(`Recieved ${message.type} message from ${message.from}`, message);

  if (term < message.term) {
    const logMessage = `Incoming term (${message.term}) is higher than my term (${term}), stepping down`;
    debug(logMessage);
    span.addEvent('stepping-down', {
      incomingTerm: message.term,
      myTerm: term,
    });
    stepDown(span, message.term);
  }

  const peerId = message.from;

  if (state == RaftServerState.LEADER && term == message.term) {
    const peer = peers[peerId];

    if (message.success) {
      peer.matchIndex = Math.max(peer.matchIndex, message.matchIndex);
      peer.nextIndex = message.matchIndex + 1;

      // `peers.matchIndex` is probably changed
      advanceCommitIndex();
    } else {
      peer.nextIndex = Math.max(1, peer.nextIndex - 1);
    }

    // If peer.nextIndex <= log.length, call `sendAppendEntriesMessage` now,
    // If not, we're gonna wait for heartbeat timeout
    if (peer.nextIndex <= log.length) {
      span?.addEvent('logs-missing-resending');
      sendAppendEntriesMessage(span, peerId);
    } else {
      span?.addEvent('logs-up-to-date');
      clearTimeout(peer.heartbeatTimeoutId);
      peer.heartbeatTimeoutId = setTimeout(() => {
        if (state == RaftServerState.STOPPED) return;
        if (state == RaftServerState.LEADER) {
          sendAppendEntriesMessage(span, peerId);
        }
      }, cfg.HEARTBEAT_INTERVAL) as any;
    }

    sendStateUpdate();
  }

  span?.end();
}

// Can be in 4 states
function handleMessageTimeout(message: RaftMessage) {
  const span = rpcSpans[message.id];
  delete rpcSpans[message.id];
  span?.setAttributes({ error: 'timeout' });

  debug(`Message timeout`, message);

  if (state == RaftServerState.STOPPED) {
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
  if (message.term != term) {
    span?.addEvent('timeout', { termChanged: true, noop: true });
    span?.end();
    return;
  }

  // If we couldn't send RequestVote message, and we're
  // still candidate, try again
  if (message.type == 'RequestVote' && state == RaftServerState.CANDIDATE) {
    span?.addEvent('timeout', { resending: true });
    span?.end();
    // debug(`Timeout for sending ${message.type} message to ${message.to}, retrying...`, message);
    sendRequestVoteMessage(span, message.to);
    return;
  }

  // If we couldn't send AppendEntries message, and we're
  // still leader, try again
  if (message.type == 'AppendEntries' && state == RaftServerState.LEADER) {
    span?.addEvent('timeout', { resending: true });
    span?.end();
    // debug(`Timeout for sending ${message.type} message to ${message.to}, retrying...`, message);
    sendAppendEntriesMessage(span, message.to);
    return;
  }
}

// When to call these function? When the following change:
// - peers.matchIndex
// - this.log.length
// - this.term
//
// However if we're sure that we're not leader, no need to call
function advanceCommitIndex() {
  const matchIndexes = [];
  Object.values(peers).forEach((peer) => matchIndexes.push(peer.matchIndex));
  matchIndexes.push(log.length);
  matchIndexes.sort((a, b) => a - b);
  const n = matchIndexes[Math.floor((Object.keys(peers).length + 1) / 2)];

  if (state == RaftServerState.LEADER && logTerm(log, n) == term) {
    commitIndex = Math.max(commitIndex, n);
    sendStateUpdate();
  }
}

function dumpStateAsSpanAttributes() {
  return {
    'self.state': state,
    'self.term': term,
    'self.votedFor': votedFor,
    'self.logs': log.map((l, i) => l.value).join(','),
    'self.logsLength': log.length,
    'self.commitIndex': commitIndex,
  };
}

////////////////////////////////////////////
////////////// PUBLIC METHODS //////////////
////////////////////////////////////////////

async function stop() {
  if (state == RaftServerState.STOPPED) {
    return;
  }

  const span = tracer.startSpan('stop', {});

  state = RaftServerState.STOPPED;
  clearTimeout(electionTimeoutId);
  Object.values(peers).forEach((peer) => {
    clearTimeout(peer.heartbeatTimeoutId);
  });

  sendStateUpdate();
  sendMessage({
    type: RaftServerWorkerMessageType.PROXY_EVENT,
    payload: {
      type: RaftServerEvents.STOPPED,
    },
  });

  await sleep(minSpanDuration); // make the span visually pleasing
  span.end();
}

async function start() {
  if (state != RaftServerState.STOPPED) {
    return;
  }

  const span = tracer.startSpan('start', {});

  state = RaftServerState.FOLLOWER;
  reloadElectionTimeout(span);

  sendStateUpdate();
  sendMessage({
    type: RaftServerWorkerMessageType.PROXY_EVENT,
    payload: {
      type: RaftServerEvents.STARTED,
    },
  });

  await sleep(minSpanDuration); // make the span visually pleasing
  span.end();
}

async function request(value: string) {
  const span = tracer.startSpan('request', {});
  span.setAttributes({
    ...dumpStateAsSpanAttributes(),
    value,
  });

  log.push({
    term: term,
    value,
  });

  sendStateUpdate();
  sendMessage({
    type: RaftServerWorkerMessageType.PROXY_EVENT,
    payload: {
      type: RaftServerEvents.LOG_REQUESTED,
    },
  });

  await sleep(minSpanDuration); // make the span visually pleasing
  span.end();
}

async function forceTriggerElection() {
  const span = tracer.startSpan('forceTriggerElection', {});
  span.setAttributes({ ...dumpStateAsSpanAttributes() });

  handleElectionTimeout(span);

  await sleep(minSpanDuration); // make the span visually pleasing
  span.end();
}

///////////////////////////////////////////////////
///////////////// EVENT LISTENING /////////////////
///////////////////////////////////////////////////

self.addEventListener('message', (event) => {
  const message = JSON.parse(event.data) as RaftServerWorkerMessage;

  if (message.type == RaftServerWorkerMessageType.INIT) {
    const { id: id_, peerIds } = message.payload;

    id = id_;
    tracer = opentelemetry.trace.getTracer(`raft-server-${id}`);

    peerIds.forEach((peerId: string) => {
      peers[peerId] = {
        id: peerId,
        voteGranted: false,
        matchIndex: 0,
        nextIndex: 1,
        heartbeatTimeoutId: null,
      };
    });

    setupTracing();

    sendMessage({ type: RaftServerWorkerMessageType.READY });
  }

  if (message.type == RaftServerWorkerMessageType.MESSAGE_FROM_PEER) {
    // Can be in 4 states
    clearTimeout(rpcTimeoutIds[message.payload.id]);
    delete rpcTimeoutIds[message.payload.id];

    if (state == RaftServerState.STOPPED) {
      return;
    }

    // Can be in 4 states
    switch (message.payload.type) {
      case 'AppendEntries':
        return handleAppendEntriesMessage(message.payload);
      case 'AppendEntriesResponse':
        return handleAppendEntriesResponse(message.payload);
      case 'RequestVote':
        return handleRequestVoteMessage(message.payload);
      case 'RequestVoteResponse':
        return handleRequestVoteResponse(message.payload);
    }
  }

  if (message.type == RaftServerWorkerMessageType.START) {
    start();
  }

  if (message.type == RaftServerWorkerMessageType.STOP) {
    stop();
  }

  if (message.type == RaftServerWorkerMessageType.REQUEST) {
    request(message.payload.value);
  }

  if (message.type == RaftServerWorkerMessageType.FORCE_TRIGGER_ELECTION) {
    forceTriggerElection();
  }
});

function sendStateUpdate() {
  sendMessage({
    type: RaftServerWorkerMessageType.STATE_UPDATE,
    payload: {
      state,
      term,
      votedFor,
      log,
      peers,
    },
  });
}

function sendMessage(message: RaftServerWorkerMessage) {
  (self.postMessage as any)(JSON.stringify(message));
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

function debug(message: string, ...args: any) {
  // console.log(`[${id}] ${message}`, args);
}

function setupTracing() {
  const provider = new BasicTracerProvider();

  ////////////////////////////////////
  ///////// CONSOLE EXPORTER /////////
  ////////////////////////////////////
  // provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

  /////////////////////////////////////////////
  ////////// OTEL-COLLECTOR EXPORTER //////////
  /////////////////////////////////////////////
  // const exporter = new CollectorTraceExporter({
  //   // url: '<opentelemetry-collector-url>', // url is optional and can be omitted - default is http://localhost:55681/v1/trace
  //   serviceName: `raft-server`,
  //   hostname: id,
  //   attributes: {
  //     // for jeager process: https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/resource/semantic_conventions/process.md#process
  //     'process.executable.name': id,
  //   },
  //   // headers: {}, // an optional object containing custom headers to be sent with each request
  //   concurrencyLimit: 10, // an optional limit on pending requests
  // });
  // provider.addSpanProcessor(
  //   new BatchSpanProcessor(exporter, {
  //     // The maximum queue size. After the size is reached spans are dropped.
  //     maxQueueSize: 100,
  //     // The maximum batch size of every export. It must be smaller or equal to maxQueueSize.
  //     maxExportBatchSize: 10,
  //     // The interval between two consecutive exports
  //     scheduledDelayMillis: 500,
  //     // How long the export can run before it is cancelled
  //     exportTimeoutMillis: 30000,
  //   })
  // );

  /////////////////////////////////////////
  ////////// STALK SPAN EXPORTER //////////
  /////////////////////////////////////////
  provider.addSpanProcessor(
    new SimpleSpanProcessor(new WorkerStalkSpanExporter(id))
  );

  provider.register();
}

sendMessage({ type: RaftServerWorkerMessageType.LOADED });
