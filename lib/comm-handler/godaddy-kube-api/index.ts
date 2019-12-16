const Client = require('kubernetes-client').Client;
const K8sConfig = require('kubernetes-client').config;
const JSONStream = require('json-stream');

export default class GoDaddyKubeApi {
  private client: any;
  private basePath: any;
  /**
   *
   * @param configMethod i.e: fromKubeconfig()
   * @param version i.e: 1.9
   */
  constructor(
    endpoint: string,
    crdVersion: string,
    configMethod: string,
    clientVersion: string = '1.9'
  ) {
    const config = eval(`K8sConfig.${configMethod}`);
    if (configMethod === 'getInCluster()') {
      this.client = new Client({ config: config });
      this.client.loadSpec();
    } else if (configMethod === 'fromKubeconfig()') {
      this.client = new Client({ config: config, version: clientVersion });
    } else throw new Error('config method not recognized');
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
      kubeWatchObject: await eval(`${this.basePath}.watch.${plural}`),
    };
  }

  /**
   * Returns object containing provided name, namespace and
   * watch object that is used to watch the resource
   * @param name resource name
   * @param namespace namespace the resource is located in
   * @param plural resource plural
   */
  async getWatchPromise(
    name: string,
    namespace: string,
    plural: string,
    promiseCallback: Function
  ) {
    const stream = await eval(`${this.basePath}.watch.${plural}.getStream()`);
    const jsonStream = new JSONStream();
    stream.pipe(jsonStream);
    return new Promise(async (resolve, reject) => {
      jsonStream.on('data', async (event: any) => {
        const { metadata } = event.object;
        if (name == metadata.name && namespace == metadata.namespace) {
          promiseCallback(resolve, reject);
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
