import times from 'lodash/times';
import { RaftServer } from './server';

export interface RaftClusterOptions {
  numberOfServers: number;
}

export class RaftCluster {
  readonly servers: RaftServer[] = [];

  constructor(private options: RaftClusterOptions) {
    this.servers = times(options.numberOfServers, () => new RaftServer());

    this.servers.forEach((server) => {
      const otherServers = this.servers.filter(s => s != server);
      server.init({
        peerServers: otherServers
      });
    });
  }

  start() {
    this.servers.forEach(s => s.start());
  }
}
