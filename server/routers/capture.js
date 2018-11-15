const express = require('express')
const debug = require('debug')('capture')
const config = require('config')
const puppeteer = require('puppeteer')
const URL = require('url').URL
const asyncWrap = require('../utils/async-wrap')

exports.init = async () => {
  return puppeteer.launch({ executablePath: 'google-chrome-unstable', args: ['--no-sandbox', '--disable-setuid-sandbox'] })
}

const router = exports.router = express.Router()

router.get('/screenshot', asyncWrap(async (req, res, next) => {
  const browser = req.app.get('browser')

  if (!req.query.target) return res.status(400).send('parameter "target" is required')
  const target = req.query.target
  debug(`capture screen short for target url ${target}`)

  // TODO: accept withxheight as query params
  let width = 800
  let height = 450

  // transmit cookies from incoming query if we target and the current service are on same host
  let sameHost
  try {
    sameHost = new URL(target).host === new URL(config.publicUrl).host
  } catch (err) {
    return res.status(400).send('Failed to parse url ' + err.message)
  }

  let cookies = []
  if (sameHost) {
    debug(`${target} is on same host as capture service, transmit cookies`)
    cookies = Object.keys(req.cookies).map(name => ({ name, value: req.cookies[name], url: target }))
  } else {
    debug(`${target} is NOT on same host as capture service, do NOT transmit cookies`)
    if (config.onlySameHost) return res.status(400).send('Only same host targets are accepted')
  }

  const page = await browser.newPage()
  if (cookies.length) await page.setCookie.apply(page, cookies)

  await page.setViewport({ width, height })
  await page.goto(target, { waitUntil: 'networkidle0' })
  const buffer = await page.screenshot()
  await page.close()
  res.contentType('image/png')
  res.send(buffer)
}))
