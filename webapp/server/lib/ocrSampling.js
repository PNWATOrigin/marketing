import path from 'node:path';

// Round-robin across source images; inspect front, back and middle before nearby cuts.
export function selectOcrPaths(paths, limit = 12) {
  const groups = new Map();
  for (const file of paths) {
    const key = path.basename(file).match(/^img_\d+/)?.[0] || file;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  }
  const queues = [...groups.values()].map(files => {
    const indices = [...new Set([0, files.length - 1, Math.floor(files.length / 2), ...files.map((_, i) => i)])];
    return indices.map(i => files[i]);
  });
  const result = [];
  while (result.length < limit && queues.some(q => q.length)) {
    for (const queue of queues) {
      if (queue.length && result.length < limit) result.push(queue.shift());
    }
  }
  return result;
}
