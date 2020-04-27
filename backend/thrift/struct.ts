import { IBaseType } from './ibase-type';


interface StructField {
    type: StructFieldType,
    id: number,
    name: string, // You can omit name, it's just for readability
    value: IBaseType
}


export class Struct implements IBaseType {
    fields: StructField[] = [];


    constructor(fields: StructField[]) {
        this.fields = fields || [];
        // TODO: Check fields?
    }


    writeToBuffer(buf: ArrayBuffer, byteOffset: number) {
        const view = new DataView(buf, byteOffset);

        let i = 0;
        this.fields.forEach((field) => {
            view.setUint8(i, field.type);
            view.setInt16(i + 1, field.id);

            if (field.value instanceof Uint8Array && field.type == StructFieldType.I64) {
                field.value.forEach((byte, index) => {
                    view.setUint8(i + 3 + index, byte);
                });
                i += 3 + field.value.length; // field.value.length must be 8
            } else if (field.value.writeToBuffer) {
                const bytesWritten = field.value.writeToBuffer(buf, byteOffset + 3 + i);
                i += 3 + bytesWritten;
            } else {
                console.log(field.value);
                throw new Error(`Not supported field value "${field.value}"`);
            }
        });

        // Stop field
        view.setUint8(i, 0);

        return i + 1;
    }


    calculateByteLength() {
        let length = 0;

        this.fields.forEach((field) => {
            // 1 for field type
            // 2 for field id
            if (field.value instanceof Uint8Array && field.type == StructFieldType.I64) {
                length += 1 + 2 + 8;
            } else {
                length += 1 + 2 + field.value.calculateByteLength();
            }
        });

        // 1 for stop-field
        return 1 + length;
    }
}


export default Struct;


export enum StructFieldType {
    BOOL = 2,
    BYTE = 3,
    DOUBLE = 4,
    I16 = 6,
    I32 = 8, // also enum
    I64 = 10,
    STRING = 11,
    STRUCT = 12,
    MAP = 13,
    SET = 14,
    LIST = 15
};
