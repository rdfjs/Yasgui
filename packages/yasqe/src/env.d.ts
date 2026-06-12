/// <reference types="vite/client" />

declare module "*?worker" {
  const worker: {
    new (): Worker;
  };
  export default worker;
}

declare module "*?worker&url" {
  const workerUrl: string;
  export default workerUrl;
}
