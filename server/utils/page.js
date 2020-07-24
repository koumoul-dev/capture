const config = require('config')
const puppeteer = require('puppeteer')
const genericPool = require('generic-pool')
const debug = require('debug')('capture')

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

// start / stop a single puppeteer browser
let _closed, _browser, _contextPool
exports.start = async (app) => {
  _browser = await puppeteer.launch({ executablePath: 'google-chrome-unstable', args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  _contextPool = genericPool.createPool(contextFactory, { min: 1, max: config.concurrency })

  // auto reconnection, cf https://github.com/GoogleChrome/puppeteer/issues/4428
  _browser.on('disconnected', async () => {
    if (!_closed) {
      console.log('Browser was disconnected for some reason, reconnect')
      try {
        await _contextPool.drain()
        _contextPool.clear()
      } catch (err) {
        console.log('Error while draining replaced contexts pool', err)
      }
      exports.start()
    }
  })
}
exports.stop = async () => {
  _closed = true
  if (_browser) await _browser.close()
  if (_contextPool) {
    await _contextPool.drain()
    _contextPool.clear()
  }
}

async function openInContext(context, target, lang, timezone, cookies, viewport) {
  const page = await context.newPage()
  await setPageLocale(page, lang || config.defaultLang, timezone || config.defaultTimezone)
  if (cookies) await page.setCookie.apply(page, cookies)
  if (viewport) await page.setViewport(viewport)
  await waitForPage(page, target)
  return page
}

exports.open = async (target, lang, timezone, cookies, viewport) => {
  const context = await _contextPool.acquire()
  let page
  try {
    await Promise.race([
      openInContext(context, target, lang, timezone, cookies, viewport).then(p => { page = p }),
      new Promise(resolve => setTimeout(resolve, config.screenshotTimeout * 2))
    ])
    if (!page) throw new Error(`Failed to open "${target}" in context before timeout`)
    return page
  } catch (err) {
    await safeCleanContext(page, cookies, context)
    throw err
  }
}

// make sure we always close the page and release the incognito context for next page
exports.close = (page, cookies) => {
  safeCleanContext(page, cookies, page.browserContext())
}

const cleanContext = async (page, cookies, context) => {
  // always empty cookies to prevent inheriting them in next use of the context
  // to be extra sure we delete the cookies that were explicitly passed to page, and check for other cookies that might have been created
  await page.deleteCookie.apply(page, cookies)
  const otherCookies = await page.cookies()
  await page.deleteCookie.apply(page, otherCookies)
  await page.close()
}

const safeCleanContext = async (page, cookies, context) => {
  if (!page) return _contextPool.destroy(context)
  try {
    let timedout
    await Promise.race([
      await cleanContext(page, cookies, context),
      new Promise(resolve => setTimeout(() => { resolve(); timedout = true }, 2000))
    ])
    if (timedout) throw new Error('timed out while cleaning page context')
    _contextPool.release(context)
  } catch (err) {
    console.error('Failed to clean page properly, do not reuse this context', err)
    _contextPool.destroy(context)
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
