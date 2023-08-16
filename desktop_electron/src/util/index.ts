export const timer = (ms: number) => new Promise<void>(
    (resolve) => {
    setTimeout(()=>{
        resolve();
    }, ms);
});

export enum FileMsgType {
    list = `list`,
    add = `add`,
    change = `change`,
    unlink = `unlink`
}