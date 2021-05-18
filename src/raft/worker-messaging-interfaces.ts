export interface RaftServerWorkerMessage {
  type: RaftServerWorkerMessageType;
  payload?: any;
}

export enum RaftServerWorkerMessageType {
  LOADED = 'loaded', // worker -> ui
  INIT = 'init', // ui -> worker
  READY = 'ready', // worker -> ui
  STATE_UPDATE = 'stateUpdate', // worker -> ui
  MESSAGE_TO_PEER = 'messageToPeer', // worker -> ui
  PROXY_EVENT = 'proxyEvent', // worker -> ui
}
