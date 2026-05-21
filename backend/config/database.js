const { Sequelize } = require('sequelize');

const isProd = process.env.NODE_ENV === 'production';
const sslEnabled = (process.env.DB_SSL ?? 'true').toLowerCase() !== 'false';

const dialectOptions = sslEnabled
  ? { ssl: { require: true, rejectUnauthorized: false } }
  : {};

const commonOptions = {
  dialect: 'postgres',
  logging: isProd ? false : (sql) => process.env.LOG_LEVEL === 'debug' && console.log(sql),
  dialectOptions,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    underscored: true,
    timestamps: true,
    paranoid: true,
    freezeTableName: false,
  },
};

let sequelize;
if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, commonOptions);
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'postgres',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 5432,
      ...commonOptions,
    },
  );
}

async function testConnection() {
  await sequelize.authenticate();
  return true;
}

module.exports = { sequelize, testConnection };
