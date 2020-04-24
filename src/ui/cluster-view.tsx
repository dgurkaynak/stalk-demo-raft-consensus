import React from 'react';
import times from 'lodash/times';
import { RaftServer, RaftServerEvents, RaftServerState } from '../raft/server';
import { ServerView } from './server-view';
import { cluster } from '../globals';

const POINT_DIAMETER = 10;
const SERVER_WIDTH = 175;
const SERVER_HEIGHT = 110;

export interface ClusterViewProps {
  style?: React.CSSProperties;
}

export interface ClusterViewState {
  serverCoordinates: {
    pointX: number,
    pointY: number,
    angle: number,
  }[];
}

export class ClusterView extends React.Component<
  ClusterViewProps,
  ClusterViewState
> {
  containerRef = React.createRef<HTMLDivElement>();

  constructor(props: ClusterViewProps) {
    super(props);

    this.state = {
      serverCoordinates: []
    };
  }

  componentDidMount() {
    if (!this.containerRef.current) return;
    const width = this.containerRef.current.offsetWidth;
    const height = this.containerRef.current.offsetHeight;

    const centerX = width / 2;
    const centerY = height / 2;

    const diameter = Math.min(
      width - 2 * (SERVER_WIDTH * 1.5),
      height - 2 * (SERVER_HEIGHT * 1.5)
    );
    const radius = diameter / 2;

    const pointCoordinates: any = [];

    const numOfServer = cluster.servers.length;
    const angleOffset = (2 * Math.PI) / numOfServer;
    times(numOfServer, (i) => {
      const angle = (Math.PI / 2) + i * angleOffset;
      const pointX = centerX - radius * Math.cos(angle);
      const pointY = centerY - radius * Math.sin(angle);
      pointCoordinates.push({ pointX, pointY, angle });
    });
    this.setState({ serverCoordinates: pointCoordinates });
  }

  componentWillUnmount() {
    // TBD
  }

  render() {
    const { style } = this.props;
    const { serverCoordinates } = this.state;

    return (
      <div
        ref={this.containerRef}
        style={{
          position: 'relative',
          ...style
        }}
      >
        {cluster.servers.map((server, i) => {
          const coord = serverCoordinates[i];
          return (
            <div
              key={server.id}
              style={{
                position: 'absolute',
                width: POINT_DIAMETER,
                height: POINT_DIAMETER,
                borderRadius: POINT_DIAMETER / 2,
                background: 'rgba(0, 0, 0, 0.25)',
                top: coord ? coord.pointY - (POINT_DIAMETER / 2) : 0,
                left: coord ? coord.pointX - (POINT_DIAMETER / 2) : 0
              }}
            ></div>
          );
        })}

        {cluster.servers.map((server, i) => {
          const coord = serverCoordinates[i];
          let top = 0;
          let left = 0;
          if (coord) {
            const angle = coord.angle % (2 * Math.PI);
            if (
              angle >= (Math.PI / 4) &&
              angle < (3 * Math.PI / 4)
            ) {
              top = coord.pointY - SERVER_HEIGHT - 15;
              left = coord.pointX - (SERVER_WIDTH / 2);
            } else if (
              angle >= (3 * Math.PI / 4) &&
              angle < (5 * Math.PI / 4)
            ) {
              top = coord.pointY - (SERVER_HEIGHT / 2);
              left = coord.pointX + 15;
            } else if (
              angle >= (5 * Math.PI / 4) &&
              angle < (7 * Math.PI / 4)
            ) {
              top = coord.pointY + 15;
              left = coord.pointX - (SERVER_WIDTH / 2);
            } else if (
              (angle >= (7 * Math.PI / 4) && angle < (8 * Math.PI / 4)) ||
              (angle >= 0 && angle < (Math.PI / 4))
            ) {
              top = coord.pointY - (SERVER_HEIGHT / 2);
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
                left: left
              }}
            />
          );
        })}
      </div>
    );
  }
}
