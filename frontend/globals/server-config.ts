const serverConfig = {
  MIN_MESSAGE_DELAY: 0,
  MAX_MESSAGE_DELAY: 0,
  RPC_TIMEOUT: 0,
  MIN_ELECTION_TIMEOUT: 0,
  MAX_ELECTION_TIMEOUT: 0,
  HEARTBEAT_INTERVAL: 0,
  BATCH_SIZE: 0
};

setDefaults();

export function setDefaults() {
    serverConfig.MIN_MESSAGE_DELAY = 1000;
    serverConfig.MAX_MESSAGE_DELAY = 1500;
    serverConfig.RPC_TIMEOUT = 5000;
    serverConfig.MIN_ELECTION_TIMEOUT = 10000;
    serverConfig.MAX_ELECTION_TIMEOUT = 20000;
    serverConfig.HEARTBEAT_INTERVAL = 3000;
    serverConfig.BATCH_SIZE = 1;
}

export function setRealistic() {
    serverConfig.MIN_MESSAGE_DELAY = 50;
    serverConfig.MAX_MESSAGE_DELAY = 100;
    serverConfig.RPC_TIMEOUT = 250;
    serverConfig.MIN_ELECTION_TIMEOUT = 700;
    serverConfig.MAX_ELECTION_TIMEOUT = 1200;
    serverConfig.HEARTBEAT_INTERVAL = 200;
    serverConfig.BATCH_SIZE = 1;
}

export default serverConfig;
