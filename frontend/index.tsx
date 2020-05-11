import React from 'react';
import ReactDOM from 'react-dom';
import { ClusterView } from './components/cluster-view';
import { Sidebar } from './components/sidebar';

import 'antd/dist/antd.css';
import 'animate.css/animate.min.css';
import './index.css';

function App() {
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
      }}
    >
      <Sidebar
        style={{
          minWidth: 250,
          maxWidth: 250,
          maxHeight: '100vh',
          overflowY: 'auto'
        }}
      />

      <ClusterView
        style={{
          minWidth: 500,
          flexGrow: 1,
          background: '#f0f2f5',
          maxHeight: '100vh',
          overflowY: 'auto'
        }}
      />
    </div>
  );
}

async function main() {
  ReactDOM.render(<App />, document.querySelector('#root'));
}

main().catch((err) => console.error(err));
