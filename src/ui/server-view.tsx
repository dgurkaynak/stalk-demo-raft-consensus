import React from 'react';
import { RaftServer, RaftServerEvents, RaftServerState } from '../raft/server';
import { ElectionProgressBar } from './election-progress-bar';

export interface ServerViewProps {
  server: RaftServer;
}

export interface ServerViewState {
  id: string;
  state: RaftServerState;
  term: number;
  votedFor: string;
  electionTimeoutSetAt: number;
  electionTimeoutDuration: number;
  peerCount: number;
  grantedPeerVoteCount: number;
}

export class ServerView extends React.Component<
  ServerViewProps,
  ServerViewState
> {
  binded = {
    onElectionTimeoutUpdated: this.onElectionTimeoutUpdated.bind(this),
    onServerStateUpdated: this.onServerStateUpdated.bind(this),
    onTurnOnButtonClicked: this.onTurnOnButtonClicked.bind(this),
    onTurnOffButtonClicked: this.onTurnOffButtonClicked.bind(this),
    onTriggerElectionButtonClicked: this.onTriggerElectionButtonClicked.bind(this),
  };

  constructor(props: ServerViewProps) {
    super(props);
    this.state = {
      id: null,
      state: RaftServerState.STOPPED,
      term: 0,
      votedFor: null,
      electionTimeoutSetAt: null,
      electionTimeoutDuration: null,
      peerCount: 0,
      grantedPeerVoteCount: 0,
    };
  }

  componentDidMount() {
    const { server } = this.props;

    // Get initial state of the server
    this.onServerStateUpdated();

    // Bind events
    server.ee.addListener(
      RaftServerEvents.CLEARED_ELECTION_TIMEOUT,
      this.binded.onElectionTimeoutUpdated
    );
    server.ee.addListener(
      RaftServerEvents.SET_ELECTION_TIMEOUT,
      this.binded.onElectionTimeoutUpdated
    );
    server.ee.addListener(
      RaftServerEvents.STARTED_NEW_ELECTION,
      this.binded.onServerStateUpdated
    );
    server.ee.addListener(
      RaftServerEvents.STEPPED_DOWN,
      this.binded.onServerStateUpdated
    );
    server.ee.addListener(
      RaftServerEvents.VOTED,
      this.binded.onServerStateUpdated
    );
    server.ee.addListener(
      RaftServerEvents.RECIEVED_VOTE,
      this.binded.onServerStateUpdated
    );
    server.ee.addListener(
      RaftServerEvents.BECAME_LEADER,
      this.binded.onServerStateUpdated
    );
    server.ee.addListener(
      RaftServerEvents.RECIEVED_APPEND_ENTRIES,
      this.binded.onServerStateUpdated
    );
    server.ee.addListener(
      RaftServerEvents.STARTED,
      this.binded.onServerStateUpdated
    );
    server.ee.addListener(
      RaftServerEvents.STOPPED,
      this.binded.onServerStateUpdated
    );
  }

  componentWillUnmount() {
    const { server } = this.props;

    // Unbind events
    server.ee.removeListener(
      RaftServerEvents.CLEARED_ELECTION_TIMEOUT,
      this.binded.onElectionTimeoutUpdated
    );
    server.ee.removeListener(
      RaftServerEvents.SET_ELECTION_TIMEOUT,
      this.binded.onElectionTimeoutUpdated
    );
    server.ee.removeListener(
      RaftServerEvents.STARTED_NEW_ELECTION,
      this.binded.onServerStateUpdated
    );
    server.ee.removeListener(
      RaftServerEvents.STEPPED_DOWN,
      this.binded.onServerStateUpdated
    );
    server.ee.removeListener(
      RaftServerEvents.VOTED,
      this.binded.onServerStateUpdated
    );
    server.ee.removeListener(
      RaftServerEvents.RECIEVED_VOTE,
      this.binded.onServerStateUpdated
    );
    server.ee.removeListener(
      RaftServerEvents.BECAME_LEADER,
      this.binded.onServerStateUpdated
    );
    server.ee.removeListener(
      RaftServerEvents.RECIEVED_APPEND_ENTRIES,
      this.binded.onServerStateUpdated
    );
    server.ee.removeListener(
      RaftServerEvents.STARTED,
      this.binded.onServerStateUpdated
    );
    server.ee.removeListener(
      RaftServerEvents.STOPPED,
      this.binded.onServerStateUpdated
    );
  }

  onElectionTimeoutUpdated(data?: { delay: number }) {
    this.setState({
      electionTimeoutSetAt: data ? Date.now() : null,
      electionTimeoutDuration: data?.delay ?? null,
    });
  }

  onServerStateUpdated() {
    const { server } = this.props;
    this.setState({
      id: server.id,
      state: server.state,
      term: server.term,
      votedFor: server.votedFor,
      peerCount: server.peers.size,
      grantedPeerVoteCount: Array.from(server.peers).filter(
        ([id, peer]) => peer.voteGranted
      ).length,
    });
  }

  onTurnOnButtonClicked() {
    const { server } = this.props;
    server.start();
  }

  onTurnOffButtonClicked() {
    const { server } = this.props;
    server.stop();
  }

  onTriggerElectionButtonClicked() {
    const { server } = this.props;
    server.forceTriggerElection();
  }

  render() {
    const {
      id,
      state,
      term,
      electionTimeoutSetAt,
      electionTimeoutDuration,
      peerCount,
      grantedPeerVoteCount
    } = this.state;

    return (
      <div style={{
        height: 150,
        transition: 'opacity 100ms',
        opacity: state == RaftServerState.STOPPED ? 0.5 : 1
      }}>
        <div>ID: {id}</div>
        <div>Term: {term}</div>
        <div>State: {state}</div>
        {(state == RaftServerState.CANDIDATE ||
          state == RaftServerState.FOLLOWER) && (
          <ElectionProgressBar
            style={{ height: 5 }}
            barColor={`#00f`}
            timeoutDuration={electionTimeoutDuration}
            timeoutSetAt={electionTimeoutSetAt}
          />
        )}
        {state == RaftServerState.CANDIDATE && (
          <div>Votes: {grantedPeerVoteCount + 1} / {peerCount + 1}</div>
        )}
        {state == RaftServerState.STOPPED ? (
          <button onClick={this.binded.onTurnOnButtonClicked}>Turn ON</button>
        ) : (
          <button onClick={this.binded.onTurnOffButtonClicked}>Turn OFF</button>
        )}
        {(state == RaftServerState.CANDIDATE ||
          state == RaftServerState.FOLLOWER) && (
            <button onClick={this.binded.onTriggerElectionButtonClicked}>Trigger Election Timer</button>
        )}
      </div>
    );
  }
}
