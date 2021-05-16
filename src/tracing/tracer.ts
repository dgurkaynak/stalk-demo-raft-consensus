import * as opentracing from 'opentracing';
import { Span } from './span';
import { SpanContext } from './span-context';
import { TextMapFormat } from './text-map-format';

const generateId = () =>
  Math.random().toString(16).substring(2, 10) +
  Math.random().toString(16).substring(2, 10);

export class Tracer extends opentracing.Tracer {
  private spanJSONs: any[] = [];

  constructor(
    private options: {
      process: {
        serviceName: string;
        tags: { [key: string]: string };
      };
    }
  ) {
    super();
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
