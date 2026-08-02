const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Grossify API',
      version: '1.0.0',
      description: 'Hyperlocal Multi-Vendor Marketplace API',
      contact: {
        name: 'Kunal Gharate',
        email: 'kunal@grossify.in',
      },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/modules/*/*.routes.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = { swaggerSpec };
