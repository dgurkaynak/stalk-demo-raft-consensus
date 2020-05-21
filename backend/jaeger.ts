import fetch from 'node-fetch';
import hash from 'object-hash';
import * as opentracing from 'opentracing';
import * as Thrift from './thrift/index';

export class JaegerReporter {
  private processDataItems: {
    process: {
      serviceName: string;
      tags: { [key: string]: string };
    };
    processHash: string;
    processThrift: any;
    spansThrift: any[];
  }[] = [];
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
    const processHash = hash(data.process);
    let processDataItem = this.processDataItems.find(
      (p) => p.processHash == processHash
    );

    if (!processDataItem) {
      processDataItem = {
        process: data.process,
        processHash,
        processThrift: process2JaegerThriftStructure(data.process),
        spansThrift: [],
      };
      this.processDataItems.push(processDataItem);
    }
    data.spans.forEach((span) => {
      const spanThrift = span2JaegerThriftStructure(span) as any;
      processDataItem.spansThrift.push(spanThrift);
    });
  }

  async report() {
    let reportedSpanCount = 0;

    for (const processDataItem of this.processDataItems) {
      if (processDataItem.spansThrift.length == 0) {
        continue;
      }

      const spansToReport = processDataItem.spansThrift.slice();

      // Build spans list
      const spansList = new Thrift.List([], Thrift.StructFieldType.STRUCT);
      spansList.elements = spansToReport;

      // Build batch struct
      const batchStruct = new Thrift.Struct([
        {
          id: 1,
          name: 'process',
          type: Thrift.StructFieldType.STRUCT,
          value: processDataItem.processThrift,
        },
        {
          id: 2,
          name: 'spans',
          type: Thrift.StructFieldType.LIST,
          value: spansList,
        },
      ]);

      const calculatedByteLength = batchStruct.calculateByteLength();
      const buffer = new ArrayBuffer(calculatedByteLength);
      batchStruct.writeToBuffer(buffer, 0);

      try {
        const response = await fetch(this.reportUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-thrift',
            Connection: 'keep-alive',
          },
          body: buffer,
        });

        if (response.ok) {
          reportedSpanCount += spansToReport.length;
          spansToReport.forEach((s) => {
            const index = processDataItem.spansThrift.indexOf(s);
            index > -1 && processDataItem.spansThrift.splice(index, 1);
          });
        } else {
          console.error(`[jaeger] Could not report: ${response.status} - ${response.statusText}`);
        }
      } catch (err) {
        console.error('[jaeger] Could not report', err);
      }
    } // for loop end

    if (reportedSpanCount > 0) {
      console.log(`[jaeger] Reported ${reportedSpanCount} span(s)`);
    }

    this.reportTimeoutId = setTimeout(() => this.report(), 1000) as any;
  }
}

export default JaegerReporter;

const emptyBuffer = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);

export function process2JaegerThriftStructure(process: {
  serviceName: string;
  tags: { [key: string]: string };
}) {
  // Build process struct
  const processTagsList = new Thrift.List([], Thrift.StructFieldType.STRUCT);
  for (let name in process.tags) {
    const tagStruct = new Thrift.Struct([
      {
        id: 1,
        name: 'key',
        type: Thrift.StructFieldType.STRING,
        value: new Thrift.String(name),
      },
      {
        id: 2,
        name: 'vType',
        type: Thrift.StructFieldType.I32,
        value: new Thrift.I32(0), // 0 refers STRING
      },
      {
        id: 3,
        name: 'vStr',
        type: Thrift.StructFieldType.STRING,
        value: new Thrift.String(process.tags[name] + ''), // cast string
      },
    ]);

    processTagsList.elements.push(tagStruct);
  }

  return new Thrift.Struct([
    {
      id: 1,
      name: 'serviceName',
      type: Thrift.StructFieldType.STRING,
      value: new Thrift.String(process.serviceName),
    },
    {
      id: 2,
      name: 'tags',
      type: Thrift.StructFieldType.LIST,
      value: processTagsList,
    },
  ]);
}

