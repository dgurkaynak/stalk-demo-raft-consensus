import React from 'react';
import times from 'lodash/times';
import { Button, Space } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { ServerView } from './server-view';
import { CLUSTER } from '../globals/cluster';
import { MessagingView } from './messaging-view';

const POINT_DIAMETER = 10;
const SERVER_WIDTH = 190;
const SERVER_HEIGHT = 75;

const styles = {
  legend: {
    circle: {
      display: 'inline-block',
      width: 16,
      height: 16,
      borderRadius: 8,
      lineHeight: '16px',
      fontSize: 10,
      textAlign: 'center',
      color: '#fff',
    },
    label: {
      marginLeft: 5,
      fontSize: 10,
      color: '#666',
    },
  },
};

export interface ClusterViewProps {
  style?: React.CSSProperties;
}

export interface ClusterViewState {
  center: { x: number; y: number };
  circleRadius: number;
  serverCoordinates: {
    pointX: number;
    pointY: number;
    angle: number;
  }[];
  collectedTraceCount: number;
  collectedSpanCount: number;
}

export class ClusterView extends React.Component<
  ClusterViewProps,
  ClusterViewState
> {
  containerRef = React.createRef<HTMLDivElement>();
  messagingViewRef = React.createRef<MessagingView>();

  constructor(props: ClusterViewProps) {
    super(props);

    this.state = {
      center: { x: 0, y: 0 },
      circleRadius: 0,
      serverCoordinates: [],
      collectedTraceCount: 0,
      collectedSpanCount: 0,
    };
  }

  componentDidMount() {
    this.updateServerCoordinates();
  }

  componentWillUnmount() {
    // TBD
  }

  updateServerCoordinates() {
    if (!this.containerRef.current) return;
    const width = this.containerRef.current.offsetWidth;
    const height = this.containerRef.current.offsetHeight;

    const centerX = width / 2;
    const centerY = height / 2;

    const diameter = Math.min(
      width - 2 * (SERVER_WIDTH + 20),
      height - 2 * (SERVER_HEIGHT + 30)
    );
    const radius = diameter / 2;

    const pointCoordinates: any = [];

    const numOfServer = CLUSTER.servers.length;
    const angleOffset = (2 * Math.PI) / numOfServer;
    times(numOfServer, (i) => {
      const angle = Math.PI / 2 + i * angleOffset;
      const pointX = centerX - radius * Math.cos(angle);
      const pointY = centerY - radius * Math.sin(angle);
      pointCoordinates.push({ pointX, pointY, angle });
    });
    this.setState(
      {
        center: { x: centerX, y: centerY },
        circleRadius: radius,
        serverCoordinates: pointCoordinates,
      },
      () => {
        this.messagingViewRef.current.setServerCoordinates(pointCoordinates);
      }
    );
  }

  render() {
    const { style } = this.props;
    const { center, circleRadius, serverCoordinates } = this.state;

    return (
      <div
        ref={this.containerRef}
        style={{
          position: 'relative',
          ...style,
        }}
      >
        {/* Legend */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            padding: '2px 5px 2px 3px',
            border: '1px solid #ccc',
            borderRight: 0,
            borderBottom: 0,
            opacity: 0.5,
          }}
        >
          {/* Append entries */}
          <div>
            <span
              style={{
                ...(styles.legend.circle as any),
                background: '#2593FC',
              }}
            >
              A
            </span>
            <span style={styles.legend.label}>
              Append Entries &amp; Heartbeat
            </span>
          </div>

          {/* Request vote */}
          <div>
            <span
              style={{
                ...(styles.legend.circle as any),
                background: '#2593FC',
              }}
            >
              R
            </span>
            <span style={styles.legend.label}>Request Vote</span>
          </div>

          {/* Reply - success */}
          <div>
            <span
              style={{
                ...(styles.legend.circle as any),
                background: '#57C22D',
              }}
            >
              &nbsp;
            </span>
            <span style={styles.legend.label}>Reply: Success</span>
          </div>

          {/* Reply - error */}
          <div>
            <span
              style={{
                ...(styles.legend.circle as any),
                background: '#FD4F54',
              }}
            >
              &nbsp;
            </span>
            <span style={styles.legend.label}>Reply: Error</span>
          </div>
        </div>

        {/* Cluster circle */}
        <div
          style={{
            position: 'absolute',
            boxSizing: 'border-box',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            width: circleRadius * 2,
            height: circleRadius * 2,
            borderRadius: circleRadius,
            top: center.y - circleRadius,
            left: center.x - circleRadius,
          }}
        ></div>

        {/* Messaging view */}
        <MessagingView ref={this.messagingViewRef} />

        {/* Server points (messaging dots) */}
        {CLUSTER.servers.map((server, i) => {
          const coord = serverCoordinates[i];
          return (
            <div
              key={server.id}
              style={{
                position: 'absolute',
                width: POINT_DIAMETER,
                height: POINT_DIAMETER,
                borderRadius: POINT_DIAMETER / 2,
                background: '#B4B5B8',
                top: coord ? coord.pointY - POINT_DIAMETER / 2 : 0,
                left: coord ? coord.pointX - POINT_DIAMETER / 2 : 0,
              }}
            ></div>
          );
        })}

        {/* Server panels */}
        {CLUSTER.servers.map((server, i) => {
          const coord = serverCoordinates[i];
          let top = 0;
          let left = 0;
          if (coord) {
            const angle = coord.angle % (2 * Math.PI);
            if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) {
              top = coord.pointY - SERVER_HEIGHT - 15;
              left = coord.pointX - SERVER_WIDTH / 2;
            } else if (
              angle >= (3 * Math.PI) / 4 &&
              angle < (5 * Math.PI) / 4
            ) {
              top = coord.pointY - SERVER_HEIGHT / 2;
              left = coord.pointX + 15;
            } else if (
              angle >= (5 * Math.PI) / 4 &&
              angle < (7 * Math.PI) / 4
            ) {
              top = coord.pointY + 15;
              left = coord.pointX - SERVER_WIDTH / 2;
            } else if (
              (angle >= (7 * Math.PI) / 4 && angle < (8 * Math.PI) / 4) ||
              (angle >= 0 && angle < Math.PI / 4)
            ) {
              top = coord.pointY - SERVER_HEIGHT / 2;
              left = coord.pointX - SERVER_WIDTH - 15;
            }
          }

          return (
            <ServerView
              key={server.id}
              server={server}
              style={{
                position: 'absolute',
                width: SERVER_WIDTH,
                height: SERVER_HEIGHT,
                top: top,
                left: left,
              }}
            />
          );
        })}

        {/* Toolbar for collected traces */}
        {this.renderTraceCollectionToolbar()}
      </div>
    );
  }

  renderTraceCollectionToolbar() {
    const TOOLBAR_HEIGHT = 50;
    const { collectedTraceCount, collectedSpanCount } = this.state;
    const shouldShow = collectedTraceCount > 0;

    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: TOOLBAR_HEIGHT,
          background: '#fff',
          borderLeft: '1px solid rgb(240, 240, 240)',
          transform: shouldShow ? 'translateY(0)' : `translateY(-${TOOLBAR_HEIGHT}px)`,
          transition: 'transform 0.25s cubic-bezier(0.65, 0.05, 0.36, 1)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1em',
        }}
      >
        <div style={{ flexGrow: 1 }}>
          Collected <strong>{collectedTraceCount}</strong> traces (
          {collectedSpanCount} spans)
        </div>
        <Space direction="horizontal" style={{ padding: '0.5em' }}>
          <Button
            type="primary"
            icon={<ExportOutlined />}
            block
            onClick={() => {}}
          >
            Open in Stalk
          </Button>
          <Button
            block
            danger
            onClick={() => {}}
          >
            Discard all
          </Button>
        </Space>
      </div>
    );
  }
}
