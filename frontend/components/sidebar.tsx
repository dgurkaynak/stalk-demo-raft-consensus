import React from 'react';
import { Button, Space, Modal, Slider, Row, Col, Dropdown, Menu } from 'antd';
import FlashChange from '@avinlab/react-flash-change';
import times from 'lodash/times';
import { CLUSTER } from '../globals/cluster';
import { SESSION_ID } from '../globals/session-id';
import {
  RaftServerState,
  RaftServerEvents,
  RaftLogItem,
  RaftServer,
} from '../raft/server';
import { SettingOutlined, DownOutlined } from '@ant-design/icons';

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
  isSimulationSettingsVisible: boolean;
}

export class Sidebar extends React.Component<SidebarProps, SidebarState> {
  binded = {
    onTurnOnAllServersClicked: this.onTurnOnAllServersClicked.bind(this),
    onTurnOffAllServersClicked: this.onTurnOffAllServersClicked.bind(this),
    updateLeader: this.updateLeader.bind(this),
    updateLogs: this.updateLogs.bind(this),
    updateTurnOnOffCounts: this.updateTurnOnOffCounts.bind(this),
    onSimulationSettingsClicked: this.onSimulationSettingsClicked.bind(this),
    onSimulationSettingsModalOk: this.onSimulationSettingsModalOk.bind(this),
    onSimulationSettingsModalCancel: this.onSimulationSettingsModalCancel.bind(
      this
    ),
  };

  constructor(props: SidebarProps) {
    super(props);

    this.state = {
      leaderId: null,
      logs: [],
      turnedOnServerCount: 0,
      turnedOffServerCount: CLUSTER.servers.length,
      isSimulationSettingsVisible: false,
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
  }

  onTurnOffAllServersClicked() {
    CLUSTER.servers.forEach((s) => s.stop());
  }

  onEmojiClick(emoji: string) {
    const { leaderId } = this.state;
    if (!leaderId) return;
    const server = CLUSTER.servers.find((s) => s.id == leaderId);
    server?.request(emoji);
  }

  onSimulationSettingsClicked() {
    this.setState({ isSimulationSettingsVisible: true });
  }

  onSimulationSettingsModalOk() {
    // TODO: Set settings
    this.setState({ isSimulationSettingsVisible: false });
  }

  onSimulationSettingsModalCancel() {
    // TODO: Reset settings
    this.setState({ isSimulationSettingsVisible: false });
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
          <div
            style={{ textAlign: 'center', color: '#ddd', fontSize: '0.8em' }}
          >
            Session ID: {SESSION_ID}
          </div>
          <div style={{ textAlign: 'center' }}>
            <Button
              type="link"
              icon={<SettingOutlined />}
              size="small"
              disabled={turnedOffServerCount != CLUSTER.servers.length}
              onClick={this.binded.onSimulationSettingsClicked}
            >
              Simulation Settings
            </Button>
          </div>
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

        {/* Simulation settings modal */}
        {this.renderSimulationSettingsModal()}

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

  renderSimulationSettingsModal() {
    const labelStyle = {
      textAlign: 'right',
      paddingRight: 15,
    } as React.CSSProperties;
    const valueStyle = {
      paddingLeft: 15,
    } as React.CSSProperties;

    return (
      <Modal
        title="Simulation Settings"
        visible={this.state.isSimulationSettingsVisible}
        onOk={this.binded.onSimulationSettingsModalOk}
        onCancel={this.binded.onSimulationSettingsModalCancel}
        width={700}
      >
        <div style={{ textAlign: 'center', marginBottom: 15 }}>
          <Dropdown
            overlay={
              <Menu>
                <Menu.Item key="0">Slowed Down (Default)</Menu.Item>
                <Menu.Item key="1">Realistic</Menu.Item>
              </Menu>
            }
            placement="bottomCenter"
          >
            <a
              className="ant-dropdown-link"
              onClick={(e) => e.preventDefault()}
            >
              Presets <DownOutlined />
            </a>
          </Dropdown>
        </div>

        <Row align="middle">
          <Col span={5} style={labelStyle}>
            Message Delay:
          </Col>
          <Col span={14}>
            <Slider
              range
              min={50}
              max={1500}
              defaultValue={[20, 50]}
              tipFormatter={sliderTipFormatter as any}
            />
          </Col>
          <Col span={5} style={valueStyle}>
            1000-1500 ms
          </Col>
        </Row>
        <Row align="middle">
          <Col span={5} style={labelStyle}>
            RPC Timeout:
          </Col>
          <Col span={14}>
            <Slider
              min={250}
              max={5000}
              defaultValue={50}
              tipFormatter={sliderTipFormatter as any}
            />
          </Col>
          <Col span={5} style={valueStyle}>
            5000 ms
          </Col>
        </Row>
        <Row align="middle">
          <Col span={5} style={labelStyle}>
            Election Timeout:
          </Col>
          <Col span={14}>
            <Slider
              range
              min={700}
              max={20000}
              defaultValue={[20, 50]}
              tipFormatter={sliderTipFormatter as any}
            />
          </Col>
          <Col span={5} style={valueStyle}>
            10000-20000 ms
          </Col>
        </Row>
        <Row align="middle">
          <Col span={5} style={labelStyle}>
            Heartbeat Interval:
          </Col>
          <Col span={14}>
            <Slider
              min={200}
              max={3000}
              defaultValue={50}
              tipFormatter={sliderTipFormatter as any}
            />
          </Col>
          <Col span={5} style={valueStyle}>
            3000 ms
          </Col>
        </Row>
      </Modal>
    );
  }
}

function sliderTipFormatter(value: string) {
  return `${value} ms`;
}
