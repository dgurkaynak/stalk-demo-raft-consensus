import React from 'react';
import { Button, Tooltip, Space, Menu, Dropdown } from 'antd';
import {
  PoweroffOutlined,
  BellOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import FlashChange from '@avinlab/react-flash-change';
import { RaftServer, RaftServerEvents, RaftServerState } from '../raft/server';
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
    onTurnOnButtonClicked: this.onTurnOnButtonClicked.bind(this),
    onTurnOffButtonClicked: this.onTurnOffButtonClicked.bind(this),
    onTriggerElectionButtonClicked: this.onTriggerElectionButtonClicked.bind(
      this
    ),
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
      grantedPeerVoteCount,
    } = this.state;
    const { style } = this.props;

    return (
      <div
        style={{
          transition: 'opacity 100ms',
          opacity: state == RaftServerState.STOPPED ? 0.5 : 1,
          border: '1px solid #3C3D3D',
          borderRadius: 5,
          overflow: 'hidden',
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
          <div style={{ width: 22 }}></div>
          <div style={{ flexGrow: 1, textAlign: 'center' }}>{id}</div>
          <div style={{ width: 22 }}>
            <Dropdown
              overlay={
                <Menu>
                  {state == RaftServerState.STOPPED ? (
                    <Menu.Item onClick={this.binded.onTurnOnButtonClicked}>
                      <PoweroffOutlined />
                      Turn ON
                    </Menu.Item>
                  ) : (
                    <Menu.Item onClick={this.binded.onTurnOffButtonClicked}>
                      <PoweroffOutlined />
                      Turn OFF
                    </Menu.Item>
                  )}
                  <Menu.Item
                    disabled={
                      state != RaftServerState.CANDIDATE &&
                      state != RaftServerState.FOLLOWER
                    }
                    onClick={this.binded.onTriggerElectionButtonClicked}
                  >
                    <BellOutlined />
                    Trigger Election Timer
                  </Menu.Item>
                </Menu>
              }
            >
              <a
                className="ant-dropdown-link"
                style={{ color: '#fff', padding: '0 5px' }}
                onClick={(e) => e.preventDefault()}
              >
                <MenuOutlined />
              </a>
            </Dropdown>
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
          <FlashChange
            className="green-background-color-flash"
            value={term}
            flashClassName="active"
            flashDuration={500}
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
          </FlashChange>

          {/* Status */}
          <FlashChange
            className="green-background-color-flash"
            value={term}
            flashClassName="active"
            flashDuration={500}
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
          </FlashChange>
        </div>
      </div>
    );
  }
}
