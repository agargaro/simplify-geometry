import { createRadixSort, extendBatchedMeshPrototype } from '@three.ez/batched-mesh-extensions';
import { Main, PerspectiveCameraAuto } from '@three.ez/main';
import { getScale, simplifyGeometryLOD, simplifyReady, type SimplifyGeometryResult } from '@three.ez/simplify-geometry';
import {
  AmbientLight,
  BatchedMesh,
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

let vertexCount = 0;
let indexCount = 0;

for (const geometryLOD of geometriesLOD) {
  vertexCount += geometryLOD[0].geometry.getAttribute('position').count;
  indexCount += getIndexCount(geometryLOD);
}

const batchedMesh = new BatchedMesh(instancesCount, vertexCount, indexCount, new MeshStandardMaterial({ metalness: 0.2, roughness: 0.2 }));
batchedMesh.customSort = createRadixSort(batchedMesh);

for (const geometryLOD of geometriesLOD) {
  const geometryId = batchedMesh.addGeometry(geometryLOD[0].geometry, -1, getIndexCount(geometryLOD));

  for (let i = 1; i < geometryLOD.length; i++) {
    batchedMesh.addGeometryLOD(geometryId, geometryLOD[i].geometry, getScreenMetric(geometryLOD, i));
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

function getScreenMetric(geometryLOD: SimplifyGeometryResult[], level: number): number {
  const geometry = geometryLOD[0].geometry;
  const meshScale = getScale(geometry.getAttribute('position').array as Float32Array);

  geometry.computeBoundingSphere();

  const radius = geometry.boundingSphere?.radius ?? 0;
  const worldError = geometryLOD[level].error * meshScale;

  return (2 * maxErrorPixels * radius) / (worldError * window.innerHeight);
}
