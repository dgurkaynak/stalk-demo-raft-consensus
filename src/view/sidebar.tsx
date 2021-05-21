import React from 'react';
import { Button, Space } from 'antd';
import FlashChange from '@avinlab/react-flash-change';
import times from 'lodash/times';
import { CLUSTER } from '../globals/cluster';
import { RaftServer } from '../raft/server';
import {
  RaftServerState,
  RaftServerEvents,
  RaftLogItem,
} from '../raft/raft-interfaces';
import cfg from '../globals/server-config';

const styles: any = {
  verticalText: {
    textOrientation: 'mixed',
    writingMode: 'vertical-rl',
  },
};

export interface SidebarProps {
  style?: React.CSSProperties;
}
export interface SidebarState {
  leaderId: string;
  logs: { [key: string]: RaftLogItem }[];
  turnedOnServerCount: number;
  turnedOffServerCount: number;
  simMessageDelayRange: [number, number];
  simRpcTimeout: number;
  simElectionTimeoutRange: [number, number];
  simHeartbeatInterval: number;
}

export class Sidebar extends React.Component<SidebarProps, SidebarState> {
  binded = {
    onTurnOnAllServersClicked: this.onTurnOnAllServersClicked.bind(this),
    onTurnOffAllServersClicked: this.onTurnOffAllServersClicked.bind(this),
    updateLeader: this.updateLeader.bind(this),
    updateLogs: this.updateLogs.bind(this),
    updateTurnOnOffCounts: this.updateTurnOnOffCounts.bind(this),
  };

  constructor(props: SidebarProps) {
    super(props);

    this.state = {
      leaderId: null,
      logs: [],
      turnedOnServerCount: 0,
      turnedOffServerCount: CLUSTER.servers.length,
      simMessageDelayRange: [cfg.MIN_MESSAGE_DELAY, cfg.MAX_MESSAGE_DELAY],
      simRpcTimeout: cfg.RPC_TIMEOUT,
      simElectionTimeoutRange: [
        cfg.MIN_ELECTION_TIMEOUT,
        cfg.MAX_ELECTION_TIMEOUT,
      ],
      simHeartbeatInterval: cfg.HEARTBEAT_INTERVAL,
    };
  }

  componentDidMount() {
    // Bind events that indicates server state (possible) change
    CLUSTER.servers.forEach((server) => {
      server.ee.addListener(
        RaftServerEvents.STARTED_NEW_ELECTION,
        this.binded.updateLeader
      );
      server.ee.addListener(
        RaftServerEvents.STEPPED_DOWN,
        this.binded.updateLeader
      );
      server.ee.addListener(
        RaftServerEvents.BECAME_LEADER,
        this.binded.updateLeader
      );
      server.ee.addListener(
        RaftServerEvents.RECIEVED_APPEND_ENTRIES,
        this.binded.updateLogs
      );
      server.ee.addListener(
        RaftServerEvents.LOG_REQUESTED,
        this.binded.updateLogs
      );
      server.ee.addListener(
        RaftServerEvents.STOPPED,
        this.binded.updateTurnOnOffCounts
      );
      server.ee.addListener(
        RaftServerEvents.STARTED,
        this.binded.updateTurnOnOffCounts
      );
    });
  }

  componentWillUnmount() {
    // Unbind events
    CLUSTER.servers.forEach((server) => {
      server.ee.removeListener(
        RaftServerEvents.STARTED_NEW_ELECTION,
        this.binded.updateLeader
      );
      server.ee.removeListener(
        RaftServerEvents.STEPPED_DOWN,
        this.binded.updateLeader
      );
      server.ee.removeListener(
        RaftServerEvents.BECAME_LEADER,
        this.binded.updateLeader
      );
      server.ee.removeListener(
        RaftServerEvents.RECIEVED_APPEND_ENTRIES,
        this.binded.updateLogs
      );
      server.ee.removeListener(
        RaftServerEvents.LOG_REQUESTED,
        this.binded.updateLogs
      );
      server.ee.removeListener(
        RaftServerEvents.STOPPED,
        this.binded.updateTurnOnOffCounts
      );
      server.ee.removeListener(
        RaftServerEvents.STARTED,
        this.binded.updateTurnOnOffCounts
      );
    });
  }

  updateLeader() {
    const leader = CLUSTER.servers.find(
      (s) => s.state == RaftServerState.LEADER
    );
    this.setState({
      leaderId: leader ? leader.id : null,
    });
  }

  updateLogs() {
    this.updateLeader();

    const logs: { [key: string]: RaftLogItem }[] = [];

    CLUSTER.servers.forEach((server) => {
      server.log.forEach((logItem, index) => {
        if (!logs[index]) {
          logs[index] = {};
        }

        const indexObj = logs[index];
        indexObj[`${server.id}`] = logItem;
      });
    });

    this.setState({ logs });
  }

