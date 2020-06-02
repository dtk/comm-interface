const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');
const grpc_promise = require('grpc-promise');

export default class GrpcServer {
  private serverAddress: string;
  private protoPath: string;
  private packageName: string;
  private serverMethodsObject: Object;
  private protoServiceName: string;
  private protoOpts: Object;
  private grpcOpts: Object;
  private server: any;
  private debugMode: Boolean;

  private serverStarted: Boolean = false;

  /**
   * Constructor
   * @param serverAddress 'localhost:PORT'
   * @param protoPath path to .proto file to use
   * @param protoServiceName service name located in protoPath file
   * @param packageName package name located in protoPath file
   * @param serverMethodsObject Object containing server methods
   * @param debugMode true/false
   * @param protoOpts
   * {
   *
   * keepCase: (true, false),
   *
   * longs: String,      - exact
   *
   * enums: String,      - exact
   *
   * defaults: (true, false),
   *
   * oneofs: (true, false)
   *
   * }
   *
   * @param grpcOpts
   * {
   *
   * --   response for a single message of bidirectional stream:
   *
   *  timeout_message: (integer),
   *
   * --   response for entire call:
   *
   *  timeout: (integer)
   *
   * }
   */
  constructor(
    serverAddress: string,
    protoPath: string,
    protoServiceName: string,
    packageName: string,
    serverMethodsObject: Object,
    debugMode: Boolean = false,
    protoOpts: Object = {},
    grpcOpts: Object = {}
  ) {
    this.serverAddress = serverAddress;
    this.protoPath = protoPath;
    this.packageName = packageName;
    this.serverMethodsObject = serverMethodsObject;
    this.protoOpts = protoOpts;
    this.grpcOpts = grpcOpts;
    this.protoServiceName = protoServiceName;
    this.debugMode = debugMode;
  }

  private resolveServer(): any {
    const protoPath = this.protoPath;
    const protoOpts = this.protoOpts;
    const packageDefinition = protoLoader.loadSync(protoPath, protoOpts);
    const protoObject = eval(
      'grpc.loadPackageDefinition(packageDefinition).' + this.packageName
    );
    const server = new grpc.Server();
    eval(
      'server.addService(protoObject.' +
        this.protoServiceName +
        '.service, this.serverMethodsObject)'
    );
    server.bind(this.serverAddress, grpc.ServerCredentials.createInsecure());
    return server;
  }

  start() {
    if (!this.serverStarted) {
      this.server = this.resolveServer();
      this.server.start();
      this.serverStarted = true;
      if (this.debugMode) console.log('Server started', this.server);
    } else console.log('Server already running');
  }

  forceShutdown() {
    if (this.serverStarted) {
      this.server.forceShutdown();
      this.serverStarted = false;
      console.log('Server shut down success');
    } else console.log('Server not started');
  }

  addHealthService(healthService: any, healthImplementation: any) {
    if (!this.server) throw 'Server not started';
    this.server.addService(healthService, healthImplementation);
  }
}
