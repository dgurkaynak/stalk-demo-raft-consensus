import { RaftCluster } from '../raft/cluster';

export const CLUSTER = ((window as any).cluster = new RaftCluster({
  numberOfServers: 5,
}));
