const config = require('config')

const commonParams = [
  {
    in: 'query',
    name: 'filename',
    description: 'The requested filename of the downloaded attachment',
    required: false,
    schema: {
      type: 'string'
    }
  },
  {
    in: 'query',
    name: 'target',
    description: 'The URL of the page to capture',
    required: true,
    schema: {
      type: 'string'
    }
  },
  {
    in: 'query',
    name: 'lang',
    description: 'Open chrome with this active language',
    required: false,
    schema: {
      type: 'string',
      default: config.defaultLang
    }

  },
  {
    in: 'query',
    name: 'lang',
    description: 'Open chrome with this active timezone',
    required: false,
    schema: {
      type: 'string',
      default: config.defaultTimezone
    }
  }
]

module.exports = {
  openapi: '3.0.0',
  info: {
    title: 'Capture',
    description: 'This service can be used to capture screenshots and prints of Web pages.',
    'x-api-id': 'capture',
    contact: {
      name: 'Koumoul',
      url: 'https://koumoul.com',
      email: 'support@koumoul.com'
    },
    version: '1.0.0'
  },
  servers: [{
    url: config.publicUrl + '/api/v1',
    description: process.env.NODE_ENV
  }],
  components: {
    securitySchemes: {
      jwt: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  },
  security: [{ jwt: [] }],
  paths: {
    '/screenshot': {
      get: {
        tags: ['Capture'],
        summary: 'Export an image or video capture.',
        operationId: 'getScreenshot',
        parameters: [
          ...commonParams,
          {
            in: 'query',
            name: 'width',
            description: 'Width of the capture',
            required: false,
            schema: {
              type: 'integer',
              default: 800
            }
          },
          {
            in: 'query',
            name: 'height',
            description: 'Height of the capture',
            required: false,
            schema: {
              type: 'integer',
              default: 450
            }
          },
          {
            in: 'query',
            name: 'type',
            description: 'Image type',
            required: false,
            schema: {
              type: 'string',
              enum: ['png', 'jpg', 'gif']
            },
            default: 'png'
          }
        ],
        responses: {
          200: {
            description: 'Réponse en cas de succès de la requête',
            content: {}
          }
        }
      }
    },
    '/print': {
      get: {
        tags: ['Capture'],
        summary: 'Print a PDF.',
        operationId: 'getPrint',
        parameters: [
          ...commonParams,
          {
            in: 'query',
            name: 'landscape',
            description: 'Landscape orientation',
            required: false,
            schema: {
              type: 'boolean'
            }
          },
          {
            in: 'query',
            name: 'footer',
            description: 'A footer for each page',
            required: false,
            schema: {
              type: 'string'
            }
          },
          {
            in: 'query',
            name: 'format',
            description: 'The format of the print',
            required: false,
            schema: {
              type: 'string',
              default: 'A4'
            }
          },
          {
            in: 'query',
            name: 'left',
            description: 'Left margin',
            required: false,
            schema: {
              type: 'string',
              default: '1.5cm'
            }
          },
          {
            in: 'query',
            name: 'right',
            description: 'Right margin',
            required: false,
            schema: {
              type: 'string',
              default: '1.5cm'
            }
          },
          {
            in: 'query',
            name: 'top',
            description: 'Top margin',
            required: false,
            schema: {
              type: 'string',
              default: '1.5cm'
            }
          },
          {
            in: 'query',
            name: 'bottom',
            description: 'Bottom margin',
            required: false,
            schema: {
              type: 'string',
              default: '1.5cm'
            }
          }
        ],
        responses: {
          200: {
            description: 'Réponse en cas de succès de la requête',
            content: {}
          }
        }
      }
    }
  },
  externalDocs: {
    description: 'Documentation Koumoul',
    url: 'https://koumoul.com/documentation'
  }
}
