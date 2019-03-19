const express = require('express')
const debug = require('debug')('capture')
const config = require('config')
const puppeteer = require('puppeteer')
const URL = require('url').URL
const asyncWrap = require('../utils/async-wrap')
// const headerFooter = require('../utils/header-footer')

exports.init = async () => {
  return puppeteer.launch({ executablePath: 'google-chrome-unstable', args: ['--no-sandbox', '--disable-setuid-sandbox'] })
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

router.get('/screenshot', auth, asyncWrap(async (req, res, next) => {
  const browser = req.app.get('browser')

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
    if (req.cookies) await page.setCookie.apply(page, req.cookies)

    await page.setViewport({ width, height })

    // Prepare a function that the page can call to signal that it is ready for capture
    const triggerCapture = new Promise(resolve => page.exposeFunction('triggerCapture', resolve))

    try {
      // wait for network inactivity, but it can be interrupted if triggerCapture is called
      await Promise.race([
        page.goto(target, { waitUntil: 'networkidle0', timeout: config.screenshotTimeout }),
        triggerCapture
      ])
    } catch (err) {
      if (err.name !== 'TimeoutError') return next(err)
    }

    // Adapt the wait strategy based on the x-capture meta
    let captureMeta
    try {
      captureMeta = await page.$eval(`head > meta[name='x-capture']`, el => el.content)
    } catch (err) {
      // nothing to do, meta is probably absent
    }
    if (captureMeta === 'trigger') {
      await Promise.race([
        triggerCapture,
        new Promise(resolve => setTimeout(resolve, config.screenshotTimeout))
      ])
    } else {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const buffer = await page.screenshot()
    res.contentType('image/png')
    res.send(buffer)
  } catch (err) {
    next(err)
  } finally {
    await page.close()
    await incognitoContext.close()
  }
}))

router.get('/print', auth, asyncWrap(async (req, res, next) => {
  const browser = req.app.get('browser')

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
    if (req.cookies) await page.setCookie.apply(page, req.cookies)

    // Prepare a function that the page can call to signal that it is ready for capture
    const triggerCapture = new Promise(resolve => page.exposeFunction('triggerCapture', resolve))

    try {
      // wait for network inactivity, but it can be interrupted if triggerCapture is called
      await Promise.race([
        page.goto(target, { waitUntil: 'networkidle0', timeout: config.screenshotTimeout }),
        triggerCapture
      ])
    } catch (err) {
      if (err.name !== 'TimeoutError') return next(err)
    }

    // Adapt the wait strategy based on the x-capture meta
    let captureMeta
    try {
      captureMeta = await page.$eval(`head > meta[name='x-capture']`, el => el.content)
    } catch (err) {
      // nothing to do, meta is probably absent
    }
    if (captureMeta === 'trigger') {
      await Promise.race([
        triggerCapture,
        new Promise(resolve => setTimeout(resolve, config.screenshotTimeout))
      ])
    } else {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const pdfOptions = { landscape, pageRanges, format, margin: {}, printBackground: true }
    /* TODO: this is a work in progress
    // see https://github.com/GoogleChrome/puppeteer/issues/1853
    if (footer) {
      pdfOptions.displayHeaderFooter = true
      pdfOptions.footerTemplate = headerFooter.footer()
      pdfOptions.margin.bottom = '40px'
    } */
    const buffer = await page.pdf(pdfOptions)
    res.contentType('application/pdf')
    res.send(buffer)
  } catch (err) {
    next(err)
  } finally {
    await page.close()
    await incognitoContext.close()
  }
}))
