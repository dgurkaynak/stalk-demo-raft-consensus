import React from 'react';
import ReactDOM from 'react-dom';
import { Button, Space } from 'antd';
import { cluster } from './globals';
import { ServerView } from './ui/server-view';
import { Sidebar } from './ui/sidebar';

import 'antd/dist/antd.css';

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
          background: '#f0f2f5',
        }}
      >
        {cluster.servers.map((server) => {
          return <ServerView key={server.id} server={server} />;
        })}
      </div>

      {/* Sidebar */}
      <Sidebar
        style={{
          minWidth: 250,
          maxWidth: 250,
        }}
      />
    </div>
  );
}

async function main() {
  ReactDOM.render(<App />, document.querySelector('#root'));
}

main().catch((err) => console.error(err));