  updateTurnOnOffCounts() {
    this.updateLeader();

    const turnedOnServers: RaftServer[] = [];
    const turnedOffServers: RaftServer[] = [];

    CLUSTER.servers.forEach((server) => {
      if (server.state == RaftServerState.STOPPED) {
        turnedOffServers.push(server);
        return;
      }

      turnedOnServers.push(server);
    });

    this.setState({
      turnedOnServerCount: turnedOnServers.length,
      turnedOffServerCount: turnedOffServers.length,
    });
  }

  onTurnOnAllServersClicked() {
    CLUSTER.servers.forEach((s) => s.start());

    window.Countly &&
      window.Countly.add_event({
        key: 'turned_on_all_servers',
        count: 1,
        segmentation: {},
      });
  }

  onTurnOffAllServersClicked() {
    CLUSTER.servers.forEach((s) => s.stop());

    window.Countly &&
      window.Countly.add_event({
        key: 'turned_off_all_servers',
        count: 1,
        segmentation: {},
      });
  }

  onEmojiClick(emoji: string) {
    const { leaderId } = this.state;
    if (!leaderId) return;
    const server = CLUSTER.servers.find((s) => s.id == leaderId);
    server?.request(emoji);

    window.Countly &&
      window.Countly.add_event({
        key: 'appended_server_log',
        count: 1,
        segmentation: { emoji },
      });
  }

  render() {
    const { style } = this.props;
    const {
      leaderId,
      logs,
      turnedOnServerCount,
      turnedOffServerCount,
    } = this.state;

    return (
      <div style={style}>
        {/* Turn on/off buttons */}
        <Space
          direction="vertical"
          style={{
            width: '100%',
            padding: '0.5em',
          }}
        >
          <Button
            type="primary"
            block
            onClick={this.onTurnOnAllServersClicked}
            disabled={turnedOnServerCount == CLUSTER.servers.length}
          >
            Turn ON All Servers
          </Button>
          <Button
            type="primary"
            block
            danger
            onClick={this.onTurnOffAllServersClicked}
            disabled={turnedOffServerCount == CLUSTER.servers.length}
          >
            Turn OFF All Servers
          </Button>
        </Space>

        {/* Leader section */}
        <div>
          <FlashChange
            className="green-background-color-flash"
            value={leaderId}
            flashClassName="active"
            flashDuration={500}
          >
            <h3
              style={{
                borderBottom: '1px solid #f0f0f0',
                padding: '0.5em',
                marginTop: '1em',
                display: 'flex',
              }}
            >
              <span style={{ flexGrow: 1 }}>LEADER:</span>
              <span>{leaderId || `N/A`}</span>
            </h3>
          </FlashChange>

          <div
            style={{
              padding: '0.5em',
            }}
          >
            <div style={{ fontSize: '0.8em' }}>
              Append a (emoji) log to leader:
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '2em',
                transition: 'color 250ms',
                color: leaderId ? 'rgba(0, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.25)',
                cursor: leaderId ? 'pointer' : 'default',
              }}
            >
              <span onClick={() => this.onEmojiClick('🔥')}>🔥</span>
              <span onClick={() => this.onEmojiClick('🍺')}>🍺</span>
              <span onClick={() => this.onEmojiClick('❤️')}>❤️</span>
              <span onClick={() => this.onEmojiClick('🤔')}>🤔</span>
              <span onClick={() => this.onEmojiClick('🍕')}>🍕</span>
              <span onClick={() => this.onEmojiClick('👍')}>👍</span>
            </div>
          </div>
        </div>

        {/* Server Logs section */}
        <div>
          <h3
            style={{
              borderBottom: '1px solid #f0f0f0',
              padding: '0.5em',
              marginTop: '1.5em',
            }}
          >
            SERVER LOGS
          </h3>

          <table
            style={{
              width: 'calc(100% - 5px)',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr>
                <td style={{ textAlign: 'center', width: 25 }}>
                  <span style={styles.verticalText}></span>
                </td>
                {CLUSTER.servers.map((server) => (
                  <td key={server.id} style={{ textAlign: 'center' }}>
                    <span style={styles.verticalText}>{server.id}</span>
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {times(Math.max(logs.length, 10), (logIndex) => {
                const logRow = logs[logIndex] || {};

                return (
                  <tr key={`log-row-${logIndex}`}>
                    <td style={{ textAlign: 'center' }}>{logIndex + 1}</td>
                    {CLUSTER.servers.map((server) => (
                      <td
                        key={server.id}
                        style={{
                          textAlign: 'center',
                          border: '1px solid #f0f0f0',
                        }}
                      >
                        <FlashChange
                          className="green-background-color-flash"
                          value={logRow[server.id]?.value}
                          flashClassName="active"
                          flashDuration={500}
                        >
                          <span>{logRow[server.id]?.value ?? ''}</span>
                        </FlashChange>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
}
