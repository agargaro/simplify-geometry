import { createRadixSort, extendBatchedMeshPrototype } from '@three.ez/batched-mesh-extensions';
import { Main, PerspectiveCameraAuto } from '@three.ez/main';
import { getScale, simplifyGeometryLOD, simplifyReady, type SimplifyGeometryResult } from '@three.ez/simplify-geometry';
import {
  AmbientLight,
  BatchedMesh,
  type BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  TorusKnotGeometry,
  Vector3,
  WebGLCoordinateSystem
} from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

extendBatchedMeshPrototype();
await simplifyReady();

const instancesCount = 500000;
const maxErrorPixels = 1;
const levels = [{ error: 0.002 }, { error: 0.005 }, { error: 0.02 }, { error: 0.05 }];

const camera = new PerspectiveCameraAuto(50, 0.1, 600).translateZ(50).translateY(10);
const scene = new Scene();
scene.fog = new Fog(0x000000, 500, 600);
const main = new Main();
main.createView({ scene, camera, enabled: false });

const controls = new MapControls(camera, main.renderer.domElement);
scene.on('animate', () => controls.update());

const geometries = [
  new TorusKnotGeometry(1, 0.4, 256, 32, 1, 1),
  new TorusKnotGeometry(1, 0.4, 256, 32, 1, 2),
  new TorusKnotGeometry(1, 0.4, 256, 32, 1, 3),
  new TorusKnotGeometry(1, 0.4, 256, 32, 1, 4),
  new TorusKnotGeometry(1, 0.4, 256, 32, 1, 5),
  new TorusKnotGeometry(1, 0.4, 256, 32, 2, 1),
  new TorusKnotGeometry(1, 0.4, 256, 32, 2, 3),
  new TorusKnotGeometry(1, 0.4, 256, 32, 3, 1),
  new TorusKnotGeometry(1, 0.4, 256, 32, 4, 1),
  new TorusKnotGeometry(1, 0.4, 256, 32, 5, 3)
];

const geometriesLOD = geometries.map((geometry) => simplifyGeometryLOD(geometry, levels, { vertices: 'reordered' }));

const indexCounts = geometriesLOD.map(getIndexCount);
let vertexCount = 0;
let indexCount = 0;

for (let i = 0; i < geometriesLOD.length; i++) {
  vertexCount += geometriesLOD[i][0].geometry.getAttribute('position').count;
  indexCount += indexCounts[i];
}

const batchedMesh = new BatchedMesh(instancesCount, vertexCount, indexCount, new MeshStandardMaterial({ metalness: 0.2, roughness: 0.2 }));
batchedMesh.customSort = createRadixSort(batchedMesh);

for (let i = 0; i < geometriesLOD.length; i++) {
  const geometryLOD = geometriesLOD[i];
  const geometryId = batchedMesh.addGeometry(geometryLOD[0].geometry, -1, indexCounts[i]);
  const screenMetricScale = getScreenMetricScale(geometryLOD[0].geometry);

  for (let j = 1; j < geometryLOD.length; j++) {
    batchedMesh.addGeometryLOD(geometryId, geometryLOD[j].geometry, screenMetricScale / geometryLOD[j].error);
  }
}

const color = new Color();
const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const scale = new Vector3(1, 1, 1);

const sqrtCount = Math.ceil(Math.sqrt(instancesCount));
const size = 5.5;
const start = (sqrtCount / -2 * size) + (size / 2);

for (let i = 0; i < instancesCount; i++) {
  const r = Math.floor(i / sqrtCount);
  const c = i % sqrtCount;
  const id = batchedMesh.addInstance(Math.floor(Math.random() * geometriesLOD.length));
  position.set(c * size + start, 0, r * size + start);
  quaternion.random();
  batchedMesh.setMatrixAt(id, matrix.compose(position, quaternion, scale));
  batchedMesh.setColorAt(id, color.setHSL(Math.random(), 0.6, 0.5));
}

batchedMesh.computeBVH(WebGLCoordinateSystem);

scene.add(batchedMesh, new AmbientLight());
const dirLight = new DirectionalLight('white', 2);
camera.add(dirLight, dirLight.target);

function getIndexCount(geometryLOD: SimplifyGeometryResult[]): number {
  let count = 0;

  for (const level of geometryLOD) {
    count += level.geometry.index?.count ?? 0;
  }

  return count;
}

function getScreenMetricScale(geometry: BufferGeometry): number {
  const meshScale = getScale(geometry.getAttribute('position').array as Float32Array);

  geometry.computeBoundingSphere();

  const radius = geometry.boundingSphere?.radius ?? 0;

  return (2 * maxErrorPixels * radius) / (meshScale * window.innerHeight);
}
