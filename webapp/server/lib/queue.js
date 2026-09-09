// 동시 실행 개수를 제한하는 아주 단순한 비동기 작업 큐.
export class ConcurrencyQueue {
  constructor(maxConcurrency) {
    this.maxConcurrency = Math.max(1, maxConcurrency);
    this.running = 0;
    this.pending = [];
  }

  push(task) {
    this.pending.push(task);
    this._drain();
  }

  _drain() {
    while (this.running < this.maxConcurrency && this.pending.length > 0) {
      const task = this.pending.shift();
      this.running++;
      Promise.resolve()
        .then(task)
        .catch((err) => console.error('큐 작업 처리 중 오류:', err))
        .finally(() => {
          this.running--;
          this._drain();
        });
    }
  }

  get size() {
    return this.pending.length + this.running;
  }
}
