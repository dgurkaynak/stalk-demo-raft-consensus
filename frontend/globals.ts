import { RaftCluster } from './raft/cluster';

export const SESSION_ID = Math.random().toString(36).substr(2, 7);

export const cluster = ((window as any).cluster = new RaftCluster({
  numberOfServers: 5,
}));

