const PQueue = require('p-queue').default
const config = require('config')

// small route wrapper for better use of async/await with express
exports.asyncWrap = route => {
  return (req, res, next) => route(req, res, next).catch(next)
}

// use a queue to limit concurrency because creating an infinite number of chrome contexts is not possible
// we use current user id (or concurrencyKey param) to split the queue so that a user cannot monopolize the queue
class QueueClass {
  constructor() {
    this._queues = {}
  }
  enqueue(run, options) {
    const queueKey = (options.req.user && options.req.user.id) || options.req.query.concurrencyKey || 'main'
    this._queues[queueKey] = this._queues[queueKey] || []
    this._queues[queueKey].push(run)
  }
  dequeue() {
    const keys = Object.keys(this._queues)
    const queueKey = keys[Math.floor(Math.random() * keys.length)]
    const item = this._queues[queueKey].shift()
    if (!this._queues[queueKey].length) delete this._queues[queueKey]
    return item
  }
  get size() {
    return Object.values(this._queues).reduce((a, queue) => a + queue.length, 0)
  }
}

const queue = new PQueue({ concurrency: config.concurrency, queueClass: QueueClass })

exports.concurrentAsyncWrap = (route) => {
  return (req, res, next) => queue.add(() => route(req, res, next), { req }).catch(next)
}
