import { RaftCluster } from './raft/cluster';

export const cluster = ((window as any).cluster = new RaftCluster({
  numberOfServers: 5,
}));

