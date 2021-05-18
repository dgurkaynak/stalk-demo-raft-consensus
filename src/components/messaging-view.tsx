import React from 'react';
import forEachRight from 'lodash/forEachRight';
import { RaftServerEvents, RaftMessage } from '../raft/raft-interfaces';
import { CLUSTER } from '../globals/cluster';

const MESSAGE_DIAMETER = 16;

export interface MessagingViewProps {}
export interface MessagingViewState {}

export class MessagingView extends React.Component<
  MessagingViewProps,
  MessagingViewState
> {
  rAF: number;
  containerRef = React.createRef<HTMLDivElement>();
  serverCoordinates: {
    [key: string]: {
      x: number;
      y: number;
    };
  } = {};
  messages: {
    element: HTMLDivElement;
    from: { x: number; y: number };
    to: { x: number; y: number };
    startAt: number;
    finishAt: number;
  }[] = [];

  binded = {
    onMessage: this.onMessage.bind(this),
    onTick: this.onTick.bind(this),
  };

  constructor(props: MessagingViewProps) {
    super(props);
    this.state = {};
  }

  componentDidMount() {
    CLUSTER.servers.forEach((server) => {
      server.ee.addListener(
        RaftServerEvents.SENT_MESSAGE,
        this.binded.onMessage
      );
    });

    this.rAF = requestAnimationFrame(this.binded.onTick);
  }

  componentWillUnmount() {
    CLUSTER.servers.forEach((server) => {
      server.ee.removeListener(
        RaftServerEvents.SENT_MESSAGE,
        this.binded.onMessage
      );
    });

    cancelAnimationFrame(this.rAF);
  }

  setServerCoordinates(
    data: {
      pointX: number;
      pointY: number;
      angle: number;
    }[]
  ) {
    this.serverCoordinates = {};

    CLUSTER.servers.forEach((server, index) => {
      this.serverCoordinates[server.id] = {
        x: data[index].pointX,
        y: data[index].pointY,
      };
    });
  }

  onMessage(data: { message: RaftMessage; delay: number }) {
    const now = Date.now();

    // Create an element
    const element = document.createElement('div');
    element.style.position = 'absolute';
    element.style.boxSizing = 'border-box';
    element.style.width = `${MESSAGE_DIAMETER}px`;
    element.style.height = `${MESSAGE_DIAMETER}px`;
    element.style.borderRadius = `${MESSAGE_DIAMETER / 2}px`;
    element.style.lineHeight = `${MESSAGE_DIAMETER}px`;
    element.style.textAlign = 'center';
    element.style.fontSize = '10px';
    element.style.color = '#fff';

    switch (data.message.type) {
      case 'AppendEntries':
        element.textContent = 'A';
        element.style.background = '#2593FC';
        break;
      case 'AppendEntriesResponse':
        element.textContent = 'A';
        element.style.background = data.message.success ? '#57C22D' : '#FD4F54';
        break;
      case 'RequestVote':
        element.textContent = 'R';
        element.style.background = '#2593FC';
        break;
      case 'RequestVoteResponse':
        element.textContent = 'R';
        element.style.background = data.message.granted ? '#57C22D' : '#FD4F54';
        break;
    }

    element.style.transform = 'translate(0, 0)';
    this.containerRef.current.appendChild(element);

    this.messages.push({
      element: element,
      from: this.serverCoordinates[data.message.from],
      to: this.serverCoordinates[data.message.to],
      startAt: now,
      finishAt: now + data.delay,
    });
  }

  onTick() {
    const finishedMessageIndexes: number[] = [];

    this.messages.forEach((message, index) => {
      const now = Date.now();

      if (now >= message.finishAt) {
        this.containerRef.current.removeChild(message.element);
        finishedMessageIndexes.push(index);
        return;
      }

      const x =
        map(
          now,
          message.startAt,
          message.finishAt,
          message.from.x,
          message.to.x
        ) -
        MESSAGE_DIAMETER / 2;
      const y =
        map(
          now,
          message.startAt,
          message.finishAt,
          message.from.y,
          message.to.y
        ) -
        MESSAGE_DIAMETER / 2;
      message.element.style.transform = `translate(${x}px, ${y}px)`;
    });

    forEachRight(finishedMessageIndexes, (index) => {
      this.messages.splice(index, 1);
    });

    this.rAF = requestAnimationFrame(this.binded.onTick);
  }

  render() {
    return (
      <div
        ref={this.containerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      ></div>
    );
  }
}

/**
 * https://github.com/processing/p5.js/blob/1.0.0/src/math/calculation.js#L416
 */
function map(
  n: number,
  start1: number,
  stop1: number,
  start2: number,
  stop2: number,
  withinBounds?: boolean
) {
  const newval = ((n - start1) / (stop1 - start1)) * (stop2 - start2) + start2;
  if (!withinBounds) {
    return newval;
  }
  if (start2 < stop2) {
    return constrain(newval, start2, stop2);
  } else {
    return constrain(newval, stop2, start2);
  }
}

function constrain(n: number, low: number, high: number) {
  return Math.max(Math.min(n, high), low);
}
