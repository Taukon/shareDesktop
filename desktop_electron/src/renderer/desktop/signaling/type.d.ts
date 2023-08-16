export type Signaling<T, U> = (params: T) => Promise<U>;

export type FileInfo = {
    fileTransferId: string, 
    fileName: string, 
    fileSize: number
};