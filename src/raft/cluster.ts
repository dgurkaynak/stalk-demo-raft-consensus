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

    this.servers = times(options.numberOfServers, (i) => {
      const peerIds = names.filter((name) => name != names[i]);
      return new RaftServer(names[i], peerIds);
    });
  }
}
