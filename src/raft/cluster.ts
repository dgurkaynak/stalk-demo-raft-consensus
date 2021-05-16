import times from 'lodash/times';
import * as Chance from 'chance';
import kebabCase from 'lodash/kebabCase';
import { RaftServer } from './server';

const chance = new Chance();

export interface RaftClusterOptions {
  numberOfServers: number;
}

export class RaftCluster {
  readonly servers: RaftServer[] = [];

  constructor(private options: RaftClusterOptions) {
    // Prepare unique names
    const names: string[] = [];
    while (names.length < options.numberOfServers) {
      const name = kebabCase(chance.first());
      if (names.indexOf(name) == -1) names.push(name);
    }

    this.servers = times(
      options.numberOfServers,
      (i) => new RaftServer(names[i])
    );

    this.servers.forEach((server) => {
      const otherServers = this.servers.filter((s) => s != server);
      server.init({
        peerServers: otherServers,
      });
    });
  }

  start() {
    this.servers.forEach((s) => s.start());
  }
}
