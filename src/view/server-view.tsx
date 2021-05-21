import React from 'react';
import { Button, Tooltip, Space, Menu, Dropdown } from 'antd';
import {
  PoweroffOutlined,
  BellOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import FlashChange from '@avinlab/react-flash-change';
import { RaftServer } from '../raft/server';
import { RaftServerEvents, RaftServerState } from '../raft/raft-interfaces';
import { ElectionProgressBar } from './election-progress-bar';

export interface ServerViewProps {
  style?: React.CSSProperties;
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
    onTriggerElectionButtonClicked: this.onTriggerElectionButtonClicked.bind(
      this
    ),
    onPowerToggleClicked: this.onPowerToggleClicked.bind(this),
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
      peerCount: Object.keys(server.peers).length,
      grantedPeerVoteCount: Object.values(server.peers).filter(
        (peer) => peer.voteGranted
      ).length,
    });
  }

  onPowerToggleClicked() {
    const { server } = this.props;
    if (server.state == RaftServerState.STOPPED) {
      server.start();
    } else {
      server.stop();
    }

    window.Countly &&
      window.Countly.add_event({
        key: 'individual_server_power_toggle_clicked',
        count: 1,
        segmentation: {},
      });
  }

  onTriggerElectionButtonClicked() {
    const { server } = this.props;
    if (
      server.state == RaftServerState.CANDIDATE ||
      server.state == RaftServerState.FOLLOWER
    ) {
      server.forceTriggerElection();
    }

    window.Countly &&
      window.Countly.add_event({
        key: 'individual_server_force_election_clicked',
        count: 1,
        segmentation: {},
      });
  }

  render() {
    const {
      id,
      state,
      term,
      electionTimeoutSetAt,
      electionTimeoutDuration,
      peerCount,
      grantedPeerVoteCount,
    } = this.state;
    const { style } = this.props;

    return (
      <div
        className={`animate__animated animate__fast ${
          state == RaftServerState.LEADER ? 'animate__tada' : ''
        }`}
        style={{
          transition: 'opacity 100ms',
          opacity: state == RaftServerState.STOPPED ? 0.5 : 1,
          border: '1px solid #3C3D3D',
          borderRadius: 5,
          overflow: 'hidden',
          userSelect: 'none',
          ...style,
        }}
      >
        <div
          style={{
            background: '#3C3D3D',
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: '0.8em',
            padding: '2px 0',
            color: '#fff',
            display: 'flex',
          }}
        >
          <div style={{ width: 50 }}></div>
          <div style={{ flexGrow: 1, textAlign: 'center' }}>{id}</div>
          <div style={{ width: 50, textAlign: 'right' }}>
            <Tooltip title="Turn ON/OFF" mouseEnterDelay={1}>
              <span
                style={{ cursor: 'pointer', padding: 3 }}
                onClick={this.binded.onPowerToggleClicked}
              >
                <PoweroffOutlined />
              </span>
            </Tooltip>
            <Tooltip title="Trigger Election Timer" mouseEnterDelay={1}>
              <span
                style={{ cursor: 'pointer', padding: 3 }}
                onClick={this.binded.onTriggerElectionButtonClicked}
              >
                <BellOutlined />
              </span>
            </Tooltip>
          </div>
        </div>

        <div style={{ height: 5 }}>
          {(state == RaftServerState.CANDIDATE ||
            state == RaftServerState.FOLLOWER) && (
            <ElectionProgressBar
              style={{ height: 5 }}
              barColor={`#1B90FA`}
              timeoutDuration={electionTimeoutDuration}
              timeoutSetAt={electionTimeoutSetAt}
            />
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-around',
            marginTop: -5,
            height: '3.7em',
          }}
        >
          {/* Term */}
          <div
            style={{
              textAlign: 'center',
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div style={{ fontSize: '0.7em', fontWeight: 'bold' }}>TERM</div>
            <div style={{ fontSize: '1.4em', lineHeight: '1em' }}>{term}</div>
          </div>

          {/* Status */}
          <div
            style={{
              textAlign: 'center',
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div style={{ fontSize: '0.7em', fontWeight: 'bold' }}>STATUS</div>
            <div style={{ fontSize: '1.4em', lineHeight: '1em' }}>
              {state}
              {state == RaftServerState.CANDIDATE
                ? `(${grantedPeerVoteCount + 1}/${peerCount + 1})`
                : ``}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
