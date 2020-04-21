import React from 'react';
import ReactDOM from 'react-dom';
import { RaftCluster } from './raft/cluster';
import { RaftServer } from './raft/server';

(window as any).RaftCluster = RaftCluster;
(window as any).RaftServer = RaftServer;

(window as any).cluster = new RaftCluster({ numberOfServers: 2 });

function App(){
  return <h1>Hello, world!</h1>
}

async function main() {
  ReactDOM.render(<App />, document.querySelector('#root'));
}

main().catch((err) => console.error(err));
