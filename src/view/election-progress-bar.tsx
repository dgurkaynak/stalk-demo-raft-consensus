import React from 'react';

export interface ElectionProgressBarProps {
  style?: React.CSSProperties;
  barColor: string;
  timeoutSetAt: number;
  timeoutDuration: number;
}

export interface ElectionProgressBarState {
  percent: number;
}

export class ElectionProgressBar extends React.Component<
  ElectionProgressBarProps,
  ElectionProgressBarState
> {
  rAF: number;

  binded = {
    onTick: this.onTick.bind(this),
  };

  constructor(props: ElectionProgressBarProps) {
    super(props);

    this.state = {
      percent: 0,
    };
  }

  onTick() {
    const { timeoutSetAt, timeoutDuration } = this.props;
    let percent = 0;
    if (timeoutSetAt) {
      percent = (Date.now() - timeoutSetAt) / timeoutDuration;
      percent = 1 - Math.min(percent, 1);
      percent = percent * 100;
    }
    this.setState({ percent });
    this.rAF = requestAnimationFrame(this.binded.onTick);
  }

  componentDidMount() {
    this.rAF = requestAnimationFrame(this.binded.onTick);
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.rAF);
  }

  render() {
    const { barColor, style } = this.props;
    const { percent } = this.state;

    return (
      <div
        style={{
          position: 'relative',
          ...style,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: `${percent}%`,
            background: barColor,
          }}
        ></div>
      </div>
    );
  }
}
