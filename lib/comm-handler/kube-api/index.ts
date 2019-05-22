import CommHandler from '../comm-handler';
import * as k8s from '@kubernetes/client-node';

type WatchCallbackResult = (phase: string, obj: any) => void;
type WatchCallbackError = (err: any) => void;

export default class KubeApi {
	private opts: Object;
	private watch: k8s.Watch;
	private watchArray: Array<WatchObject> = [];

	/**
	 * Constructor
	 * @param opts kube api opts; empty loads from default
	 */
	constructor(opts: Object = {}) {
		this.opts = opts;
		this.watch = this.getWatch();
	}

	private getWatch() {
		const kc = new k8s.KubeConfig();
		if (Object.keys(this.opts).length === 0) kc.loadFromDefault();
		else kc.loadFromOptions(this.opts);
		return new k8s.Watch(kc);
	}

	/**
	 * Create a watch request
	 * @param apiPath /api/.../...
	 *
	 * @param callbackResult (type: string, obj: any) => void;
	 *
	 * @param callbackError (err: any) => void;
	 */
	watchRequest(
		apiPath: string,
		callbackResult: WatchCallbackResult,
		callbackError: WatchCallbackError
	) {
		const watchObject = new WatchObject(
			this.watch.watch(apiPath, {}, callbackResult, callbackError),
			apiPath
		);
		this.watchArray.push(watchObject);
	}

	/**
	 * Abort all watch requests made
	 */
	abortAllWatch() {
		for (let watch of this.watchArray) watch.getWatch().abort();
		this.watchArray = [];
	}

	/**
	 * Abort a/every watch on a given path
	 * @param apiPath abort watch from the given path
	 */
	abortWatch(apiPath: string) {
		for (let i = this.watchArray.length - 1; i >= 0; i--) {
			const watchObject = this.watchArray[i];
			if (watchObject.getApiPath() === apiPath) {
				watchObject.getWatch().abort();
				this.watchArray.splice(i, 1);
			}
		}
	}
}

class WatchObject {
	private watch: any;
	private apiPath: string;

	constructor(watch: any, apiPath: string) {
		this.watch = watch;
		this.apiPath = apiPath;
	}

	getWatch() {
		return this.watch;
	}

	getApiPath() {
		return this.apiPath;
	}
}
