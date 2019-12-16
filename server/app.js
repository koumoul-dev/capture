const config = require('config')
const express = require('express')
const cookieParser = require('cookie-parser')
const http = require('http')
const eventToPromise = require('event-to-promise')
const proxy = require('http-proxy-middleware')
const capture = require('./routers/capture')

const app = express()

if (!config.directoryUrl) {
  console.error('WARNING: It is recommended to define directoryUrl parameter')
} else {
  const session = require('@koumoul/sd-express')({
    directoryUrl: config.directoryUrl,
    publicUrl: config.publicUrl,
    cookieDomain: config.sessionDomain
  })
  app.set('session', session)
}

app.use(cookieParser())

if (process.env.NODE_ENV === 'development') {
  // In production CORS is taken care of by the reverse proxy if necessary
  app.use(require('cors')())

  // Create a mono-domain environment with other services in dev
  app.use('/simple-directory', proxy({ target: 'http://localhost:8080', pathRewrite: { '^/simple-directory': '' } }))
}

app.use('/api/v1', capture.router)
app.use('/test', express.static('./test'))

// Run app and return it in a promise
const server = http.createServer(app)
exports.run = async () => {
  await capture.init()
  server.listen(config.port)
  await eventToPromise(server, 'listening')
  return app
}

exports.stop = async() => {
  server.close()
  await eventToPromise(server, 'close')
  await capture.close()
}
