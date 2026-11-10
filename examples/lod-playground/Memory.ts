import type { BufferGeometry, TypedArray } from 'three';

export interface LevelMemory {
  level: number;
  vertices: number;
  triangles: number;
  indexType: string;
  indexBytes: number;
  /** Bytes of the vertex buffers first used by this level: buffers shared with a previous level are counted there. */
  vertexBytes: number;
}

export interface MemoryReport {
  levels: LevelMemory[];
  indexBytes: number;
  vertexBytes: number;
  /** Vertex bytes beyond those of level 0: copies made by compact vertices or by the skin reduction. */
  extraVertexBytes: number;
}

/**
 * Measures the CPU memory of the drawn geometries, the same that is uploaded to the GPU: index arrays, and vertex buffers counted once
 * even when several levels share them.
 */
export function getMemoryReport(geometries: BufferGeometry[]): MemoryReport {
  const seen = new Set<ArrayBufferLike>();
  const levels: LevelMemory[] = [];
  let indexBytes = 0;
  let vertexBytes = 0;

  for (let level = 0; level < geometries.length; level++) {
    const geometry = geometries[level];
    const index = geometry.index;
    const levelIndexBytes = index === null ? 0 : index.array.byteLength;
    let levelVertexBytes = 0;

    for (const array of getVertexArrays(geometry)) {
      if (seen.has(array.buffer)) continue;

      seen.add(array.buffer);
      levelVertexBytes += array.byteLength;
    }

    levels.push({
      level,
      vertices: geometry.getAttribute('position').count,
      triangles: index === null ? 0 : index.count / 3,
      indexType: index === null ? '-' : getIndexType(index.array),
      indexBytes: levelIndexBytes,
      vertexBytes: levelVertexBytes
    });
    indexBytes += levelIndexBytes;
    vertexBytes += levelVertexBytes;
  }

  return { levels, indexBytes, vertexBytes, extraVertexBytes: vertexBytes - (levels[0]?.vertexBytes ?? 0) };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getVertexArrays(geometry: BufferGeometry): TypedArray[] {
  const arrays: TypedArray[] = [];

  for (const name of Object.keys(geometry.attributes)) addArray(arrays, geometry.getAttribute(name));

  const morphAttributes = geometry.morphAttributes as Record<string, { array?: TypedArray; data?: { array?: TypedArray } }[]>;

  for (const name of Object.keys(morphAttributes)) {
    for (const attribute of morphAttributes[name]) addArray(arrays, attribute);
  }

  return arrays;
}

function addArray(arrays: TypedArray[], attribute: { array?: TypedArray; data?: { array?: TypedArray } }): void {
  const array = getArray(attribute);

  if (array !== undefined) arrays.push(array);
}

/**
 * Returns the array of a buffer or interleaved attribute, or undefined for attributes that live only on the GPU, like those that
 * InstancedMesh2 adds to the geometries it draws.
 */
function getArray(attribute: { array?: TypedArray; data?: { array?: TypedArray } }): TypedArray | undefined {
  return attribute.data !== undefined ? attribute.data.array : attribute.array;
}

function getIndexType(array: TypedArray): string {
  return array.BYTES_PER_ELEMENT === 1 ? 'Uint8' : array.BYTES_PER_ELEMENT === 2 ? 'Uint16' : 'Uint32';
}
