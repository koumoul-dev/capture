const { file } = require('tmp-promise')
const config = require('config')
const fs = require('fs')
const util = require('util')
const stream = require('stream')
const pipeline = util.promisify(stream.pipeline)
const GifEncoder = require('gif-encoder')
const getPixels = util.promisify(require('get-pixels'))
const imageminGifsicle = require('imagemin-gifsicle')
const debug = require('debug')('capture')

exports.capture = async (target, page, width, height, res) => {
  let stopped = false
  const gif = new GifEncoder(width, height)
  gif.setFrameRate(15) // 15fps seams like a good compromise for a gif
  gif.writeHeader()
  const { path, cleanup } = await file({ postfix: '.gif' })
  const pipelinePromise = pipeline(gif, fs.createWriteStream(path))
  let i = 0
  while (!stopped && i < config.maxAnimationFrames) {
    i++
    stopped = await page.evaluate(() => window.animateCaptureFrame())
    let buffer
    await Promise.race([
      page.screenshot().then(b => { buffer = b }),
      new Promise(resolve => setTimeout(resolve, config.screenshotTimeout))
    ])
    if (!buffer) throw new Error(`Failed to capture animation frame of page "${target}" before timeout`)
    const pixels = await getPixels(buffer, 'image/png')
    gif.addFrame(pixels.data)
  }
  gif.finish()
  await pipelinePromise
  debug(`gif screenshot is taken ${target}`)
  const rawBuffer = await fs.promises.readFile(path)
  cleanup()
  const compressedBuffer = await imageminGifsicle({ optimizationLevel: 2 })(rawBuffer)
  return compressedBuffer
}
