import { COMM_INTERFACE, WATCH_TIMEOUT_MS } from '../../constants';

const Client = require('kubernetes-client').Client;
const K8sConfig = require('kubernetes-client').config;
const JSONStream = require('json-stream');

export default class GoDaddyKubeApi {
  private client: any;
  private basePath: any;
  private watchTimeoutMS: number;
  /**
   *
   * @param configMethod i.e: fromKubeconfig()
   * @param version i.e: 1.9
   */
  constructor(
    endpoint: string,
    crdVersion: string,
    configMethod: string,
    clientVersion: string = '1.9',
    watchTimeoutMS: number = WATCH_TIMEOUT_MS
  ) {
    this.watchTimeoutMS = watchTimeoutMS;
    const config = eval(`K8sConfig.${configMethod}`);
    if (configMethod === 'getInCluster()') {
      this.client = new Client({ config: config });
      this.client.loadSpec();
    } else if (configMethod === 'fromKubeconfig()') {
      this.client = new Client({ config: config, version: clientVersion });
    } else throw new Error(`${COMM_INTERFACE} config method not recognized`);
    this.basePath = `this.client.apis['${endpoint}'].${crdVersion}`;
  }

  async createCRD(body: string, kubeEndPoint: string = 'apiextensions.k8s.io') {
    return await this.client.apis[
      kubeEndPoint
    ].v1beta1.customresourcedefinitions.post({ body: body });
  }

  async addCRD(body: any) {
    await this.client.addCustomResourceDefinition(body);
  }

  async createNamespace(body: any) {
    return await this.client.api.v1.namespaces.post({ body: body });
  }

  async getBaseCRDInstancePath(
    namespace: string,
    plural: string,
    instanceName: string
  ) {
    return await eval(
      `${this.basePath}.namespace('${namespace}').${plural}('${instanceName}')`
    );
  }

  /**
   *
   * @param body
   * @param namespace
   * @param endpoint corresponds to 'group' property in crd
   * @param kind must be lowercase
   */
  async createCRDInstance(namespace: string, kind: string, body: any) {
    return await eval(
      `${this.basePath}.namespace('${namespace}').${kind}.post( { body: body } )`
    );
  }

  /**
   * Returns object containing provided name, namespace and
   * watch object that is used to watch the resource
   * @param name resource name
   * @param namespace namespace the resource is located in
   * @param plural resource plural
   */
  async getCRDWatch(name: string, namespace: string, plural: string) {
    return {
      name,
      namespace,
      plural,
      kubeWatchObject: await eval(`${this.basePath}.watch.${plural}`),
    };
  }

  getActionStates(
    steps: any,
    actionId: string,
    name: string,
    namespace: string
  ) {
    const actionObject = steps.find((element: any) => {
      return element.id === actionId;
    });
    const { state, parentId } = actionObject;
    const parentActionObject = steps.find((element: any) => {
      return element.id === parentId;
    });
    if (!actionObject)
      throw new Error(
        `${COMM_INTERFACE} Executable action with id ${actionId} not found in action instance: name '${name}', namespace '${namespace}'`
      );
    if (!parentActionObject)
      throw new Error(
        `${COMM_INTERFACE} Abstract action with id ${parentId} not found in action instance: name '${name}', namespace '${namespace}'`
      );
    console.log(
      `${COMM_INTERFACE} Watch ended. Action state is ${state}, parent state is ${parentActionObject.state}`
    );
    return { actionState: state, parentState: parentActionObject.state };
  }

  /**
   * Returns object containing provided name, namespace and
   * watch object that is used to watch the resource
   * @param name resource name
   * @param namespace namespace the resource is located in
   * @param plural resource plural
   * @param executableActionId must be provided when watching 'actions' for handling of 'end' event
   */
  async getWatchPromise(
    name: string,
    namespace: string,
    plural: string,
    promiseCallback: Function,
    actionId: string = '',
    watchEndedCallback: Function = () => {}
  ) {
    const stream = await eval(`${this.basePath}.watch.${plural}.getStream()`);
    if (actionId) {
      stream.on('end', async () => {
        const actionInstancePath = await this.getBaseCRDInstancePath(
          namespace,
          plural,
          name
        );
        const actionInstance = await actionInstancePath.get();
        const { actionState, parentState } = this.getActionStates(
          actionInstance.body.spec.status.steps,
          actionId,
          name,
          namespace
        );
        stream.abort();
        await watchEndedCallback(
          actionState === 'EXECUTING' && !(parentState === 'FAILURE'),
          this,
          { name, namespace, plural }
        );
      });
    }

    const jsonStream = new JSONStream();
    stream.pipe(jsonStream);
    return new Promise(async (resolve, reject) => {
      jsonStream.on('data', async (event: any) => {
        const { metadata } = event.object;
        if (name == metadata.name && namespace == metadata.namespace) {
          promiseCallback(event, stream, resolve, reject);
        }
      });
    });
  }

  /**
   * Returns object containing provided name, namespace and
   * watch object that is used to watch the resource
   * @param name resource name
   * @param namespace namespace the resource is located in
   * @param plural resource plural
   */
  async getWatchPromiseWTimeout(
    name: string,
    namespace: string,
    plural: string,
    promiseCallback: Function
  ) {
    const stream = await eval(`${this.basePath}.watch.${plural}.getStream()`);
    const jsonStream = new JSONStream();
    stream.pipe(jsonStream);
    return new Promise(async (resolve, reject) => {
      setTimeout(() => {
        stream.abort();
        reject({ watchTimeout: 'Watch timed out' });
      }, this.watchTimeoutMS);
      jsonStream.on('data', async (event: any) => {
        const { metadata } = event.object;
        if (name == metadata.name && namespace == metadata.namespace) {
          promiseCallback(event, stream, resolve, reject);
        }
      });
    });
  }

  async getSimplePath() {
    return this.basePath;
  }

  getClient() {
    return this.client;
  }
}
