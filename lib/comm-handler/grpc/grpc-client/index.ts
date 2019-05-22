import CommHandler from '../../comm-handler';
const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');
const grpc_promise = require('grpc-promise');

export default class GrpcClient extends CommHandler {
	private serverAddress: string;
	private protoPath: string;
	private packageName: string;
	private protoServiceName: string;
	private protoOpts: Object;
	private grpcOpts: Object;
	private client: any;
	private debugMode: Boolean;
	private streamingObj: any = null;

	/**
	 * Constructor
	 * @param serverAddress 'localhost:PORT'
	 * @param protoPath path to .proto file to use
	 * @param protoServiceName service name located in protoPath file
	 * @param packageName package name located in protoPath file
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
		debugMode: Boolean = false,
		protoOpts: Object = {},
		grpcOpts: Object = {}
	) {
		super();
		this.serverAddress = serverAddress;
		this.protoPath = protoPath;
		this.packageName = packageName;
		this.protoOpts = protoOpts;
		this.grpcOpts = grpcOpts;
		this.protoServiceName = protoServiceName;
		this.debugMode = debugMode;
		this.client = this.resolveClient();
	}

	private resolveClient(): any {
		const protoPath = this.protoPath;
		const protoOpts = this.protoOpts;
		const packageDefinition = protoLoader.loadSync(protoPath, protoOpts);
		const protoObject = eval(
			'grpc.loadPackageDefinition(packageDefinition).' + this.packageName
		);
		const client = eval(
			'new protoObject.' +
				this.protoServiceName +
				"('" +
				this.serverAddress +
				"', grpc.credentials.createInsecure()" +
				')'
		);
		grpc_promise.promisifyAll(client, this.grpcOpts);
		return client;
	}

	/**
	 * Returns method object
	 * @param serviceMethod method defined in proto file
	 */
	getMethodObject(serviceMethod: string){
		return eval('this.client.' + serviceMethod);
	}

	/**
	 * Publish a single message, returning acknowledge
	 * @param msg msg to publish
	 * @param serviceMethod method to use for publishing (from .proto file)
	 */
	async publishUnary(msg: any, serviceMethod: string) {
		const obj = this.getMethodObject(serviceMethod);
		const requestAck = await obj.sendMessage(msg);
		if (this.debugMode) console.log('Client: message received: ', requestAck);
		return requestAck;
	}

	/**
	 * Publish a single message with streaming ending immediately
	 * @param msg msg to publish
	 * @param serviceMethod method with all stream parameters
	 */
	async publishSingleStreaming(msg: any, serviceMethod: string) {
		const obj = this.getMethodObject(serviceMethod);
		const requestAck = await obj.sendMessage(msg);
		obj.end();
		if (this.debugMode) console.log('Client: message received: ', requestAck);
		return requestAck;
	}

	async startStreaming(msg: any, serviceMethod: string) {
		if(!this.streamingObj) this.streamingObj = this.getMethodObject(serviceMethod);
		if (this.debugMode) console.log('Sending message');
		const requestAck = await this.streamingObj.sendMessage(msg);
		if (this.debugMode) console.log('Client: message received: ', requestAck);
		return requestAck;
	}

	endStream() {
		if(!this.streamingObj) return Error('Streaming not initiated');
		this.streamingObj.end();
		this.streamingObj = null;
		if(this.debugMode) console.log('Client: stream ended');
		return true;
	}

	/**
	 * Return GRPC client object
	 */
	getClient() {
		if (!this.client) return Error('Client not resolved');
		return this.client;
	}
}
