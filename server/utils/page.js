const config = require('config')
const puppeteer = require('puppeteer')
const genericPool = require('generic-pool')
const debug = require('debug')('capture')

// start / stop a single puppeteer browser
let _closed, _browser
exports.start = async (app) => {
  _browser = await puppeteer.launch({ executablePath: 'google-chrome-unstable', args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  // auto reconnection, cf https://github.com/GoogleChrome/puppeteer/issues/4428
  _browser.on('disconnected', () => {
    if (!_closed) {
      console.log('Browser was disconnected for some reason, reconnect')
      exports.init()
    }
  })
}
exports.stop = async () => {
  _closed = true
  if (_browser) await _browser.close()
  await contextPool.drain()
  contextPool.clear()
}

const contextFactory = {
  async create() {
    // create pages in incognito contexts so that cookies are not shared
    // each context is used sequentially only because of cookies or other states conflicts
    return _browser.createIncognitoBrowserContext()
  },
  async destroy(context) {
    await context.close()
  }
}
const contextPool = genericPool.createPool(contextFactory, { min: 1, max: config.concurrency, autostart: false })

exports.open = async (target, lang, timezone, cookies, viewport) => {
  const context = await contextPool.acquire()
  let page
  try {
    page = await context.newPage()
    await setPageLocale(page, lang || config.defaultLang, timezone || config.defaultTimezone)
    if (cookies) await page.setCookie.apply(page, cookies)
    if (viewport) await page.setViewport(viewport)
    await waitForPage(page, target)
    return page
  } catch (err) {
    await cleanContext(page, cookies, context)
    throw err
  }
}

// make sure we always close the page and release the incognito context for next page
exports.close = (page, cookies) => {
  cleanContext(page, cookies, page.browserContext())
}

const cleanContext = async (page, cookies, context) => {
  try {
    // always empty cookies to prevent inheriting them in next use of the context
    // to be extra sure we delete the cookies that were explicitly passed to page, and check for other cookies that might have been created
    await page.deleteCookie.apply(page, cookies)
    const otherCookies = await page.cookies()
    await page.deleteCookie.apply(page, otherCookies)
    await page.close()
    contextPool.release(context)
  } catch (err) {
    console.error('Failed to clean page properly, do not reuse this context', err)
    contextPool.destroy(context)
  }
}

// quite complex strategy to wait for the page to be ready for capture.
// it can either explitly call a triggerCapture function or we wait for idle network + 1s
const waitForPage = async (page, target) => {
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

const setPageLocale = async (page, lang, timezone) => {
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
