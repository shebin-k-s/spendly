import { DataSource } from 'typeorm';

const hasDatabaseUrl = !!process.env.DB_URL;

export const AppDataSource = new DataSource({
    type: 'postgres',
    ...(hasDatabaseUrl
        ? { url: process.env.DB_URL }
        : {
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT) || 5432,
            username: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'spendly',
        }),
    synchronize: true,
    logging: false,
    entities: [__dirname + '/../modules/**/*.entity.{ts,js}'],
    migrations: [],
    subscribers: [],
});
