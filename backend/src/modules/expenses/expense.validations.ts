import Joi from 'joi';

export const createExpenseSchema = Joi.object({
    amount: Joi.number().positive().precision(2).required(),
    cashback: Joi.number().min(0).precision(2).optional(),
    description: Joi.string().min(1).max(200).required(),
    date: Joi.string()
        .pattern(/^\d{4}-\d{2}-\d{2}$/)
        .required()
        .messages({ 'string.pattern.base': 'date must be in yyyy-MM-dd format' }),
    time: Joi.string().pattern(/^\d{2}:\d{2}$/).allow(null, '').optional(),
    note: Joi.string().max(500).allow('', null).optional(),
    categoryId: Joi.string().uuid().allow(null).optional(),
});

export const parseTextSchema = Joi.object({
    text: Joi.string().min(1).max(500).required(),
});

export const parseBulkTextSchema = Joi.object({
    text: Joi.string().min(1).max(2000).required(),
});



export const updateExpenseSchema = Joi.object({
    amount: Joi.number().positive().precision(2).optional(),
    cashback: Joi.number().min(0).precision(2).optional(),
    description: Joi.string().min(1).max(200).optional(),
    date: Joi.string()
        .pattern(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    time: Joi.string().pattern(/^\d{2}:\d{2}$/).allow(null, '').optional(),
    note: Joi.string().max(500).allow('', null).optional(),
    categoryId: Joi.string().uuid().allow(null).optional(),
});
