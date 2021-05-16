import * as opentracing from 'opentracing';
import { SpanContext } from './span-context'


// Make http header compatible
export const TextMapFormatPropertyKeys = {
    TRACE_ID: 'X-Stalk-TraceId',
    SPAN_ID: 'X-Stalk-SpanId',
    BAGGAGE_ITEM_PREFIX: 'X-Stalk-BaggageItem-'
};


export const TextMapFormat = {
    name: opentracing.FORMAT_TEXT_MAP,

    inject(spanContext: SpanContext, carrier: any) {
        if (!carrier || typeof carrier != 'object') {
            console.error(`Could not inject context to plain object, carrier is not object.`, carrier);
            return;
        }

        carrier[TextMapFormatPropertyKeys.TRACE_ID] = spanContext.toTraceId();
        carrier[TextMapFormatPropertyKeys.SPAN_ID] = spanContext.toSpanId();
        for (let key in spanContext.baggageItems) {
            const value = spanContext.baggageItems[key];
            carrier[TextMapFormatPropertyKeys.BAGGAGE_ITEM_PREFIX + key] = value;
        }
    },


    extract(carrier: any): opentracing.SpanContext | null {
        if (!carrier || typeof carrier != 'object') {
            console.error('Could not extract context from carrier', carrier);
            return null;
        }

        let traceId: string;
        let spanId: string;
        let baggageItems: { [key: string]: string } = {};

        for (let key in carrier) {
            const keyLowercase = key.toLowerCase();
            if (keyLowercase.indexOf(TextMapFormatPropertyKeys.BAGGAGE_ITEM_PREFIX.toLowerCase()) == 0) {
                const realKey = key.replace(new RegExp(TextMapFormatPropertyKeys.BAGGAGE_ITEM_PREFIX, 'ig'), '')
                baggageItems[realKey] = carrier[key];
            } else if (keyLowercase == TextMapFormatPropertyKeys.TRACE_ID.toLowerCase()) {
                traceId = carrier[key];
            } else if (keyLowercase == TextMapFormatPropertyKeys.SPAN_ID.toLowerCase()) {
                spanId = carrier[key];
            }
        }

        if (!traceId || !spanId) return null;

        const context = new SpanContext(traceId, spanId);
        context.addBaggageItems(baggageItems);
        return context;
    }
}
