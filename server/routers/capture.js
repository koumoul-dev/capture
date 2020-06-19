const config = require('config')
const express = require('express')
const debug = require('debug')('capture')
const URL = require('url').URL
const asyncWrap = require('../utils/async-wrap')
const headerFooter = require('../utils/header-footer')
const pageUtils = require('../utils/page')

const router = exports.router = express.Router()

async function auth(req, res, next) {
  if (!req.app.get('session')) {
    console.error('WARNING: It is recommended to define directoryUrl parameter')
  } else {
    await req.app.get('session').auth(req, res, () => {})
    if (!req.user && req.query.key !== config.secretKeys.capture) return res.status(401).send()
  }

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

router.get('/screenshot', asyncWrap(auth), asyncWrap(async (req, res, next) => {
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

  const page = await pageUtils.open(target, req.query.lang, req.query.timezone, req.cookies, { width, height })
  try {
    const buffer = await page.screenshot()
    res.type('png')
    if (req.query.filename) res.attachment(req.query.filename)
    res.send(buffer)
  } finally {
    pageUtils.close(page, req.cookies)
  }
}))

router.get('/print', asyncWrap(auth), asyncWrap(async (req, res, next) => {
  const target = req.query.target
  debug(`print page for target url ${target}`)

  // read query params
  const landscape = req.query.landscape === 'true'
  const showFooter = !!req.query.footer
  const footer = req.query.footer === 'true' ? '' : req.query.footer
  const pageRanges = req.query.pageRanges || ''
  const format = req.query.format || 'A4'
  const left = req.query.left || '1.5cm'
  const right = req.query.right || '1.5cm'
  const top = req.query.top || '1.5cm'
  const bottom = req.query.bottom || '1.5cm'

  const page = await pageUtils.open(target, req.query.lang, req.query.timezone, req.cookies)
  try {
    const pdfOptions = { landscape, pageRanges, format, margin: { left, right, top, bottom }, printBackground: true }
    if (showFooter) {
      pdfOptions.displayHeaderFooter = true
      pdfOptions.headerTemplate = ' '
      pdfOptions.footerTemplate = headerFooter.footer(footer)
    }
    const buffer = await page.pdf(pdfOptions)
    res.type('pdf')
    if (req.query.filename) res.attachment(req.query.filename)
    res.send(buffer)
  } finally {
    pageUtils.close(page, req.cookies)
  }
}))
