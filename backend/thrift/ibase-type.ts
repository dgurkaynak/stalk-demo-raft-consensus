export interface IBaseType {
    writeToBuffer(buf: ArrayBuffer, byteOffset: number): number;
    calculateByteLength(): number;
}

export default IBaseType;
