# Capture

A simple service for capturing rendered Web pages using [puppeteer](https://github.com/GoogleChrome/puppeteer).

Ased as a companion service for [data-fair](https://koumoul-dev.github.io/data-fair/).

## Developper

To run locally you will need to install google-chrome-unstable for your system.

Install dependencies without downloading chromium:

    export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
    npm i

Then start the server:

    DEBUG=capture npm start

And open an [example](http://localhost:5607/api/v1/screenshot?target=https://koumoul-dev.github.io/data-fair/)