export function span2JaegerThriftStructure(data: any) {
  // const data = span.toJSON();

  // Must obey:
  // https://github.com/jaegertracing/jaeger-idl/blob/master/thrift/jaeger.thrift

  let parentSpanId: string;

  const referencesList = new Thrift.List([], Thrift.StructFieldType.STRUCT);
  data.references.forEach((ref: any) => {
    if (
      ref.type == opentracing.REFERENCE_CHILD_OF ||
      ref.type == opentracing.REFERENCE_FOLLOWS_FROM
    ) {
      let refTypeEnumValue: number;

      if (ref.type == opentracing.REFERENCE_CHILD_OF) {
        parentSpanId = ref.referencedContext.spanId;
        refTypeEnumValue = 0; // 0 means CHILD_OF
      } else if (ref.type == opentracing.REFERENCE_FOLLOWS_FROM) {
        refTypeEnumValue = 1; // 1 means FOLLOWS_FROM
      }

      const spanRefStruct = new Thrift.Struct([
        {
          id: 1,
          name: 'refType',
          type: Thrift.StructFieldType.I32,
          value: new Thrift.I32(refTypeEnumValue),
        },
        {
          id: 2,
          name: 'traceIdLow',
          type: Thrift.StructFieldType.I64,
          value: new Thrift.I64(ref.referencedContext.traceId),
        },
        {
          id: 3,
          name: 'traceIdHigh',
          type: Thrift.StructFieldType.I64,
          value: emptyBuffer as any,
        },
        {
          id: 4,
          name: 'spanId',
          type: Thrift.StructFieldType.I64,
          value: new Thrift.I64(ref.referencedContext.spanId),
        },
      ]);

      referencesList.elements.push(spanRefStruct);
    } else {
      throw new Error(`Unsupported reference type "${ref.type}"`);
    }
  });

  const tagsList = new Thrift.List([], Thrift.StructFieldType.STRUCT);
  for (let name in data.tags) {
    const tagStruct = new Thrift.Struct([
      {
        id: 1,
        name: 'key',
        type: Thrift.StructFieldType.STRING,
        value: new Thrift.String(name),
      },
      {
        id: 2,
        name: 'vType',
        type: Thrift.StructFieldType.I32,
        value: new Thrift.I32(0), // 0 refers STRING
      },
      {
        id: 3,
        name: 'vStr',
        type: Thrift.StructFieldType.STRING,
        value: new Thrift.String(data.tags[name] + ''), // cast string
      },
    ]);

    tagsList.elements.push(tagStruct);
  }

  const logsList = new Thrift.List([], Thrift.StructFieldType.STRUCT);
  data.logs.forEach((log: any) => {
    const fieldsList = new Thrift.List([], Thrift.StructFieldType.STRUCT);
    for (let name in log.fields) {
      let value = log.fields[name];
      if (!value) continue;
      if (typeof value == 'object') value = JSON.stringify(value);

      const tagStruct = new Thrift.Struct([
        {
          id: 1,
          name: 'key',
          type: Thrift.StructFieldType.STRING,
          value: new Thrift.String(name),
        },
        {
          id: 2,
          name: 'vType',
          type: Thrift.StructFieldType.I32,
          value: new Thrift.I32(0), // 0 refers STRING
        },
        {
          id: 3,
          name: 'vStr',
          type: Thrift.StructFieldType.STRING,
          value: new Thrift.String(value + ''), // cast string
        },
      ]);

      fieldsList.elements.push(tagStruct);
    }

    const logStruct = new Thrift.Struct([
      {
        id: 1,
        name: 'timestamp',
        type: Thrift.StructFieldType.I64,
        value: new Thrift.I64(BigInt(log.timestamp * 1000)),
      },
      {
        id: 2,
        name: 'fields',
        type: Thrift.StructFieldType.LIST,
        value: fieldsList,
      },
    ]);

    logsList.elements.push(logStruct);
  });

  const spanStruct = new Thrift.Struct([
    {
      id: 1,
      name: 'traceIdLow',
      type: Thrift.StructFieldType.I64,
      value: new Thrift.I64(data.context.traceId),
    },
    {
      id: 2,
      name: 'traceIdHigh',
      type: Thrift.StructFieldType.I64,
      value: emptyBuffer as any,
    },
    {
      id: 3,
      name: 'spanId',
      type: Thrift.StructFieldType.I64,
      value: new Thrift.I64(data.context.spanId),
    },
    {
      id: 4,
      name: 'parentSpanId',
      type: Thrift.StructFieldType.I64,
      value: emptyBuffer as any,
    },
    {
      id: 5,
      name: 'operationName',
      type: Thrift.StructFieldType.STRING,
      value: new Thrift.String(data.operationName),
    },
    {
      id: 6,
      name: 'references',
      type: Thrift.StructFieldType.LIST,
      value: referencesList,
    },
    {
      id: 7,
      name: 'flags',
      type: Thrift.StructFieldType.I32,
      value: new Thrift.I32(0), // TODO: No flags for now
    },
    {
      id: 8,
      name: 'startTime',
      type: Thrift.StructFieldType.I64,
      value: new Thrift.I64(BigInt(data.startTime * 1000)),
    },
    {
      id: 9,
      name: 'duration',
      type: Thrift.StructFieldType.I64,
      value: new Thrift.I64((data.finishTime - data.startTime) * 1000),
    },
    {
      id: 10,
      name: 'tags',
      type: Thrift.StructFieldType.LIST,
      value: tagsList,
    },
    {
      id: 11,
      name: 'logs',
      type: Thrift.StructFieldType.LIST,
      value: logsList,
    },
  ]);

  return spanStruct;
}
