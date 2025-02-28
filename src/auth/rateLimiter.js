class RateLimiter {
  constructor(ratePerSec) {
    this.queue = [];
    this.ratePerSec = ratePerSec;
    this.interval = 1000 / ratePerSec;
    this.timer = null;
  }
  
  start() {
    if (!this.timer) {
      this.timer = setInterval(() => {
        if (this.queue.length > 0) {
          const task = this.queue.shift();
          try {
            task();
          } catch (error) {
            console.error('Erro ao executar tarefa:', error);
          }
        }
      }, this.interval);
    }
  }
  
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  
  enqueue(task) {
    this.queue.push(task);
  }
}

module.exports = RateLimiter;
