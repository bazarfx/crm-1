const swaggerJSDoc = require('swagger-jsdoc');

const definition = {
  openapi: '3.0.0',
  info: {
    title: 'CRM 1 — Trading Telesales API',
    version: '0.1.0',
    description: 'Backend API for CRM 1. Most endpoints require a Bearer access token.',
  },
  servers: [
    { url: '/api/v1', description: 'Default' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: {},
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

const options = {
  definition,
  apis: ['./routes/*.js', './controllers/*.js'],
};

module.exports = swaggerJSDoc(options);
