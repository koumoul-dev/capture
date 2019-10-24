// small route wrapper for better use of async/await with express
exports.asyncWrap = route => {
  return (req, res, next) => route(req, res, next).catch(next)
}

exports.concurrentAsyncWrap = (queue, route) => {
  return (req, res, next) => queue.add(() => route(req, res, next)).catch(next)
}
