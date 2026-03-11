declare module '@mapbox/vector-tile' {
  export class VectorTile {
    constructor(pbf: any);
    layers: { [key: string]: VectorTileLayer };
  }

  export class VectorTileLayer {
    length: number;
    feature(i: number): VectorTileFeature;
  }

  export class VectorTileFeature {
    loadGeometry(): Array<Array<{ x: number; y: number }>>;
    properties: { [key: string]: any };
    type: number;
  }
}

declare module 'pbf' {
  export default class Pbf {
    constructor(buffer: ArrayBuffer);
  }
}
