declare module '@npmcli/arborist' {
  interface ArboristOptions {
    path?: string;
    registry?: string;
  }

  interface Node {
    path: string;
    children: Map<string, Node>;
  }

  class Arborist {
    constructor(options: ArboristOptions);
    reify(): Promise<Node>;
  }

  export default Arborist;
}
