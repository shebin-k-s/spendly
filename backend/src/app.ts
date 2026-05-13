import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import { protect } from './common/middlewares/protect.middleware';
import { errorHandler } from './common/middlewares/error.middleware';

import authRoutes from './modules/auth/auth.routes';
import categoryRoutes from './modules/categories/category.routes';
import expenseRoutes from './modules/expenses/expense.routes';

const app = express();

const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:8081',
    'http://localhost:8081',
    'http://localhost:5173',
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));

app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

// Public routes
app.use('/api/v1/auth', authRoutes);

// Protected routes
app.use('/api/v1/categories', protect, categoryRoutes);
app.use('/api/v1/expenses', protect, expenseRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'spendly-api' }));

// Global error handler (must be last)
app.use(errorHandler);

export default app;
