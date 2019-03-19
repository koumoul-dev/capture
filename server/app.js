const config = require('config')
const express = require('express')
const cookieParser = require('cookie-parser')
const http = require('http')
const eventToPromise = require('event-to-promise')
const capture = require('./routers/capture')

const app = express()

app.use(cookieParser())
// In production CORS is taken care of by the reverse proxy if necessary
if (process.env.NODE_ENV === 'development') {
  app.use('/test', express.static('./test'))
  app.use(require('cors')())
}

const server = http.createServer(app)

app.use('/api/v1', capture.router)

// Run app and return it in a promise
exports.run = async () => {
  app.set('browser', await capture.init())
  server.listen(config.port)
  await eventToPromise(server, 'listening')
  return app
}

exports.stop = async() => {
  await app.get('browser').close()
}
