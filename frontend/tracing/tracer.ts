import * as opentracing from 'opentracing';
import { Span } from './span';
import { SpanContext } from './span-context';
import { TextMapFormat } from './text-map-format';

const generateId = () =>
  Math.random().toString(16).substring(2, 10) +
  Math.random().toString(16).substring(2, 10);

export class Tracer extends opentracing.Tracer {
  private spanJSONs: any[] = [];
  private reportTimeoutId: number;

  constructor(
    private options: {
      process: {
        serviceName: string;
        tags: { [key: string]: string };
      };
    }
  ) {
    super();
    this.reportTimeoutId = setTimeout(() => this.onReportTick(), 1000) as any;
  }

  /**
   * Overridden just for returning span's type.
   */
  startSpan(name: string, options: opentracing.SpanOptions = {}): Span {
    return super.startSpan(name, options) as Span;
  }

  handleSpanFinish(span: Span) {
    this.spanJSONs.push(span.toJSON());
  }

  private async onReportTick() {
    const spansToReport = this.spanJSONs.slice();

    if (spansToReport.length == 0) {
      this.reportTimeoutId = setTimeout(() => this.onReportTick(), 1000) as any;
      return;
    }

    try {
      const response = await fetch(`http://${window.location.host}/spans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          process: this.options.process,
          spans: spansToReport,
        }),
      });

      if (response.ok) {
        spansToReport.forEach((s) => {
          const index = this.spanJSONs.indexOf(s);
          index > -1 && this.spanJSONs.splice(index, 1);
        });
      }
    } catch (err) {
      console.warn(`Could not send spans`, err);
    }

    this.reportTimeoutId = setTimeout(() => this.onReportTick(), 1000) as any;
  }

  ///////////////////////////////////////////
  // Override opentracing internal methods //
  ///////////////////////////////////////////

  /**
   * Main span creating method.
   */
  protected _startSpan(name: string, fields: opentracing.SpanOptions) {
    // Extract trace id from first reference.
    // If it doesn't exists, start a new trace
    const firstRef = fields.references ? fields.references[0] : null;
    const firstRefContext = firstRef
      ? (firstRef.referencedContext() as SpanContext)
      : null;
    const traceId = firstRefContext
      ? firstRefContext.toTraceId()
      : generateId();
    const spanId = generateId();
    const spanContext = new SpanContext(traceId, spanId);
    if (firstRefContext?.baggageItems)
      spanContext.addBaggageItems(firstRefContext.baggageItems);

    const span = new Span(this, spanContext);
    span.setOperationName(name);
    if (fields.tags) span.addTags(fields.tags);

    if (fields.references) {
      for (const ref of fields.references) {
        span.addReference(ref);
      }
    }

    span.start(fields.startTime);

    return span;
  }

  /**
   * Tries to inject given span context into carrier. This method should not throw an error.
   */
  protected _inject(spanContext: SpanContext, format: string, carrier: any) {
    switch (format) {
      case opentracing.FORMAT_HTTP_HEADERS:
      case opentracing.FORMAT_TEXT_MAP:
        return TextMapFormat.inject(spanContext, carrier);
      default:
        console.error(
          `Could not inject context into carrier, unknown format "${format}"`,
          carrier
        );
    }
  }

  /**
   * Tries to extract span context from any supported carrier. This method should not
   * throw an error, return nil instead. Creating a new trace is not our responsibility.
   */
  protected _extract(
    format: string,
    carrier: any
  ): opentracing.SpanContext | null {
    switch (format) {
      case opentracing.FORMAT_HTTP_HEADERS:
      case opentracing.FORMAT_TEXT_MAP: {
        return TextMapFormat.extract(carrier);
      }
      default: {
        console.error(
          `Could not extract context from carrier, unknown carrier format "${format}"`,
          carrier
        );
      }
    }
  }
}
