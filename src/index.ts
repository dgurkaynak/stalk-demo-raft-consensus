import { RaftCluster } from './raft/cluster';
import { RaftServer } from './raft/server';

(window as any).RaftCluster = RaftCluster;
(window as any).RaftServer = RaftServer;

(window as any).cluster = new RaftCluster({ numberOfServers: 2 });

async function main() {
  console.log('hello bitcheeees!');
}

main().catch((err) => console.error(err));
