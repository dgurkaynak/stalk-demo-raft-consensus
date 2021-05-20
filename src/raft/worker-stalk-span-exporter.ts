import { SpanExporter, ReadableSpan } from '@opentelemetry/tracing';
import {
  ExportResult,
  ExportResultCode,
  hrTimeToMilliseconds,
} from '@opentelemetry/core';
import {
  RaftServerWorkerMessage,
  RaftServerWorkerMessageType,
} from './worker-messaging-interfaces';

/**
 * This class is derived from:
 * https://github.com/open-telemetry/opentelemetry-js/blob/f045eef8b02e6dda452aab3cdbeaf78b225c2fd4/packages/opentelemetry-tracing/src/export/ConsoleSpanExporter.ts
 *
 * Which converts otel spans directly to Stalk's span interface:
 * https://github.com/dgurkaynak/stalk/blob/ba4aba14b296a95974b3472bbde79d4a9290bb23/src/model/interfaces.ts
 */
export class WorkerStalkSpanExporter implements SpanExporter {
  id: string;

  constructor(id: string) {
    this.id = id;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    return this._sendSpans(spans, resultCallback);
  }

  shutdown(): Promise<void> {
    this._sendSpans([]);
    return Promise.resolve();
  }

  private _exportInfo(span: ReadableSpan) {
    const startTime = hrTimeToMilliseconds(span.startTime);
    const references: {
      type: 'childOf' | 'followsFrom';
      spanId: string;
      traceId: string;
    }[] = [];

    if (span.parentSpanId) {
      references.push({
        type: 'childOf',
        spanId: span.parentSpanId,
        traceId: span.spanContext.traceId,
      });
    }

    span.links.forEach((link) => {
      references.push({
        type: 'followsFrom', // I think jaeger assumes all the span links as follows from
        spanId: link.context.spanId,
        traceId: link.context.traceId,
      });
    });

    const logs = span.events.map((event) => {
      return {
        timestamp: hrTimeToMilliseconds(event.time),
        fields: event.attributes || {},
      };
    });
    const process = {
      serviceName: `raft-server`,
      id: this.id,
      tags: {},
    };

    return {
      id: span.spanContext.spanId,
      traceId: span.spanContext.traceId,
      operationName: span.name,
      startTime,
      finishTime: startTime + hrTimeToMilliseconds(span.duration),
      references,
      tags: span.attributes,
      logs,
      process,
    };
  }

  private _sendSpans(
    spans: ReadableSpan[],
    done?: (result: ExportResult) => void
  ): void {
    for (const span of spans) {
      const message: RaftServerWorkerMessage = {
        type: RaftServerWorkerMessageType.EXPORT_SPAN,
        payload: this._exportInfo(span),
      };
      (self.postMessage as any)(JSON.stringify(message));
    }
    if (done) {
      return done({ code: ExportResultCode.SUCCESS });
    }
  }
}
