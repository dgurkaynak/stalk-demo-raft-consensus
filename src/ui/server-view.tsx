import React from 'react';
import { Button, Tooltip, Space } from 'antd';
import { PoweroffOutlined, BellOutlined } from '@ant-design/icons';
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
          border: '1px solid rgba(0, 0, 0, 0.75)',
          borderRadius: 5,
          ...style
        }}
      >
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.75)',
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: '0.8em',
            padding: '2px 0',
            color: '#fff',
          }}
        >
          {id}
        </div>

        <div style={{ height: 10 }}>
          {(state == RaftServerState.CANDIDATE ||
            state == RaftServerState.FOLLOWER) && (
            <ElectionProgressBar
              style={{ height: 10 }}
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
            marginTop: '0.25em',
            // alignItems: 'center'
          }}
        >
          {/* Term */}
          <FlashChange
            className="green-background-color-flash"
            value={term}
            flashClassName="active"
            flashDuration={500}
            style={{ textAlign: 'center', flexGrow: 1 }}
          >
            <div style={{ fontSize: '0.7em', fontWeight: 'bold' }} >TERM</div>
            <div style={{ fontSize: '1.4em', lineHeight: '1em' }} >{term}</div>
          </FlashChange>

          {/* Status */}
          <FlashChange
            className="green-background-color-flash"
            value={term}
            flashClassName="active"
            flashDuration={500}
            style={{ textAlign: 'center', flexGrow: 1 }}
          >
            <div style={{ fontSize: '0.7em', fontWeight: 'bold' }}>STATUS</div>
            <div style={{ fontSize: '1.4em', lineHeight: '1em' }}>
              {state}
              {state == RaftServerState.CANDIDATE ? `(${grantedPeerVoteCount + 1}/${peerCount + 1})` : ``}
            </div>
          </FlashChange>
        </div>

        {/* Buttons */}
        <div
          style={{
            textAlign: 'center',
            marginTop: 5
          }}
        >
          <Space>
            {state == RaftServerState.STOPPED ? (
              <Tooltip title="Turn ON">
                <Button
                  type="primary"
                  size="small"
                  shape="circle"
                  icon={<PoweroffOutlined />}
                  onClick={this.binded.onTurnOnButtonClicked}
                />
              </Tooltip>
            ) : (
              <Tooltip title="Turn OFF">
                <Button
                  type="danger"
                  size="small"
                  shape="circle"
                  icon={<PoweroffOutlined />}
                  onClick={this.binded.onTurnOffButtonClicked}
                />
              </Tooltip>
            )}
            <Tooltip title="Force trigger election timer">
              <Button
                size="small"
                shape="circle"
                icon={<BellOutlined />}
                disabled={
                  state != RaftServerState.CANDIDATE &&
                  state != RaftServerState.FOLLOWER
                }
                onClick={this.binded.onTriggerElectionButtonClicked}
              />
            </Tooltip>
          </Space>
        </div>

      </div>
    );
  }
}
