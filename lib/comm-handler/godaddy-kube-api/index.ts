import { COMM_INTERFACE, WATCH_TIMEOUT_MS } from '../../constants';
const Client = require('kubernetes-client').Client;

export default class GoDaddyKubeApi {
  private client: any;
  private basePath: any;
  private watchTimeoutMS: number;

  constructor(
    client: any,
    basePath: string,
    watchTimeoutMS: number = WATCH_TIMEOUT_MS
  ) {
    this.watchTimeoutMS = watchTimeoutMS;
    this.basePath = basePath;
    this.client = client;
  }

  /**
   *
   * @param configMethod i.e: fromKubeconfig()
   * @param version i.e: 1.9
   */
  static async getInstance(
    endpoint: string,
    crdVersion: string,
    configMethod: string,
    clientVersion: string = '1.13',
    watchTimeoutMS: number = WATCH_TIMEOUT_MS
  ) {
    let client = new Client({ version: clientVersion });
    await client.loadSpec();

    const basePath = `this.client.apis['${endpoint}'].${crdVersion}`;
    return new GoDaddyKubeApi(client, basePath, watchTimeoutMS);
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
        `${COMM_INTERFACE} Executable action with id ${actionId} not found in workflow instance: name '${name}', namespace '${namespace}'`
      );
    if (!parentActionObject)
      throw new Error(
        `${COMM_INTERFACE} Abstract action with id ${parentId} not found in workflow instance: name '${name}', namespace '${namespace}'`
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
   * @param executableActionId must be provided when watching 'workflowinstance' for handling of 'end' event
   */
  async getWatchPromise(
    name: string,
    namespace: string,
    plural: string,
    promiseCallback: Function,
    actionId: string = '',
    watchEndedCallback: Function = () => {}
  ) {
    const stream = await eval(`${this.basePath}.watch.${plural}.getObjectStream()`);
    if (actionId) {
      stream.on('end', async () => {
        const workflowInstancePath = await this.getBaseCRDInstancePath(
          namespace,
          plural,
          name
        );
        const workflowInstance = await workflowInstancePath.get();
        const { actionState, parentState } = this.getActionStates(
          workflowInstance.body.spec.status.steps,
          actionId,
          name,
          namespace
        );
        await watchEndedCallback(
          actionState === 'EXECUTING' && !(parentState === 'FAILURE'),
          this,
          { name, namespace, plural }
        );
      });
    }

    return new Promise(async (resolve, reject) => {
      stream.on('data', async (event: any) => {
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
    const stream = await eval(`${this.basePath}.watch.${plural}.getObjectStream()`);
    return new Promise(async (resolve, reject) => {
      setTimeout(() => {
        reject({ watchTimeout: 'Watch timed out' });
      }, this.watchTimeoutMS);
      stream.on('data', async (event: any) => {
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
