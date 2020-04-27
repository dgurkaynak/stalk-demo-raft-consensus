import { IBaseType } from './ibase-type';
import { StructFieldType } from './struct';


export class List implements IBaseType {
    elementType: StructFieldType;
    elements: IBaseType[] = [];


    constructor(elements: IBaseType[], elementType: StructFieldType) {
        this.elements = elements || [];
        this.elementType = elementType;
    }


    writeToBuffer(buf: ArrayBuffer, byteOffset: number) {
        const view = new DataView(buf, byteOffset);

        view.setUint8(0, this.elementType);
        view.setUint32(1, this.elements.length, false);

        let i = 5;
        this.elements.forEach((element) => {
            if (!element.writeToBuffer) {
                throw new Error(`List elements must have "writeToBuffer" method`);
            }

            const bytesWritten = element.writeToBuffer(buf, byteOffset + i);
            i += bytesWritten;
        });

        return i;
    }


    calculateByteLength() {
        let length = 0;

        this.elements.forEach((val) => {
            length += val.calculateByteLength();
        });

        // 1 byte for element type
        // 4 bytes for size (i32)
        return length + 1 + 4;
    }
}


export default List;
