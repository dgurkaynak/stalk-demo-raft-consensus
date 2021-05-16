// Shared-singleton object
const serverConfig = getDefaults();

export function getDefaults() {
  return {
    MIN_MESSAGE_DELAY: 1000,
    MAX_MESSAGE_DELAY: 1500,
    RPC_TIMEOUT: 5000,
    MIN_ELECTION_TIMEOUT: 10000,
    MAX_ELECTION_TIMEOUT: 20000,
    HEARTBEAT_INTERVAL: 3000,
    BATCH_SIZE: 1,
  };
}

export function getRealistic() {
  return {
    MIN_MESSAGE_DELAY: 50,
    MAX_MESSAGE_DELAY: 100,
    RPC_TIMEOUT: 250,
    MIN_ELECTION_TIMEOUT: 750,
    MAX_ELECTION_TIMEOUT: 1200,
    HEARTBEAT_INTERVAL: 200,
    BATCH_SIZE: 1,
  };
}

export default serverConfig;
