export enum RaftServerState {
  FOLLOWER = 'follower',
  CANDIDATE = 'candidate',
  LEADER = 'leader',
  STOPPED = 'stopped',
}

export enum RaftServerEvents {
  SENT_MESSAGE = 'sent message',
  CLEARED_ELECTION_TIMEOUT = 'cleared election timeout',
  SET_ELECTION_TIMEOUT = 'set election timeout',
  STARTED_NEW_ELECTION = 'started new election',
  STEPPED_DOWN = 'stepped down',
  VOTED = 'voted',
  RECIEVED_VOTE = 'recieved vote',
  BECAME_LEADER = 'became leader',
  RECIEVED_APPEND_ENTRIES = 'recieved append entries',
  STARTED = 'started',
  STOPPED = 'stopped',
  LOG_REQUESTED = 'log requested',
}

export interface RaftLogItem {
  term: number;
  value: string;
}

export type RaftMessage =
  | RequestVoteMessage
  | RequestVoteResponseMessage
  | AppendEntriesMessage
  | AppendEntriesResponseMessage;

export interface RequestVoteMessage {
  id: string;
  from: string;
  to: string;
  term: number;
  type: 'RequestVote';
  lastLogTerm: number;
  lastLogIndex: number;
}

export interface RequestVoteResponseMessage {
  id: string;
  from: string;
  to: string;
  term: number;
  type: 'RequestVoteResponse';
  granted: boolean;
}

export interface AppendEntriesMessage {
  id: string;
  from: string;
  to: string;
  term: number;
  type: 'AppendEntries';
  prevIndex: number;
  prevTerm: number;
  entries: RaftLogItem[];
  commitIndex: number;
}

export interface AppendEntriesResponseMessage {
  id: string;
  from: string;
  to: string;
  term: number;
  type: 'AppendEntriesResponse';
  success: boolean;
  matchIndex: number;
}
