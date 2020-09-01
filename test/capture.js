const assert = require('assert').strict
const pdfParse = require('pdf-parse')
const app = require('../server/app')

const ax = require('axios').create({
  baseURL: 'http://localhost:5607/api/v1/'
})

const target = 'http://localhost:5607/test/resources/test1.html'

before('start app', async function () {
  await app.run()
})
after('stop app', async () => {
  await app.stop()
})

describe('capture', () => {
  it('make a few screenshot of a page', async () => {
    let res = await ax.get('screenshot', { params: { target } })
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    const size1 = Number(res.headers['content-length'])

    res = await ax.get('screenshot', { params: { target, width: '1600' } })
    assert.equal(res.status, 200)
    const size2 = Number(res.headers['content-length'])
    assert.ok(size2 > size1)

    res = await ax.get('screenshot', { params: { target, filename: 'screenshot.png' } })
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-disposition'], 'attachment; filename="screenshot.png"')
  })

  it('make a few prints of a page', async () => {
    let res = await ax.get('print', { params: { target }, responseType: 'arraybuffer' })
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'application/pdf')
    let content = await pdfParse(res.data)
    assert.ok(content.text.includes('Test page 1'))
    assert.ok(content.text.includes('["fr-FR","fr"]'))

    res = await ax.get('print', { params: { target, lang: 'es' }, responseType: 'arraybuffer' })
    assert.equal(res.status, 200)
    content = await pdfParse(res.data)
    assert.ok(content.text.includes('["es"]'))

    res = await ax.get('print', { params: { target, footer: 'My footer' }, responseType: 'arraybuffer' })
    assert.equal(res.status, 200)
    content = await pdfParse(res.data)
    assert.ok(content.text.includes('My footer'))

    res = await ax.get('print', { params: { target }, headers: { cookie: 'id_token=my_token' }, responseType: 'arraybuffer' })
    assert.equal(res.status, 200)
    content = await pdfParse(res.data)
    assert.ok(content.text.includes('id_token=my_token'))
  })

  it('make concurrent prints with separate contexts', async () => {
    const t0 = new Date().getTime()
    const nb = 20
    const promises = []
    for (let i = 0; i < nb; i++) {
      // cookie only on a part of the captures, so that we make sure that they do not inherit cookies from previous pages
      const cookie = i % 2 === 0 ? `id_token=-footer ${i}-` : null
      promises.push(
        ax.get('print', { params: { target, footer: `>footer ${i}<` }, headers: { cookie }, responseType: 'arraybuffer' })
      )
    }
    const responses = await Promise.all(promises)
    for (let i = 0; i < nb; i++) {
      const res = responses[i]
      assert.equal(res.status, 200)
      assert.equal(res.headers['content-type'], 'application/pdf')
      let content = await pdfParse(res.data)
      assert.ok(content.text.includes('Test page 1'))
      assert.ok(content.text.includes(`>footer ${i}<`))
      if (i % 2 === 0) {
        assert.ok(content.text.includes(`id_token=-footer ${i}-`))
      } else {
        assert.ok(!content.text.includes(`id_token=`))
      }
    }
    const t1 = new Date().getTime()
    console.log(`${nb} prints in ${t1 - t0}ms`)
  })

  it('make prints of a page that is never idle', async () => {
    let res = await ax.get('print', { params: { target: 'http://localhost:5607/test/resources/test-timeout.html' }, responseType: 'arraybuffer' })
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'application/pdf')
    const content = await pdfParse(res.data)
    assert.ok(content.text.includes('count3') || content.text.includes('count:4') || content.text.includes('count:5'))
  })

  it('make animated gif screenshot of a page', async () => {
    let res = await ax.get('screenshot', { params: { target: 'http://localhost:5607/test/resources/test-anim.html', type: 'gif' } })
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/gif')
    const size1 = Number(res.headers['content-length'])
    assert.ok(size1 < 50000)

    res = await ax.get('screenshot', { params: { target: 'http://localhost:5607/test/resources/test-anim.html', filename: 'test.gif' } })
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/gif')
    assert.equal(res.headers['content-disposition'], 'attachment; filename="test.gif"')

    res = await ax.get('screenshot', { params: { target: 'http://localhost:5607/test/resources/test-anim.html' } })
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    const size2 = Number(res.headers['content-length'])
    assert.ok(size2 < 15000)
  })

  it('convert screenshot to jpg', async () => {
    let res = await ax.get('screenshot', { params: { target, type: 'jpg' } })
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/jpeg')
  })
})
