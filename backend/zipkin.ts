import fetch from 'node-fetch';
import * as opentracing from 'opentracing';

export class ZipkinReporter {
  private zipkinSpans: any[] = [];
  private reportTimeoutId: number;

  constructor(private reportUrl: string) {
    this.reportTimeoutId = setTimeout(() => this.report(), 1000) as any;
  }

  push(data: {
    process: {
      serviceName: string;
      tags: { [key: string]: string };
    };
    spans: any[];
  }) {
    data.spans.forEach((span) => {
      const zipkinSpan = toZipkinJSON(span, true, data.process.tags) as any;
      zipkinSpan.localEndpoint = {
        serviceName: data.process.serviceName
      };
      this.zipkinSpans.push(zipkinSpan);
    });
  }

  async report() {
    const spansToReport = this.zipkinSpans.slice();
    if (spansToReport.length == 0) {
      this.reportTimeoutId = setTimeout(() => this.report(), 1000) as any;
      return;
    }

    const response = await fetch(this.reportUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spansToReport),
    });

    if (response.ok) {
      console.log(`[zipkin] Reported ${spansToReport.length} span(s)`);
      spansToReport.forEach((s) => {
        const index = this.zipkinSpans.indexOf(s);
        index > -1 && this.zipkinSpans.splice(index, 1);
      });
    }

    this.reportTimeoutId = setTimeout(() => this.report(), 1000) as any;
  }
}

export default ZipkinReporter;

export function toZipkinJSON(
  data: any,
  shouldConvertLogsToAnnotations = false,
  constantTags: { [key: string]: string } = {}
) {
  // const data = span.toJSON();

  const tags: { [key: string]: string } = {};
  for (let name in constantTags) {
    tags[name] = data.tags[name] + '';
  }
  for (let name in data.tags) {
    tags[name] = data.tags[name] + '';
  }

  const output = {
    traceId: data.context.traceId,
    id: data.context.spanId,
    name: data.operationName,
    timestamp: data.startTime * 1000,
    duration: (data.finishTime - data.startTime) * 1000,
    tags,
  };

  if (shouldConvertLogsToAnnotations) {
    (output as any).annotations = data.logs.map((log: any) => {
      let value = '';

      if (log.fields.level && log.fields.message) {
        value = `[${log.fields.level}] ${log.fields.message}`;
      } else if (log.fields.message) {
        value = log.fields.message;
      } else {
        value = JSON.stringify(log.fields);
      }

      return {
        timestamp: (log.timestamp || 0) * 1000,
        value,
      };
    });
  }

  // As far as I understand, zipkin does not have `followsFrom` relation
  // So we're setting any referenced span as parent span :/
  const parentId =
    data.references.length > 0
      ? data.references[0].referencedContext.spanId
      : null;
  if (parentId) (output as any).parentId = parentId;

  const kind = data.tags[opentracing.Tags.SPAN_KIND];
  if (kind) {
    (output as any).kind = kind;
    delete output.tags[opentracing.Tags.SPAN_KIND];
  }

  return output;
}
