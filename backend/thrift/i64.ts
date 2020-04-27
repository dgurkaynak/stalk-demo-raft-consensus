import { IBaseType } from './ibase-type';


export class I64 implements IBaseType {
    // value: number;
    value: any; // Fix BigInt error: "TS2322: Type 'bigint' is not assignable to type 'number'."


    constructor(value: number | BigInt | string) {
        if (typeof value == 'number') this.value = BigInt(value);
        else if (typeof value == 'bigint') this.value = value;
        else if (typeof value == 'string') this.value = BigInt(`0x${value}`);
        else throw new Error(`Unsupported i64 value "${value}"`)
    }


    writeToBuffer(buf: ArrayBuffer, byteOffset: number) {
        const view = new DataView(buf, byteOffset, 8);

        // Fill with zeros
        view.setUint32(0, 0, false);
        view.setUint32(4, 0, false);

        let hex = this.value.toString(16);
        if (hex.length % 2) { hex = '0' + hex; }

        const len = hex.length / 2;

        let i = 0;
        let j = 0;
        const leftOffset = 8 - len; // for leading zeros
        while (i < len) {
          view.setUint8(leftOffset + i, parseInt(hex.slice(j, j+2), 16));
          i += 1;
          j += 2;
        }

        return 8;
    }


    calculateByteLength() {
        return 8;
    }


    toJSON() {
        return this.value.toString(16);
    }
}


export default I64;
