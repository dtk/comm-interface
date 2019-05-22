# Comm Interface

Provides simple calls for GRPC and Kube API communication. This module uses [grpc-promise](https://github.com/carlessistare/grpc-promise) and [kubernetes-client](https://github.com/kubernetes-client/javascript) modules as main dependencies.

## Installation

```
npm install comm-interface
```

## GRPC Example

### Client (Unary request)

```typescript
import { GrpcClient } from 'comm-interface';

const address = '0.0.0.0:8080';
const modelPath = 'test.proto';
const serviceName = 'MessageService';
const packageName = 'package';
const debugMode = false;
const protoOpts = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
};
const message = {
  message: "Hello World!"
};

async function main() {
  const grpcClient = new GrpcClient(address, modelPath, serviceName, packageName, debugMode, protoOpts);

  const methodName = 'sendMessage()'; //defined in service: serviceName
  const response = await grpcClient.publishUnary(message, methodName);
  console.log(response);
}

main();
```

### Server (Unary request)

```typescript
import { GrpcServer } from 'comm-interface';

const address = '0.0.0.0:8080';
const modelPath = 'test.proto';
const serviceName = 'MessageService';
const packageName = 'package';
const debugMode = false;
const protoOpts = {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
};

function sendMessage(call: any, callback: any) {
  callback(null, call.request);
}

async function main() {
  const grpcServer = new GrpcServer(address, modelPath, serviceName, packageName, { sendMessage }, debugMode, protoOpts);
  grpcServer.start();
}

main();
```

## Kube API Watch Example

```typescript
import { KubeApi } from 'comm-interface';

const path = '/api/v1/namespaces';

function kubeWatchCallback(type: string, obj: any) {
  if (type === 'ADDED') console.log('new object:');
  else if (type === 'MODIFIED') console.log('changed object:');
  else if (type === 'DELETED') console.log('deleted object:');
  else console.log('unknown type: ' + type);
  console.log(obj);
}

function kubeWatchErrorCallback(err: any) {
  throw new Error(err);
}

function main() {
  const kubeApi = new KubeApi(); // empty options load from default kube options
  kubeApi.watchRequest(path, kubeWatchCallback, kubeWatchErrorCallback);
}

main();
```
