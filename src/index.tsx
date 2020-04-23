import React from 'react';
import ReactDOM from 'react-dom';
import { cluster } from './globals';
import { ServerView } from './ui/server-view';

import 'normalize.css/normalize.css';



function App() {
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
      }}
    >
      {/* Cluster visualization container */}
      <div
        style={{
          minWidth: 500,
          flexGrow: 1,
        }}
      >
        {cluster.servers.map((server) => {
          return <ServerView key={server.id} server={server} />;
        })}
      </div>

      {/* Sidebar */}
      <div
        style={{
          minWidth: 250,
          maxWidth: 250,
          background: '#ccc',
        }}
      >
        <div>
          <h4>CLUSTER</h4>
          All - Turn ON / Turn OFF
        </div>
        <div>
          <h4>Leader: xxx</h4>
          Append log to Leader <br/>
          Emojis here
        </div>
        <div>
          <h4>SERVER LOGS</h4>
        </div>
      </div>
    </div>
  );
}

async function main() {
  ReactDOM.render(<App />, document.querySelector('#root'));
}

main().catch((err) => console.error(err));
