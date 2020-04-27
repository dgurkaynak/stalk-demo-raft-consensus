import { IBaseType } from './ibase-type';

export class I32 implements IBaseType {
    value: number;


    constructor(value: number) {
        if (typeof value == 'number') this.value = value;
        else throw new Error(`Unsupported number value "${value}"`);
    }


    writeToBuffer(buf: ArrayBuffer, byteOffset: number) {
        const view = new DataView(buf, byteOffset, 4);
        view.setUint32(0, this.value, false);
        return 4;
    }


    calculateByteLength() {
        return 4;
    }
}


export default I32;
