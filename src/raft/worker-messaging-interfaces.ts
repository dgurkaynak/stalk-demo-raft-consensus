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
  MESSAGE_FROM_PEER = 'messageFromPeer', // ui -> worker
  PROXY_EVENT = 'proxyEvent', // worker -> ui
  STOP = 'stop', // ui -> worker
  START = 'start', // ui -> worker
  REQUEST = 'request', // ui -> worker
  FORCE_TRIGGER_ELECTION = 'forceTriggerElectrion', // ui -> worker
  EXPORT_SPAN = 'exportSpan', // worker -> ui
}
