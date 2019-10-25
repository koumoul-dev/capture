# Capture

A simple service for capturing rendered Web pages using [puppeteer](https://github.com/GoogleChrome/puppeteer).

Ased as a companion service for [data-fair](https://koumoul-dev.github.io/data-fair/).

## Developper

To run locally you will need to install google-chrome-unstable for your system.

Install dependencies without downloading chromium:

    export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
    npm i

Then start the server:

    npm run dev

Or build and run the docker image:

    docker build -t capture . && docker run --rm -it -p 5607:5607 -e DEBUG=capture -e ONLY_SAME_HOST=false -e PORT=5607 --name capture capture

Check the service with these examples:

  - [simple screenshot](http://localhost:5607/api/v1/screenshot?target=http://localhost:5607/test/test1.html)
  - [custom size](http://localhost:5607/api/v1/screenshot?target=http://localhost:5607/test/test1.html&width=200&height=150)
  - [custom lang](http://localhost:5607/api/v1/screenshot?target=http://localhost:5607/test/test1.html&lang=en)
