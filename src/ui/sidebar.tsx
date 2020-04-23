import React from 'react';
import { Button, Space } from 'antd';
import FlashChange from '@avinlab/react-flash-change';
import { cluster, SESSION_ID } from '../globals';
import { RaftServerState, RaftServerEvents } from '../raft/server';

export interface SidebarProps {
  style?: React.CSSProperties;
}
export interface SidebarState {
  leaderId: string;
}

export class Sidebar extends React.Component<SidebarProps, SidebarState> {
  binded = {
    onTurnOnAllServersClicked: this.onTurnOnAllServersClicked.bind(this),
    onTurnOffAllServersClicked: this.onTurnOffAllServersClicked.bind(this),
    updateLeader: this.updateLeader.bind(this),
  };

  constructor(props: SidebarProps) {
    super(props);

    this.state = {
      leaderId: null,
    };
  }

  componentDidMount() {
    // Bind events that indicates server state (possible) change
    cluster.servers.forEach((server) => {
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
        this.binded.updateLeader
      );
      server.ee.addListener(RaftServerEvents.STOPPED, this.binded.updateLeader);
      server.ee.addListener(RaftServerEvents.STARTED, this.binded.updateLeader);
    });
  }

  componentWillUnmount() {
    // Unbind events
    cluster.servers.forEach((server) => {
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
        this.binded.updateLeader
      );
      server.ee.removeListener(
        RaftServerEvents.STOPPED,
        this.binded.updateLeader
      );
      server.ee.removeListener(
        RaftServerEvents.STARTED,
        this.binded.updateLeader
      );
    });
  }

  updateLeader() {
    const leader = cluster.servers.find(
      (s) => s.state == RaftServerState.LEADER
    );
    this.setState({
      leaderId: leader ? leader.id : null,
    });
  }

  onTurnOnAllServersClicked() {
    cluster.servers.forEach((s) => s.start());
  }

  onTurnOffAllServersClicked() {
    cluster.servers.forEach((s) => s.stop());
  }

  render() {
    const { style } = this.props;
    const { leaderId } = this.state;

    return (
      <div style={style}>
        <Space
          direction="vertical"
          style={{
            width: '100%',
            padding: '0.5em',
          }}
        >
          <div
            style={{ textAlign: 'center', color: '#ddd', fontSize: '0.8em' }}
          >
            Session ID: {SESSION_ID}
          </div>
          <Button block onClick={this.onTurnOnAllServersClicked}>
            Turn ON All Servers
          </Button>
          <Button block danger onClick={this.onTurnOffAllServersClicked}>
            Turn OFF All Servers
          </Button>
        </Space>
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
              <span>🔥</span>
              <span>🍺</span>
              <span>❤️</span>
              <span>🤔</span>
              <span>🍕</span>
              <span>👍</span>
            </div>
          </div>
        </div>
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
        </div>
      </div>
    );
  }
}
