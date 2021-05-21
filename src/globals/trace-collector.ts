import { reject } from 'lodash';

interface SpanLike {
  id: string;
  traceId: string;
}

type ChangeListener = (traceCount: number, spanCount: number) => any;

let traces: { [key: string]: SpanLike[] } = {};
let listeners: ChangeListener[] = [];
const STALK_URL = 'https://deniz.co/stalk';
let stalkWindow: Window;

export function addSpan(span: SpanLike) {
  if (!traces[span.traceId]) traces[span.traceId] = [];
  traces[span.traceId].push(span);
  notifyListeners();
}

export function clear() {
  traces = {};
  notifyListeners();
}

export function onChange(listener: ChangeListener) {
  listeners.push(listener);
}

function notifyListeners() {
  const traceCount = Object.keys(traces).length;
  const spanCount = Object.values(traces).reduce(
    (acc, spans) => acc + spans.length,
    0
  );
  listeners.forEach((listener) => listener(traceCount, spanCount));
}

export async function exportToStalk() {
  if (!stalkWindow || stalkWindow?.closed) {
    stalkWindow = window.open(STALK_URL);

    await new Promise<void>((resolve) => {
      window.addEventListener('message', (event) => {
        if (event.data == 'ready') {
          resolve();
          return;
        }

        console.error(`Unexpected response from Stalk`, event.data);
        reject(new Error(`Unexpected response from Stalk`));
      });
    });
  }

  stalkWindow.postMessage(JSON.stringify(traces), '*');
  stalkWindow.focus();
}