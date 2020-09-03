const config = require('config')
const express = require('express')
const cookieParser = require('cookie-parser')
const http = require('http')
const eventToPromise = require('event-to-promise')
const proxy = require('http-proxy-middleware')
const capture = require('./routers/capture')
const pageUtils = require('./utils/page')
const apiDocs = require('../contract/api-docs')
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
app.get('/api/v1/api-docs.json', (req, res, next) => res.send(apiDocs))
app.use('/test', express.static('./test'))

// Error management
app.use((err, req, res, next) => {
  const status = err.statusCode || err.status || 500
  if (status === 500) console.error('Error in express route', err)
  if (!res.headersSent) res.status(status).send(err.message)
})

// Run app and return it in a promise
const server = http.createServer(app)
exports.run = async () => {
  await pageUtils.start()
  server.listen(config.port)
  await eventToPromise(server, 'listening')
  return app
}

exports.stop = async() => {
  server.close()
  await eventToPromise(server, 'close')
  await pageUtils.start()
}
