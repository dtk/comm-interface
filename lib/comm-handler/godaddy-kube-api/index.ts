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

  /**
   *
   * @param namespace
   * @param serviceName
   * returns selector labels from the service
   */
  async getServiceSelectorLabels(namespace: string, serviceName: string) {
    let service = await this.client.api.v1.namespaces(namespace).services(serviceName).get();
    return service.body.spec.selector;
  }

  /**
   *
   * @param namespace
   * @param serviceName
   * based on selector labels from the service, it selects corresponding pods
   */
  async getPodsFromSpecificService(namespace: string, serviceName: string) {
    let selectorLabels = await this.getServiceSelectorLabels(namespace, serviceName);
    let labelKey = Object.keys(selectorLabels)[0];
    let labelValue = Object.values(selectorLabels)[0];
    let pods = await this.client.api.v1.namespaces(namespace).pods.get({
      qs: {
        labelSelector: `${labelKey}=${labelValue}`
      },
    });
    return pods.body.items;
  }

  /**
   *
   * @param namespace
   * @param serviceName
   * returns list of nodeNames on which pods are running
   */
  async getNodeNamesAssociatedWithPods(namespace: string, serviceName: string) {
    let nodeNames = [];
    let pods = await this.getPodsFromSpecificService(namespace, serviceName);
    for (let pod of pods) {
      nodeNames.push(pod.spec.nodeName);
    }
    return nodeNames;
  }

  /**
   * 
   * @param daemonSetObject
   * @param namespace
   * @param replicaCount
   * This method creates daemonset based on the daemonSetObject passed as argument.
   * It also fetches the state to verify that number of running (and ready) pods is equal to expected replicaCount (which suggest that daemonSet is running successfully)
   * Returns true/false based on the success of daemonSet creation.
   */
  async createDaemonSet(daemonSetObject: any, namespace: string, replicaCount: number) {
    try {
      let daemonSetCreated = await this.client.apis.apps.v1.namespaces(namespace).daemonsets.post({ body: daemonSetObject });
      let maxRetries = 10;
      let retryCount = 0;

      while (retryCount < maxRetries) {
        let daemonSetStatus = await this.client.apis.apps.v1.namespaces(namespace).daemonsets(daemonSetCreated.body.metadata.name).status.get();
        if (daemonSetStatus.body.status.numberReady < replicaCount) {
          console.log(`Telegraf DaemonSet: number of current replicas: ${daemonSetStatus.body.status.numberReady}, number of expected replicas: ${replicaCount}`);
          console.log(`Waiting for Telegraf DaemonSet to be ready`);
          this.sleep(3000);
          retryCount++;
        } else {
          console.log("Telegraf DaemonSet is ready");
          return true;
        }   
      }

      if (retryCount == maxRetries) {
        console.log("Telegraf DaemonSet is not ready. Aborting further operations. Please check logs of Telegraf Daemonset");
        return false;
      }  
    } catch (err) {
      console.error('Error when creating DaemonSet: ', err)
      return false;
    }
  }

  /**
   * 
   * @param daemonSetName
   * @param namespace
   * This method deletes daemonset and verify that deletion passed successfully.
   * Returns true/false based on the success of daemonSet deletion.
   */
  async deleteDaemonSet(daemonSetName: string, namespace: string) {
    try {
      let daemonSetDeleted = await this.client.apis.apps.v1.namespaces(namespace).daemonsets(daemonSetName).delete();
      if (daemonSetDeleted.body.status == "Success") return true;
    } catch (err) {
      console.error('Error when deleting DaemonSet: ', err);
      return false;
    }
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
        stream.destroy();
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
        stream.destroy();
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

  async sleep(ms: any) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
