import { DataTypes, Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

export const sequelize = new Sequelize(process.env.DB_NAME || 'store_ratings', process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  dialect: 'mysql',
  logging: false,
});

export const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(60), allowNull: false },
  email: { type: DataTypes.STRING(254), allowNull: false, unique: true, validate: { isEmail: true } },
  address: { type: DataTypes.STRING(400), allowNull: false },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('ADMIN', 'USER', 'OWNER'), allowNull: false, defaultValue: 'USER' },
}, { indexes: [{ fields: ['name'] }, { fields: ['email'] }, { fields: ['role'] }] });

export const Store = sequelize.define('Store', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  email: { type: DataTypes.STRING(254), allowNull: false, validate: { isEmail: true } },
  address: { type: DataTypes.STRING(400), allowNull: false },
}, { indexes: [{ fields: ['name'] }, { fields: ['address'] }] });

export const Rating = sequelize.define('Rating', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  value: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
}, { indexes: [{ unique: true, fields: ['userId', 'storeId'] }] });

User.hasMany(Store, { as: 'ownedStores', foreignKey: 'ownerId' });
Store.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' });
User.hasMany(Rating, { foreignKey: 'userId' });
Store.hasMany(Rating, { foreignKey: 'storeId' });
Rating.belongsTo(User, { foreignKey: 'userId' });
Rating.belongsTo(Store, { foreignKey: 'storeId' });
