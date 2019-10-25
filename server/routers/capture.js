const config = require('config')
const express = require('express')
const debug = require('debug')('capture')
const puppeteer = require('puppeteer')
const URL = require('url').URL
const PQueue = require('p-queue').default
const { concurrentAsyncWrap } = require('../utils/async-wrap')
// const headerFooter = require('../utils/header-footer')

const queue = new PQueue({ concurrency: config.concurrency })

let _closed, _browser
let browserPromise

exports.init = async (app) => {
  browserPromise = puppeteer.launch({ executablePath: 'google-chrome-unstable', args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  _browser = await browserPromise

  // auto reconnection, cf https://github.com/GoogleChrome/puppeteer/issues/4428
  _browser.on('disconnected', () => {
    if (!_closed) {
      console.log('Browser was disconnected for some reason, reconnect')
      exports.init()
    }
  })
}

exports.close = async () => {
  _closed = true
  await _browser.close()
}

const router = exports.router = express.Router()

function auth(req, res, next) {
  if (!req.query.target) return res.status(400).send('parameter "target" is required')
  const target = req.query.target

  // transmit cookies from incoming query if we target and the current service are on same host
  let sameHost
  try {
    sameHost = new URL(target).host === new URL(config.publicUrl).host
  } catch (err) {
    return res.status(400).send('Failed to parse url ' + err.message)
  }

  if (sameHost) {
    debug(`${target} is on same host as capture service, transmit cookies`)
    req.cookies = Object.keys(req.cookies).map(name => ({ name, value: req.cookies[name], url: target }))
  } else {
    debug(`${target} is NOT on same host as capture service, do NOT transmit cookies`)
    if (config.onlySameHost) return res.status(400).send('Only same host targets are accepted')
  }
  next()
}

// quite complex strategy to wait for the page to be ready for capture.
// it can either explitly call a triggerCapture function or we wait for idle network + 1s
async function waitForPage(page, target) {
  // Prepare a function that the page can call to signal that it is ready for capture
  let captureTriggered = false
  let timeoutReached = false
  const triggerCapture = new Promise(resolve => page.exposeFunction('triggerCapture', () => {
    captureTriggered = true
    resolve()
  }))

  try {
    // wait for network inactivity, but it can be interrupted if triggerCapture is called
    await Promise.race([
      page.goto(target, { waitUntil: 'networkidle0', timeout: config.screenshotTimeout }),
      triggerCapture
    ])
    if (captureTriggered) debug(`Capture was expicitly triggered by window.triggerCapture call for ${target}`)
    else debug(`network was idle during 500ms for ${target}`)
  } catch (err) {
    if (err.name !== 'TimeoutError') throw err
    else {
      debug(`timeout of ${config.screenshotTimeout} was reached for ${target}`)
      timeoutReached = true
    }
  }

  if (captureTriggered || timeoutReached) {
    // we are done here, capture was already explicitly triggered or we already waited for a long time
  } else {
    // Adapt the wait strategy based on the x-capture meta
    let captureMeta
    try {
      captureMeta = await page.$eval(`head > meta[name='x-capture']`, el => el.content)
    } catch (err) {
      // nothing to do, meta is probably absent
    }
    if (captureMeta === 'trigger') {
      debug(`wait for explicit window.triggerCapture call after network was found idle for ${target}`)
      await Promise.race([
        triggerCapture,
        new Promise(resolve => setTimeout(resolve, config.screenshotTimeout))
      ])
      if (captureTriggered) debug(`Capture was expicitly triggered by window.triggerCapture call for ${target}`)
      else debug(`timeout of ${config.screenshotTimeout} was reached for ${target}`)
    } else {
      debug(`wait 1000ms more after idle network for safety ${target}`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}

async function setPageLocale(page, lang, timezone) {
  debug(`Localization lang=${lang}, timezone=${timezone}`)
  await page.emulateTimezone(timezone)
  await page.setExtraHTTPHeaders({
    'Accept-Language': lang
  })
  await page.evaluateOnNewDocument((lang) => {
    const langs = [lang]
    if (lang.includes('-')) langs.push(lang.split('-')[0])
    Object.defineProperty(navigator, 'language', {
      get: function() {
        return lang
      }
    })
    Object.defineProperty(navigator, 'languages', {
      get: function() {
        return langs
      }
    })
  }, lang)
}

router.get('/screenshot', auth, concurrentAsyncWrap(queue, async (req, res, next) => {
  const browser = await browserPromise
  const target = req.query.target
  debug(`capture screenshot for target url ${target}`)

  // read query params
  let width, height
  try {
    width = req.query.width ? parseInt(req.query.width) : 800
    height = req.query.height ? parseInt(req.query.height) : 450
  } catch (err) {
    return res.status(400).send(err.message)
  }
  if (width > 3000) return res.status(400).send('width too large')
  if (height > 3000) return res.status(400).send('width too large')

  // Create page in incognito context so that cookies are not shared
  // make sure we always close the page and the incognito context
  const incognitoContext = await browser.createIncognitoBrowserContext()
  const page = await incognitoContext.newPage()

  try {
    setPageLocale(page, req.query.lang || config.defaultLang, req.query.timezone || config.defaultTimezone)
    if (req.cookies) await page.setCookie.apply(page, req.cookies)
    await page.setViewport({ width, height })
    await waitForPage(page, target)
    const buffer = await page.screenshot()
    res.type('png')
    if (req.query.filename) res.attachment(req.query.filename)
    res.send(buffer)
  } catch (err) {
    next(err)
  } finally {
    await page.close()
    await incognitoContext.close()
  }
}))

router.get('/print', auth, concurrentAsyncWrap(queue, async (req, res, next) => {
  const browser = await browserPromise
  const target = req.query.target
  debug(`print page for target url ${target}`)

  // read query params
  const landscape = req.query.landscape === 'true'
  // const footer = req.query.footer === 'true'
  const pageRanges = req.query.pageRanges || ''
  const format = req.query.format || 'A4'

  // Create page in incognito context so that cookies are not shared
  // make sure we always close the page and the incognito context
  const incognitoContext = await browser.createIncognitoBrowserContext()
  const page = await incognitoContext.newPage()
  try {
    setPageLocale(page, req.query.lang || config.defaultLang, req.query.timezone || config.defaultTimezone)
    if (req.cookies) await page.setCookie.apply(page, req.cookies)
    await waitForPage(page, target)
    const pdfOptions = { landscape, pageRanges, format, margin: {}, printBackground: true }
    /* TODO: this is a work in progress
    // see https://github.com/GoogleChrome/puppeteer/issues/1853
    if (footer) {
      pdfOptions.displayHeaderFooter = true
      pdfOptions.footerTemplate = headerFooter.footer()
      pdfOptions.margin.bottom = '40px'
    } */
    const buffer = await page.pdf(pdfOptions)
    res.type('pdf')
    if (req.query.filename) res.attachment(req.query.filename)
    res.send(buffer)
  } catch (err) {
    next(err)
  } finally {
    await page.close()
    await incognitoContext.close()
  }
}))
